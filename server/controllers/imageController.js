const GeneratedImage = require('../models/GeneratedImage');
const User = require('../models/User');

// POST /api/images  { prompt, style, imageUrl }
exports.saveImage = async (req, res, next) => {
  try {
    const { prompt, style, imageUrl } = req.body;
    if (!prompt || !imageUrl) {
      return res.status(400).json({ success: false, message: 'prompt and imageUrl are required.' });
    }
    const record = await GeneratedImage.create({ user: req.user._id, prompt, style, imageUrl });
    await User.findByIdAndUpdate(req.user._id, { $inc: { 'stats.imagesGenerated': 1 } });
    res.status(201).json({ success: true, image: record });
  } catch (err) {
    next(err);
  }
};

// GET /api/images?page=&limit=
exports.getImages = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 24, 100);
    const page = Number(req.query.page) || 1;
    const images = await GeneratedImage.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    res.json({ success: true, count: images.length, images });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/images/:id
exports.deleteImage = async (req, res, next) => {
  try {
    const img = await GeneratedImage.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!img) return res.status(404).json({ success: false, message: 'Image not found.' });
    res.json({ success: true, message: 'Image removed.' });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/images/resize-count - increments resize usage stat
exports.incrementResizeCount = async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { $inc: { 'stats.imagesResized': 1 } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};
