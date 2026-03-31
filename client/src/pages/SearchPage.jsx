import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { getInitials } from '../utils/helpers';
import { useSocket } from '../context/SocketContext';
import { getAvatarColor } from '../utils/constants';

const SongResultItem = ({ song, onAdd, activeChannelId }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
    {song.thumbnail && <img src={song.thumbnail} alt="" style={{ width: 44, height: 44, borderRadius: 'var(--radius-sm)', objectFit: 'cover' }} />}
    <div style={{ flex: 1 }}>
      <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>{song.title}</div>
      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>{song.artist}</div>
    </div>
    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
      <button className="btn btn-primary btn-sm" onClick={() => onAdd(song)}>
        {activeChannelId ? '▶ Play Now' : '🎵 Play'}
      </button>
    </div>
  </div>
);

const SearchPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { socket, activeChannelId } = useSocket();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [results, setResults] = useState({});
  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(null);
  const [myChannels, setMyChannels] = useState([]);

  useEffect(() => {
    const q = searchParams.get('q');
    if (q) { setQuery(q); doSearch(q); }
  }, [searchParams]);

  const doSearch = async (q) => {
    if (!q?.trim()) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/search?q=${encodeURIComponent(q)}&type=${activeTab}`);
      setResults(res.data.results);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const fetchMyChannels = async () => {
    try {
      const res = await api.get('/api/channels/my');
      setMyChannels(res.data.channels);
    } catch (err) { console.error(err); }
  };

  const handleAdd = (song, channelId) => {
    const targetId = channelId || activeChannelId;
    if (!targetId) {
      fetchMyChannels();
      setShowPicker(song);
      return;
    }
    socket?.emit('queue:add', { channelId: targetId, songData: song });
    if (channelId) navigate(`/channel/${channelId}`);
    else alert(`Added to queue in your active channel!`);
  };

  const handleSubmit = (e) => { e.preventDefault(); navigate(`/search?q=${encodeURIComponent(query)}`); doSearch(query); };
  const tabs = ['all', 'users', 'channels', 'songs', 'playlists'];

  const Section = ({ title, icon, items, children }) => items?.length > 0 ? (
    <div style={{ marginBottom: 'var(--space-8)' }}>
      <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>{icon} {title}</h2>
      {children}
    </div>
  ) : null;

  return (
    <div className="page-container">
      <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 800, marginBottom: 'var(--space-6)' }}>🔍 Search</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-6)' }}>
        <input className="input-field" style={{ flex: 1 }} placeholder="Search users, channels, songs, playlists..."
          value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        <button type="submit" className="btn btn-primary btn-lg">Search</button>
      </form>
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-6)' }}>
        {tabs.map(t => (
          <button key={t} className={`btn ${activeTab === t ? 'btn-primary' : 'btn-secondary'} btn-sm`}
            onClick={() => { setActiveTab(t); doSearch(query); }} style={{ textTransform: 'capitalize' }}>{t}</button>
        ))}
      </div>

      {loading ? <div className="skeleton" style={{ height: 200 }} /> : (
        <>
          <Section title="Users" icon="👥" items={results.users}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {results.users?.map(u => (
                <div key={u._id} className="glass-card" style={{ padding: 'var(--space-4)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}
                  onClick={() => navigate(`/profile/${u._id}`)}>
                  <div className="avatar avatar-placeholder" style={{ background: getAvatarColor(u.username) }}>{getInitials(u.username)}</div>
                  <div><div style={{ fontWeight: 600 }}>{u.username}</div></div>
                  {u.isOnline && <span className="badge badge-online" style={{ marginLeft: 'auto' }}>Online</span>}
                </div>
              ))}
            </div>
          </Section>

          <Section title="Channels" icon="📺" items={results.channels}>
            <div className="channel-grid">
              {results.channels?.map(ch => (
                <div key={ch._id} className="channel-card" onClick={() => navigate(`/channel/${ch._id}`)}>
                  <div className="channel-card-header"><h3 className="channel-card-title">{ch.name}</h3>
                    <span className={`badge badge-${ch.type}`}>{ch.type}</span></div>
                  <p className="channel-card-description">{ch.description}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Songs" icon="🎵" items={results.songs}>
            <div className="glass-card" style={{ overflow: 'hidden' }}>
              {results.songs?.map((s) => (
                <SongResultItem key={s._id} song={s} onAdd={handleAdd} activeChannelId={activeChannelId} />
              ))}
            </div>
          </Section>

          <Section title="Playlists" icon="📋" items={results.playlists}>
            <div className="channel-grid">
              {results.playlists?.map(p => (
                <div key={p._id} className="channel-card" onClick={() => navigate(`/playlist/${p._id}`)}>
                  <div className="channel-card-header"><h3 className="channel-card-title">{p.name}</h3></div>
                  <p className="channel-card-description">{p.description}</p>
                </div>
              ))}
            </div>
          </Section>

          {showPicker && (
            <>
              <div className="modal-backdrop" onClick={() => setShowPicker(null)} />
              <div className="modal" style={{ maxWidth: '400px' }}>
                <div className="modal-header">
                  <h3>Select Channel</h3>
                  <button className="modal-close" onClick={() => setShowPicker(null)}>✕</button>
                </div>
                <p style={{ marginBottom: 'var(--space-4)', fontSize: 'var(--font-size-sm)' }}>Choose a channel to play <strong>{showPicker.title}</strong></p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {myChannels.map(ch => (
                    <button key={ch._id} className="btn btn-secondary" style={{ justifyContent: 'start' }} onClick={() => handleAdd(showPicker, ch._id)}>
                      📺 {ch.name}
                    </button>
                  ))}
                  {myChannels.length === 0 && <p style={{ textAlign: 'center', padding: 'var(--space-4)' }}>No channels found. Create one first!</p>}
                </div>
              </div>
            </>
          )}

          {Object.keys(results).length > 0 && Object.values(results).every(v => !v?.length) && (
            <div style={{ textAlign: 'center', padding: 'var(--space-16)', color: 'var(--text-secondary)' }}>
              <p style={{ fontSize: '48px', marginBottom: 'var(--space-4)' }}>🔍</p><p>No results found for "{query}"</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SearchPage;
