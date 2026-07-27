const { verifyToken } = require('../utils/jwt');
const User = require('../models/User');

/**
 * Verifies the JWT (from httpOnly cookie or Authorization header),
 * loads the user, and attaches it to req.user.
 */
async function protect(req, res, next) {
  try {
    const cookieName = process.env.COOKIE_NAME || 'aips_token';
    let token = req.cookies?.[cookieName];

    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authenticated. Please log in.' });
    }

    const decoded = verifyToken(token);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ success: false, message: 'User no longer exists.' });
    }
    if (user.status !== 'active') {
      return res.status(403).json({ success: false, message: `Account is ${user.status}. Contact support.` });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired session.' });
  }
}

/** Restricts a route to admins only. Must run after protect(). */
function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required.' });
  }
  next();
}

/** Optional auth: attaches req.user if a valid token exists, otherwise continues silently. */
async function optionalAuth(req, res, next) {
  try {
    const cookieName = process.env.COOKIE_NAME || 'aips_token';
    const token = req.cookies?.[cookieName];
    if (!token) return next();
    const decoded = verifyToken(token);
    const user = await User.findById(decoded.id);
    if (user && user.status === 'active') req.user = user;
  } catch (_) {
    /* ignore invalid token for optional auth */
  }
  next();
}

module.exports = { protect, adminOnly, optionalAuth };
