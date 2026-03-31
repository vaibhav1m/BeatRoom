const Queue = require('../models/Queue');
const Song = require('../models/Song');
const Channel = require('../models/Channel');

const queueHandler = (io, socket) => {
  // Add to queue
  socket.on('queue:add', async (data) => {
    try {
      const { channelId, songData } = data;
      // Create or find song
      let song = await Song.findOne({ source: songData.source, sourceId: songData.sourceId });
      if (!song) {
        song = await Song.create({ ...songData, addedBy: socket.user._id });
      }
      let queue = await Queue.findOne({ channel: channelId });
      if (!queue) {
        queue = await Queue.create({ channel: channelId, items: [] });
      }
      queue.items.push({ song: song._id, addedBy: socket.user._id });
      await queue.save();
      const populated = await Queue.findById(queue._id)
        .populate('items.song')
        .populate('items.addedBy', 'username avatar');
      io.to(`channel:${channelId}`).emit('queue:updated', populated);

      // If nothing is playing, auto-play
      const channel = await Channel.findById(channelId);
      if (!channel.currentSong) {
        channel.currentSong = song._id;
        channel.playbackState = { isPlaying: true, currentTime: 0, updatedAt: new Date() };
        await channel.save();
        await Song.findByIdAndUpdate(song._id, { $inc: { playCount: 1 } });
        io.to(`channel:${channelId}`).emit('player:state', {
          isPlaying: true, currentTime: 0, song,
          controlledBy: 'system',
        });
      }
    } catch (err) {
      console.error('Queue add error:', err);
      socket.emit('error', { message: 'Failed to add to queue' });
    }
  });

  // Remove from queue
  socket.on('queue:remove', async (data) => {
    try {
      const { channelId, itemIndex } = data;
      const queue = await Queue.findOne({ channel: channelId });
      if (!queue) return;
      queue.items.splice(itemIndex, 1);
      await queue.save();
      const populated = await Queue.findById(queue._id)
        .populate('items.song')
        .populate('items.addedBy', 'username avatar');
      io.to(`channel:${channelId}`).emit('queue:updated', populated);
    } catch (err) {
      socket.emit('error', { message: 'Failed to remove from queue' });
    }
  });

  // Upvote
  socket.on('queue:upvote', async (data) => {
    try {
      const { channelId, itemIndex } = data;
      const queue = await Queue.findOne({ channel: channelId });
      if (!queue || !queue.items[itemIndex]) return;
      const item = queue.items[itemIndex];
      // Remove from downvotes if present
      item.downvotes = item.downvotes.filter(id => id.toString() !== socket.user._id.toString());
      // Toggle upvote
      const upIdx = item.upvotes.findIndex(id => id.toString() === socket.user._id.toString());
      if (upIdx > -1) {
        item.upvotes.splice(upIdx, 1);
      } else {
        item.upvotes.push(socket.user._id);
      }
      await queue.save();
      const populated = await Queue.findById(queue._id)
        .populate('items.song')
        .populate('items.addedBy', 'username avatar');
      io.to(`channel:${channelId}`).emit('queue:updated', populated);
    } catch (err) {
      socket.emit('error', { message: 'Failed to upvote' });
    }
  });

  // Downvote
  socket.on('queue:downvote', async (data) => {
    try {
      const { channelId, itemIndex } = data;
      const queue = await Queue.findOne({ channel: channelId });
      if (!queue || !queue.items[itemIndex]) return;
      const item = queue.items[itemIndex];
      item.upvotes = item.upvotes.filter(id => id.toString() !== socket.user._id.toString());
      const downIdx = item.downvotes.findIndex(id => id.toString() === socket.user._id.toString());
      if (downIdx > -1) {
        item.downvotes.splice(downIdx, 1);
      } else {
        item.downvotes.push(socket.user._id);
      }
      await queue.save();
      const populated = await Queue.findById(queue._id)
        .populate('items.song')
        .populate('items.addedBy', 'username avatar');
      io.to(`channel:${channelId}`).emit('queue:updated', populated);
    } catch (err) {
      socket.emit('error', { message: 'Failed to downvote' });
    }
  });

  // Clear queue
  socket.on('queue:clear', async (data) => {
    try {
      const { channelId } = data;
      const channel = await Channel.findById(channelId);
      if (channel.admin.toString() !== socket.user._id.toString() && socket.user.role !== 'superadmin') {
        return socket.emit('error', { message: 'Only admin can clear queue' });
      }
      await Queue.findOneAndUpdate({ channel: channelId }, { items: [] });
      io.to(`channel:${channelId}`).emit('queue:updated', { channel: channelId, items: [] });
    } catch (err) {
      socket.emit('error', { message: 'Failed to clear queue' });
    }
  });

  // Skip to next
  socket.on('queue:next', async (data) => {
    try {
      const { channelId } = data;
      const queue = await Queue.findOne({ channel: channelId });
      const channel = await Channel.findById(channelId);
      if (!queue || queue.items.length === 0) {
        channel.currentSong = null;
        channel.playbackState = { isPlaying: false, currentTime: 0, updatedAt: new Date() };
        await channel.save();
        io.to(`channel:${channelId}`).emit('player:state', {
          isPlaying: false, currentTime: 0, song: null,
        });
        return;
      }
      const nextItem = queue.items.shift();
      await queue.save();
      const song = await Song.findById(nextItem.song);
      channel.currentSong = song._id;
      channel.playbackState = { isPlaying: true, currentTime: 0, updatedAt: new Date() };
      await channel.save();
      await Song.findByIdAndUpdate(song._id, { $inc: { playCount: 1 } });
      io.to(`channel:${channelId}`).emit('player:state', {
        isPlaying: true, currentTime: 0, song,
        controlledBy: 'auto-play',
      });
      const populated = await Queue.findById(queue._id)
        .populate('items.song')
        .populate('items.addedBy', 'username avatar');
      io.to(`channel:${channelId}`).emit('queue:updated', populated);
    } catch (err) {
      socket.emit('error', { message: 'Failed to skip' });
    }
  });
};

module.exports = queueHandler;
