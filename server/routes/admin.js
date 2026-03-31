const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { superAdminOnly } = require('../middleware/admin');
const { getStats, forceDeleteChannel, banUser } = require('../controllers/adminController');

router.get('/stats', auth, getStats);
router.delete('/channels/:id', auth, superAdminOnly, forceDeleteChannel);
router.post('/users/:id/ban', auth, superAdminOnly, banUser);

module.exports = router;
