const Channel = require('../models/Channel');
const Queue = require('../models/Queue');
const JoinRequest = require('../models/JoinRequest');
const Notification = require('../models/Notification');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// POST /api/channels
exports.createChannel = async (req, res, next) => {
  try {
    const { name, description, type, password, tags } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Channel name is required' });

    const channelData = {
      name,
      description: description || '',
      type: type || 'public',
      admin: req.user._id,
      members: [req.user._id],
      inviteCode: uuidv4().substring(0, 8).toUpperCase(),
      tags: tags || [],
    };

    if (type === 'private' && password) {
      const salt = await bcrypt.genSalt(10);
      channelData.password = await bcrypt.hash(password, salt);
    }

    const channel = await Channel.create(channelData);
    await Queue.create({ channel: channel._id, items: [] });
    const populated = await Channel.findById(channel._id).populate('admin', 'username avatar').populate('members', 'username avatar isOnline');
    res.status(201).json({ success: true, channel: populated });
  } catch (error) {
    next(error);
  }
};

// GET /api/channels
exports.getChannels = async (req, res, next) => {
  try {
    const channels = await Channel.find({ isActive: true })
      .populate('admin', 'username avatar')
      .populate('members', 'username avatar isOnline')
      .populate('currentSong')
      .sort('-createdAt');
    res.json({ success: true, channels });
  } catch (error) {
    next(error);
  }
};

// GET /api/channels/:id
exports.getChannel = async (req, res, next) => {
  try {
    const channel = await Channel.findById(req.params.id)
      .populate('admin', 'username avatar')
      .populate('members', 'username avatar isOnline')
      .populate('currentSong');
    if (!channel) return res.status(404).json({ success: false, error: 'Channel not found' });
    const queue = await Queue.findOne({ channel: channel._id })
      .populate('items.song')
      .populate('items.addedBy', 'username avatar');
    res.json({ success: true, channel, queue });
  } catch (error) {
    next(error);
  }
};

// POST /api/channels/:id/join
exports.joinChannel = async (req, res, next) => {
  try {
    const channel = await Channel.findById(req.params.id).select('+password');
    if (!channel) return res.status(404).json({ success: false, error: 'Channel not found' });
    if (channel.bannedUsers.includes(req.user._id)) {
      return res.status(403).json({ success: false, error: 'You are banned from this channel' });
    }
    if (channel.members.includes(req.user._id)) {
      return res.status(400).json({ success: false, error: 'Already a member' });
    }
    if (channel.type === 'private') {
      const { password } = req.body;
      if (!password) return res.status(400).json({ success: false, error: 'Password required for private channel' });
      const isMatch = await bcrypt.compare(password, channel.password);
      if (!isMatch) return res.status(401).json({ success: false, error: 'Incorrect channel password' });
    }
    channel.members.push(req.user._id);
    await channel.save();
    // Notify admin
    await Notification.create({
      recipient: channel.admin,
      type: 'user_joined',
      message: `${req.user.username} joined your channel "${channel.name}"`,
      data: { channelId: channel._id, userId: req.user._id },
    });
    const populated = await Channel.findById(channel._id)
      .populate('admin', 'username avatar')
      .populate('members', 'username avatar isOnline');
    res.json({ success: true, channel: populated });
  } catch (error) {
    next(error);
  }
};

// POST /api/channels/:id/leave
exports.leaveChannel = async (req, res, next) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) return res.status(404).json({ success: false, error: 'Channel not found' });
    channel.members = channel.members.filter(m => m.toString() !== req.user._id.toString());
    await channel.save();
    res.json({ success: true, message: 'Left channel' });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/channels/:id
exports.deleteChannel = async (req, res, next) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) return res.status(404).json({ success: false, error: 'Channel not found' });
    if (channel.admin.toString() !== req.user._id.toString() && req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    await Channel.findByIdAndDelete(req.params.id);
    await Queue.findOneAndDelete({ channel: req.params.id });
    res.json({ success: true, message: 'Channel deleted' });
  } catch (error) {
    next(error);
  }
};

// POST /api/channels/:id/kick/:userId
exports.kickUser = async (req, res, next) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) return res.status(404).json({ success: false, error: 'Channel not found' });
    if (channel.admin.toString() !== req.user._id.toString() && req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    channel.members = channel.members.filter(m => m.toString() !== req.params.userId);
    channel.bannedUsers.addToSet(req.params.userId);
    await channel.save();
    await Notification.create({
      recipient: req.params.userId,
      type: 'system',
      message: `You were removed from channel "${channel.name}"`,
      data: { channelId: channel._id },
    });
    res.json({ success: true, message: 'User kicked' });
  } catch (error) {
    next(error);
  }
};

// POST /api/channels/join/:inviteCode
exports.joinByInvite = async (req, res, next) => {
  try {
    const channel = await Channel.findOne({ inviteCode: req.params.inviteCode });
    if (!channel) return res.status(404).json({ success: false, error: 'Invalid invite code' });
    if (channel.members.includes(req.user._id)) {
      return res.status(400).json({ success: false, error: 'Already a member' });
    }
    if (channel.bannedUsers.includes(req.user._id)) {
      return res.status(403).json({ success: false, error: 'You are banned from this channel' });
    }
    channel.members.push(req.user._id);
    await channel.save();
    const populated = await Channel.findById(channel._id)
      .populate('admin', 'username avatar')
      .populate('members', 'username avatar isOnline');
    res.json({ success: true, channel: populated });
  } catch (error) {
    next(error);
  }
};

// POST /api/channels/:id/toggle-control
exports.toggleControl = async (req, res, next) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) return res.status(404).json({ success: false, error: 'Channel not found' });
    if (channel.admin.toString() !== req.user._id.toString() && req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    channel.allowAllControl = !channel.allowAllControl;
    await channel.save();
    res.json({ success: true, allowAllControl: channel.allowAllControl });
  } catch (error) {
    next(error);
  }
};
