const Message = require("../models/Message");

// send a new message
exports.sendMessage = async (req, res) => {
  try {
    const { to, text } = req.body;
    if (!to || text === undefined || text === null)
      return res.status(400).json({ message: "Missing fields" });

    const message = new Message({ from: req.user._id, to, text });
    await message.save();

    res.json({ message });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// get conversation with pagination (cursor by timestamp)
// Query params:
//   limit - number of messages to return (default 20)
//   before - ISO timestamp (e.g. 2025-09-14T12:34:56.000Z). Returns messages created before this timestamp.
// Behavior: returns messages sorted from oldest -> newest (so Flutter can prepend older messages when scrolling up).
exports.getConversation = async (req, res) => {
  try {
    const otherUserId = req.params.userId;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const before = req.query.before ? new Date(req.query.before) : null;

    const baseQuery = {
      $or: [
        { from: req.user._id, to: otherUserId },
        { from: otherUserId, to: req.user._id },
      ],
    };

    if (before) {
      baseQuery.createdAt = { $lt: before };
    }

    let messages = await Message.find(baseQuery)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("from", "name avatar")
      .populate("to", "name avatar");

    messages = messages.reverse(); // oldest -> newest

    res.json({ messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};
