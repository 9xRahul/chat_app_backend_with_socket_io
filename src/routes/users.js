const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const User = require("../models/User");

// get current user
router.get("/me", auth, (req, res) => {
  res.json({ user: req.user });
});

// list all users except the logged-in one, with optional search and pagination
// query params:
//   q - search term for name
//   limit - items per page (default 20)
//   page - page number (default 1)
router.get("/", auth, async (req, res) => {
  try {
    const q = req.query.q || "";
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;

    const filter = {
      _id: { $ne: req.user._id },
      name: { $regex: q, $options: "i" },
    };

    const [users, total] = await Promise.all([
      User.find(filter).select("-password").skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);

    res.json({
      users,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
