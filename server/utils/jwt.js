const jwt = require('jsonwebtoken');

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

function sendTokenCookie(res, token) {
  const cookieName = process.env.COOKIE_NAME || 'aips_token';
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  });
}

function clearTokenCookie(res) {
  const cookieName = process.env.COOKIE_NAME || 'aips_token';
  res.clearCookie(cookieName, { path: '/' });
}

module.exports = { signToken, verifyToken, sendTokenCookie, clearTokenCookie };
