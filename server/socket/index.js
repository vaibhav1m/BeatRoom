const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../models/User');
const chatHandler = require('./chatHandler');
const playerHandler = require('./playerHandler');
const queueHandler = require('./queueHandler');
const notificationHandler = require('./notificationHandler');

const Channel = require('../models/Channel');

// Helper: compute accurate current playback time
const computeSyncedTime = (pb) => {
  if (!pb || !pb.isPlaying) return pb?.currentTime || 0;
  if (pb.startedAt) return Math.max(0, (Date.now() - new Date(pb.startedAt).getTime()) / 1000);
  const elapsed = (Date.now() - new Date(pb.updatedAt).getTime()) / 1000;
  return Math.max(0, (pb.currentTime || 0) + elapsed);
};

const setupSocketHandlers = (io) => {
  // Auth middleware for socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));
      const decoded = jwt.verify(token, config.JWT_SECRET);
      const user = await User.findById(decoded.id);
      if (!user) return next(new Error('User not found'));
      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    console.log(`🔌 ${socket.user.username} connected (${socket.id})`);

    // Update online status
    await User.findByIdAndUpdate(socket.user._id, { isOnline: true });
    io.emit('user:online', { userId: socket.user._id, username: socket.user.username });

    // Channel join/leave
    socket.on('channel:join', async (channelId) => {
      socket.join(`channel:${channelId}`);
      socket.currentChannel = channelId;
      socket.to(`channel:${channelId}`).emit('channel:user-joined', {
        user: { _id: socket.user._id, username: socket.user.username, avatar: socket.user.avatar },
      });
      socket.to(`channel:${channelId}`).emit('chat:system', {
        text: `${socket.user.username} joined the channel`,
        type: 'join',
        timestamp: new Date(),
      });

      // Proactively push current playback state to the joining socket.
      // This is the primary sync mechanism — more reliable than waiting for
      // client to emit player:request-sync and hoping the listener is ready.
      try {
        const channel = await Channel.findById(channelId).populate('currentSong');
        if (channel?.currentSong) {
          socket.emit('player:state', {
            isPlaying: channel.playbackState.isPlaying,
            currentTime: computeSyncedTime(channel.playbackState),
            song: channel.currentSong,
          });
        }
      } catch (e) {
        console.error('Join sync error:', e.message);
      }

      console.log(`  📺 ${socket.user.username} joined channel ${channelId}`);
    });

    socket.on('channel:leave', async (channelId) => {
      socket.leave(`channel:${channelId}`);
      socket.to(`channel:${channelId}`).emit('channel:user-left', {
        userId: socket.user._id, username: socket.user.username,
      });
      socket.to(`channel:${channelId}`).emit('chat:system', {
        text: `${socket.user.username} left the channel`,
        type: 'leave',
        timestamp: new Date(),
      });
      socket.currentChannel = null;
      // Auto-pause if channel has no more online members
      try {
        const room = io.sockets.adapter.rooms.get(`channel:${channelId}`);
        const onlineCount = room ? room.size : 0;
        if (onlineCount === 0) {
          const Channel = require('../models/Channel');
          await Channel.findByIdAndUpdate(channelId, {
            'playbackState.isPlaying': false,
            'playbackState.updatedAt': new Date(),
          });
          io.to(`channel:${channelId}`).emit('player:state', { isPlaying: false, currentTime: 0 });
        }
      } catch (e) {}
    });

    // Set up feature handlers
    chatHandler(io, socket);
    playerHandler(io, socket);
    queueHandler(io, socket);
    notificationHandler(io, socket);

    // Disconnect
    socket.on('disconnect', async () => {
      await User.findByIdAndUpdate(socket.user._id, { isOnline: false, lastSeen: new Date() });
      io.emit('user:offline', { userId: socket.user._id });
      if (socket.currentChannel) {
        socket.to(`channel:${socket.currentChannel}`).emit('channel:user-left', {
          userId: socket.user._id, username: socket.user.username,
        });
        try {
          const room = io.sockets.adapter.rooms.get(`channel:${socket.currentChannel}`);
          const onlineCount = room ? room.size : 0;
          if (onlineCount === 0) {
            const Channel = require('../models/Channel');
            await Channel.findByIdAndUpdate(socket.currentChannel, {
              'playbackState.isPlaying': false,
              'playbackState.updatedAt': new Date(),
            });
          }
        } catch (e) {}
      }
      console.log(`🔌 ${socket.user.username} disconnected`);
    });
  });
};

module.exports = setupSocketHandlers;
