// index.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const User = require("./models/User");
const XPHistory = require("./models/XPHistory");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8000;
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("MONGODB_URI missing in .env");
  process.exit(1);
}

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ MongoDB connected"))
.catch((err) => {
  console.error("❌ MongoDB connection error:", err);
  process.exit(1);
});

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.post("/api/xp/update", async (req, res) => {
  try {
    const { userId, username, displayName, xpChange, reason } = req.body;
    if (typeof xpChange !== "number") {
      return res.status(400).json({ error: "xpChange (number) is required" });
    }

    let user;

    if (userId) {
      user = await User.findByIdAndUpdate(
        userId,
        { $inc: { total_xp: xpChange }, $set: { updatedAt: new Date(), displayName: displayName || undefined } },
        { new: true }
      ).lean();
    } else if (username) {
      user = await User.findOneAndUpdate(
        { username },
        { $inc: { total_xp: xpChange }, $set: { updatedAt: new Date(), displayName: displayName || username } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      ).lean();
    } else {
      return res.status(400).json({ error: "Provide userId or username" });
    }

    await XPHistory.create({
      userId: user._id,
      xpChange,
      reason: reason || "practice_session"
    });

    return res.json({ status: "ok", total_xp: user.total_xp, userId: user._id });
  } catch (err) {
    console.error("update xp error:", err);
    return res.status(500).json({ error: "internal" });
  }
});

app.get("/api/leaderboard", async (req, res) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit || "20", 10));
    const userId = req.query.userId;

    const top = await User.find({}, { username: 1, displayName: 1, avatarUrl: 1, total_xp: 1 })
      .sort({ total_xp: -1 })
      .limit(limit)
      .lean();

    let user_rank = null;
    if (userId) {
      const user = await User.findById(userId, { total_xp: 1 }).lean();
      if (!user) {
        user_rank = { rank: null, total_xp: 0 };
      } else {
        const higherCount = await User.countDocuments({ total_xp: { $gt: user.total_xp } });
        user_rank = { rank: higherCount + 1, total_xp: user.total_xp };
      }
    }

    return res.json({ top, user_rank });
  } catch (err) {
    console.error("leaderboard error:", err);
    return res.status(500).json({ error: "internal" });
  }
});

app.get("/api/test-insert", async (req, res) => {
  try {
    const u = await User.create({ username: `user_${Date.now()}`, displayName: "Test User" });
    res.json(u);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
