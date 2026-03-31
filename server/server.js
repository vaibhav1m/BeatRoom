const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const { initSocket } = require('./config/socket');
const config = require('./config/env');
const errorHandler = require('./middleware/errorHandler');
const setupSocketHandlers = require('./socket/index');

// Connect to MongoDB
connectDB();

const app = express();
const server = http.createServer(app);

// Initialize Socket.io
const io = initSocket(server);
setupSocketHandlers(io);

// Middleware
app.use(cors({
  origin: [config.CLIENT_URL, 'http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'BeatRoom API is running 🎵', timestamp: new Date().toISOString() });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/channels', require('./routes/channels'));
app.use('/api/playlists', require('./routes/playlists'));
app.use('/api/songs', require('./routes/songs'));
app.use('/api/search', require('./routes/search'));
app.use('/api/admin', require('./routes/admin'));

// Error handler
app.use(errorHandler);

// Serve React frontend in production
if (config.NODE_ENV === 'production') {
  const clientBuild = path.join(__dirname, '../client/dist');
  app.use(express.static(clientBuild));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuild, 'index.html'));
  });
}

// Start server
server.listen(config.PORT, () => {
  console.log(`\n🎵 BeatRoom Server running on port ${config.PORT}`);
  console.log(`📡 Environment: ${config.NODE_ENV}`);
  console.log(`🌐 Client URL: ${config.CLIENT_URL}\n`);
});

module.exports = { app, server, io };
