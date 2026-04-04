const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  createChannel, getChannels, getChannel, joinChannel, leaveChannel,
  deleteChannel, kickUser, joinByInvite, getChannelByInvite, toggleControl, unbanUser,
} = require('../controllers/channelController');

router.post('/', auth, createChannel);
router.get('/', auth, getChannels);
router.get('/:id', auth, getChannel);
router.post('/:id/join', auth, joinChannel);
router.post('/:id/leave', auth, leaveChannel);
router.delete('/:id', auth, deleteChannel);
router.post('/:id/kick/:userId', auth, kickUser);
router.post('/:id/unban/:userId', auth, unbanUser);
router.get('/invite/:inviteCode', auth, getChannelByInvite);
router.post('/join/:inviteCode', auth, joinByInvite);
router.post('/:id/toggle-control', auth, toggleControl);

module.exports = router;
