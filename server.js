const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS enabled
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static(__dirname));

// --- In-Memory State ---
// This stores all chat history and the admin code for each room.
const rooms = {}; 
let messageCounter = 1; 

io.on('connection', (socket) => {
    console.log(`New connection: ${socket.id}`);

    // --- 1. Join or Create Room (Handles Creator Persistence) ---
    // The client sends the adminCode from its Local Storage for verification
    socket.on('joinRoom', ({ roomId, username, adminCode }) => {
        socket.join(roomId);

        let isCreator = false;
        let room = rooms[roomId];

        // A. Room Creation (if it doesn't exist)
        if (!room) {
            // Create new room, use the provided adminCode if available, otherwise generate new
            const code = adminCode || Math.random().toString(36).substring(2, 10);
            
            rooms[roomId] = { 
                adminCode: code, 
                messages: [] 
            };
            room = rooms[roomId];
            isCreator = true;
        } 
        // B. Room Exists - Check Credentials
        else {
            // If the provided adminCode matches the room's stored adminCode, grant creator access
            if (adminCode && room.adminCode === adminCode) {
                isCreator = true;
            }
        }

        // Determine Display Name
        const displayName = username && username.trim() !== "" 
            ? username 
            : `Guest-${Math.floor(Math.random() * 10000)}`;

        // Send setup data back to the client
        socket.emit('roomJoined', {
            roomId: roomId,
            userId: socket.id,      
            username: displayName,  
            isCreator: isCreator,   
            // Send the admin code back only if the user is the creator (for persistence)
            adminCode: room.adminCode, 
            history: room.messages
        });
        
        // Notify others
        socket.to(roomId).emit('systemMessage', `${displayName} has joined.`);
    });

    // --- 2. Handle New Messages ---
    socket.on('chatMessage', (data) => {
        const { roomId, username, message } = data;
        const messageId = messageCounter++;
        
        const newMessage = {
            id: messageId,
            senderName: username, 
            senderId: socket.id, 
            text: message,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: 'text'
        };

        if (rooms[roomId]) {
            rooms[roomId].messages.push(newMessage);
        }

        io.to(roomId).emit('message', newMessage);
    });

    // --- 3. Handle Message Deletion (Moderator OR Self-Deletion) ---
    socket.on('deleteMessage', (data) => {
        const { roomId, messageId, adminCode } = data; // adminCode is passed from client (Local Storage)
        const room = rooms[roomId];

        if (!room) return;
        
        const messageIndex = room.messages.findIndex(msg => msg.id === messageId);
        if (messageIndex === -1) return;
        
        const message = room.messages[messageIndex];

        // 1. Is this user the Admin? (Codes match)
        const isAdmin = room.adminCode === adminCode;
        // 2. Is this user the original sender?
        const isSender = message.senderId === socket.id;
        
        if (isAdmin || isSender) {
            room.messages.splice(messageIndex, 1);
            io.to(roomId).emit('messageDeleted', { messageId });
        } else {
            socket.emit('systemMessage', 'Error: Permission denied.');
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000; 

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
