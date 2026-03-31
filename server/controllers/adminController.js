const User = require('../models/User');
const Channel = require('../models/Channel');
const Song = require('../models/Song');
const Playlist = require('../models/Playlist');

// GET /api/admin/stats
exports.getStats = async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments();
    const onlineUsers = await User.countDocuments({ isOnline: true });
    const totalChannels = await Channel.countDocuments({ isActive: true });
    const totalSongs = await Song.countDocuments();
    const totalPlaylists = await Playlist.countDocuments();

    const mostActiveChannels = await Channel.find({ isActive: true })
      .sort('-members')
      .limit(5)
      .populate('admin', 'username avatar');

    const mostPlayedSongs = await Song.find()
      .sort('-playCount')
      .limit(10);

    const popularPlaylists = await Playlist.find({ visibility: 'public' })
      .sort('-followers')
      .limit(5)
      .populate('owner', 'username avatar');

    const recentUsers = await User.find()
      .sort('-createdAt')
      .limit(10)
      .select('username avatar isOnline createdAt');

    res.json({
      success: true,
      stats: {
        totalUsers, onlineUsers, totalChannels, totalSongs, totalPlaylists,
        mostActiveChannels, mostPlayedSongs, popularPlaylists, recentUsers,
      },
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/admin/channels/:id
exports.forceDeleteChannel = async (req, res, next) => {
  try {
    await Channel.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Channel deleted by admin' });
  } catch (error) {
    next(error);
  }
};

// POST /api/admin/users/:id/ban
exports.banUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    if (user.role === 'superadmin') return res.status(403).json({ success: false, error: 'Cannot ban superadmin' });
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'User banned and removed' });
  } catch (error) {
    next(error);
  }
};
