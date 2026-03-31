const mongoose = require('mongoose');

const joinRequestSchema = new mongoose.Schema({
  channel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Channel',
    required: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('JoinRequest', joinRequestSchema);
