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
// rooms structure: 
// { 
//   'roomId': { 
//      adminCode: 'secret-password', 
//      messages: [ {id, text, senderName, senderId, timestamp, type} ] 
//   } 
// }
const rooms = {}; 
let messageCounter = 1; 

io.on('connection', (socket) => {
    console.log(`New connection: ${socket.id}`);

    // --- 1. Join or Create Room ---
    socket.on('joinRoom', ({ roomId, username, adminCode }) => {
        socket.join(roomId);

        let isCreator = false;
        let room = rooms[roomId];

        // A. Room Creation (if it doesn't exist)
        if (!room) {
            // Create new room
            // If user provided an adminCode, set it. Otherwise generate a random one.
            const code = adminCode || Math.random().toString(36).substring(2, 10);
            
            rooms[roomId] = { 
                adminCode: code, 
                messages: [] 
            };
            room = rooms[roomId];
            
            // First user is always creator if they just created it
            isCreator = true;
        } 
        // B. Room Exists - Check Credentials
        else {
            // Check if the provided code matches the room's admin code
            if (adminCode && room.adminCode === adminCode) {
                isCreator = true;
            }
        }

        // Determine Display Name
        // If username is provided, use it. Otherwise generate Guest ID.
        const displayName = username && username.trim() !== "" 
            ? username 
            : `Guest-${Math.floor(Math.random() * 10000)}`;

        // Send setup data back to the client
        socket.emit('roomJoined', {
            roomId: roomId,
            userId: socket.id,      // This session's unique ID
            username: displayName,  // The public display name
            isCreator: isCreator,   // Private flag: Am I admin?
            adminCode: isCreator ? room.adminCode : null, // Send code back only if authorized
            history: room.messages
        });
        
        // Notify others (Don't reveal if they are admin!)
        socket.to(roomId).emit('systemMessage', `${displayName} has joined.`);
    });

    // --- 2. Handle New Messages ---
    socket.on('chatMessage', (data) => {
        const { roomId, username, message } = data;
        const messageId = messageCounter++;
        
        const newMessage = {
            id: messageId,
            senderName: username, 
            senderId: socket.id, // Store socket ID to allow self-deletion
            text: message,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: 'text'
        };

        if (rooms[roomId]) {
            rooms[roomId].messages.push(newMessage);
        }

        io.to(roomId).emit('message', newMessage);
    });

    // --- 3. Handle Message Deletion (Stealth Moderator or Self) ---
    socket.on('deleteMessage', (data) => {
        const { roomId, messageId, adminCode } = data;
        const room = rooms[roomId];

        if (!room) return;
        
        const messageIndex = room.messages.findIndex(msg => msg.id === messageId);
        if (messageIndex === -1) return;
        
        const message = room.messages[messageIndex];

        // Check Permissions
        // 1. Is this user the Admin? (Codes match)
        const isAdmin = room.adminCode === adminCode;
        // 2. Is this user the original sender?
        const isSender = message.senderId === socket.id;
        
        if (isAdmin || isSender) {
            // Remove from memory
            room.messages.splice(messageIndex, 1);
            // Tell everyone to remove it from UI
            io.to(roomId).emit('messageDeleted', { messageId });
        } else {
            socket.emit('systemMessage', 'Error: Permission denied.');
        }
    });

    socket.on('disconnect', () => {
        // We do NOT clear the room here, so history persists if users rejoin.
    });
});

const PORT = process.env.PORT || 3000; 

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
