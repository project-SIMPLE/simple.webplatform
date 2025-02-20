import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();

const server = createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://10.2.172.36:8000", // React app URL
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  // console.log(`User connected: ${socket.id}`);

  // Listen for messages
  socket.on("message", (data) => {
    // console.log(`Received message: ${data}`);
    io.emit("message", data); // Broadcast message
  });

  socket.on("disconnect", () => {
    // console.log(`User disconnected: ${socket.id}`);
  });
});

server.listen(3001, "0.0.0.0", () => {
  console.log("Socket.IO server running on 10.2.172.36:3001");
});
