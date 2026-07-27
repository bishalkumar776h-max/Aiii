const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.post('/message', chatController.saveMessage);
router.get('/history', chatController.getHistory);
router.get('/sessions', chatController.getSessions);
router.delete('/session/:sessionId', chatController.deleteSession);

module.exports = router;
