import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { formatNumber } from '../utils/helpers';
import { getInitials } from '../utils/helpers';
import { getAvatarColor } from '../utils/constants';

const DashboardPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [channels, setChannels] = useState([]);
  const [stats, setStats] = useState(null);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannel, setNewChannel] = useState({ name: '', description: '', type: 'public', password: '' });
  const [joinPassword, setJoinPassword] = useState('');
  const [joiningChannel, setJoiningChannel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [channelsRes, statsRes] = await Promise.all([
        api.get('/api/channels'),
        api.get('/api/admin/stats'),
      ]);
      setChannels(channelsRes.data.channels);
      setStats(statsRes.data.stats);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateChannel = async (e) => {
    e.preventDefault();
    setError('');
    if (!newChannel.name.trim()) { setError('Channel name is required'); return; }
    try {
      const res = await api.post('/api/channels', newChannel);
      setChannels([res.data.channel, ...channels]);
      setShowCreateChannel(false);
      setNewChannel({ name: '', description: '', type: 'public', password: '' });
      navigate(`/channel/${res.data.channel._id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create channel');
    }
  };

  const handleJoinChannel = async (channel) => {
    if (channel.members?.some(m => m._id === user._id)) {
      navigate(`/channel/${channel._id}`);
      return;
    }
    if (channel.type === 'private') {
      setJoiningChannel(channel);
      return;
    }
    try {
      await api.post(`/api/channels/${channel._id}/join`);
      navigate(`/channel/${channel._id}`);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to join');
    }
  };

  const handleJoinPrivate = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/api/channels/${joiningChannel._id}/join`, { password: joinPassword });
      navigate(`/channel/${joiningChannel._id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to join');
    }
  };

  return (
    <div className="page-container">
      {/* Welcome Header */}
      <div style={{ marginBottom: 'var(--space-8)' }}>
        <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 800 }}>
          Welcome back, <span className="gradient-text">{user?.username}</span> 👋
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>
          Discover channels, join rooms, and stream music with friends.
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="stats-grid" style={{ marginBottom: 'var(--space-8)' }}>
          {[
            { icon: '📺', value: stats.totalChannels, label: 'Active Channels', color: 'rgba(124,58,237,0.2)' },
            { icon: '👥', value: stats.onlineUsers, label: 'Online Now', color: 'rgba(16,185,129,0.2)' },
            { icon: '🎵', value: stats.totalSongs, label: 'Songs Played', color: 'rgba(6,182,212,0.2)' },
            { icon: '📋', value: stats.totalPlaylists, label: 'Playlists', color: 'rgba(244,63,94,0.2)' },
          ].map((stat, i) => (
            <div className="stat-card" key={i}>
              <div className="stat-card-icon" style={{ background: stat.color }}>{stat.icon}</div>
              <div className="stat-card-value gradient-text">{formatNumber(stat.value)}</div>
              <div className="stat-card-label">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Channels Section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
        <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700 }}>🔊 Channels</h2>
        <button className="btn btn-primary" onClick={() => setShowCreateChannel(true)}>
          ➕ Create Channel
        </button>
      </div>

      {loading ? (
        <div className="channel-grid">
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton" style={{ height: 180, borderRadius: 'var(--radius-lg)' }} />
          ))}
        </div>
      ) : (
        <div className="channel-grid">
          {channels.map(channel => {
            const isMember = channel.members?.some(m => m._id === user._id);
            return (
              <div key={channel._id} className="channel-card" onClick={() => handleJoinChannel(channel)}>
                <div className="channel-card-header">
                  <h3 className="channel-card-title">{channel.name}</h3>
                  <span className={`badge badge-${channel.type}`}>{channel.type === 'private' ? '🔒 Private' : '🌐 Public'}</span>
                </div>
                <p className="channel-card-description">{channel.description || 'No description'}</p>
                <div className="channel-card-footer">
                  <div className="channel-card-members">
                    👥 {channel.members?.length || 0} members
                  </div>
                  {channel.currentSong && (
                    <div className="channel-card-now-playing">
                      <div className="pulse" /> Now playing
                    </div>
                  )}
                  {isMember && (
                    <span className="badge badge-online" style={{ marginLeft: 'auto' }}>Joined</span>
                  )}
                </div>
                <div style={{ marginTop: 'var(--space-3)', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  {channel.tags?.map((tag, i) => (
                    <span key={i} style={{
                      padding: '2px 8px', borderRadius: 'var(--radius-full)',
                      background: 'var(--surface-glass)', fontSize: 'var(--font-size-xs)',
                      color: 'var(--text-tertiary)',
                    }}>#{tag}</span>
                  ))}
                </div>
              </div>
            );
          })}
          {channels.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 'var(--space-16)', color: 'var(--text-secondary)' }}>
              <p style={{ fontSize: 'var(--font-size-4xl)', marginBottom: 'var(--space-4)' }}>🎧</p>
              <p>No channels yet. Create the first one!</p>
            </div>
          )}
        </div>
      )}

      {/* Trending Section */}
      {stats?.mostPlayedSongs?.length > 0 && (
        <div style={{ marginTop: 'var(--space-12)' }}>
          <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, marginBottom: 'var(--space-6)' }}>🔥 Trending Songs</h2>
          <div className="glass-card" style={{ overflow: 'hidden' }}>
            {stats.mostPlayedSongs.slice(0, 5).map((song, i) => (
              <div key={song._id} style={{
                display: 'flex', alignItems: 'center', gap: 'var(--space-4)',
                padding: 'var(--space-4) var(--space-5)',
                borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.03)' : 'none',
              }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 700, width: 24, textAlign: 'center' }}>{i + 1}</span>
                {song.thumbnail && <img src={song.thumbnail} alt="" style={{ width: 44, height: 44, borderRadius: 'var(--radius-sm)', objectFit: 'cover' }} />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>{song.title}</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>{song.artist}</div>
                </div>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>▶ {song.playCount} plays</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Channel Modal */}
      {showCreateChannel && (
        <>
          <div className="modal-backdrop" onClick={() => setShowCreateChannel(false)} />
          <div className="modal">
            <div className="modal-header">
              <h2>Create Channel</h2>
              <button className="modal-close" onClick={() => setShowCreateChannel(false)}>✕</button>
            </div>
            {error && <div className="form-error" style={{ marginBottom: 'var(--space-4)' }}>{error}</div>}
            <form onSubmit={handleCreateChannel} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="form-group">
                <label>Channel Name</label>
                <input className="input-field" placeholder="My Awesome Channel" value={newChannel.name}
                  onChange={(e) => setNewChannel({ ...newChannel, name: e.target.value })} autoFocus />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea className="input-field" placeholder="What's this channel about?" rows={3}
                  value={newChannel.description} onChange={(e) => setNewChannel({ ...newChannel, description: e.target.value })}
                  style={{ resize: 'vertical' }} />
              </div>
              <div className="form-group">
                <label>Type</label>
                <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                  <button type="button" className={`btn ${newChannel.type === 'public' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setNewChannel({ ...newChannel, type: 'public' })}>🌐 Public</button>
                  <button type="button" className={`btn ${newChannel.type === 'private' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setNewChannel({ ...newChannel, type: 'private' })}>🔒 Private</button>
                </div>
              </div>
              {newChannel.type === 'private' && (
                <div className="form-group">
                  <label>Channel Password</label>
                  <input type="password" className="input-field" placeholder="Set a password for this channel"
                    value={newChannel.password} onChange={(e) => setNewChannel({ ...newChannel, password: e.target.value })} />
                </div>
              )}
              <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }}>🚀 Create Channel</button>
            </form>
          </div>
        </>
      )}

      {/* Join Private Channel Modal */}
      {joiningChannel && (
        <>
          <div className="modal-backdrop" onClick={() => { setJoiningChannel(null); setJoinPassword(''); setError(''); }} />
          <div className="modal">
            <div className="modal-header">
              <h2>🔒 Join Private Channel</h2>
              <button className="modal-close" onClick={() => { setJoiningChannel(null); setJoinPassword(''); setError(''); }}>✕</button>
            </div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-4)' }}>
              Enter the password to join <strong>{joiningChannel.name}</strong>
            </p>
            {error && <div className="form-error" style={{ marginBottom: 'var(--space-4)' }}>{error}</div>}
            <form onSubmit={handleJoinPrivate} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <input type="password" className="input-field" placeholder="Channel password"
                value={joinPassword} onChange={(e) => setJoinPassword(e.target.value)} autoFocus />
              <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }}>Join Channel</button>
            </form>
          </div>
        </>
      )}
    </div>
  );
};

export default DashboardPage;
