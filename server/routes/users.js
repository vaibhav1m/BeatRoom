const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getUsers, getUser, updateProfile, sendFriendRequest, respondFriendRequest, getFriends } = require('../controllers/userController');

router.get('/', auth, getUsers);
router.get('/friends', auth, getFriends);
router.put('/profile', auth, updateProfile);
router.get('/:id', auth, getUser);
router.post('/friend-request/:userId', auth, sendFriendRequest);
router.post('/friend-request/:requestId/respond', auth, respondFriendRequest);

module.exports = router;
