const User = require('../models/User');
const Channel = require('../models/Channel');
const Song = require('../models/Song');
const Playlist = require('../models/Playlist');
const axios = require('axios');
const config = require('../config/env');

// GET /api/search?q=query&type=all
exports.globalSearch = async (req, res, next) => {
  try {
    const { q, type } = req.query;
    if (!q) return res.status(400).json({ success: false, error: 'Search query required' });
    const searchType = type || 'all';
    const results = {
      users: [],
      channels: [],
      songs: [],
      playlists: []
    };

    const searchPromises = [];

    if (searchType === 'all' || searchType === 'users') {
      searchPromises.push(User.find({
        $or: [
          { username: { $regex: q, $options: 'i' } },
          { email: { $regex: q, $options: 'i' } },
        ],
      }).select('username avatar isOnline bio').limit(10).then(r => results.users = r));
    }

    if (searchType === 'all' || searchType === 'channels') {
      searchPromises.push(Channel.find({
        $or: [
          { name: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } },
        ],
      }).populate('admin', 'username avatar').limit(10).then(r => results.channels = r));
    }

    if (searchType === 'all' || searchType === 'songs') {
      const youtubeSearch = async () => {
        let ytResults = [];
        if (config.YOUTUBE_API_KEY) {
          try {
            const ytRes = await axios.get('https://www.googleapis.com/youtube/v3/search', {
              params: {
                part: 'snippet', q: q + ' music', type: 'video', videoCategoryId: '10', maxResults: 10,
                key: config.YOUTUBE_API_KEY
              }
            });
            ytResults = ytRes.data.items.map(item => ({
              _id: `yt_${item.id.videoId}`,
              title: item.snippet.title,
              artist: item.snippet.channelTitle,
              source: 'youtube',
              sourceId: item.id.videoId,
              thumbnail: item.snippet.thumbnails.default?.url,
              isExternal: true
            }));
          } catch (err) { console.error('Global YT search error:', err.message); }
        } else {
          // Invidious fallback
          const instances = ['https://inv.nadeko.net', 'https://yewtu.be'];
          for (const instance of instances) {
            try {
              const invRes = await axios.get(`${instance}/api/v1/search`, {
                params: { q: q + ' music', type: 'video' }, timeout: 3000
              });
              if (invRes.data?.length) {
                ytResults = invRes.data.slice(0, 10).map(item => ({
                  _id: `yt_${item.videoId}`,
                  title: item.title, artist: item.author, source: 'youtube', sourceId: item.videoId,
                  thumbnail: item.videoThumbnails?.[0]?.url, isExternal: true
                }));
                break;
              }
            } catch (err) { /* silent fail for fallback */ }
          }
        }
        
        const localSongs = await Song.find({
          $or: [{ title: { $regex: q, $options: 'i' } }, { artist: { $regex: q, $options: 'i' } }]
        }).limit(10);
        
        results.songs = [...localSongs, ...ytResults];
      };
      searchPromises.push(youtubeSearch());
    }

    if (searchType === 'all' || searchType === 'playlists') {
      searchPromises.push(Playlist.find({
        $or: [
          { name: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } },
        ],
        visibility: 'public',
      }).populate('owner', 'username avatar').limit(10).then(r => results.playlists = r));
    }

    await Promise.all(searchPromises);
    res.json({ success: true, results });
  } catch (error) {
    next(error);
  }
};
