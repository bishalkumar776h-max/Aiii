const ChatMessage = require('../models/ChatMessage');
const User = require('../models/User');

// POST /api/chat/message  { sessionId, sender, text }
exports.saveMessage = async (req, res, next) => {
  try {
    const { sessionId, sender, text } = req.body;
    if (!sessionId || !sender || !text) {
      return res.status(400).json({ success: false, message: 'sessionId, sender and text are required.' });
    }
    const msg = await ChatMessage.create({ user: req.user._id, sessionId, sender, text });

    if (sender === 'user') {
      await User.findByIdAndUpdate(req.user._id, { $inc: { 'stats.chatMessagesSent': 1 } });
    }

    res.status(201).json({ success: true, message: msg });
  } catch (err) {
    next(err);
  }
};

// GET /api/chat/history?sessionId=&limit=&page=
exports.getHistory = async (req, res, next) => {
  try {
    const { sessionId } = req.query;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const page = Number(req.query.page) || 1;

    const filter = { user: req.user._id };
    if (sessionId) filter.sessionId = sessionId;

    const messages = await ChatMessage.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({ success: true, count: messages.length, messages: messages.reverse() });
  } catch (err) {
    next(err);
  }
};

// GET /api/chat/sessions - list distinct sessions with last message preview
exports.getSessions = async (req, res, next) => {
  try {
    const sessions = await ChatMessage.aggregate([
      { $match: { user: req.user._id } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$sessionId',
          lastMessage: { $first: '$text' },
          lastAt: { $first: '$createdAt' },
          count: { $sum: 1 },
        },
      },
      { $sort: { lastAt: -1 } },
      { $limit: 30 },
    ]);
    res.json({ success: true, sessions });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/chat/session/:sessionId
exports.deleteSession = async (req, res, next) => {
  try {
    await ChatMessage.deleteMany({ user: req.user._id, sessionId: req.params.sessionId });
    res.json({ success: true, message: 'Session deleted.' });
  } catch (err) {
    next(err);
  }
};
