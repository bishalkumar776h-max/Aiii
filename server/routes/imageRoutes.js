const express = require('express');
const router = express.Router();
const imageController = require('../controllers/imageController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.post('/', imageController.saveImage);
router.get('/', imageController.getImages);
router.delete('/:id', imageController.deleteImage);
router.patch('/resize-count', imageController.incrementResizeCount);

module.exports = router;
