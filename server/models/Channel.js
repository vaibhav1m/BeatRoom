const mongoose = require('mongoose');

const channelSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Channel name is required'],
    trim: true,
    maxlength: 50,
  },
  description: {
    type: String,
    default: '',
    maxlength: 500,
  },
  type: {
    type: String,
    enum: ['public', 'private'],
    default: 'public',
  },
  password: {
    type: String,
    select: false,
  },
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  bannedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  inviteCode: {
    type: String,
    unique: true,
  },
  currentSong: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Song',
  },
  playbackState: {
    isPlaying: { type: Boolean, default: false },
    currentTime: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now },
  },
  allowAllControl: {
    type: Boolean,
    default: true,
  },
  tags: [{
    type: String,
    trim: true,
  }],
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

channelSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('Channel', channelSchema);
