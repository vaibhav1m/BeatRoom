# BeatRoom — Project Overview

## What We Wanted to Build

A **collaborative music listening room** — something closer to a permanent club or radio station than a one-off session. The core idea: friends join a named channel, someone adds songs to a shared queue, and everyone hears the exact same audio at the exact same moment, no matter when they joined or what device they are on.

Key goals:
- Persistent channels (not temporary sessions like Spotify Jam)
- Democratic queue — anyone can add songs and vote songs up or down
- Real-time chat alongside the player
- Works on free content (YouTube) instead of requiring a paid streaming subscription
- Channel admin controls: lock down playback to admin-only, set video vs. audio mode, invite/kick/ban members

---

## What We Have Built & Implemented

### Authentication & Users
- JWT-based login/register; token stored in `localStorage` as `beatroom_token`
- Superadmin role auto-assigned at registration if email matches `SUPER_ADMIN_EMAIL`
- Online/offline presence tracked via socket connect/disconnect events

### Channels
- Public channels (browse & join) and private channels (password-protected or invite-link only)
- Channel admin can toggle `allowAllControl` (everyone DJs vs. admin-only)
- Admin can switch `viewMode` between video (YouTube iframe visible) and audio-only (animated visualiser overlay)
- Invite link generation (`/join/:inviteCode`); kick and ban members
- Auto-pause when the last user leaves a channel (server-side, persisted to DB)

### Collaborative Queue
- Add single songs or import an entire playlist in one click (`queue:add-many`)
- Deduplication: same `source`+`sourceId` cannot appear twice in the same queue
- Upvote / downvote per song per user (toggle, mutually exclusive)
- Drag-to-reorder (HTML5 drag events → `queue:reorder` socket event)
- Play any queue item immediately (`queue:play-at`), shuffle, clear (admin only)
- Auto-play: when the queue receives its first song and nothing is currently playing, it starts automatically
- `Song` documents are shared across channels (deduped by `source`+`sourceId`), `playCount` incremented on every play

### Real-time Chat
- Messages, emoji reactions, threaded replies, typing indicators
- System messages for join/leave/song-added events
- Message history loaded on channel join (`chat:history`)

### Player — Synchronized Playback
Covered in depth in the **Synchronization** section below.

### Playlists
- Users can create personal playlists and save songs from any channel queue to them
- Playlists can be bulk-imported into a channel queue

### Search
- YouTube Data API v3 for search; Invidious as automatic fallback if no API key is configured
- Spotify metadata API for song info; Lyrics.ovh for lyrics

### Admin Panel
- Superadmin-only: manage all users and channels

---

## Technology Stack

| Layer | Technology | Why |
|---|---|---|
| **Backend runtime** | Node.js + Express | Simple, non-blocking I/O — well suited for many concurrent WebSocket connections |
| **Database** | MongoDB (Mongoose) | Flexible schema; playback state, queue items, reactions are naturally document-shaped |
| **Real-time** | Socket.io | Rooms abstraction maps cleanly to channels; built-in reconnect handling |
| **Auth** | JWT (jsonwebtoken) | Stateless; the same token authenticates both REST calls and WebSocket handshake |
| **Frontend** | React 19 + Vite | Fast HMR for development; React's context tree maps well to the app's shared state model |
| **Routing** | React Router v6 | Client-side routing; `ProtectedRoute` wrapper for auth guards |
| **HTTP client** | Axios | Interceptor pattern for attaching Bearer token and handling global 401 redirects |
| **YouTube playback** | YouTube IFrame API | Only viable free embeddable video/audio player at scale |
| **External music data** | YouTube Data API v3, Invidious (fallback), Spotify, Lyrics.ovh | Song metadata, search, lyrics |
| **State sharing** | React Context (5 contexts) | `AuthContext`, `SocketContext`, `PlayerContext`, `ThemeContext`, `ToastContext` |
| **Dev tooling** | concurrently, nodemon, ESLint | Run both servers in one terminal; auto-restart on backend changes |

