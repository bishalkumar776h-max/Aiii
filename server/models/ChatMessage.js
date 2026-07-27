const mongoose = require('mongoose');

const ChatMessageSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    sender: { type: String, enum: ['user', 'bot'], required: true },
    text: { type: String, required: true, maxlength: 8000 },
  },
  { timestamps: true }
);

ChatMessageSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('ChatMessage', ChatMessageSchema);
