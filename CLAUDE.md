# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install all dependencies (run once after cloning)
npm run install:all

# Start both servers concurrently (recommended for development)
npm run dev

# Start individually
npm run server   # Backend on :5000
npm run client   # Frontend on :5173

# Production
cd server && npm start
cd client && npm run build

# Lint (client only)
cd client && npm run lint
```

There are no automated tests configured.

## Architecture

BeatRoom is a full-stack collaborative music streaming app with real-time synchronized playback across channels.

### Stack
- **Backend:** Node.js + Express, MongoDB (Mongoose), Socket.io, JWT auth
- **Frontend:** React 19, Vite, React Router, Axios, socket.io-client
- **External APIs:** YouTube Data API v3 (with Invidious fallback), Spotify, Lyrics.ovh

### Request Flow
- Vite dev server proxies `/api/*` → `http://localhost:5000` and `/socket.io` → `ws://localhost:5000`
- REST API is at `/api/*` namespace; WebSocket events coexist on the same server
- JWT stored in localStorage; `client/src/services/api.js` injects it as a Bearer token via Axios interceptors
- Socket.io handshake also authenticates via JWT (`server/config/socket.js`)

### Backend Structure (`server/`)
- `server.js` — Express app entry; registers routes and calls `setupSocketHandlers(io)`
- `config/` — DB connection, env vars, Socket.io init
- `routes/` + `controllers/` — Standard REST resource pairs (auth, users, channels, songs, playlists, search, admin)
- `socket/` — WebSocket event handlers: `playerHandler.js` (sync playback), `queueHandler.js` (collaborative queue with voting), `chatHandler.js`, `notificationHandler.js`
- `middleware/auth.js` — JWT verification middleware for protected routes
- `middleware/admin.js` — Superadmin guard (based on email match to `SUPER_ADMIN_EMAIL` env var)

### Frontend Structure (`client/src/`)
- `App.jsx` — Router setup and context provider tree; wraps routes with `ProtectedRoute`
- `context/` — Four contexts: `AuthContext` (user/token), `SocketContext` (WebSocket connection), `PlayerContext` (current song, queue, playback state), `ThemeContext`
- `pages/` — One component per route (Dashboard, Channel, Playlist, Profile, Search, Admin)
- `components/layout/Layout.jsx` — Shared layout wrapper

### Real-time Synchronization
Channel playback is synchronized server-side: when a user joins a channel, the server sends the current song and playback position so they start in sync. All play/pause/seek events are broadcast to all members in the channel's Socket.io room. The `playerHandler.js` and `queueHandler.js` files manage this state.

### Data Models
Key relationships: `Channel` stores current playback state and references members/admins; `Queue` is per-channel with upvote/downvote arrays per song; `Song` stores metadata from YouTube/Spotify sources. Channels support private (password-protected) mode and invite codes.

### Environment Variables
Copy `.env.example` to `.env` in the project root. Required: `MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`. Optional for full functionality: `YOUTUBE_API_KEY`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `GENIUS_API_KEY`, `SUPER_ADMIN_EMAIL`. Without a YouTube API key, song search falls back to Invidious.
