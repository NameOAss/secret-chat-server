const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
    maxHttpBufferSize: 1e8 // เพิ่มขีดจำกัดให้ส่งรูปใหญ่ได้ (100MB)
});

// เก็บข้อมูลห้องและรหัสผ่าน (ในหน่วยความจำชั่วคราว)
let roomPasswords = {};
// รหัสลับสำหรับ Admin เอาไว้เตะคน (เปลี่ยนตรงนี้ได้เลย)
const ADMIN_PASSWORD = "admin-secret-key"; 

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
    
  // เมื่อมีคนขอเข้าห้อง
  socket.on('join room', (data) => {
    const { username, room, password } = data;

    // เช็คว่าห้องนี้มีรหัสผ่านไหม
    if (roomPasswords[room]) {
        if (roomPasswords[room] !== password) {
            socket.emit('error', 'รหัสผ่านห้องไม่ถูกต้อง!');
            return;
        }
    } else {
        // ถ้าห้องยังไม่มีรหัส (ห้องใหม่) ให้ตั้งรหัสตามที่คนแรกพิมพ์มา
        if(password) roomPasswords[room] = password;
    }

    // ผ่านฉลุย! ให้เข้าห้องได้
    socket.join(room);
    socket.username = username;
    socket.room = room;
    
    // แจ้งเตือนคนในห้อง
    io.to(room).emit('system message', `${username} เข้ามาร่วมวงแล้ว!`);
  });

  // รับข้อความแชท + ระบบ Admin Kick
  socket.on('chat message', (msg) => {
    if (!socket.room) return;

    // เช็คว่าเป็นคำสั่งเตะหรือไม่? (Format: /kick [ชื่อคน] [รหัสแอดมิน])
    if (msg.startsWith('/kick ')) {
        const parts = msg.split(' ');
        const targetName = parts[1];
        const adminPass = parts[2];

        if (adminPass === ADMIN_PASSWORD) {
            // ค้นหาคนที่จะเตะในห้องเดียวกัน
            const socketsInRoom = io.sockets.adapter.rooms.get(socket.room);
            let kicked = false;
            if (socketsInRoom) {
                for (const socketId of socketsInRoom) {
                    const targetSocket = io.sockets.sockets.get(socketId);
                    if (targetSocket.username === targetName) {
                        targetSocket.emit('error', 'คุณถูก Admin ดีดออกจากห้อง!');
                        targetSocket.disconnect(true); // ตัดการเชื่อมต่อทันที
                        kicked = true;
                        io.to(socket.room).emit('system message', `⚡ ${targetName} ถูกดีดออกจากห้อง!`);
                        break;
                    }
                }
            }
            if (!kicked) socket.emit('error', `หาผู้ใช้ ${targetName} ไม่เจอ`);
        } else {
            socket.emit('error', 'รหัส Admin ไม่ถูกต้อง!');
        }
        return; // จบการทำงาน ไม่ต้องส่งเป็นข้อความแชท
    }

    // ถ้าไม่ใช่คำสั่ง ก็ส่งข้อความปกติ
    io.to(socket.room).emit('chat message', {
        user: socket.username,
        msg: msg,
        type: 'text',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  // รับรูปภาพ
  socket.on('chat image', (imgData) => {
      if (!socket.room) return;
      io.to(socket.room).emit('chat message', {
          user: socket.username,
          img: imgData,
          type: 'image',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
  });

  // เมื่อคนออกจากห้อง
  socket.on('disconnect', () => {
    if (socket.username && socket.room) {
      io.to(socket.room).emit('system message', `${socket.username} ออกจากห้องไปแล้ว`);
    }
  });
});

server.listen(3000, () => {
  console.log('listening on *:3000');
});