const Notification = require('../models/Notification');

const notificationHandler = (io, socket) => {
  // Get notifications
  socket.on('notification:get', async () => {
    try {
      const notifications = await Notification.find({ recipient: socket.user._id })
        .sort('-createdAt')
        .limit(20);
      socket.emit('notification:list', notifications);
    } catch (err) {
      socket.emit('error', { message: 'Failed to get notifications' });
    }
  });

  // Mark as read
  socket.on('notification:read', async (data) => {
    try {
      const { notificationId } = data;
      if (notificationId === 'all') {
        await Notification.updateMany({ recipient: socket.user._id }, { read: true });
      } else {
        await Notification.findByIdAndUpdate(notificationId, { read: true });
      }
      socket.emit('notification:read-success', { notificationId });
    } catch (err) {
      socket.emit('error', { message: 'Failed to mark notification' });
    }
  });

  // Get unread count
  socket.on('notification:unread-count', async () => {
    try {
      const count = await Notification.countDocuments({ recipient: socket.user._id, read: false });
      socket.emit('notification:unread-count', count);
    } catch (err) {
      socket.emit('error', { message: 'Failed to get count' });
    }
  });
};

module.exports = notificationHandler;
