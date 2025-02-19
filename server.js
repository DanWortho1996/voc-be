require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const admin = require("firebase-admin");
const path = require("path");

// Initialize Firebase Admin SDK
const serviceAccount = require(path.join(__dirname, "firebase-service-account.json")); // Ensure correct path
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

const app = express(); // Defined before using it
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Change this to your frontend URL for security
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
    credentials: true
  }
});

// Root route added correctly
app.get("/", (req, res) => {
  res.send("Voting game server is running");
});

let rooms = {}; // Store players in rooms

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  socket.on("joinGame", ({ name, room }) => {
    console.log(`🔹 Received joinGame: Player ${name} joining Room ${room}`);
    
    if (!room) {
      io.to(socket.id).emit("nextPlayer", { nextPlayer: name, room: null });
      return;
    }
    
    if (!rooms[room]) {
      rooms[room] = [];
    }
    
    if (!rooms[room].includes(name)) {
      rooms[room].push(name);
      socket.join(room);
    }
  
    console.log(`Player ${name} joined Room ${room}. Current Players:`, rooms[room]);
    io.to(room).emit("playersInRoom", rooms[room]);
  
    // Send confirmation
    io.to(socket.id).emit("joinSuccess", { name, room });
  
    if (rooms[room].length === 1) {
      console.log(`🚀 Game starting! First player: ${rooms[room][0]}`);
      io.to(room).emit("nextPlayer", { nextPlayer: rooms[room][0], room });
    }
  });
  

  // socket.on("playerLost", ({ name, room, correctAnswer }) => {
  //   console.log(`${name} was eliminated from room ${room || "single-player"}.`);
  //   if (room && rooms[room]) {
  //     rooms[room] = rooms[room].filter(player => player !== name);
  //     io.to(room).emit("playerEliminated", { eliminatedPlayer: name, room });
  //     io.to(room).emit("revealAnswer", { correctAnswer, room });
  //     if (rooms[room].length > 0) {
  //       io.to(room).emit("nextPlayer", { nextPlayer: rooms[room][0], room });
  //     } else {
  //       io.to(room).emit("gameOver");
  //       delete rooms[room];
  //     }
  //   }
  // });

  socket.on("playerLost", ({ name, room }) => {
    console.log(`${name} lost in room ${room}. Removing player...`);
    
    if (room && rooms[room]) {
      rooms[room] = rooms[room].filter(player => player !== name);
      io.to(room).emit("playerEliminated", { eliminatedPlayer: name, room });
      
      if (rooms[room].length > 0) {
        io.to(room).emit("nextPlayer", { nextPlayer: rooms[room][0], room });
      } else {
        io.to(room).emit("gameOver");
        delete rooms[room];
      }
    }
  });  

  socket.on("updateScore", async ({ name, score }) => {
    try {
      await db.collection("leaderboard").doc(name).set({ name, score }, { merge: true });
      const updatedSnapshot = await db.collection("leaderboard").orderBy("score", "desc").get();
      const updatedScores = updatedSnapshot.docs.map(doc => doc.data());
      io.emit("updateLeaderboard", updatedScores);
    } catch (error) {
      console.error("Error updating leaderboard:", error);
    }
  });

  socket.on("disconnect", () => {
    console.log("Player disconnected:", socket.id);
    
    // Find and remove the player from rooms
    for (const room in rooms) {
      rooms[room] = rooms[room].filter(player => player !== socket.id);
      if (rooms[room].length === 0) {
        delete rooms[room]; // Clean up empty rooms
      }
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
