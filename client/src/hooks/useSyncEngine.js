/**
 * useSyncEngine — BeatRoom synchronization engine
 *
 * Core fix: instead of seeking with stale REST data from mount time, this hook
 * fetches a fresh startedAt from the server via socket at the exact moment the
 * YouTube player fires onReady. This eliminates the 1–3 s stale-position bug.
 *
 * Additional improvements:
 *  - seekTo compensation (+400 ms) pre-accounts for YouTube's rebuffer latency
 *  - Rate nudge capped at ±4% so pitch shift is inaudible on music
 *  - Hard seekTo only at >5 s drift (was 3 s) — reduces rebuffer events
 *  - RAF drift loop when tab visible; interval fallback when tab hidden
 *  - Post-join correction checks at T+2 s and T+8 s catch residual error
 *  - Periodic 60 s clock re-sync prevents long-session drift
 *  - Self-echo window is 3 s (avoids player reacting to its own events)
 */

import { useRef, useEffect, useCallback } from 'react';

// ─── Tuning ───────────────────────────────────────────────────────────────────
const SEEK_COMPENSATION_MS = 400;   // pre-account for YT seek+buffer latency
const SELF_ECHO_WINDOW_MS  = 3000;
const CLOCK_RESYNC_MS      = 60_000;
const DRIFT_IGNORE         = 0.25;  // s — too small to matter
const DRIFT_RATE_MAX       = 3.0;   // s — use rate nudge below this
const DRIFT_SEEK           = 5.0;   // s — hard seekTo above this
const RATE_NUDGE_MILD      = 1.02;  // ±2% for <1 s drift (inaudible)
const RATE_NUDGE_STRONG    = 1.04;  // ±4% for 1–3 s drift (barely audible)

// ─── Clock measurement ────────────────────────────────────────────────────────

function measureClockOffset(socket) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    socket.timeout(2000).emit('time:sync', t0, (err, resp) => {
      if (err) { resolve({ offsetMs: 0, rttMs: 999 }); return; }
      const t2 = Date.now();
      const rttMs = t2 - t0;
      // server may send a plain number or { serverTime }
      const serverTime = typeof resp === 'number' ? resp : (resp?.serverTime ?? t2);
      const offsetMs = serverTime - (t0 + rttMs / 2);
      resolve({ offsetMs, rttMs });
    });
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {object} opts.socket     — socket.io socket instance
 * @param {object} opts.playerRef  — ref whose .current is the YouTube IFrame player
 * @param {string} opts.channelId  — current channel ID
 */
