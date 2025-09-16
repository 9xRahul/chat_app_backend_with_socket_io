// src/socket.js
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("./models/User");
const Message = require("./models/Message");

let io = null;

const initSocket = (httpServer, options = {}) => {
  if (io) {
    console.log("Socket.io already initialized");
    return io;
  }

  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_ORIGIN || "*",
      methods: ["GET", "POST"],
    },
    ...options,
    pingInterval: 25000, // default 25000 ms
    pingTimeout: 60000, // default 5000 ms; increase so proxies don't drop; tune carefully
  });

  console.log("Socket.io initialized");

  // auth middleware
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token || socket.handshake.query?.token;
      console.log(">>> socket handshake token present?", !!token);

      if (!token) {
        console.error(
          "Socket auth: no token provided in handshake (auth or query)."
        );
        return next(new Error("Authentication error: No token"));
      }

      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch (jwtErr) {
        console.error(
          "Socket auth jwt verify error:",
          jwtErr.message || jwtErr
        );
        return next(
          new Error("Authentication error: " + (jwtErr.message || "jwt error"))
        );
      }

      const user = await User.findById(decoded.id).select("-password");
      if (!user) {
        console.error("Socket auth: user not found for id:", decoded.id);
        return next(new Error("Authentication error: User not found"));
      }

      socket.user = user;
      next();
    } catch (err) {
      console.error("Socket auth unexpected error:", err);
      next(new Error("Authentication error: unexpected"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.user;
    console.log(
      "User connected via socket:",
      user?._id?.toString(),
      "socketId:",
      socket.id
    );

    // mark user online
    User.findByIdAndUpdate(
      user._id,
      { online: true, socketId: socket.id },
      { new: true }
    )
      .select("-password")
      .then((u) => {
        io.emit("user_online", { userId: u._id, online: true });
      })
      .catch(console.error);

    socket.join(user._id.toString());

    socket.on("private_message", async (payload, ack) => {
      try {
        const { to, text } = payload || {};
        if (!to || text === undefined || text === null) {
          if (typeof ack === "function")
            ack({ success: false, message: "Invalid payload" });
          return;
        }

        const message = new Message({ from: user._id, to, text });
        await message.save();

        const emitMessage = {
          _id: message._id,
          from: user._id,
          to,
          text,
          createdAt: message.createdAt,
        };

        io.to(to.toString()).emit("private_message", { message: emitMessage });
        io.to(user._id.toString()).emit("private_message", {
          message: emitMessage,
        });

        if (typeof ack === "function")
          ack({ success: true, message: emitMessage });
      } catch (err) {
        console.error("private_message error", err);
        if (typeof ack === "function")
          ack({ success: false, message: "Server error" });
      }
    });

    socket.on("typing", (payload) => {
      try {
        const { to, typing } = payload || {};
        if (!to) return;
        io.to(to.toString()).emit("typing", {
          from: user._id,
          typing: !!typing,
        });
      } catch (err) {
        console.error("typing error", err);
      }
    });

    socket.on("disconnect", async () => {
      console.log(
        "Socket disconnected for user:",
        user?._id?.toString(),
        "socketId:",
        socket.id
      );
      try {
        const dbUser = await User.findById(user._id);
        if (dbUser && dbUser.socketId === socket.id) {
          dbUser.online = false;
          dbUser.socketId = null;
          await dbUser.save();
          io.emit("user_online", { userId: dbUser._id, online: false });
        }
      } catch (err) {
        console.error("disconnect handling error", err);
      }
    });
  });

  return io;
};

const getIO = () => io;

module.exports = { initSocket, getIO };
