const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { globalSearch } = require('../controllers/searchController');

router.get('/', auth, globalSearch);

module.exports = router;
