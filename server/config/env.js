const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

module.exports = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/beatroom',
  JWT_SECRET: process.env.JWT_SECRET || 'dev_secret',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret',
  JWT_EXPIRE: process.env.JWT_EXPIRE || '7d',
  JWT_REFRESH_EXPIRE: process.env.JWT_REFRESH_EXPIRE || '30d',
  YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY || '',
  SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID || '',
  SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET || '',
  GENIUS_API_KEY: process.env.GENIUS_API_KEY || '',
  SUPER_ADMIN_EMAIL: process.env.SUPER_ADMIN_EMAIL || 'admin@beatroom.com',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',
};

console.log(`\n📡 Environment: ${module.exports.NODE_ENV}`);
console.log(`🔑 YouTube API Key: ${module.exports.YOUTUBE_API_KEY ? 'LOADED ✅' : 'MISSING ❌'}`);
console.log(`🌐 Client URL: ${module.exports.CLIENT_URL}\n`);