---

## Current Issue — Synchronization

This is the hardest part of the project. Getting all clients to play the same audio at the same second requires solving several independent problems at once.

### Problem 1: Clock skew between server and client
Server and browser clocks are not the same. A client whose clock is 2 seconds fast will always appear 2 seconds behind in the drift calculation.

**Solution implemented:** `time:sync` socket event. The client sends its local timestamp, the server echoes back with its own timestamp in an ack callback. The client measures round-trip time and computes the offset (`serverNow()` function in `SocketContext` applies this offset whenever server-relative time is needed).

### Problem 2: Accurate position on join (no accumulated drift)
If we stored `currentTime` and `updatedAt` and computed `currentTime + elapsed` on join, any delay in writing to the DB would compound over time.

**Solution implemented:** `startedAt` invariant. Every time play starts or a seek happens, we store the timestamp representing "when would second 0 have been playing." Position at any point is then a single subtraction: `(now - startedAt) / 1000`. No accumulation, no drift.

### Problem 3: Clients drifting while playing (ongoing)
Network jitter, CPU throttling, and tab backgrounding all cause slow drift between clients over time.

**Solution implemented — layered approach:**

1. **5-second server heartbeat** — `socket/index.js` broadcasts `player:heartbeat` to every active channel every 5 s with the authoritative `currentTime` and `serverTime`. This is the safety net.
2. **Drift correction loop (1 s interval, client-side)** — instead of `seekTo` (which forces YouTube to drop its buffer and re-fetch, causing visible buffering), we use `setPlaybackRate`:
   - < 0.3 s drift → do nothing (imperceptible)
   - 0.3–3 s drift → playback rate nudge ±5–10% (catches up silently over ~10-30 s)
   - > 3 s drift → one hard `seekTo` (extreme case: tab was sleeping)
3. **"Go Live" button** — visible only when lag > 5 s; user-triggered snap to current position.

### Problem 4: Browser autoplay policy
Browsers block unmuted autoplay unless the user has already interacted with the page in the current tab session. This hits hard for late joiners — the song should start immediately but the browser refuses.

**Solution implemented:** We detect whether the user has produced any gesture (`pointerdown`, `keydown`, `touchstart`) since the tab opened. If not, we force-mute the YouTube player on load and show a small "Tap to unmute" pill overlay. Playback starts immediately (muted), and one tap from the user unmutes it. This avoids the full autoplay block without hiding the problem.

### Problem 5: Self-echo causing re-buffer on the controlling client
When the channel admin seeks, the server broadcasts the seek to everyone including the admin. If the admin's client then calls `seekTo` again in response to its own event, YouTube drops its buffer and re-fetches — the admin experiences buffering on every click.

**Solution implemented:** `selfControlledAt` ref. Whenever the client emits a control event (play, pause, seek), it records `Date.now()`. When `player:state` or `player:seek` arrives back, if `Date.now() - selfControlledAt < 2000 ms`, the client skips the local `seekTo` (it already applied the change) and lets the drift loop handle any residual error.

### What is still imperfect
- **First-load sync accuracy** — on initial page load, the REST API response is used to seed `startedAt`. By the time the YouTube player is ready and `seekTo` fires, 1-3 additional seconds may have passed. The drift loop corrects this within ~5 s but there is a visible "jump" in the seek bar on some joins.
- **Aggressive CPU throttling** — browsers throttle background tabs heavily. A user who leaves BeatRoom in a background tab for several minutes may fall significantly behind; the > 3 s hard seek fires but also triggers a brief re-buffer.
- **Rate correction audibility** — playing at 1.10x speed for 30 s to catch up 3 s is inaudible on speech but can cause a subtle pitch shift on music (YouTube's `setPlaybackRate` does not pitch-correct). Not yet addressed.
