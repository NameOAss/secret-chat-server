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

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// ฟังก์ชันสำหรับเก็บข้อความเข้าประวัติ
function saveMessageToHistory(room, messageData) {
    if (!roomMessages[room]) {
        roomMessages[room] = [];
    }
    roomMessages[room].push(messageData);
    // เก็บแค่ 50 ข้อความล่าสุดต่อห้อง (ประหยัด RAM)
    if (roomMessages[room].length > 50) {
        roomMessages[room].shift();
    }
}

io.on('connection', (socket) => {
    
  socket.on('join room', (data) => {
    const { username, room, password } = data;

    // เช็คระบบรหัสผ่าน
    if (roomPasswords[room]) {
        if (roomPasswords[room] !== password) {
            socket.emit('error', 'รหัสผ่านห้องไม่ถูกต้อง!');
            return;
        }
    } else {
        if(password) roomPasswords[room] = password;
    }

    socket.join(room);
    socket.username = username;
    socket.room = room;
    
    // ส่งประวัติแชทเก่าให้คนมาใหม่
    if (roomMessages[room]) {
        socket.emit('load history', roomMessages[room]);
    }

    // แจ้งเตือนคนอื่นว่ามีคนเข้าห้อง
    socket.broadcast.to(room).emit('system message', `${username} เข้ามาร่วมวงแล้ว!`);
    
    // ส่ง Watermark กลับไปหาคนเข้าห้อง (ถ้ามีระบบนี้ในหน้าบ้าน)
    socket.emit('set watermark', { user: username, ip: socket.handshake.address });
  });

  socket.on('chat message', (msg) => {
    if (!socket.room) return;

    // 🔥🔥🔥 [START] ส่วนที่เพิ่มใหม่: ระบบระเบิดตัวเอง 🔥🔥🔥
    if (msg === '/reset-all') {
        // ล้างข้อมูลทุกอย่างใน RAM
        roomPasswords = {};
        roomMessages = {};
        
        // แจ้งเตือนทุกคนใน Server ว่าระบบถูกรีเซ็ต
        io.emit('system message', '⚠️ SYSTEM RESET: ล้างข้อมูลห้องและรหัสผ่านทั้งหมดแล้ว!');
        console.log('💥 System Reset Triggered by ' + socket.username);
        return; // จบการทำงาน ไม่ต้องส่งข้อความนี้ไปโชว์ในห้อง
    }
    // 🔥🔥🔥 [END] จบส่วนที่เพิ่ม 🔥🔥🔥


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

    // สร้างข้อมูลข้อความ (เวลาไทย)
    const messageData = {
        user: socket.username,
        msg: msg,
        type: 'text',
        time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })
    };

    // บันทึกลงประวัติ
    saveMessageToHistory(socket.room, messageData);

    // ส่งให้ทุกคนในห้อง
    io.to(socket.room).emit('chat message', messageData);
  });

  socket.on('disconnect', () => {
    if (socket.username && socket.room) {
      io.to(socket.room).emit('system message', `${socket.username} ออกจากห้องไปแล้ว`);
    }
  });
});

server.listen(3000, () => {
  console.log('listening on *:3000');
});