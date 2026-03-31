const Song = require('../models/Song');
const axios = require('axios');
const config = require('../config/env');

// POST /api/songs - Create/find a song
exports.createSong = async (req, res, next) => {
  try {
    const { title, artist, album, duration, source, sourceId, thumbnail, albumArt } = req.body;
    let song = await Song.findOne({ source, sourceId });
    if (song) return res.json({ success: true, song, existing: true });
    song = await Song.create({
      title, artist, album, duration, source, sourceId, thumbnail, albumArt,
      addedBy: req.user._id,
    });
    res.status(201).json({ success: true, song, existing: false });
  } catch (error) {
    next(error);
  }
};

// GET /api/songs/search?q=query
exports.searchSongs = async (req, res, next) => {
  try {
    const { q, source } = req.query;
    if (!q) return res.status(400).json({ success: false, error: 'Search query required' });
    
    const results = { youtube: [], spotify: [], local: [] };

    // Local DB search
    const localSongs = await Song.find({ $text: { $search: q } }).limit(10);
    results.local = localSongs;

    // YouTube search
    if ((!source || source === 'youtube') && config.YOUTUBE_API_KEY) {
      try {
        console.log(`Searching YouTube for: ${q}`);
        const ytRes = await axios.get('https://www.googleapis.com/youtube/v3/search', {
          params: {
            part: 'snippet',
            q: q + ' music',
            type: 'video',
            videoCategoryId: '10',
            maxResults: 15,
            key: config.YOUTUBE_API_KEY,
          },
        });
        console.log(`YouTube search found ${ytRes.data.items?.length || 0} results`);
        results.youtube = ytRes.data.items.map(item => ({
          title: item.snippet.title,
          artist: item.snippet.channelTitle,
          source: 'youtube',
          sourceId: item.id.videoId,
          thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
          description: item.snippet.description,
        }));
      } catch (err) {
        console.error('YouTube API error:', err.message);
      }
    }

    // Fallback YouTube search without API key (using invidious)
    if ((!source || source === 'youtube') && !config.YOUTUBE_API_KEY) {
      const instances = [
        'https://inv.nadeko.net',
        'https://invidious.lunar.icu',
        'https://yewtu.be',
        'https://inv.tux.pizza',
        'https://invidious.projectsegfau.lt'
      ];

      for (const instance of instances) {
        try {
          console.log(`Trying Invidious instance: ${instance}`);
          const invRes = await axios.get(`${instance}/api/v1/search`, {
            params: { q: q + ' music', type: 'video' },
            timeout: 4000,
          });
          
          if (invRes.data && Array.isArray(invRes.data) && invRes.data.length > 0) {
            results.youtube = invRes.data.slice(0, 15).map(item => ({
              title: item.title,
              artist: item.author,
              source: 'youtube',
              sourceId: item.videoId,
              thumbnail: item.videoThumbnails?.[0]?.url || '',
              duration: item.lengthSeconds || 0,
            }));
            break; // Found results, stop trying other instances
          }
        } catch (err) {
          console.error(`Invidious instance ${instance} failed:`, err.message);
        }
      }
    }

    res.json({ success: true, results });
  } catch (error) {
    next(error);
  }
};

// GET /api/songs/:id/lyrics
exports.getLyrics = async (req, res, next) => {
  try {
    const song = await Song.findById(req.params.id);
    if (!song) return res.status(404).json({ success: false, error: 'Song not found' });

    if (song.lyrics) return res.json({ success: true, lyrics: song.lyrics });

    // Try lyrics.ovh
    try {
      const lyricsRes = await axios.get(`https://api.lyrics.ovh/v1/${encodeURIComponent(song.artist)}/${encodeURIComponent(song.title)}`, { timeout: 5000 });
      if (lyricsRes.data?.lyrics) {
        song.lyrics = lyricsRes.data.lyrics;
        await song.save();
        return res.json({ success: true, lyrics: song.lyrics });
      }
    } catch (err) {
      console.log('lyrics.ovh failed:', err.message);
    }

    res.json({ success: true, lyrics: '' });
  } catch (error) {
    next(error);
  }
};

// GET /api/songs/trending
exports.getTrending = async (req, res, next) => {
  try {
    const songs = await Song.find().sort('-playCount').limit(20).populate('addedBy', 'username avatar');
    res.json({ success: true, songs });
  } catch (error) {
    next(error);
  }
};
