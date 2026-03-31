const mongoose = require('mongoose');

const playlistSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Playlist name is required'],
    trim: true,
    maxlength: 100,
  },
  description: {
    type: String,
    default: '',
    maxlength: 500,
  },
  coverImage: {
    type: String,
    default: '',
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  collaborators: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  songs: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Song',
  }],
  visibility: {
    type: String,
    enum: ['public', 'private'],
    default: 'public',
  },
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
}, {
  timestamps: true,
});

playlistSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('Playlist', playlistSchema);
