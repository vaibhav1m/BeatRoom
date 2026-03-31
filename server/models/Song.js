const mongoose = require('mongoose');

const songSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  artist: {
    type: String,
    default: 'Unknown Artist',
    trim: true,
  },
  album: {
    type: String,
    default: '',
  },
  duration: {
    type: Number,
    default: 0,
  },
  source: {
    type: String,
    enum: ['youtube', 'spotify'],
    required: true,
  },
  sourceId: {
    type: String,
    required: true,
  },
  thumbnail: {
    type: String,
    default: '',
  },
  albumArt: {
    type: String,
    default: '',
  },
  lyrics: {
    type: String,
    default: '',
  },
  playCount: {
    type: Number,
    default: 0,
  },
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

songSchema.index({ title: 'text', artist: 'text' });

module.exports = mongoose.model('Song', songSchema);
