const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  channel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Channel',
    required: true,
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  content: {
    type: String,
    required: true,
    maxlength: 2000,
  },
  type: {
    type: String,
    enum: ['text', 'system', 'song-share'],
    default: 'text',
  },
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
  },
  reactions: [{
    emoji: String,
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  }],
  songData: {
    title: String,
    artist: String,
    thumbnail: String,
    sourceId: String,
    source: String,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Message', messageSchema);
