const Message = require('../models/Message');

const chatHandler = (io, socket) => {
  // Send message
  socket.on('chat:message', async (data) => {
    try {
      const { channelId, content, replyTo, type, songData } = data;
      const message = await Message.create({
        channel: channelId,
        sender: socket.user._id,
        content,
        type: type || 'text',
        replyTo: replyTo || null,
        songData: songData || null,
      });
      const populated = await Message.findById(message._id)
        .populate('sender', 'username avatar')
        .populate('replyTo');
      io.to(`channel:${channelId}`).emit('chat:message', populated);
    } catch (err) {
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Get message history
  socket.on('chat:history', async (data) => {
    try {
      const { channelId, limit = 50, before } = data;
      const query = { channel: channelId };
      if (before) query.createdAt = { $lt: new Date(before) };
      const messages = await Message.find(query)
        .populate('sender', 'username avatar')
        .populate('replyTo')
        .sort('-createdAt')
        .limit(limit);
      socket.emit('chat:history', messages.reverse());
    } catch (err) {
      socket.emit('error', { message: 'Failed to fetch messages' });
    }
  });

  // Add reaction
  socket.on('chat:reaction', async (data) => {
    try {
      const { messageId, emoji } = data;
      const message = await Message.findById(messageId);
      if (!message) return;
      const existingReaction = message.reactions.find(r => r.emoji === emoji);
      if (existingReaction) {
        const userIdx = existingReaction.users.indexOf(socket.user._id);
        if (userIdx > -1) {
          existingReaction.users.splice(userIdx, 1);
          if (existingReaction.users.length === 0) {
            message.reactions = message.reactions.filter(r => r.emoji !== emoji);
          }
        } else {
          existingReaction.users.push(socket.user._id);
        }
      } else {
        message.reactions.push({ emoji, users: [socket.user._id] });
      }
      await message.save();
      const channelId = message.channel.toString();
      io.to(`channel:${channelId}`).emit('chat:reaction-update', {
        messageId, reactions: message.reactions,
      });
    } catch (err) {
      socket.emit('error', { message: 'Failed to update reaction' });
    }
  });

  // Delete message
  socket.on('chat:delete', async (data) => {
    try {
      const { messageId, channelId } = data;
      const message = await Message.findById(messageId);
      if (!message) return;
      if (message.sender.toString() !== socket.user._id.toString() && socket.user.role !== 'superadmin') {
        return socket.emit('error', { message: 'Not authorized to delete this message' });
      }
      await Message.findByIdAndDelete(messageId);
      io.to(`channel:${channelId}`).emit('chat:deleted', { messageId });
    } catch (err) {
      socket.emit('error', { message: 'Failed to delete message' });
    }
  });

  // Typing indicator
  socket.on('chat:typing', ({ channelId }) => {
    socket.to(`channel:${channelId}`).emit('chat:typing', {
      userId: socket.user._id, username: socket.user.username,
    });
  });

  socket.on('chat:stop-typing', ({ channelId }) => {
    socket.to(`channel:${channelId}`).emit('chat:stop-typing', {
      userId: socket.user._id,
    });
  });
};

module.exports = chatHandler;
