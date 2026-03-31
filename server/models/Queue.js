const mongoose = require('mongoose');

const queueSchema = new mongoose.Schema({
  channel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Channel',
    required: true,
    unique: true,
  },
  items: [{
    song: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Song',
      required: true,
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    upvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    downvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    addedAt: {
      type: Date,
      default: Date.now,
    },
  }],
}, {
  timestamps: true,
});

module.exports = mongoose.model('Queue', queueSchema);
