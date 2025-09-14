const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("./models/User");
const Message = require("./models/Message");

let io;

/**
 * Initialize socket.io
 * @param httpServer - node http server (created from http.createServer(app))
 * @param options - optional socket.io options
 */
const initSocket = (httpServer, options = {}) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_ORIGIN || "*",
      methods: ["GET", "POST"],
    },
    ...options,
  });

  // middleware to authenticate socket connections using JWT
  io.use(async (socket, next) => {
    try {
      // token can be passed via auth or query
      const token =
        socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error("Authentication error: No token"));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      if (!user) return next(new Error("Authentication error: User not found"));

      socket.user = user;
      next();
    } catch (err) {
      console.error("Socket auth error", err.message);
      next(new Error("Authentication error"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.user;
    if (!user) {
      socket.disconnect(true);
      return;
    }

    console.log("Socket connected:", user._id, "socketId:", socket.id);

    // mark user online and save socket id
    User.findByIdAndUpdate(
      user._id,
      { online: true, socketId: socket.id },
      { new: true }
    )
      .select("-password")
      .then((u) => {
        // notify others (optional) that user is online
        io.emit("user_online", { userId: u._id, online: true });
      })
      .catch(console.error);

    // join personal room by user id so we can emit privately by room
    socket.join(user._id.toString());

    /**
     * private_message handler
     * payload: { to: recipientUserId, text: '...' }
     */
    socket.on("private_message", async (payload, ack) => {
      try {
        const { to, text } = payload || {};
        if (!to || text === undefined || text === null) {
          if (typeof ack === "function")
            ack({ success: false, message: "Invalid payload" });
          return;
        }

        // save message
        const message = new Message({ from: user._id, to, text });
        await message.save();

        // populate minimal fields for emit
        const emitMessage = {
          _id: message._id,
          from: user._id,
          to,
          text,
          createdAt: message.createdAt,
          updatedAt: message.updatedAt,
        };

        // emit to recipient room
        io.to(to.toString()).emit("private_message", { message: emitMessage });

        // also emit to sender's own room (so other devices of sender get it)
        io.to(user._id.toString()).emit("private_message", {
          message: emitMessage,
        });

        // ack to sender
        if (typeof ack === "function")
          ack({ success: true, message: emitMessage });
      } catch (err) {
        console.error("private_message error", err);
        if (typeof ack === "function")
          ack({ success: false, message: "Server error" });
      }
    });

    // typing indicator example: { to: recipientId, typing: true/false }
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

    // handle disconnect
    socket.on("disconnect", async () => {
      console.log("Socket disconnected:", user._id, "socketId:", socket.id);
      try {
        // only clear if this socket id matches saved one (in case user has multiple devices)
        const dbUser = await User.findById(user._id);
        if (dbUser) {
          // if socketId matches, set offline, else don't change (user has other device)
          if (dbUser.socketId === socket.id) {
            dbUser.online = false;
            dbUser.socketId = null;
            await dbUser.save();
            io.emit("user_online", { userId: dbUser._id, online: false });
          }
        }
      } catch (err) {
        console.error("disconnect handling error", err);
      }
    });
  }); // io.on('connection')
};

module.exports = { initSocket };
