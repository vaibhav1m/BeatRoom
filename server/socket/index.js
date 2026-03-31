const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../models/User');
const chatHandler = require('./chatHandler');
const playerHandler = require('./playerHandler');
const queueHandler = require('./queueHandler');
const notificationHandler = require('./notificationHandler');

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
    socket.on('channel:join', (channelId) => {
      socket.join(`channel:${channelId}`);
      socket.currentChannel = channelId;
      socket.to(`channel:${channelId}`).emit('channel:user-joined', {
        user: { _id: socket.user._id, username: socket.user.username, avatar: socket.user.avatar },
      });
      console.log(`  📺 ${socket.user.username} joined channel ${channelId}`);
    });

    socket.on('channel:leave', (channelId) => {
      socket.leave(`channel:${channelId}`);
      socket.to(`channel:${channelId}`).emit('channel:user-left', {
        userId: socket.user._id, username: socket.user.username,
      });
      socket.currentChannel = null;
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
      }
      console.log(`🔌 ${socket.user.username} disconnected`);
    });
  });
};

module.exports = setupSocketHandlers;
