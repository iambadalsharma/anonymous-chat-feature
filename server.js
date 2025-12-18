const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static(__dirname));

// --- In-Memory State ---
const rooms = {}; 
let messageCounter = 1; 

io.on('connection', (socket) => {
    
    // --- 1. Join Logic ---
    socket.on('joinRoom', ({ roomId, username, secretCode }) => {
        socket.join(roomId);

        // Create room if it doesn't exist
        if (!rooms[roomId]) {
            rooms[roomId] = {
                secretCode: secretCode || "", // Store the password
                messages: []
            };
        }

        const room = rooms[roomId];
        
        // Admin Validation
        // You are Admin ONLY if the room has a password AND you provided the matching password.
        const roomHasCode = room.secretCode && room.secretCode.length > 0;
        const providedMatch = secretCode === room.secretCode;
        
        // If room has no code, no one is admin (public room).
        const isAdmin = roomHasCode && providedMatch;

        const displayName = username && username.trim() !== "" 
            ? username 
            : `User-${Math.floor(Math.random() * 9000) + 1000}`;

        socket.emit('roomJoined', {
            roomId: roomId,
            userId: socket.id,
            username: displayName,
            isCreator: isAdmin, // Sends TRUE if you are Admin
            history: room.messages
        });
    });

    // --- 2. Message Handling ---
    socket.on('chatMessage', (data) => {
        const { roomId, username, message } = data;
        const room = rooms[roomId];
        
        if (room) {
            const newMessage = {
                id: messageCounter++,
                senderName: username,
                senderId: socket.id,
                text: message,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };

            room.messages.push(newMessage);
            io.to(roomId).emit('message', newMessage);
        }
    });

    // --- 3. Deletion Logic (FIXED) ---
    socket.on('deleteMessage', (data) => {
        const { roomId, messageId, secretCode } = data;
        const room = rooms[roomId];

        if (!room) return;

        const msgIndex = room.messages.findIndex(m => m.id === messageId);
        if (msgIndex === -1) return;

        const message = room.messages[msgIndex];

        // --- SECURITY CHECK ---
        const roomHasCode = room.secretCode && room.secretCode.length > 0;
        const isAdmin = (roomHasCode && secretCode === room.secretCode);
        const isSender = (message.senderId === socket.id);

        // Admin can delete ANYTHING. Sender can only delete THEIR OWN.
        if (isAdmin || isSender) {
            room.messages.splice(msgIndex, 1);
            io.to(roomId).emit('messageDeleted', { messageId });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
