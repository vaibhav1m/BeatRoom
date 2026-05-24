const Channel = require('../models/Channel');
const Song = require('../models/Song');

const computeSyncedTime = (playbackState) => {
  if (!playbackState) return 0;
  if (!playbackState.isPlaying) return playbackState.currentTime || 0;
  if (playbackState.startedAt) {
    return Math.max(0, (Date.now() - new Date(playbackState.startedAt).getTime()) / 1000);
  }
  const elapsed = (Date.now() - new Date(playbackState.updatedAt).getTime()) / 1000;
  return Math.max(0, (playbackState.currentTime || 0) + elapsed);
};

const playerHandler = (io, socket) => {
  // Play song
  socket.on('player:play', async (data) => {
    try {
      const { channelId, songId, currentTime } = data;
      const channel = await Channel.findById(channelId);
      if (!channel) return;
      if (!channel.allowAllControl && channel.admin.toString() !== socket.user._id.toString() && socket.user.role !== 'superadmin') {
        return socket.emit('error', { message: 'Only admin can control playback' });
      }
      const ct = currentTime || 0;
      const startedAt = new Date(Date.now() - ct * 1000);
      channel.currentSong = songId;
      channel.playbackState = { isPlaying: true, currentTime: ct, updatedAt: new Date(), startedAt };
      await channel.save();
      if (songId) await Song.findByIdAndUpdate(songId, { $inc: { playCount: 1 } });
      const song = songId ? await Song.findById(songId) : null;
      io.to(`channel:${channelId}`).emit('player:state', {
        isPlaying: true,
        currentTime: ct,
        startedAt: startedAt.getTime(), // ms number for client clock math
        action: 'play',
        song,
        controlledBy: socket.user.username,
        serverTime: Date.now(),
      });
    } catch (err) {
      socket.emit('error', { message: 'Failed to play' });
    }
  });

  // Pause
  socket.on('player:pause', async (data) => {
    try {
      const { channelId, currentTime } = data;
      const channel = await Channel.findById(channelId);
      if (!channel) return;
      if (!channel.allowAllControl && channel.admin.toString() !== socket.user._id.toString() && socket.user.role !== 'superadmin') {
        return socket.emit('error', { message: 'Only admin can control playback' });
      }
      const prevStartedAt = channel.playbackState.startedAt;
      channel.playbackState = {
        isPlaying: false,
        currentTime,
        updatedAt: new Date(),
        startedAt: prevStartedAt,
      };
      await channel.save();
      io.to(`channel:${channelId}`).emit('player:state', {
        isPlaying: false,
        currentTime,
        startedAt: prevStartedAt ? new Date(prevStartedAt).getTime() : null,
        action: 'pause',
        controlledBy: socket.user.username,
        serverTime: Date.now(),
      });
    } catch (err) {
      socket.emit('error', { message: 'Failed to pause' });
    }
  });

  // Seek
  socket.on('player:seek', async (data) => {
    try {
      const { channelId, currentTime } = data;
      const channel = await Channel.findById(channelId);
      if (!channel) return;
      if (!channel.allowAllControl && channel.admin.toString() !== socket.user._id.toString() && socket.user.role !== 'superadmin') {
        return socket.emit('error', { message: 'Only admin can control playback' });
      }
      const startedAt = channel.playbackState.isPlaying
        ? new Date(Date.now() - currentTime * 1000)
        : channel.playbackState.startedAt;
      channel.playbackState = {
        isPlaying: channel.playbackState.isPlaying,
        currentTime,
        updatedAt: new Date(),
        startedAt,
      };
      await channel.save();
      io.to(`channel:${channelId}`).emit('player:seek', {
        currentTime,
        startedAt: startedAt ? new Date(startedAt).getTime() : null, // ms for client
        controlledBy: socket.user.username,
        serverTime: Date.now(),
      });
    } catch (err) {
      socket.emit('error', { message: 'Failed to seek' });
    }
  });

  // Request sync (fallback used by heartbeat recovery path)
  socket.on('player:request-sync', async (data) => {
    try {
      const { channelId } = data;
      const channel = await Channel.findById(channelId).populate('currentSong');
      if (channel && channel.currentSong) {
        const pb = channel.playbackState;
        socket.emit('player:state', {
          isPlaying: pb.isPlaying,
          currentTime: computeSyncedTime(pb),
          startedAt: pb.startedAt ? new Date(pb.startedAt).getTime() : null,
          action: 'sync',
          song: channel.currentSong,
          serverTime: Date.now(),
        });
      }
    } catch (err) {
      socket.emit('error', { message: 'Failed to sync' });
    }
  });

  // Toggle repeat mode — broadcast only, no DB persistence
  socket.on('player:repeat', ({ channelId, isRepeat }) => {
    socket.to(`channel:${channelId}`).emit('player:repeat', { isRepeat });
  });
};

module.exports = playerHandler;
