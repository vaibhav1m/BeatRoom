const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../models/User');
const chatHandler = require('./chatHandler');
const playerHandler = require('./playerHandler');
const queueHandler = require('./queueHandler');
const notificationHandler = require('./notificationHandler');

const Channel = require('../models/Channel');

const computeSyncedTime = (pb) => {
  if (!pb || !pb.isPlaying) return pb?.currentTime || 0;
  if (pb.startedAt) return Math.max(0, (Date.now() - new Date(pb.startedAt).getTime()) / 1000);
  const elapsed = (Date.now() - new Date(pb.updatedAt).getTime()) / 1000;
  return Math.max(0, (pb.currentTime || 0) + elapsed);
};

const setupSocketHandlers = (io) => {
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

    await User.findByIdAndUpdate(socket.user._id, { isOnline: true });
    io.emit('user:online', { userId: socket.user._id, username: socket.user.username });

    // Clock sync — send plain ms timestamp so client can compute skew
    socket.on('time:sync', (clientTime, ack) => {
      if (typeof ack === 'function') ack(Date.now());
    });

    // Fresh authoritative state fetched at the exact moment YT player fires onReady.
    // Using a socket ack (not REST) gives lower latency and fresher data.
    socket.on('player:request-state', async ({ channelId }, ack) => {
      if (typeof ack !== 'function') return;
      try {
        const channel = await Channel.findById(channelId).populate('currentSong').lean();
        if (!channel || !channel.playbackState?.isPlaying) return ack(null);
        const pb = channel.playbackState;
        ack({
          startedAt:   pb.startedAt ? new Date(pb.startedAt).getTime() : null,
          isPlaying:   pb.isPlaying,
          currentSong: channel.currentSong,
        });
      } catch (e) {
        ack(null);
      }
    });

    // Channel join/leave
    socket.on('channel:join', async (channelId) => {
      const roomName = `channel:${channelId}`;
      const alreadyInRoom = socket.rooms.has(roomName);
      socket.join(roomName);
      socket.currentChannel = channelId;

      if (!alreadyInRoom) {
        socket.to(roomName).emit('channel:user-joined', {
          user: { _id: socket.user._id, username: socket.user.username, avatar: socket.user.avatar },
        });
        socket.to(roomName).emit('chat:system', {
          text: `${socket.user.username} joined the channel`,
          type: 'join',
          timestamp: new Date(),
        });
      }

      // Push current song to the joining socket so the client can start loading
      // the YT player. The actual seek position is fetched fresh via player:request-state
      // at onReady time — this push is just for song metadata.
      try {
        const channel = await Channel.findById(channelId).populate('currentSong');
        if (channel?.currentSong) {
          const pb = channel.playbackState;
          socket.emit('player:state', {
            isPlaying:   pb.isPlaying,
            currentTime: computeSyncedTime(pb),
            startedAt:   pb.startedAt ? new Date(pb.startedAt).getTime() : null,
            action:      'join',
            song:        channel.currentSong,
            serverTime:  Date.now(),
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
      try {
        const room = io.sockets.adapter.rooms.get(`channel:${channelId}`);
        const onlineCount = room ? room.size : 0;
        if (onlineCount === 0) {
          await Channel.findByIdAndUpdate(channelId, {
            'playbackState.isPlaying': false,
            'playbackState.updatedAt': new Date(),
          });
          io.to(`channel:${channelId}`).emit('player:state', { isPlaying: false, currentTime: 0, action: 'pause' });
        }
      } catch (e) {}
    });

    chatHandler(io, socket);
    playerHandler(io, socket);
    queueHandler(io, socket);
    notificationHandler(io, socket);

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

  // Heartbeat every 5s — now includes startedAt so clients can recompute position
  // using the invariant rather than adding elapsed time to a stale currentTime.
  setInterval(async () => {
    try {
      const rooms = io.sockets.adapter.rooms;
      const channelIds = [];
      for (const [name, sockets] of rooms.entries()) {
        if (name.startsWith('channel:') && sockets.size > 0) {
          channelIds.push(name.slice('channel:'.length));
        }
      }
      if (!channelIds.length) return;

      const channels = await Channel.find({ _id: { $in: channelIds } })
        .populate('currentSong')
        .select('currentSong playbackState');

      for (const ch of channels) {
        if (!ch.currentSong) continue;
        const pb = ch.playbackState;
        io.to(`channel:${ch._id}`).emit('player:heartbeat', {
          isPlaying:   pb.isPlaying,
          currentTime: computeSyncedTime(pb),
          startedAt:   pb.startedAt ? new Date(pb.startedAt).getTime() : null,
          songId:      String(ch.currentSong._id),
          serverTime:  Date.now(),
        });
      }
    } catch (e) {
      console.error('Heartbeat error:', e.message);
    }
  }, 5000);
};

module.exports = setupSocketHandlers;
