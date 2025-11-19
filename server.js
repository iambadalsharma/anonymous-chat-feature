const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS enabled for all origins (safe for local testing)
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve the static index.html file
app.use(express.static(__dirname));

// --- Database/State Management Placeholder ---
// In a real application, messages and moderator info would be stored in a database.
// For this simple example, we use in-memory objects.

const rooms = {}; // { 'roomId': { creatorId: 'socket.id', messages: [] } }
let messageCounter = 1; // Simple unique ID generator for messages

// --- Socket.IO Connection Handler ---
io.on('connection', (socket) => {
    console.log(`New user connected: ${socket.id}`);

    // --- 1. Join or Create Room ---
    // --- Updated joinRoom handler in server.js ---
socket.on('joinRoom', ({ roomId, creatorToken }) => {
    socket.join(roomId);

    let isCreator = false;
    let newCreatorToken = creatorToken;

    if (!rooms[roomId]) {
        // New room: Current user is the creator. Generate a unique token.
        newCreatorToken = Math.random().toString(36).substring(2, 15);
        rooms[roomId] = { creatorToken: newCreatorToken, messages: [] };
        isCreator = true;
    } else if (rooms[roomId].creatorToken === creatorToken && creatorToken) {
        // Existing room, and the user provided the correct creator token
        isCreator = true;
    }

    // Assign anonymous ID
    const anonymousId = isCreator ? 'Creator (You)' : `Guest-${Math.floor(Math.random() * 1000)}`;

    // Send back the token and status
    socket.emit('roomJoined', {
        roomId: roomId,
        anonymousId: anonymousId,
        isCreator: isCreator,
        creatorToken: newCreatorToken, // Send back the token for client storage
        history: rooms[roomId].messages
    });
    
    // Notify others
    socket.to(roomId).emit('systemMessage', `${anonymousId} has joined the room.`);
});

    // --- 2. Handle New Messages ---
    socket.on('chatMessage', (data) => {
        const { roomId, anonymousId, message } = data;
        const messageId = messageCounter++;
        
        // Create the message object
        const newMessage = {
            id: messageId,
            sender: anonymousId,
            text: message,
            timestamp: new Date().toLocaleTimeString()
        };

        // Save to in-memory state
        if (rooms[roomId]) {
            rooms[roomId].messages.push(newMessage);
        }

        // Broadcast to all clients in the room
        io.to(roomId).emit('message', newMessage);
    });

    // --- 3. Handle Message Deletion (Moderator Action) ---
// --- Update deleteMessage handler in server.js to check creatorToken ---
socket.on('deleteMessage', (data) => {
    const { roomId, messageId, creatorToken } = data; // Receive token
    const room = rooms[roomId];

    // --- SECURITY CHECK (check against the token) ---
    if (room && room.creatorToken === creatorToken && creatorToken) { 
        // Logic to delete the message (unchanged)
        const initialLength = room.messages.length;
        room.messages = room.messages.filter(msg => msg.id !== messageId);
        
        if (room.messages.length < initialLength) {
            io.to(roomId).emit('messageDeleted', { messageId });
        }
    } else {
        // ... rest of the unauthorized message ...
    }
});

    // --- 4. Handle Disconnect ---
    socket.on('disconnect', () => {
        // Simple log for disconnect. Robust logic would clean up empty rooms.
        console.log(`User disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000; 

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
