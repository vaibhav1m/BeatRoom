const User = require('../models/User');
const Playlist = require('../models/Playlist');

// GET /api/users
exports.getUsers = async (req, res, next) => {
  try {
    const users = await User.find().select('-friendRequests -listeningHistory').sort('-createdAt');
    res.json({ success: true, users });
  } catch (error) {
    next(error);
  }
};

// GET /api/users/:id
exports.getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-friendRequests -listeningHistory').populate('friends', 'username avatar isOnline');
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    const playlists = await Playlist.find({
      $or: [
        { owner: user._id, visibility: 'public' },
        { owner: user._id, $or: [{ owner: req.user._id }, { collaborators: req.user._id }] },
      ],
    }).populate('owner', 'username avatar');
    res.json({ success: true, user, playlists });
  } catch (error) {
    next(error);
  }
};

// PUT /api/users/profile
exports.updateProfile = async (req, res, next) => {
  try {
    const { username, bio, avatar } = req.body;
    const updates = {};
    if (username) updates.username = username;
    if (bio !== undefined) updates.bio = bio;
    if (avatar !== undefined) updates.avatar = avatar;
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
    res.json({ success: true, user });
  } catch (error) {
    next(error);
  }
};

// POST /api/users/friend-request/:userId
exports.sendFriendRequest = async (req, res, next) => {
  try {
    const targetUser = await User.findById(req.params.userId);
    if (!targetUser) return res.status(404).json({ success: false, error: 'User not found' });
    if (targetUser._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, error: 'Cannot send friend request to yourself' });
    }
    const existing = targetUser.friendRequests.find(
      r => r.from.toString() === req.user._id.toString() && r.status === 'pending'
    );
    if (existing) return res.status(400).json({ success: false, error: 'Friend request already sent' });
    if (req.user.friends.includes(targetUser._id)) {
      return res.status(400).json({ success: false, error: 'Already friends' });
    }
    targetUser.friendRequests.push({ from: req.user._id });
    await targetUser.save();
    res.json({ success: true, message: 'Friend request sent' });
  } catch (error) {
    next(error);
  }
};

// POST /api/users/friend-request/:requestId/respond
exports.respondFriendRequest = async (req, res, next) => {
  try {
    const { action } = req.body; // 'accept' or 'reject'
    const user = await User.findById(req.user._id);
    const request = user.friendRequests.id(req.params.requestId);
    if (!request) return res.status(404).json({ success: false, error: 'Request not found' });
    if (action === 'accept') {
      request.status = 'accepted';
      user.friends.addToSet(request.from);
      const sender = await User.findById(request.from);
      sender.friends.addToSet(user._id);
      await sender.save();
    } else {
      request.status = 'rejected';
    }
    await user.save();
    res.json({ success: true, message: `Friend request ${action}ed` });
  } catch (error) {
    next(error);
  }
};

// GET /api/users/friends
exports.getFriends = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate('friends', 'username avatar isOnline lastSeen');
    res.json({ success: true, friends: user.friends });
  } catch (error) {
    next(error);
  }
};
