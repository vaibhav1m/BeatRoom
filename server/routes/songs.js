const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { createSong, searchSongs, getLyrics, getTrending } = require('../controllers/songController');

router.post('/', auth, createSong);
router.get('/search', auth, searchSongs);
router.get('/trending', auth, getTrending);
router.get('/:id/lyrics', auth, getLyrics);

module.exports = router;