export function useSyncEngine({ socket, playerRef, channelId }) {
  const clockOffsetRef      = useRef(0);
  const startedAtRef        = useRef(null); // server ms when position 0 would have played
  const selfControlledAtRef = useRef(0);
  const animFrameRef        = useRef(null);
  const syncIntervalRef     = useRef(null);
  const clockResyncRef      = useRef(null);
  const postJoinTimersRef   = useRef([]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const serverNow = useCallback(() => Date.now() + clockOffsetRef.current, []);

  const getExpectedPosition = useCallback(() => {
    if (!startedAtRef.current) return 0;
    return Math.max(0, (serverNow() - startedAtRef.current) / 1000);
  }, [serverNow]);

  /** Call before emitting any player control event to suppress the server echo. */
  const markSelfControlled = useCallback(() => {
    selfControlledAtRef.current = Date.now();
  }, []);

  const isSelfEcho = useCallback(
    () => Date.now() - selfControlledAtRef.current < SELF_ECHO_WINDOW_MS,
    []
  );

  // ── Clock sync ─────────────────────────────────────────────────────────────

  const resyncClock = useCallback(async () => {
    if (!socket?.connected) return;
    const samples = await Promise.all([
      measureClockOffset(socket),
      measureClockOffset(socket),
      measureClockOffset(socket),
    ]);
    const best = samples.reduce((a, b) => (a.rttMs < b.rttMs ? a : b));
    clockOffsetRef.current = best.offsetMs;
  }, [socket]);

  // ── Seek helper ────────────────────────────────────────────────────────────

  const seekToSync = useCallback(() => {
    const player = playerRef?.current;
    if (!player?.seekTo) return;
    const compensated = getExpectedPosition() + SEEK_COMPENSATION_MS / 1000;
    player.seekTo(compensated, true);
  }, [playerRef, getExpectedPosition]);

  // ── Drift correction ───────────────────────────────────────────────────────

  const applyDriftCorrection = useCallback(() => {
    const player = playerRef?.current;
    if (!player?.getCurrentTime || !startedAtRef.current) return;

    const actual   = player.getCurrentTime();
    const expected = getExpectedPosition();
    const drift    = actual - expected; // positive = client is ahead of server

    if (Math.abs(drift) < DRIFT_IGNORE) {
      if (player.getPlaybackRate?.() !== 1) player.setPlaybackRate?.(1);
      return;
    }

    if (Math.abs(drift) > DRIFT_SEEK) {
      seekToSync();
      player.setPlaybackRate?.(1);
      return;
    }

    // Rate nudge — stays inaudible on music at these levels
    let rate;
    if (Math.abs(drift) < 1.0) {
      rate = drift > 0 ? 1 - RATE_NUDGE_MILD   : 1 + RATE_NUDGE_MILD;
    } else {
      rate = drift > 0 ? 1 - RATE_NUDGE_STRONG : 1 + RATE_NUDGE_STRONG;
    }
    if (player.getPlaybackRate?.() !== rate) player.setPlaybackRate?.(rate);
  }, [playerRef, getExpectedPosition, seekToSync]);

  // ── Drift loop (RAF when visible, interval when hidden) ───────────────────

  const stopDriftLoop = useCallback(() => {
    if (animFrameRef.current)    { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
    if (syncIntervalRef.current) { clearInterval(syncIntervalRef.current); syncIntervalRef.current = null; }
  }, []);

  const startDriftLoop = useCallback(() => {
    stopDriftLoop();
    if (!startedAtRef.current) return;

    if (document.visibilityState === 'visible') {
      let last = 0;
      const loop = (ts) => {
        if (ts - last >= 1000) { last = ts; applyDriftCorrection(); }
        animFrameRef.current = requestAnimationFrame(loop);
      };
      animFrameRef.current = requestAnimationFrame(loop);
    } else {
      syncIntervalRef.current = setInterval(applyDriftCorrection, 1000);
    }
  }, [stopDriftLoop, applyDriftCorrection]);

  useEffect(() => {
    const onVis = () => startDriftLoop();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [startDriftLoop]);

  // ── THE CORE FIX: fresh state at onReady time ─────────────────────────────
  /**
   * Call this from your YouTube IFrame onReady callback.
   *
   * If the song is paused, seeks to the saved position immediately.
   * If the song is playing, re-syncs the clock then fetches fresh startedAt
   * from the server via socket ack — so the seekTo target is computed from
   * server state that is milliseconds old, not 1–3 seconds old.
   *
   * @param {{ isPlaying: boolean, currentTime: number }} initialSync
   *   The pendingSyncRef value saved at mount/REST-fetch time.
   */
  const onPlayerReady = useCallback(async (initialSync) => {
    const player = playerRef?.current;
    if (!player) return;

    if (!initialSync?.isPlaying) {
      // Paused — no need for fresh server round-trip
      try { player.seekTo(initialSync?.currentTime || 0, true); } catch (_) {}
      try { player.pauseVideo(); } catch (_) {}
      return;
    }

    // Playing — re-sync clock, then fetch the freshest possible startedAt
    await resyncClock();

    await new Promise((resolve) => {
      if (!socket?.connected) {
        // Fallback: use initialSync if socket not ready
        try { player.seekTo((initialSync.currentTime || 0) + SEEK_COMPENSATION_MS / 1000, true); } catch (_) {}
        try { player.playVideo(); } catch (_) {}
        resolve();
        return;
      }

      socket.emit('player:request-state', { channelId }, (state) => {
        if (state?.startedAt) {
          startedAtRef.current = state.startedAt;
        }
        seekToSync();
        try { player.playVideo(); } catch (_) {}

        // Two follow-up correction checks catch any residual error
        postJoinTimersRef.current.forEach(clearTimeout);
        const t1 = setTimeout(() => applyDriftCorrection(), 2000);
        const t2 = setTimeout(() => applyDriftCorrection(), 8000);
        postJoinTimersRef.current = [t1, t2];
        resolve();
      });
    });
  }, [socket, channelId, playerRef, resyncClock, seekToSync, applyDriftCorrection]);

  // ── Socket event listeners (player control only, no UI state) ─────────────

  useEffect(() => {
    if (!socket) return;

    const onHeartbeat = ({ startedAt }) => {
      if (startedAt) startedAtRef.current = startedAt;
      // drift loop corrects position on next tick
    };

    const onState = ({ isPlaying, startedAt }) => {
      if (isSelfEcho()) return;
      if (startedAt) startedAtRef.current = startedAt;
      if (isPlaying === false) {
        stopDriftLoop();
        try { playerRef?.current?.pauseVideo(); } catch (_) {}
      } else if (isPlaying === true) {
        seekToSync();
        try { playerRef?.current?.playVideo(); } catch (_) {}
        startDriftLoop();
      }
    };

    const onSeek = ({ startedAt }) => {
      if (isSelfEcho()) return;
      if (startedAt) startedAtRef.current = startedAt;
      seekToSync();
    };

    socket.on('player:heartbeat', onHeartbeat);
    socket.on('player:state',     onState);
    socket.on('player:seek',      onSeek);

    return () => {
      socket.off('player:heartbeat', onHeartbeat);
      socket.off('player:state',     onState);
      socket.off('player:seek',      onSeek);
    };
  }, [socket, isSelfEcho, stopDriftLoop, startDriftLoop, seekToSync, playerRef]);

  // ── Periodic clock re-sync ─────────────────────────────────────────────────

  useEffect(() => {
    resyncClock();
    clockResyncRef.current = setInterval(resyncClock, CLOCK_RESYNC_MS);
    return () => clearInterval(clockResyncRef.current);
  }, [resyncClock]);

  // ── Cleanup ────────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      stopDriftLoop();
      postJoinTimersRef.current.forEach(clearTimeout);
    };
  }, [stopDriftLoop]);

  return { onPlayerReady, markSelfControlled, startDriftLoop, stopDriftLoop };
}
