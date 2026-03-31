const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  createPlaylist, getPlaylists, getMyPlaylists, getPlaylist, updatePlaylist,
  deletePlaylist, addSongToPlaylist, removeSongFromPlaylist, addCollaborator, followPlaylist,
} = require('../controllers/playlistController');

router.post('/', auth, createPlaylist);
router.get('/', auth, getPlaylists);
router.get('/my', auth, getMyPlaylists);
router.get('/:id', auth, getPlaylist);
router.put('/:id', auth, updatePlaylist);
router.delete('/:id', auth, deletePlaylist);
router.post('/:id/songs', auth, addSongToPlaylist);
router.delete('/:id/songs/:songId', auth, removeSongFromPlaylist);
router.post('/:id/collaborators', auth, addCollaborator);
router.post('/:id/follow', auth, followPlaylist);

module.exports = router;
