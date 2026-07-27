const User = require('../models/User');
const ChatMessage = require('../models/ChatMessage');
const GeneratedImage = require('../models/GeneratedImage');

// GET /api/admin/stats
exports.getStats = async (req, res, next) => {
  try {
    const [totalUsers, activeUsers, suspendedUsers, bannedUsers, totalMessages, totalImages] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ status: 'active' }),
      User.countDocuments({ status: 'suspended' }),
      User.countDocuments({ status: 'banned' }),
      ChatMessage.countDocuments(),
      GeneratedImage.countDocuments(),
    ]);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const newUsersLast7Days = await User.countDocuments({ createdAt: { $gte: sevenDaysAgo } });

    // Signups per day for the last 14 days (for charting)
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const signupTrend = await User.aggregate([
      { $match: { createdAt: { $gte: fourteenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const topGenerators = await User.find().sort({ 'stats.imagesGenerated': -1 }).limit(5).select('username stats.imagesGenerated');

    res.json({
      success: true,
      stats: {
        totalUsers,
        activeUsers,
        suspendedUsers,
        bannedUsers,
        totalMessages,
        totalImages,
        newUsersLast7Days,
        signupTrend,
        topGenerators,
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/users?search=&page=&limit=&status=&role=
exports.getUsers = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const page = Number(req.query.page) || 1;
    const filter = {};

    if (req.query.search) {
      const re = new RegExp(req.query.search, 'i');
      filter.$or = [{ username: re }, { email: re }];
    }
    if (req.query.status) filter.status = req.query.status;
    if (req.query.role) filter.role = req.query.role;

    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      User.countDocuments(filter),
    ]);

    res.json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      users: users.map((u) => u.toSafeObject()),
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/users/:id
exports.getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    const [messageCount, imageCount] = await Promise.all([
      ChatMessage.countDocuments({ user: user._id }),
      GeneratedImage.countDocuments({ user: user._id }),
    ]);

    res.json({ success: true, user: user.toSafeObject(), messageCount, imageCount });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/users/:id/status  { status: 'active'|'suspended'|'banned' }
exports.updateUserStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['active', 'suspended', 'banned'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value.' });
    }
    if (String(req.params.id) === String(req.user._id)) {
      return res.status(400).json({ success: false, message: 'You cannot change your own status.' });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, message: `User marked as ${status}.`, user: user.toSafeObject() });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/users/:id/role  { role: 'user'|'admin' }
exports.updateUserRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role value.' });
    }
    if (String(req.params.id) === String(req.user._id)) {
      return res.status(400).json({ success: false, message: 'You cannot change your own role.' });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, message: `Role updated to ${role}.`, user: user.toSafeObject() });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/admin/users/:id
exports.deleteUser = async (req, res, next) => {
  try {
    if (String(req.params.id) === String(req.user._id)) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account.' });
    }
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    await Promise.all([
      ChatMessage.deleteMany({ user: user._id }),
      GeneratedImage.deleteMany({ user: user._id }),
    ]);

    res.json({ success: true, message: 'User and their data deleted.' });
  } catch (err) {
    next(err);
  }
};
