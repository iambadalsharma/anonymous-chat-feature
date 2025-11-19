const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS enabled for all origins
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static(__dirname));

// --- In-Memory State (for rooms and messages) ---
const rooms = {}; 
let messageCounter = 1; // Simple unique ID generator for messages

io.on('connection', (socket) => {
    console.log(`New user connected: ${socket.id}`);

    // --- 1. Join or Create Room (Handles Creator Persistence) ---
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
        // Note: The anonymous ID must be consistent for self-deletion to work
        const anonymousId = isCreator ? 'Creator (You)' : `Guest-${Math.floor(Math.random() * 1000)}`;

        // Send back the token and status
        socket.emit('roomJoined', {
            roomId: roomId,
            anonymousId: anonymousId,
            isCreator: isCreator,
            creatorToken: newCreatorToken, // Send back the token for client storage
            history: rooms[roomId].messages
        });
        
        socket.to(roomId).emit('systemMessage', `${anonymousId} has joined the room.`);
    });

    // --- 2. Handle New Messages ---
    socket.on('chatMessage', (data) => {
        const { roomId, anonymousId, message } = data;
        const messageId = messageCounter++;
        
        const newMessage = {
            id: messageId,
            sender: anonymousId, 
            text: message,
            timestamp: new Date().toLocaleTimeString()
        };

        if (rooms[roomId]) {
            rooms[roomId].messages.push(newMessage);
        }

        io.to(roomId).emit('message', newMessage);
    });

    // --- 3. Handle Message Deletion (Moderator AND Self-Deletion) ---
    socket.on('deleteMessage', (data) => {
        const { roomId, messageId, creatorToken, requestSenderId } = data;
        const room = rooms[roomId];

        if (!room) return;
        
        // 1. Find the message to be deleted
        const messageIndex = room.messages.findIndex(msg => msg.id === messageId);
        if (messageIndex === -1) return;
        const message = room.messages[messageIndex];

        // 2. Check if the user is the MODERATOR OR the original SENDER
        const isModerator = room.creatorToken === creatorToken && creatorToken;
        const isSender = message.sender === requestSenderId;
        
        if (isModerator || isSender) {
            room.messages.splice(messageIndex, 1);
            io.to(roomId).emit('messageDeleted', { messageId });
        } else {
            socket.emit('systemMessage', 'Error: You do not have permission to delete this message.');
        }
    });

    // --- 4. Handle Disconnect ---
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000; 

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
