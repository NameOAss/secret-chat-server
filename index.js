const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

// เก็บข้อมูลห้องและรหัสผ่าน
let roomPasswords = {};
// เก็บประวัติแชทของแต่ละห้อง
let roomMessages = {}; 

const ADMIN_PASSWORD = "admin-secret-key"; 

// ให้ Server รู้จักไฟล์ index.html
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// ฟังก์ชันบันทึกประวัติแชท
function saveMessageToHistory(room, messageData) {
    if (!roomMessages[room]) {
        roomMessages[room] = [];
    }
    roomMessages[room].push(messageData);
    // เก็บแค่ 50 ข้อความล่าสุด (ประหยัด RAM)
    if (roomMessages[room].length > 50) {
        roomMessages[room].shift();
    }
}

io.on('connection', (socket) => {
    
  // --- ส่วน Login เข้าห้อง ---
  socket.on('join room', (data) => {
    const { username, room, password } = data;

    // 1. เช็คว่ามีห้องนี้อยู่แล้วไหม และรหัสถูกไหม
    if (roomPasswords[room]) {
        if (roomPasswords[room] !== password) {
            // ถ้ารหัสผิด ส่ง error กลับไป (หน้าจอจะไม่เปลี่ยน)
            socket.emit('error', '❌ รหัสผ่านห้องไม่ถูกต้อง!');
            return;
        }
    } else {
        // ถ้าห้องใหม่ ให้ตั้งรหัสผ่านตามที่ส่งมา
        if(password) roomPasswords[room] = password;
    }

    // 2. ถ้ารหัสผ่านถูก (หรือห้องใหม่) ให้เข้าร่วมห้อง
    socket.join(room);
    socket.username = username;
    socket.room = room;
    
    // 3. โหลดประวัติเก่าให้ดู
    if (roomMessages[room]) {
        socket.emit('load history', roomMessages[room]);
    }

    // 4. 🔥 สำคัญมาก: ส่ง System Message เพื่อบอก Client ว่า "ผ่านแล้วนะ เปลี่ยนหน้าจอได้"
    // (io.to ส่งหาทุกคนรวมถึงตัวเองด้วย หน้าจอตัวเองถึงจะเปลี่ยน)
    io.to(room).emit('system message', `${username} เข้ามาร่วมวงแล้ว!`);
  });


  // --- ส่วนรับส่งข้อความ ---
  socket.on('chat message', (msg) => {
    if (!socket.room) return;

    // 🔥 ระบบระเบิดตัวเอง (Reset All)
    if (msg === '/reset-all') {
        roomPasswords = {};
        roomMessages = {};
        io.emit('system message', '⚠️ SYSTEM RESET: ล้างข้อมูลห้องทั้งหมดแล้ว!');
        console.log('System Reset by ' + socket.username);
        return; 
    }

    // ระบบ Admin Kick
    if (msg.startsWith('/kick ')) {
        const parts = msg.split(' ');
        const targetName = parts[1];
        const adminPass = parts[2];
        if (adminPass === ADMIN_PASSWORD) {
            const socketsInRoom = io.sockets.adapter.rooms.get(socket.room);
            if (socketsInRoom) {
                for (const socketId of socketsInRoom) {
                    const targetSocket = io.sockets.sockets.get(socketId);
                    if (targetSocket.username === targetName) {
                        targetSocket.disconnect(true);
                        io.to(socket.room).emit('system message', `⚡ ${targetName} ถูกดีดออกจากห้อง!`);
                    }
                }
            }
        }
        return; 
    }

    // สร้างข้อมูลข้อความ
    const messageData = {
        user: socket.username,
        msg: msg,
        type: 'text',
        time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })
    };

    saveMessageToHistory(socket.room, messageData);
    io.to(socket.room).emit('chat message', messageData);
  });

  socket.on('disconnect', () => {
    if (socket.username && socket.room) {
      io.to(socket.room).emit('system message', `${socket.username} ออกจากห้องไปแล้ว`);
    }
  });
});

// 🔥 แก้บรรทัดนี้ครับ: ใช้ process.env.PORT เพื่อให้ Render สั่งงานได้
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`listening on *:${PORT}`);
});