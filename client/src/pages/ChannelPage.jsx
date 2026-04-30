import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import { usePlayer } from '../context/PlayerContext';
import api from '../services/api';
import { formatTimeAgo, getInitials, formatDuration } from '../utils/helpers';
import { getAvatarColor, EMOJIS } from '../utils/constants';

const ChannelPage = () => {
  const { channelId } = useParams();
  const { user } = useAuth();
  const { socket, joinChannel, leaveChannel, setActiveChannelId, serverNow } = useSocket();
  const { toast } = useToast();
  const { setCurrentSong: setGlobalSong, setIsPlaying: setGlobalPlaying, setCurrentChannelId: setGlobalChannelId, setChannelName: setGlobalChannelName } = usePlayer();
  const navigate = useNavigate();

  useEffect(() => {
    setActiveChannelId(channelId);
    setSyncReady(false); // reset sync overlay on channel change
    setNeedsUnmute(false);
    return () => setActiveChannelId(null);
  }, [channelId, setActiveChannelId]);

  // Track whether the user has produced any gesture in this tab.
  // Browsers allow unmuted autoplay only after one. We treat "joined this tab fresh"
  // as no gesture, so we force-mute in that case.
  const userInteractedRef = useRef(false);
  useEffect(() => {
    const mark = () => { userInteractedRef.current = true; };
    window.addEventListener('pointerdown', mark, { once: true, capture: true });
    window.addEventListener('keydown', mark, { once: true, capture: true });
    window.addEventListener('touchstart', mark, { once: true, capture: true });
    return () => {
      window.removeEventListener('pointerdown', mark, { capture: true });
      window.removeEventListener('keydown', mark, { capture: true });
      window.removeEventListener('touchstart', mark, { capture: true });
    };
  }, []);

  // Channel & chat state
  const [channel, setChannel] = useState(null);
  const [queue, setQueue] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [typing, setTyping] = useState([]);

  // Player state
  const [currentSong, setCurrentSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  // Volume persisted in localStorage
  const [volume, setVolume] = useState(() => {
    const v = localStorage.getItem('beatroom_volume');
    return v !== null ? parseInt(v, 10) : 80;
  });
  const [isMuted, setIsMuted] = useState(() => localStorage.getItem('beatroom_muted') === 'true');
  const [isRepeat, setIsRepeat] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [songHistory, setSongHistory] = useState([]);
  const [ytApiReady, setYtApiReady] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekDraft, setSeekDraft] = useState(0);
  // viewMode is channel-level (admin sets it, all members follow)
  const [viewMode, setViewMode] = useState('video');
  // Sync loading state — show spinner until YT player actually reaches PLAYING/PAUSED with sync applied
  const [syncReady, setSyncReady] = useState(false);
  // True when we force-muted the player to bypass browser autoplay restrictions.
  // Shows a small "Tap to unmute" pill — does NOT block playback.
  const [needsUnmute, setNeedsUnmute] = useState(false);
  // How many seconds behind the server this client currently is (0 = in sync)
  const [lagSeconds, setLagSeconds] = useState(0);

  // Import playlist state
  const [showImportPlaylist, setShowImportPlaylist] = useState(false);
  const [myPlaylists, setMyPlaylists] = useState([]);
  const [importingPlaylist, setImportingPlaylist] = useState(null);

  // Save to playlist state
  const [songToSave, setSongToSave] = useState(null); // song object to save
  const [savingToPlaylist, setSavingToPlaylist] = useState(null); // playlistId currently saving to
  const [saveSuccess, setSaveSuccess] = useState(null); // playlistId that just succeeded

  // Queue drag-to-reorder state
  const [dragFromIndex, setDragFromIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  // Right panel tab + online tracking
  const [rightTab, setRightTab] = useState('chat');
  const [onlineUserIds, setOnlineUserIds] = useState(() => new Set());

  // Refs
  const chatEndRef = useRef(null);
  const typingTimeout = useRef(null);
  const ytPlayerInstance = useRef(null);
  const ytPlayerDivRef = useRef(null);       // DOM ref — avoids YT API's internal ID cache bug on remount
  const timeInterval = useRef(null);
  const isRepeatRef = useRef(false);
  const currentSongRef = useRef(null);
  const socketRef = useRef(socket);          // always-current socket for YT callbacks
  const pendingSyncRef = useRef(null);       // sync to apply once YT player is ready
  const serverSyncRef = useRef(null);        // last known server time { time, receivedAt, isPlaying }
  const selfControlledAt = useRef(0);        // Date.now() when this client last sent a control action

  useEffect(() => { isRepeatRef.current = isRepeat; }, [isRepeat]);
  useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);
  useEffect(() => { socketRef.current = socket; }, [socket]);

  // Keep global PlayerContext in sync for mini player
  useEffect(() => { setGlobalSong(currentSong); }, [currentSong]);
  useEffect(() => { setGlobalPlaying(isPlaying); }, [isPlaying]);

  // Persist volume to localStorage
  useEffect(() => { localStorage.setItem('beatroom_volume', volume); }, [volume]);
  useEffect(() => { localStorage.setItem('beatroom_muted', isMuted); }, [isMuted]);

  // Note: sync is now pushed by the server on channel:join — no client pull needed here

  // Load YouTube IFrame API once
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      setYtApiReady(true);
      return;
    }
    window.onYouTubeIframeAPIReady = () => setYtApiReady(true);
    if (!document.getElementById('yt-iframe-api')) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  }, []);

  // Compute the playback position the player SHOULD currently be at, given the
  // most recent server snapshot and clock-corrected elapsed time.
  const getExpectedTime = useCallback(() => {
    const sv = serverSyncRef.current;
    if (!sv) return 0;
    if (!sv.isPlaying) return sv.time;
    // serverNow() returns server-clock-aligned ms; sv.serverTime is the server's clock at sv.time
    const elapsedMs = serverNow() - sv.serverTime;
    return Math.max(0, sv.time + elapsedMs / 1000);
  }, [serverNow]);

  useEffect(() => {
    if (!ytApiReady) return;
    clearInterval(timeInterval.current);

    if (!currentSong || currentSong.source !== 'youtube') {
      if (ytPlayerInstance.current) {
        try { ytPlayerInstance.current.destroy(); } catch (e) {}
        ytPlayerInstance.current = null;
      }
      setCurrentTime(0); setDuration(0); setSyncReady(true); setNeedsUnmute(false);
      return;
    }

    if (currentSong.duration) setDuration(currentSong.duration);
    setSyncReady(false);
    if (!ytPlayerDivRef.current) return;

    const sync = pendingSyncRef.current || { isPlaying: isPlaying, currentTime: currentTime };
    pendingSyncRef.current = null;

    const targetTime = sync.isPlaying ? getExpectedTime() : (sync.currentTime || 0);

    const forceMute = sync.isPlaying && !userInteractedRef.current;
    if (forceMute) setNeedsUnmute(true);
    const startMuted = forceMute || isMuted;

    // ── Fast path: reuse existing player with loadVideoById ──────────────────
    // Swaps the video without tearing down the iframe. No blank gap, no
    // re-initialization cost. onStateChange (already registered) fires for
    // the new video's PLAYING/ENDED events.
    if (ytPlayerInstance.current) {
      try {
        const player = ytPlayerInstance.current;
        if (startMuted) player.mute(); else player.unMute();
        player.setVolume(volume);
        if (sync.isPlaying) {
          player.loadVideoById({ videoId: currentSong.sourceId, startSeconds: targetTime });
        } else {
          player.cueVideoById({ videoId: currentSong.sourceId, startSeconds: targetTime });
          setSyncReady(true);
        }
        return;
      } catch (_) { // eslint-disable-line no-unused-vars
        try { ytPlayerInstance.current.destroy(); } catch (_) {}
        ytPlayerInstance.current = null;
      }
    }

    // ── Slow path: create fresh player (first load or after error) ───────────
    // Load directly at targetTime. No pre-heat — loading 12s before just wastes
    // bandwidth on slow connections; YouTube has to fetch those extra segments
    // before it can reach the target, making the initial sync take 3-8s longer.
    ytPlayerInstance.current = new window.YT.Player(ytPlayerDivRef.current, {
      height: '200',
      width: '100%',
      videoId: currentSong.sourceId,
      playerVars: {
        autoplay: 1,
        mute: startMuted ? 1 : 0,
        start: Math.floor(targetTime),
        enablejsapi: 1, playsinline: 1,
        controls: 0, modestbranding: 1, rel: 0,
        origin: window.location.origin,
      },
      events: {
        onReady: (e) => {
          e.target.setVolume(volume);
          if (startMuted) e.target.mute(); else e.target.unMute();
          const dur = e.target.getDuration();
          if (dur) setDuration(dur);

          if (sync.isPlaying) {
            // Fine-tune: absorb time elapsed between effect and onReady (~0.5-2s).
            // seekTo is cheap here because we're already at floor(targetTime).
            const liveNow = getExpectedTime();
            try { e.target.seekTo(liveNow, true); } catch (_) {}
            try { e.target.playVideo(); } catch (_) {}
          } else {
            try { e.target.seekTo(sync.currentTime || 0, true); } catch (_) {}
            try { e.target.pauseVideo(); } catch (_) {}
            setSyncReady(true);
          }
        },
        onStateChange: (e) => {
          const PS = window.YT.PlayerState;
          if (e.data === PS.PLAYING) {
            setSyncReady(true);
            startDriftLoop();
          }
          if (e.data === PS.PAUSED) {
            clearInterval(timeInterval.current);
          }
          if (e.data === PS.ENDED) {
            clearInterval(timeInterval.current);
            if (isRepeatRef.current) {
              e.target.seekTo(0, true);
              e.target.playVideo();
            } else {
              socketRef.current?.emit('queue:next', { channelId });
            }
          }
        },
      },
    });

    return () => clearInterval(timeInterval.current);
  }, [currentSong?._id, ytApiReady]);

  // ─── DRIFT CORRECTION ────────────────────────────────────────────────────────
  // Runs every 1s while playing. Uses ONLY setPlaybackRate — never seekTo.
  // seekTo on an already-playing stream forces YouTube to drop buffer and
  // re-fetch, which is exactly the buffering users complained about.
  //
  // Rate correction converges silently:
  //   < 0.3s drift  → do nothing (imperceptible)
  //   0.3–5s drift  → rate ± up to 10% (catches up over ~10-50s, invisible)
  //   > 5s drift    → one hard seek (extreme case: tab was sleeping, CPU throttle)
  //
  // The "Go Live" button handles voluntary snap-to-live for users who notice lag.
  const LAG_THRESHOLD = 5;
  const startDriftLoop = useCallback(() => {
    clearInterval(timeInterval.current);
    timeInterval.current = setInterval(() => {
      const player = ytPlayerInstance.current;
      if (!player?.getCurrentTime) return;
      const actual = player.getCurrentTime();
      setCurrentTime(actual);
      const d = player.getDuration?.();
      if (d && d > 0) setDuration(d);

      const sv = serverSyncRef.current;
      if (!sv?.isPlaying) {
        setLagSeconds(0);
        try { if ((player.getPlaybackRate?.() ?? 1) !== 1) player.setPlaybackRate(1); } catch (_) {}
        return;
      }

      const expected = getExpectedTime();
      const drift = expected - actual; // positive = we're behind
      const abs = Math.abs(drift);

      setLagSeconds(drift > LAG_THRESHOLD ? Math.round(drift) : 0);

      try {
        if (abs > 5) {
          // Last resort — extreme lag (sleeping tab, heavy CPU throttle)
          player.seekTo(expected, true);
          player.setPlaybackRate(1);
        } else if (abs > 0.3) {
          // Rate nudge — converges without any visible stutter or re-buffer
          // Scale rate proportionally: 0.3s → 1.015x, 2s → 1.10x, 5s → 1.10x (capped)
          const adjustment = Math.min(abs * 0.05, 0.10);
          const rate = drift > 0 ? 1 + adjustment : 1 - adjustment;
          if (Math.abs((player.getPlaybackRate?.() ?? 1) - rate) > 0.005) {
            player.setPlaybackRate(rate);
          }
        } else {
          // In sync — restore 1x so playback sounds normal
          if ((player.getPlaybackRate?.() ?? 1) !== 1) player.setPlaybackRate(1);
        }
      } catch (_) {}
    }, 1000);
  }, [getExpectedTime]);

  // Manual unmute — user tap on the "Tap to unmute" pill
  const handleUnmuteRequest = () => {
    userInteractedRef.current = true;
    if (ytPlayerInstance.current) {
      try {
        ytPlayerInstance.current.unMute();
        ytPlayerInstance.current.setVolume(volume || 80);
      } catch (_) {}
    }
    setNeedsUnmute(false);
    setIsMuted(false);
  };

  // Go Live — snap to the current server position immediately.
  // Adds a small +0.5s ahead-seek to absorb the YouTube seek+buffer delay.
  const handleGoLive = () => {
    const expected = getExpectedTime();
    if (!ytPlayerInstance.current) return;
    try {
      ytPlayerInstance.current.seekTo(expected + 0.5, true);
      ytPlayerInstance.current.setPlaybackRate(1);
      if (!isPlaying) ytPlayerInstance.current.playVideo();
    } catch (_) {}
    setLagSeconds(0);
  };

  // Fetch channel data
  useEffect(() => {
    const fetchChannel = async () => {
      try {
        const res = await api.get(`/api/channels/${channelId}`);
        setChannel(res.data.channel);
        setGlobalChannelId(res.data.channel._id);
        setGlobalChannelName(res.data.channel.name);
        if (res.data.channel.viewMode) setViewMode(res.data.channel.viewMode);
        setQueue(res.data.queue);

        const song = res.data.channel.currentSong;
        const pb = res.data.channel.playbackState;
        const pbPlaying = pb?.isPlaying || false;

        // Use playbackState.startedAt (set by server when play started) as the precise origin.
        // Fall back to updatedAt if missing.
        const originIso = pb?.startedAt || pb?.updatedAt;
        const originMs = originIso ? new Date(originIso).getTime() : Date.now();
        const correctedTime = pbPlaying
          ? Math.max(0, (Date.now() - originMs) / 1000)
          : (pb?.currentTime || 0);

        setCurrentSong(song);
        setIsPlaying(pbPlaying);
        setCurrentTime(correctedTime);

        if (song) {
          const seed = { isPlaying: pbPlaying, currentTime: correctedTime, serverTime: serverNow() };
          if (!pendingSyncRef.current) pendingSyncRef.current = seed;
          if (!serverSyncRef.current) {
            serverSyncRef.current = { time: correctedTime, serverTime: serverNow(), isPlaying: pbPlaying };
          }
        }

        // Seed online users from DB isOnline field
        const online = new Set(
          (res.data.channel.members || []).filter(m => m.isOnline).map(m => m._id)
        );
        setOnlineUserIds(online);
      } catch (err) {
        console.error(err);
        navigate('/dashboard');
      } finally {
        setLoading(false);
      }
    };
    fetchChannel();
  }, [channelId]);

  // Socket handlers
  useEffect(() => {
    if (!socket || !channelId) return;
    joinChannel(channelId);
    socket.emit('chat:history', { channelId });

    const handleSocketError = (err) => toast.error(err?.message || 'Something went wrong');
    socket.on('error', handleSocketError);

    const handleMessage = (msg) => setMessages(prev => [...prev, msg]);
    const handleHistory = (msgs) => setMessages(msgs);
    const handleReaction = ({ messageId, reactions }) => {
      setMessages(prev => prev.map(m => m._id === messageId ? { ...m, reactions } : m));
    };
    const handleDeleted = ({ messageId }) => {
      setMessages(prev => prev.filter(m => m._id !== messageId));
    };
    const handlePlayerState = ({ isPlaying: playing, currentTime: ct, song, serverTime }) => {
      setIsPlaying(playing);
      setCurrentTime(ct || 0);
      if (!playing) setSyncReady(true);

      const songChanging = song !== undefined && song !== null &&
        currentSongRef.current?._id &&
        song._id !== currentSongRef.current._id;

      if (song !== undefined) {
        if (songChanging) {
          setSongHistory(prev => [...prev.slice(-9), currentSongRef.current]);
          // Pause current video immediately so users don't see the wrong song for
          // the ~100ms until React re-renders and the YT effect fires.
          // (pauseVideo not stopVideo — stopVideo can trigger ENDED → queue:next)
          if (ytPlayerInstance.current) {
            try { ytPlayerInstance.current.pauseVideo(); } catch (_) {}
          }
        }
        setCurrentSong(song);
      }

      // Server-aligned snapshot for drift correction. serverTime is the server's clock
      // at the moment ct was sampled — using it (with our skew) gives sub-100ms accuracy.
      const sTime = serverTime || serverNow();
      serverSyncRef.current = { time: ct || 0, serverTime: sTime, isPlaying: playing };
      pendingSyncRef.current = { isPlaying: playing, currentTime: ct || 0, serverTime: sTime };

      if (songChanging) return; // YT effect will apply pendingSyncRef via loadVideoById

      // Same song — if player exists, push the change directly.
      // IMPORTANT: if this event is the echo of our own action (we sent it < 2s ago),
      // skip the seekTo — calling seekTo on an already-playing stream forces YouTube
      // to re-buffer, which is what the owner experiences as "buffering on my own click".
      if (ytPlayerInstance.current) {
        try {
          const state = ytPlayerInstance.current.getPlayerState?.();
          if (state !== -1 && state != null) {
            const isSelfEcho = Date.now() - selfControlledAt.current < 2000;
            const actual = ytPlayerInstance.current.getCurrentTime?.() ?? 0;
            const target = ct || 0;
            // Seek only if: someone else triggered it AND we're meaningfully out of position
            if (!isSelfEcho && Math.abs(actual - target) > 1.5) {
              ytPlayerInstance.current.seekTo(target, true);
            }
            if (playing) ytPlayerInstance.current.playVideo();
            else ytPlayerInstance.current.pauseVideo();
            pendingSyncRef.current = null;
          }
        } catch (e) { /* leave pendingSyncRef */ }
      }
    };
    // Heartbeat: server broadcasts authoritative state every 5s. We update
    // serverSyncRef so the drift loop pulls things back into alignment automatically.
    // Also a recovery path: if the joiner missed player:state, the heartbeat brings them in.
    const handleHeartbeat = ({ isPlaying: playing, currentTime: ct, songId, serverTime }) => {
      const sTime = serverTime || serverNow();
      serverSyncRef.current = { time: ct || 0, serverTime: sTime, isPlaying: playing };

      // Recovery: heartbeat song doesn't match what we're showing → request full state
      const localSongId = currentSongRef.current?._id;
      if (songId && localSongId && String(songId) !== String(localSongId)) {
        socketRef.current?.emit('player:request-sync', { channelId });
        return;
      }
      // Recovery: nothing playing locally but server has a song → request full state
      if (songId && !localSongId) {
        socketRef.current?.emit('player:request-sync', { channelId });
        return;
      }
      // Drift loop will apply the correction; no direct seek here
    };
    const handlePlayerSeek = ({ currentTime: ct, serverTime }) => {
      setCurrentTime(ct);
      const sTime = serverTime || serverNow();
      if (serverSyncRef.current) {
        serverSyncRef.current = { ...serverSyncRef.current, time: ct, serverTime: sTime };
      }
      // Skip seek if we sent this (we already seeked locally in handleSeekCommit)
      const isSelfEcho = Date.now() - selfControlledAt.current < 2000;
      if (!isSelfEcho) {
        if (ytPlayerInstance.current) {
          try { ytPlayerInstance.current.seekTo(ct, true); } catch (e) {}
        } else {
          pendingSyncRef.current = pendingSyncRef.current
            ? { ...pendingSyncRef.current, currentTime: ct, serverTime: sTime }
            : { isPlaying: false, currentTime: ct, serverTime: sTime };
        }
      }
    };
    const handleQueueUpdate = (q) => setQueue(q);
    const handleRepeatSync = ({ isRepeat: r }) => setIsRepeat(r);
    const handleUserJoined = ({ user: joinedUser }) => {
      setChannel(prev => prev ? { ...prev, members: [...(prev.members || []), joinedUser] } : prev);
      setOnlineUserIds(prev => new Set([...prev, joinedUser._id]));
    };
    const handleUserLeft = ({ userId }) => {
      setChannel(prev => prev ? { ...prev, members: (prev.members || []).filter(m => m._id !== userId) } : prev);
      setOnlineUserIds(prev => { const s = new Set(prev); s.delete(userId); return s; });
    };
    const handleSystemMsg = (msg) => setMessages(prev => [...prev, { ...msg, _id: `sys-${Date.now()}`, isSystem: true }]);
    const handleTyping = ({ username }) => {
      setTyping(prev => [...new Set([...prev, username])]);
    };
    const handleStopTyping = ({ userId }) => {
      setTyping(prev => prev.filter(u => u !== userId));
    };

    socket.on('chat:message', handleMessage);
    socket.on('chat:history', handleHistory);
    socket.on('chat:reaction-update', handleReaction);
    socket.on('chat:deleted', handleDeleted);
    socket.on('player:state', handlePlayerState);
    socket.on('player:heartbeat', handleHeartbeat);
    socket.on('player:seek', handlePlayerSeek);
    socket.on('queue:updated', handleQueueUpdate);
    socket.on('player:repeat', handleRepeatSync);
    socket.on('channel:user-joined', handleUserJoined);
    socket.on('channel:user-left', handleUserLeft);
    socket.on('chat:system', handleSystemMsg);
    socket.on('chat:typing', handleTyping);
    socket.on('chat:stop-typing', handleStopTyping);
    const handleViewMode = ({ viewMode: vm }) => setViewMode(vm);
    socket.on('channel:view-mode', handleViewMode);

    return () => {
      leaveChannel(channelId);
      socket.off('error', handleSocketError);
      socket.off('chat:message', handleMessage);
      socket.off('chat:history', handleHistory);
      socket.off('chat:reaction-update', handleReaction);
      socket.off('chat:deleted', handleDeleted);
      socket.off('player:state', handlePlayerState);
      socket.off('player:heartbeat', handleHeartbeat);
      socket.off('player:seek', handlePlayerSeek);
      socket.off('queue:updated', handleQueueUpdate);
      socket.off('player:repeat', handleRepeatSync);
      socket.off('channel:user-joined', handleUserJoined);
      socket.off('channel:user-left', handleUserLeft);
      socket.off('chat:system', handleSystemMsg);
      socket.off('chat:typing', handleTyping);
      socket.off('chat:stop-typing', handleStopTyping);
      socket.off('channel:view-mode', handleViewMode);
    };
  }, [socket, channelId]);

  // Cleanup YT player on unmount
  useEffect(() => {
    return () => {
      clearInterval(timeInterval.current);
      if (ytPlayerInstance.current) {
        try { ytPlayerInstance.current.destroy(); } catch (e) {}
      }
    };
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Chat actions ──────────────────────────────────────────────────────────
  const sendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !socket) return;
    socket.emit('chat:message', { channelId, content: chatInput, replyTo: replyTo?._id });
    setChatInput('');
    setReplyTo(null);
    socket.emit('chat:stop-typing', { channelId });
  };

  const handleTypingInput = (e) => {
    setChatInput(e.target.value);
    socket?.emit('chat:typing', { channelId });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socket?.emit('chat:stop-typing', { channelId });
    }, 2000);
  };

  const toggleReaction = (messageId, emoji) => socket?.emit('chat:reaction', { messageId, emoji });

  // ── Player actions ────────────────────────────────────────────────────────
  const togglePlayback = () => {
    selfControlledAt.current = Date.now();
    if (isPlaying) {
      socket?.emit('player:pause', { channelId, currentTime });
    } else {
      socket?.emit('player:play', { channelId, songId: currentSong?._id, currentTime });
    }
  };

  const skipNext = () => {
    selfControlledAt.current = Date.now();
    socket?.emit('queue:next', { channelId });
  };

  const playPrevious = () => {
    selfControlledAt.current = Date.now();
    if (currentTime > 3) {
      socket?.emit('player:seek', { channelId, currentTime: 0 });
      socket?.emit('player:play', { channelId, songId: currentSong?._id, currentTime: 0 });
    } else if (songHistory.length > 0) {
      const prev = songHistory[songHistory.length - 1];
      setSongHistory(h => h.slice(0, -1));
      socket?.emit('player:play', { channelId, songId: prev._id, currentTime: 0 });
    }
  };

  const handleSeekCommit = (e) => {
    const time = parseFloat(e.target.value);
    selfControlledAt.current = Date.now();
    setCurrentTime(time);
    setIsSeeking(false);
    socket?.emit('player:seek', { channelId, currentTime: time });
    try { ytPlayerInstance.current?.seekTo(time, true); } catch (err) {}
  };

  const handleVolumeChange = (e) => {
    const vol = parseInt(e.target.value);
    setVolume(vol);
    if (vol === 0) setIsMuted(true);
    else setIsMuted(false);
    try {
      if (ytPlayerInstance.current) {
        ytPlayerInstance.current.setVolume(vol);
        if (vol === 0) ytPlayerInstance.current.mute();
        else ytPlayerInstance.current.unMute();
      }
    } catch (_) {}
  };

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    try {
      if (ytPlayerInstance.current) {
        if (newMuted) ytPlayerInstance.current.mute();
        else {
          ytPlayerInstance.current.unMute();
          ytPlayerInstance.current.setVolume(volume || 80);
        }
      }
    } catch (_) {}
  };

  const toggleShuffle = () => {
    const next = !isShuffle;
    setIsShuffle(next);
    if (next && queue?.items?.length > 1) socket?.emit('queue:shuffle', { channelId });
  };

  // ── Queue actions ─────────────────────────────────────────────────────────
  const searchSongs = async () => {
    if (!searchQuery.trim()) return;
    try {
      const res = await api.get(`/api/songs/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchResults([
        ...(res.data.results.youtube || []),
        ...(res.data.results.local || []),
      ]);
    } catch (err) {
      console.error('Search failed:', err);
    }
  };

  const addToQueue = (songData) => {
    socket?.emit('queue:add', { channelId, songData });
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const fetchMyPlaylists = async () => {
    if (myPlaylists.length > 0) return;
    try {
      const res = await api.get('/api/playlists/my');
      setMyPlaylists(res.data.playlists || []);
    } catch (err) {
      console.error('Failed to fetch playlists:', err);
    }
  };

  const importPlaylist = (playlist) => {
    if (!playlist.songs?.length) return;
    setImportingPlaylist(playlist._id);
    const songs = playlist.songs.map(s => ({
      title: s.title,
      artist: s.artist,
      source: s.source,
      sourceId: s.sourceId,
      thumbnail: s.thumbnail,
      duration: s.duration,
      album: s.album,
    }));
    socket?.emit('queue:add-many', { channelId, songs });
    setTimeout(() => {
      setImportingPlaylist(null);
      setShowImportPlaylist(false);
    }, 800);
  };

  const openSaveToPlaylist = (song) => {
    setSongToSave(song);
    setSaveSuccess(null);
    fetchMyPlaylists();
  };

  const handleSaveToPlaylist = async (playlistId) => {
    if (!songToSave?._id) return;
    setSavingToPlaylist(playlistId);
    try {
      await api.post(`/api/playlists/${playlistId}/songs`, { songId: songToSave._id });
      setSaveSuccess(playlistId);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save song');
    } finally {
      setSavingToPlaylist(null);
    }
  };

  const upvoteSong = (index) => socket?.emit('queue:upvote', { channelId, itemIndex: index });
  const downvoteSong = (index) => socket?.emit('queue:downvote', { channelId, itemIndex: index });
  const removeFromQueue = (index) => socket?.emit('queue:remove', { channelId, itemIndex: index });
  const playAt = (index) => socket?.emit('queue:play-at', { channelId, itemIndex: index });

  // Drag-to-reorder handlers
  const handleDragStart = (e, index) => {
    setDragFromIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };
  const handleDrop = (e, toIndex) => {
    e.preventDefault();
    if (dragFromIndex !== null && dragFromIndex !== toIndex) {
      socket?.emit('queue:reorder', { channelId, fromIndex: dragFromIndex, toIndex });
    }
    setDragFromIndex(null);
    setDragOverIndex(null);
  };
  const handleDragEnd = () => { setDragFromIndex(null); setDragOverIndex(null); };

  const isAdmin = channel?.admin?._id === user?._id || user?.role === 'superadmin';
  const canControl = isAdmin || channel?.allowAllControl;

  if (loading) {
    return <div className="page-container"><div className="skeleton" style={{ height: '60vh', borderRadius: 'var(--radius-lg)' }} /></div>;
  }

  return (
    <div className="page-container" style={{ maxWidth: '100%', padding: 'var(--space-4)' }}>
      {/* Channel Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 'var(--space-4)', padding: 'var(--space-4) var(--space-5)',
        background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', border: 'var(--border-default)',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800 }}>{channel?.name}</h1>
            <span className={`badge badge-${channel?.type}`}>{channel?.type === 'private' ? '🔒' : '🌐'}</span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>{channel?.description}</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setRightTab('members')}>
            👥 {channel?.members?.length || 0}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowSearch(true)}>
            ➕ Add Song
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => { setShowImportPlaylist(true); fetchMyPlaylists(); }}>
            📋 Import Playlist
          </button>
          {/* Audio/Video mode — admin sets it, affects all members */}
          {isAdmin ? (
            <button
              className="btn btn-secondary btn-sm"
              title="Toggle audio/video mode for all members"
              onClick={async () => {
                const res = await api.post(`/api/channels/${channelId}/toggle-view-mode`);
                setViewMode(res.data.viewMode);
                setChannel(prev => ({ ...prev, viewMode: res.data.viewMode }));
              }}
            >
              {viewMode === 'video' ? '📺 Video' : '🎵 Audio'}
            </button>
          ) : (
            <span className="btn btn-ghost btn-sm" style={{ cursor: 'default', opacity: 0.7 }}>
              {viewMode === 'video' ? '📺 Video' : '🎵 Audio'}
            </span>
          )}
          {isAdmin && (
            <button className="btn btn-secondary btn-sm" onClick={async () => {
              const res = await api.post(`/api/channels/${channelId}/toggle-control`);
              setChannel(prev => ({ ...prev, allowAllControl: res.data.allowAllControl }));
            }}>
              {channel?.allowAllControl ? '🔓 All Control' : '🔒 Admin Only'}
            </button>
          )}
          <button className="btn btn-ghost btn-sm" title="Copy invite link" onClick={() => {
            const url = `${window.location.origin}/join/${channel?.inviteCode}`;
            navigator.clipboard.writeText(url);
            alert(`Invite link copied!`);
          }}>🔗 Invite</button>
        </div>
      </div>

      {/* Main Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 'var(--space-4)', height: 'calc(100vh - 220px)' }}>
        {/* Left: Player + Queue */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', minHeight: 0, overflowY: 'auto' }}>

          {/* Solo mode banner */}
          {channel?.members?.length <= 1 && (
            <div style={{
              padding: 'var(--space-3) var(--space-5)',
              background: 'rgba(124, 58, 237, 0.08)',
              border: '1px solid rgba(124, 58, 237, 0.2)',
              borderRadius: 'var(--radius-md)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 'var(--space-3)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <span style={{ fontSize: 24 }}>🎧</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>You're listening solo</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                    Music is more fun with friends — invite someone to jam together! 🎶
                  </div>
                </div>
              </div>
              <button
                className="btn btn-primary btn-sm"
                style={{ flexShrink: 0 }}
                onClick={() => {
                  const url = `${window.location.origin}/join/${channel?.inviteCode}`;
                  navigator.clipboard.writeText(url);
                  alert('Invite link copied! 🔗 Share it with friends');
                }}
              >
                🔗 Invite Friends
              </button>
            </div>
          )}

          {/* Player */}
          <div className="glass-card" style={{ padding: 'var(--space-5)' }}>
            {currentSong ? (
              <div>
                {/* Song info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
                  {currentSong.thumbnail && (
                    <img src={currentSong.thumbnail} alt="" style={{ width: 72, height: 72, borderRadius: 'var(--radius-md)', objectFit: 'cover', flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h2 style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentSong.title}</h2>
                    <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-1)', fontSize: 'var(--font-size-sm)' }}>{currentSong.artist}</p>
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    title="Save to playlist"
                    onClick={() => openSaveToPlaylist(currentSong)}
                    style={{ flexShrink: 0 }}
                  >💾</button>
                </div>

                {/* YouTube player */}
                {currentSong.source === 'youtube' && (
                  <div style={{ marginBottom: 'var(--space-4)', borderRadius: 'var(--radius-md)', overflow: 'hidden', position: 'relative', minHeight: 200 }}>

                    {/* YT iframe — ALWAYS mounted (never display:none, which can break the API).
                        In audio mode, it's still loaded but hidden behind the visualiser overlay. */}
                    <div
                      ref={ytPlayerDivRef}
                      style={{
                        width: '100%',
                        minHeight: 200,
                        visibility: viewMode === 'video' ? 'visible' : 'hidden',
                      }}
                    />

                    {/* Audio-only visualiser (overlays the iframe) */}
                    {viewMode === 'audio' && (
                      <div style={{
                        position: 'absolute', inset: 0,
                        height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'linear-gradient(135deg, var(--bg-tertiary), var(--bg-elevated))',
                        gap: 6, zIndex: 2,
                      }}>
                        {[1,2,3,4,5,6,7,8].map(i => (
                          <div key={i} style={{
                            width: 6, borderRadius: 3,
                            background: 'var(--accent-primary)',
                            height: isPlaying ? `${20 + Math.sin(i * 0.8) * 40 + 20}px` : '8px',
                            animation: isPlaying ? `bar-bounce ${0.6 + i * 0.1}s ease-in-out infinite alternate` : 'none',
                            transition: 'height 0.3s ease',
                          }} />
                        ))}
                        <style>{`@keyframes bar-bounce { from { transform: scaleY(0.3); } to { transform: scaleY(1); } }`}</style>
                      </div>
                    )}

                    {/* Sync loading overlay — shown until YT player actually starts playing or is paused */}
                    {!syncReady && (
                      <div style={{
                        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(0,0,0,0.7)', borderRadius: 'var(--radius-md)', zIndex: 5,
                        flexDirection: 'column', gap: 12,
                      }}>
                        <div style={{ fontSize: 32 }}>🎵</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Syncing playback...</div>
                      </div>
                    )}

                    {/* Tap-to-unmute pill — non-blocking, video already plays muted */}
                    {needsUnmute && (
                      <button
                        onClick={handleUnmuteRequest}
                        style={{
                          position: 'absolute', top: 12, right: 12, zIndex: 6,
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '8px 14px', borderRadius: 999,
                          background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(255,255,255,0.15)',
                          color: 'var(--text-primary)', cursor: 'pointer',
                          fontSize: 13, fontWeight: 600,
                          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                        }}
                        title="Browser blocked sound — tap to unmute"
                      >
                        🔇 Tap to unmute
                      </button>
                    )}
                  </div>
                )}

                {/* Go Live — appears when this client is > 5s behind the server */}
                {lagSeconds > 0 && isPlaying && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 12px', marginBottom: 'var(--space-2)',
                    background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: 'var(--radius-md)',
                  }}>
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      You are <strong style={{ color: '#f87171' }}>{lagSeconds}s behind</strong> the channel
                    </span>
                    <button
                      className="btn btn-sm"
                      onClick={handleGoLive}
                      style={{
                        background: '#ef4444', color: '#fff', border: 'none',
                        padding: '4px 14px', borderRadius: 999, fontWeight: 700, fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      ⚡ Go Live
                    </button>
                  </div>
                )}

                {/* Seek bar */}
                <div className="seek-bar-container">
                  <span className="seek-time">{formatDuration(isSeeking ? seekDraft : currentTime)}</span>
                  <input
                    type="range"
                    className="seek-bar"
                    min={0}
                    max={duration || 1}
                    step={0.5}
                    value={isSeeking ? seekDraft : Math.min(currentTime, duration || currentTime)}
                    onMouseDown={() => { setIsSeeking(true); setSeekDraft(currentTime); }}
                    onChange={(e) => setSeekDraft(parseFloat(e.target.value))}
                    onMouseUp={handleSeekCommit}
                    onTouchEnd={handleSeekCommit}
                    disabled={!canControl}
                    title={canControl ? 'Seek' : 'Admin only'}
                  />
                  <span className="seek-time">{formatDuration(duration)}</span>
                </div>

                {/* Controls */}
                <div className="player-controls">
                  {/* Left: Shuffle */}
                  <button
                    className={`player-ctrl-btn player-mode-btn${isShuffle ? ' player-ctrl-active' : ''}`}
                    onClick={toggleShuffle}
                    title={isShuffle ? 'Shuffle: On' : 'Shuffle: Off'}
                  >🔀 <span className="player-mode-label">Shuffle</span></button>

                  {/* Center: Prev / Play / Next */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flex: 1, justifyContent: 'center' }}>
                    <button
                      className="player-ctrl-btn"
                      onClick={playPrevious}
                      title="Previous"
                      disabled={!canControl || (songHistory.length === 0 && currentTime <= 3)}
                    >⏮</button>
                    <button
                      className="player-btn-play"
                      onClick={togglePlayback}
                      disabled={!canControl}
                      style={{ opacity: !canControl ? 0.5 : 1 }}
                      title={isPlaying ? 'Pause' : 'Play'}
                    >
                      {isPlaying ? '⏸' : '▶'}
                    </button>
                    <button className="player-ctrl-btn" onClick={skipNext} title="Skip next" disabled={!canControl}>⏭</button>
                  </div>

                  {/* Right: Repeat */}
                  <button
                    className={`player-ctrl-btn player-mode-btn${isRepeat ? ' player-ctrl-active' : ''}`}
                    onClick={() => {
                      const next = !isRepeat;
                      setIsRepeat(next);
                      socket?.emit('player:repeat', { channelId, isRepeat: next });
                    }}
                    title={isRepeat ? 'Repeat: On' : 'Repeat: Off'}
                  >🔁 <span className="player-mode-label">Repeat</span></button>
                </div>

                {/* Volume row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
                  <button
                    className="player-ctrl-btn"
                    onClick={toggleMute}
                    title={isMuted ? 'Unmute' : 'Mute'}
                    style={{ flexShrink: 0, fontSize: 18, minWidth: 32 }}
                  >
                    {isMuted || volume === 0 ? '🔇' : volume < 40 ? '🔉' : '🔊'}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    style={{
                      flex: 1,
                      height: 4,
                      accentColor: 'var(--accent-primary)',
                      cursor: 'pointer',
                    }}
                    title={`Volume: ${isMuted ? 0 : volume}%`}
                  />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 32, textAlign: 'right' }}>
                    {isMuted ? 0 : volume}%
                  </span>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 'var(--space-10)', color: 'var(--text-secondary)' }}>
                <p style={{ fontSize: '48px', marginBottom: 'var(--space-4)' }}>🎵</p>
                <p>No song playing. Add songs to the queue!</p>
                <button className="btn btn-primary" style={{ marginTop: 'var(--space-4)' }} onClick={() => setShowSearch(true)}>
                  ➕ Search & Add Songs
                </button>
              </div>
            )}
          </div>

          {/* Queue */}
          <div className="queue-container" style={{ flex: 1, minHeight: 220, display: 'flex', flexDirection: 'column' }}>
            <div className="queue-header">
              <h3 style={{ fontWeight: 700 }}>📋 Queue ({queue?.items?.length || 0})</h3>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                {queue?.items?.length > 1 && (
                  <button className="btn btn-ghost btn-sm" onClick={toggleShuffle} title="Shuffle queue">🔀 Shuffle</button>
                )}
                {isAdmin && queue?.items?.length > 0 && (
                  <button className="btn btn-danger btn-sm" onClick={() => socket?.emit('queue:clear', { channelId })}>Clear</button>
                )}
              </div>
            </div>
            <div className="queue-list" style={{ flex: 1, overflow: 'auto' }}>
              {queue?.items?.map((item, i) => (
                <div
                  key={i}
                  className={`queue-item${dragOverIndex === i && dragFromIndex !== i ? ' queue-drag-over' : ''}${dragFromIndex === i ? ' queue-dragging' : ''}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, i)}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDrop={(e) => handleDrop(e, i)}
                  onDragEnd={handleDragEnd}
                >
                  <span className="queue-drag-handle" title="Drag to reorder">⠿</span>
                  <span className="queue-item-position">{i + 1}</span>
                  <div
                    className="queue-item-thumb-wrap"
                    onClick={() => canControl && playAt(i)}
                    title={canControl ? 'Play now' : ''}
                    style={{ cursor: canControl ? 'pointer' : 'default' }}
                  >
                    {item.song?.thumbnail && <img src={item.song.thumbnail} alt="" className="queue-item-thumbnail" />}
                    {canControl && <span className="queue-item-play-overlay">▶</span>}
                  </div>
                  <div
                    className="queue-item-info"
                    onClick={() => canControl && playAt(i)}
                    style={{ cursor: canControl ? 'pointer' : 'default' }}
                  >
                    <div className="queue-item-title">{item.song?.title}</div>
                    <div className="queue-item-artist">
                      {item.song?.artist}
                      {item.addedBy?.username && (
                        <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
                          • added by {item.addedBy.username}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="queue-item-votes">
                    <button className={`queue-vote-btn${item.upvotes?.includes(user?._id) ? ' upvoted' : ''}`}
                      onClick={() => upvoteSong(i)}>👍</button>
                    <span className="queue-vote-count">{(item.upvotes?.length || 0) - (item.downvotes?.length || 0)}</span>
                    <button className={`queue-vote-btn${item.downvotes?.includes(user?._id) ? ' downvoted' : ''}`}
                      onClick={() => downvoteSong(i)}>👎</button>
                    <button className="queue-vote-btn" onClick={() => openSaveToPlaylist(item.song)} title="Save to playlist">💾</button>
                    {(canControl || item.addedBy?._id === user?._id) && (
                      <button className="queue-vote-btn" onClick={() => removeFromQueue(i)} title="Remove">✕</button>
                    )}
                  </div>
                </div>
              ))}
              {(!queue?.items || queue.items.length === 0) && (
                <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Queue is empty. Add some songs!
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Chat + Members (tabbed) */}
        <div className="chat-container" style={{ height: '100%' }}>
          {/* Tab bar */}
          <div className="right-panel-tabs">
            <button
              className={`right-panel-tab${rightTab === 'chat' ? ' active' : ''}`}
              onClick={() => setRightTab('chat')}
            >💬 Chat</button>
            <button
              className={`right-panel-tab${rightTab === 'members' ? ' active' : ''}`}
              onClick={() => setRightTab('members')}
            >👥 Members <span className="tab-count">{channel?.members?.length || 0}</span></button>
          </div>

          {/* Members panel */}
          {rightTab === 'members' && (
            <div style={{ flex: 1, overflow: 'auto', padding: 'var(--space-3)' }}>
              {channel?.members?.map(member => {
                const isOnline = onlineUserIds.has(member._id) || member._id === user?._id;
                return (
                  <div key={member._id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                    marginBottom: 'var(--space-2)',
                    background: 'var(--surface-glass)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <div style={{ position: 'relative' }}>
                        <div className="avatar avatar-sm avatar-placeholder" style={{ background: getAvatarColor(member.username), fontSize: '11px' }}>
                          {getInitials(member.username)}
                        </div>
                        <div style={{
                          position: 'absolute', bottom: 0, right: 0,
                          width: 10, height: 10, borderRadius: '50%',
                          background: isOnline ? 'var(--accent-success)' : 'var(--text-muted)',
                          border: '2px solid var(--bg-secondary)',
                        }} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          {member.username}
                          {member._id === channel.admin?._id && (
                            <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: 'var(--radius-full)', background: 'var(--accent-primary-glow)', color: 'var(--accent-primary)' }}>Admin</span>
                          )}
                        </div>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: isOnline ? 'var(--accent-success)' : 'var(--text-muted)' }}>
                          {isOnline ? '● Online' : '○ Offline'}
                        </div>
                      </div>
                    </div>
                    {isAdmin && member._id !== user?._id && member._id !== channel.admin?._id && (
                      <button className="btn btn-danger btn-sm" onClick={async () => {
                        await api.post(`/api/channels/${channelId}/kick/${member._id}`);
                        setChannel(prev => ({ ...prev, members: prev.members.filter(m => m._id !== member._id) }));
                      }}>Kick</button>
                    )}
                  </div>
                );
              })}
              {isAdmin && channel?.bannedUsers?.length > 0 && (
                <div style={{ marginTop: 'var(--space-4)', borderTop: 'var(--border-default)', paddingTop: 'var(--space-3)' }}>
                  <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-2)' }}>
                    Banned Users
                  </div>
                  {channel.bannedUsers.map(banned => (
                    <div key={banned._id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)',
                      background: 'rgba(239,68,68,0.06)', marginBottom: 'var(--space-1)',
                    }}>
                      <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                        🚫 {banned.username}
                      </span>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent-success)', fontSize: 11 }}
                        onClick={async () => {
                          try {
                            await api.post(`/api/channels/${channelId}/unban/${banned._id}`);
                            setChannel(prev => ({ ...prev, bannedUsers: prev.bannedUsers.filter(b => b._id !== banned._id) }));
                            toast.success(`${banned.username} has been unbanned`);
                          } catch (err) {
                            toast.error(err.response?.data?.error || 'Failed to unban');
                          }
                        }}>
                        Unban
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Chat panel */}
          {rightTab === 'chat' && (<>
          <div className="chat-messages" style={{ flex: 1, overflow: 'auto' }}>
            {messages.map((msg) => (
              msg.isSystem ? (
                <div key={msg._id} style={{
                  textAlign: 'center', padding: '4px 16px', margin: '4px 0',
                  fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)',
                  fontStyle: 'italic',
                }}>
                  <span style={{ padding: '2px 10px', background: 'var(--surface-glass)', borderRadius: 'var(--radius-full)' }}>
                    {msg.text}
                  </span>
                </div>
              ) : (
                <div key={msg._id} className="chat-message">
                  <div className="avatar avatar-sm avatar-placeholder"
                    style={{ background: getAvatarColor(msg.sender?.username || ''), fontSize: '11px' }}>
                    {getInitials(msg.sender?.username || '')}
                  </div>
                  <div className="chat-message-content">
                    <div className="chat-message-header">
                      <span className="chat-message-username">{msg.sender?.username}</span>
                      <span className="chat-message-time">{formatTimeAgo(msg.createdAt)}</span>
                    </div>
                    {msg.replyTo && (
                      <div style={{ padding: '4px 8px', background: 'var(--surface-glass)', borderLeft: '2px solid var(--accent-primary)', borderRadius: '4px', marginBottom: '4px', fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
                        ↩ {msg.replyTo.content?.substring(0, 60)}
                      </div>
                    )}
                    <div className="chat-message-text">{msg.content}</div>
                    {msg.reactions?.length > 0 && (
                      <div className="chat-message-reactions">
                        {msg.reactions.map((r, i) => (
                          <button key={i} className={`chat-reaction ${r.users?.includes(user?._id) ? 'active' : ''}`}
                            onClick={() => toggleReaction(msg._id, r.emoji)}>
                            {r.emoji} {r.users?.length}
                          </button>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '4px', marginTop: '4px', opacity: 0 }}
                      className="msg-actions"
                      onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                      onMouseLeave={(e) => e.currentTarget.style.opacity = 0}>
                      <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: '12px' }}
                        onClick={() => setReplyTo(msg)}>↩</button>
                      {EMOJIS.slice(0, 5).map(emoji => (
                        <button key={emoji} className="btn btn-ghost" style={{ padding: '2px 4px', fontSize: '14px' }}
                          onClick={() => toggleReaction(msg._id, emoji)}>{emoji}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )
            ))}
            <div ref={chatEndRef} />
          </div>
          {typing.length > 0 && (
            <div style={{ padding: '4px 20px', fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
              {typing.join(', ')} typing...
            </div>
          )}
          {replyTo && (
            <div style={{ padding: '8px 20px', background: 'var(--surface-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--font-size-xs)' }}>
              <span>↩ Replying to <strong>{replyTo.sender?.username}</strong>: {replyTo.content?.substring(0, 40)}</span>
              <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>✕</button>
            </div>
          )}
          <form className="chat-input-bar" onSubmit={sendMessage}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowEmoji(!showEmoji)}>😀</button>
            <input className="chat-input" placeholder="Type a message..." value={chatInput} onChange={handleTypingInput} />
            <button type="submit" className="btn btn-primary btn-sm">Send</button>
          </form>
          {showEmoji && (
            <div style={{
              position: 'absolute', bottom: 80, right: 20, background: 'var(--bg-secondary)',
              border: 'var(--border-default)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)',
              display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px', zIndex: 100,
            }}>
              {EMOJIS.map(emoji => (
                <button key={emoji} onClick={() => { setChatInput(prev => prev + emoji); setShowEmoji(false); }}
                  style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', padding: '4px' }}>
                  {emoji}
                </button>
              ))}
            </div>
          )}
          </>)}
        </div>
      </div>

      {/* Save to Playlist Modal */}
      {songToSave && (
        <>
          <div className="modal-backdrop" onClick={() => { setSongToSave(null); setSaveSuccess(null); }} />
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2>💾 Save to Playlist</h2>
              <button className="modal-close" onClick={() => { setSongToSave(null); setSaveSuccess(null); }}>✕</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--surface-glass)', borderRadius: 'var(--radius-md)' }}>
              {songToSave.thumbnail && <img src={songToSave.thumbnail} alt="" style={{ width: 44, height: 44, borderRadius: 'var(--radius-sm)', objectFit: 'cover' }} />}
              <div>
                <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>{songToSave.title}</div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>{songToSave.artist}</div>
              </div>
            </div>
            {myPlaylists.length === 0 ? (
              <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-muted)' }}>
                No playlists yet.{' '}
                <button className="btn btn-ghost btn-sm" onClick={() => { setSongToSave(null); navigate('/playlist'); }}>
                  Create one
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxHeight: 320, overflowY: 'auto' }}>
                {myPlaylists.map(pl => {
                  const alreadySaved = saveSuccess === pl._id;
                  return (
                    <div key={pl._id} style={{
                      display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                      padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                      background: 'var(--surface-glass)',
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>{pl.name}</div>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>{pl.songs?.length || 0} songs</div>
                      </div>
                      <button
                        className={`btn btn-sm ${alreadySaved ? 'btn-secondary' : 'btn-primary'}`}
                        disabled={savingToPlaylist === pl._id || alreadySaved}
                        onClick={() => handleSaveToPlaylist(pl._id)}
                      >
                        {alreadySaved ? '✓ Saved' : savingToPlaylist === pl._id ? 'Saving...' : '+ Save'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Import Playlist Modal */}
      {showImportPlaylist && (
        <>
          <div className="modal-backdrop" onClick={() => setShowImportPlaylist(false)} />
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h2>📋 Import Playlist to Queue</h2>
              <button className="modal-close" onClick={() => setShowImportPlaylist(false)}>✕</button>
            </div>
            {myPlaylists.length === 0 ? (
              <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
                You have no playlists yet. Create one from the Playlists page!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {myPlaylists.map(pl => (
                  <div key={pl._id} style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                    padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                    background: 'var(--surface-glass)',
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>{pl.name}</div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                        {pl.songs?.length || 0} songs
                        {pl.description && ` · ${pl.description}`}
                      </div>
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => importPlaylist(pl)}
                      disabled={importingPlaylist === pl._id || !pl.songs?.length}
                    >
                      {importingPlaylist === pl._id ? 'Adding...' : '+ Add All'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Search Songs Modal */}
      {showSearch && (
        <>
          <div className="modal-backdrop" onClick={() => { setShowSearch(false); setSearchResults([]); setSearchQuery(''); }} />
          <div className="modal" style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <h2>🔍 Search Songs</h2>
              <button className="modal-close" onClick={() => { setShowSearch(false); setSearchResults([]); setSearchQuery(''); }}>✕</button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); searchSongs(); }} style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
              <input className="input-field" placeholder="Search for songs..." value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)} autoFocus style={{ flex: 1 }} />
              <button type="submit" className="btn btn-primary">Search</button>
            </form>
            <div style={{ maxHeight: 400, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {searchResults.map((song, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                  padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                  background: 'var(--surface-glass)', cursor: 'pointer',
                }} onClick={() => addToQueue(song)}>
                  {song.thumbnail && <img src={song.thumbnail} alt="" style={{ width: 48, height: 48, borderRadius: 'var(--radius-sm)', objectFit: 'cover' }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.title}</div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>{song.artist}</div>
                  </div>
                  <button className="btn btn-primary btn-sm">+ Add</button>
                </div>
              ))}
              {searchResults.length === 0 && searchQuery && (
                <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--text-muted)' }}>
                  Search for songs to add to the queue
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ChannelPage;
