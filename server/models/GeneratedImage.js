const mongoose = require('mongoose');

const GeneratedImageSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    prompt: { type: String, required: true, maxlength: 2000 },
    style: { type: String, default: 'realistic' },
    imageUrl: { type: String, required: true },
  },
  { timestamps: true }
);

GeneratedImageSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('GeneratedImage', GeneratedImageSchema);
