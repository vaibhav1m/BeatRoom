import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePlayer } from '../context/PlayerContext';
import { useSocket } from '../context/SocketContext';

const MiniPlayer = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentSong, isPlaying, currentChannelId, channelName, setCurrentSong, setIsPlaying, setCurrentChannelId, setChannelName } = usePlayer();
  const { socket } = useSocket();
  const [dismissed, setDismissed] = useState(false);

  // Don't show if: no song, no channel, on the channel page itself, or dismissed
  const isOnChannelPage = location.pathname.startsWith('/channel/');
  if (!currentSong || !currentChannelId || isOnChannelPage || dismissed) return null;

  const handlePlayPause = () => {
    if (isPlaying) {
      socket?.emit('player:pause', { channelId: currentChannelId, currentTime: 0 });
    } else {
      socket?.emit('player:play', { channelId: currentChannelId, songId: currentSong._id, currentTime: 0 });
    }
  };

  const handleSkip = () => {
    socket?.emit('queue:next', { channelId: currentChannelId });
  };

  const handleMaximize = () => {
    navigate(`/channel/${currentChannelId}`);
  };

  const handleClose = () => {
    setDismissed(true);
    setCurrentSong(null);
    setIsPlaying(false);
    setCurrentChannelId(null);
    setChannelName(null);
  };

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      height: 72,
      background: 'var(--bg-secondary)',
      borderTop: '1px solid rgba(124,58,237,0.3)',
      display: 'flex', alignItems: 'center',
      padding: '0 var(--space-4)',
      gap: 'var(--space-4)',
      zIndex: 150,
      backdropFilter: 'blur(12px)',
      boxShadow: '0 -4px 24px rgba(0,0,0,0.4)',
    }}>
      {/* Thumbnail */}
      {currentSong.thumbnail ? (
        <img src={currentSong.thumbnail} alt=""
          style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
      ) : (
        <div style={{ width: 44, height: 44, borderRadius: 6, background: 'var(--accent-primary-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🎵</div>
      )}

      {/* Song info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {currentSong.title}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {currentSong.artist} {channelName && <span style={{ color: 'var(--accent-primary)', marginLeft: 6 }}>• {channelName}</span>}
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button onClick={handlePlayPause} style={{
          width: 40, height: 40, borderRadius: '50%',
          background: 'var(--accent-primary)',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, color: '#fff',
        }}>
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button onClick={handleSkip} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-secondary)', fontSize: 18, padding: '4px 6px',
        }}>⏭</button>
      </div>

      {/* Maximize & Close */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <button onClick={handleMaximize} title="Go to channel" style={{
          background: 'var(--surface-glass)', border: 'var(--border-default)',
          borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
          color: 'var(--text-secondary)', fontSize: 12,
        }}>⤢ Open</button>
        <button onClick={handleClose} title="Close mini player" style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', fontSize: 18, padding: '4px 6px',
        }}>✕</button>
      </div>
    </div>
  );
};

export default MiniPlayer;
