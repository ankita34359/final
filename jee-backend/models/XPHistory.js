// models/XPHistory.js
const mongoose = require("mongoose");

const XPHistorySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
  xpChange: { type: Number, required: true },
  reason: { type: String, default: "practice_session" },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("XPHistory", XPHistorySchema);
