const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

router.post(
  '/register',
  authLimiter,
  [
    body('username').trim().isLength({ min: 3, max: 30 }).withMessage('Username must be 3-30 characters.')
      .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain letters, numbers and underscores.'),
    body('email').isEmail().withMessage('Valid email is required.'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
  ],
  authController.register
);

router.post(
  '/login',
  authLimiter,
  [
    body('emailOrUsername').notEmpty().withMessage('Email or username is required.'),
    body('password').notEmpty().withMessage('Password is required.'),
  ],
  authController.login
);

router.post('/logout', authController.logout);
router.get('/me', protect, authController.getMe);
router.patch('/profile', protect, authController.updateProfile);
router.patch('/password', protect, authController.changePassword);

module.exports = router;
