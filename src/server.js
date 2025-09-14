// src/server.js
require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const connectDB = require("./config/db");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const messageRoutes = require("./routes/messages");
const { initSocket, getIO } = require("./socket");

const app = express();
const server = http.createServer(app);

// connect DB
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/chatapp";
connectDB(MONGO_URI);

app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || true,
    credentials: true,
  })
);
app.use(express.json());

// health
app.get("/", (req, res) => res.json({ status: "ok" }));

// routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/messages", messageRoutes);

// initialize socket.io with the same server
initSocket(server);

// OPTIONAL: test endpoint (kept after initSocket so getIO() works)
// app.post("/api/test-emit", (req, res) => {
//   try {
//     const io = getIO();
//     if (!io) {
//       console.error("GET /api/test-emit -> io not initialized");
//       return res
//         .status(500)
//         .json({ ok: false, message: "Socket not initialized" });
//     }

//     // emit to everyone
//     io.emit("server_test", { text: "hello from HTTP emit" });

//     return res.json({ ok: true });
//   } catch (err) {
//     console.error("/api/test-emit error", err);
//     return res.status(500).json({ ok: false });
//   }
// });

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
