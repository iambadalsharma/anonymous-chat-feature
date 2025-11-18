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
    socket.on('joinRoom', (roomId) => {
        socket.join(roomId);

        // Determine if this user is the creator (moderator)
        let isCreator = false;
        if (!rooms[roomId]) {
            // New room: current user is the creator/moderator
            rooms[roomId] = { creatorId: socket.id, messages: [] };
            isCreator = true;
            console.log(`Room ${roomId} created by ${socket.id}`);
        }

        // Assign an anonymous user ID
        const anonymousId = isCreator ? 'Creator (You)' : `Guest-${Math.floor(Math.random() * 1000)}`;

        // Send confirmation and chat history to the joining client
        socket.emit('roomJoined', {
            roomId: roomId,
            anonymousId: anonymousId,
            isCreator: isCreator,
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
    socket.on('deleteMessage', (data) => {
        const { roomId, messageId } = data;
        const room = rooms[roomId];

        // --- SECURITY CHECK ---
        // Only the room creator (moderator) can delete messages
        if (room && room.creatorId === socket.id) {
            // Find and remove the message from the in-memory state
            const initialLength = room.messages.length;
            room.messages = room.messages.filter(msg => msg.id !== messageId);
            
            if (room.messages.length < initialLength) {
                // If message was successfully deleted, notify all clients
                io.to(roomId).emit('messageDeleted', { messageId });
                console.log(`Message ${messageId} deleted in room ${roomId} by moderator.`);
            }
        } else {
            // If someone tries to delete without permission
            socket.emit('systemMessage', 'Error: You do not have permission to delete messages.');
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
