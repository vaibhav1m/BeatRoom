const Playlist = require('../models/Playlist');
const Song = require('../models/Song');

// POST /api/playlists
exports.createPlaylist = async (req, res, next) => {
  try {
    const { name, description, visibility } = req.body;
    const playlist = await Playlist.create({
      name,
      description,
      visibility: visibility || 'public',
      owner: req.user._id,
    });
    const populated = await Playlist.findById(playlist._id).populate('owner', 'username avatar');
    res.status(201).json({ success: true, playlist: populated });
  } catch (error) {
    next(error);
  }
};

// GET /api/playlists
exports.getPlaylists = async (req, res, next) => {
  try {
    const playlists = await Playlist.find({
      $or: [
        { visibility: 'public' },
        { owner: req.user._id },
        { collaborators: req.user._id },
      ],
    }).populate('owner', 'username avatar').populate('songs').sort('-createdAt');
    res.json({ success: true, playlists });
  } catch (error) {
    next(error);
  }
};

// GET /api/playlists/my
exports.getMyPlaylists = async (req, res, next) => {
  try {
    const playlists = await Playlist.find({
      $or: [{ owner: req.user._id }, { collaborators: req.user._id }],
    }).populate('owner', 'username avatar').populate('songs').sort('-createdAt');
    res.json({ success: true, playlists });
  } catch (error) {
    next(error);
  }
};

// GET /api/playlists/:id
exports.getPlaylist = async (req, res, next) => {
  try {
    const playlist = await Playlist.findById(req.params.id)
      .populate('owner', 'username avatar')
      .populate('collaborators', 'username avatar')
      .populate('songs')
      .populate('followers', 'username avatar');
    if (!playlist) return res.status(404).json({ success: false, error: 'Playlist not found' });
    if (playlist.visibility === 'private' &&
        playlist.owner._id.toString() !== req.user._id.toString() &&
        !playlist.collaborators.some(c => c._id.toString() === req.user._id.toString())) {
      return res.status(403).json({ success: false, error: 'This playlist is private' });
    }
    res.json({ success: true, playlist });
  } catch (error) {
    next(error);
  }
};

// PUT /api/playlists/:id
exports.updatePlaylist = async (req, res, next) => {
  try {
    const playlist = await Playlist.findById(req.params.id);
    if (!playlist) return res.status(404).json({ success: false, error: 'Playlist not found' });
    if (playlist.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    const { name, description, visibility, coverImage } = req.body;
    if (name) playlist.name = name;
    if (description !== undefined) playlist.description = description;
    if (visibility) playlist.visibility = visibility;
    if (coverImage !== undefined) playlist.coverImage = coverImage;
    await playlist.save();
    res.json({ success: true, playlist });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/playlists/:id
exports.deletePlaylist = async (req, res, next) => {
  try {
    const playlist = await Playlist.findById(req.params.id);
    if (!playlist) return res.status(404).json({ success: false, error: 'Playlist not found' });
    if (playlist.owner.toString() !== req.user._id.toString() && req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    await Playlist.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Playlist deleted' });
  } catch (error) {
    next(error);
  }
};

// POST /api/playlists/:id/songs
exports.addSongToPlaylist = async (req, res, next) => {
  try {
    const playlist = await Playlist.findById(req.params.id);
    if (!playlist) return res.status(404).json({ success: false, error: 'Playlist not found' });
    const isOwnerOrCollab = playlist.owner.toString() === req.user._id.toString() ||
      playlist.collaborators.some(c => c.toString() === req.user._id.toString());
    if (!isOwnerOrCollab) return res.status(403).json({ success: false, error: 'Not authorized' });

    const { songId } = req.body;
    if (playlist.songs.includes(songId)) {
      return res.status(400).json({ success: false, error: 'Song already in playlist' });
    }
    playlist.songs.push(songId);
    await playlist.save();
    const populated = await Playlist.findById(playlist._id).populate('songs');
    res.json({ success: true, playlist: populated });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/playlists/:id/songs/:songId
exports.removeSongFromPlaylist = async (req, res, next) => {
  try {
    const playlist = await Playlist.findById(req.params.id);
    if (!playlist) return res.status(404).json({ success: false, error: 'Playlist not found' });
    const isOwnerOrCollab = playlist.owner.toString() === req.user._id.toString() ||
      playlist.collaborators.some(c => c.toString() === req.user._id.toString());
    if (!isOwnerOrCollab) return res.status(403).json({ success: false, error: 'Not authorized' });
    playlist.songs = playlist.songs.filter(s => s.toString() !== req.params.songId);
    await playlist.save();
    res.json({ success: true, playlist });
  } catch (error) {
    next(error);
  }
};

// POST /api/playlists/:id/collaborators
exports.addCollaborator = async (req, res, next) => {
  try {
    const playlist = await Playlist.findById(req.params.id);
    if (!playlist) return res.status(404).json({ success: false, error: 'Playlist not found' });
    if (playlist.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    const { userId } = req.body;
    if (playlist.collaborators.includes(userId)) {
      return res.status(400).json({ success: false, error: 'Already a collaborator' });
    }
    playlist.collaborators.push(userId);
    await playlist.save();
    res.json({ success: true, message: 'Collaborator added' });
  } catch (error) {
    next(error);
  }
};

// POST /api/playlists/:id/follow
exports.followPlaylist = async (req, res, next) => {
  try {
    const playlist = await Playlist.findById(req.params.id);
    if (!playlist) return res.status(404).json({ success: false, error: 'Playlist not found' });
    const idx = playlist.followers.indexOf(req.user._id);
    if (idx > -1) {
      playlist.followers.splice(idx, 1);
    } else {
      playlist.followers.push(req.user._id);
    }
    await playlist.save();
    res.json({ success: true, following: idx === -1 });
  } catch (error) {
    next(error);
  }
};
