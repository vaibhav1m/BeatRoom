const Channel = require('../models/Channel');
const Song = require('../models/Song');

const playerHandler = (io, socket) => {
  // Play song
  socket.on('player:play', async (data) => {
    try {
      const { channelId, songId, currentTime } = data;
      const channel = await Channel.findById(channelId);
      if (!channel) return;
      // Check if allowed to control
      if (!channel.allowAllControl && channel.admin.toString() !== socket.user._id.toString() && socket.user.role !== 'superadmin') {
        return socket.emit('error', { message: 'Only admin can control playback' });
      }
      channel.currentSong = songId;
      channel.playbackState = { isPlaying: true, currentTime: currentTime || 0, updatedAt: new Date() };
      await channel.save();
      // Increment play count
      if (songId) await Song.findByIdAndUpdate(songId, { $inc: { playCount: 1 } });
      const song = songId ? await Song.findById(songId) : null;
      io.to(`channel:${channelId}`).emit('player:state', {
        isPlaying: true, currentTime: currentTime || 0, song,
        controlledBy: socket.user.username,
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
      channel.playbackState = { isPlaying: false, currentTime, updatedAt: new Date() };
      await channel.save();
      io.to(`channel:${channelId}`).emit('player:state', {
        isPlaying: false, currentTime, controlledBy: socket.user.username,
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
      channel.playbackState.currentTime = currentTime;
      channel.playbackState.updatedAt = new Date();
      await channel.save();
      io.to(`channel:${channelId}`).emit('player:seek', {
        currentTime, controlledBy: socket.user.username,
      });
    } catch (err) {
      socket.emit('error', { message: 'Failed to seek' });
    }
  });

  // Request sync (when new user joins)
  socket.on('player:request-sync', async (data) => {
    try {
      const { channelId } = data;
      const channel = await Channel.findById(channelId).populate('currentSong');
      if (channel && channel.currentSong) {
        const timeDiff = (Date.now() - new Date(channel.playbackState.updatedAt).getTime()) / 1000;
        const syncedTime = channel.playbackState.isPlaying
          ? channel.playbackState.currentTime + timeDiff
          : channel.playbackState.currentTime;
        socket.emit('player:state', {
          isPlaying: channel.playbackState.isPlaying,
          currentTime: syncedTime,
          song: channel.currentSong,
        });
      }
    } catch (err) {
      socket.emit('error', { message: 'Failed to sync' });
    }
  });
};

module.exports = playerHandler;
