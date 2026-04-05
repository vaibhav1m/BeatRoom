const Channel = require('../models/Channel');
const Song = require('../models/Song');

// Helper: compute accurate current playback time from stored state
const computeSyncedTime = (playbackState) => {
  if (!playbackState) return 0;
  if (!playbackState.isPlaying) return playbackState.currentTime || 0;
  // Use startedAt for accuracy (single subtraction, no accumulated drift)
  if (playbackState.startedAt) {
    return Math.max(0, (Date.now() - new Date(playbackState.startedAt).getTime()) / 1000);
  }
  // Fallback: updatedAt + currentTime
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
      // startedAt = timestamp that represents "when would 0:00 have been played"
      const startedAt = new Date(Date.now() - ct * 1000);
      channel.currentSong = songId;
      channel.playbackState = { isPlaying: true, currentTime: ct, updatedAt: new Date(), startedAt };
      await channel.save();
      if (songId) await Song.findByIdAndUpdate(songId, { $inc: { playCount: 1 } });
      const song = songId ? await Song.findById(songId) : null;
      io.to(`channel:${channelId}`).emit('player:state', {
        isPlaying: true, currentTime: ct, song,
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
      // Preserve startedAt when pausing so we know where we were
      channel.playbackState = {
        isPlaying: false,
        currentTime,
        updatedAt: new Date(),
        startedAt: channel.playbackState.startedAt,
      };
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
      // Recalculate startedAt for the new position
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
        currentTime, controlledBy: socket.user.username,
      });
    } catch (err) {
      socket.emit('error', { message: 'Failed to seek' });
    }
  });

  // Request sync (fallback — channel:join now handles primary sync)
  socket.on('player:request-sync', async (data) => {
    try {
      const { channelId } = data;
      const channel = await Channel.findById(channelId).populate('currentSong');
      if (channel && channel.currentSong) {
        socket.emit('player:state', {
          isPlaying: channel.playbackState.isPlaying,
          currentTime: computeSyncedTime(channel.playbackState),
          song: channel.currentSong,
        });
      }
    } catch (err) {
      socket.emit('error', { message: 'Failed to sync' });
    }
  });

  // Toggle repeat mode — broadcast to all channel members
  socket.on('player:repeat', ({ channelId, isRepeat }) => {
    socket.to(`channel:${channelId}`).emit('player:repeat', { isRepeat });
  });
};

module.exports = playerHandler;
