const express = require('express');
const router = express.Router();
const borrowController = require('../controllers/borrowController');
const { authenticate, requireAdmin } = require('../middleware/authMiddleware');

router.get('/mine', authenticate, borrowController.getMyRequests);
router.get('/', authenticate, requireAdmin, borrowController.getAllRequests);
router.post('/', authenticate, borrowController.createRequest);
router.put('/:id', authenticate, requireAdmin, borrowController.updateRequest);
router.put('/:id/approve', authenticate, requireAdmin, borrowController.approveRequest);
router.put('/:id/return', authenticate, requireAdmin, borrowController.returnItems);

module.exports = router;