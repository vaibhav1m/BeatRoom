# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install all dependencies (run once after cloning)
npm run install:all

# Start both servers concurrently (recommended for development)
npm run dev

# Start individually
npm run server   # Backend on :5000 (nodemon)
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
- JWT stored in `localStorage` under key `beatroom_token`; `client/src/services/api.js` injects it as Bearer token via Axios interceptors — a 401 response clears the token and redirects to `/login`
- Socket.io handshake also authenticates via JWT; the decoded user is attached as `socket.user` in `server/socket/index.js`

### Backend Structure (`server/`)
- `server.js` — Express app entry; registers routes and calls `setupSocketHandlers(io)`
- `config/env.js` — centralised env var access; `config/db.js` — Mongoose connection; `config/socket.js` — Socket.io server init (note: `setupSocketHandlers` in `socket/index.js` is the real handler, not this file)
- `routes/` + `controllers/` — Standard REST resource pairs (auth, users, channels, songs, playlists, search, admin)
- `socket/index.js` — All socket lifecycle logic: auth middleware, `channel:join/leave`, online presence, the 5 s heartbeat, and wires up feature handlers
- `socket/playerHandler.js` — play/pause/seek/repeat; `socket/queueHandler.js` — collaborative queue with voting, reorder, shuffle, auto-play; `socket/chatHandler.js`; `socket/notificationHandler.js`
- `middleware/auth.js` — JWT verification for REST routes; `middleware/admin.js` — superadmin guard (email match to `SUPER_ADMIN_EMAIL`)

### Frontend Structure (`client/src/`)
- `App.jsx` — Router setup and context provider tree; wraps routes with `ProtectedRoute`
- `context/` — Five contexts: `AuthContext` (user/token), `SocketContext` (WebSocket connection), `PlayerContext` (current song, queue, playback state), `ThemeContext`, `ToastContext`
- `pages/` — One component per route (Dashboard, Channel, Playlist, Profile, Search, Admin, Login, Register, Join)
- `components/layout/Layout.jsx` — Shared layout wrapper
- `components/MiniPlayer.jsx` — Persistent bottom player UI

### Real-time Synchronization
Playback state is authoritative on the server. Key mechanisms:

1. **Join-time push** — when a socket emits `channel:join`, the server immediately emits `player:state` with the current song and a computed `currentTime` (derived from `playbackState.startedAt` so it stays accurate without drift) plus `serverTime`.
2. **5 s heartbeat** — `socket/index.js` polls all active channel rooms every 5 seconds and broadcasts `player:heartbeat` as a drift-correction safety net.
3. **Clock skew** — clients can emit `time:sync` (with a callback ack) to measure server-vs-client clock difference and compensate.
4. **`startedAt` invariant** — `playbackState.startedAt` stores the timestamp that represents "when would 0:00 have been played". `currentTime = (now - startedAt) / 1000` while playing. On seek, `startedAt` is recalculated. On pause, it is preserved so the position is still known.
5. **Empty-room auto-pause** — when the last socket leaves a channel (on `channel:leave` or `disconnect`), the server sets `isPlaying: false` in the DB.

### Playback Control Permissions
`Channel.allowAllControl` (default `true`) gates play/pause/seek/queue-remove. When `false`, only the channel admin or a superadmin can control playback. Queue clear always requires admin. The `player:repeat` event is broadcast-only (no DB persistence).

### Data Models
- `Channel` — stores `currentSong`, `playbackState` (isPlaying, currentTime, updatedAt, startedAt), `allowAllControl`, `viewMode` (video/audio), `type` (public/private), `password`, `inviteCode`, `bannedUsers`
- `Queue` — one document per channel (unique index on `channel`); `items[]` each have `upvotes[]` and `downvotes[]` arrays of user IDs; songs are deduplicated by `source`+`sourceId` before insertion
- `Song` — metadata from YouTube/Spotify; `source`+`sourceId` pair is the dedup key; `playCount` is incremented on each play
- `User` — `role` is either `'user'` or `'superadmin'`; role assigned at registration if email matches `SUPER_ADMIN_EMAIL`

### Environment Variables
Copy `.env.example` to `.env` in `server/`. Required: `MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`. Optional: `YOUTUBE_API_KEY`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `GENIUS_API_KEY`, `SUPER_ADMIN_EMAIL`, `CLIENT_URL`. Without a YouTube API key, song search falls back to Invidious.
