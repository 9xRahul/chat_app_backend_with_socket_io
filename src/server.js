require("dotenv").config();
console.log(
  "DEBUG: JWT_SECRET (masked) =",
  process.env.JWT_SECRET
    ? process.env.JWT_SECRET.slice(0, 6) + "..."
    : "undefined"
);
const express = require("express");
const http = require("http");
const cors = require("cors");
const connectDB = require("./config/db");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const messageRoutes = require("./routes/messages");
const { initSocket } = require("./socket");

const app = express();
const server = http.createServer(app);

// connect DB
const MONGO_URI = process.env.MONGO_URI;
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

// Start server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
