import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const PlaylistPage = () => {
  const { playlistId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newPlaylist, setNewPlaylist] = useState({ name: '', description: '', visibility: 'public', coverImage: '' });
  const [loading, setLoading] = useState(true);
  const [showAddSongs, setShowAddSongs] = useState(false);
  const [songSearch, setSongSearch] = useState('');
  const [songResults, setSongResults] = useState([]);
  const [addingToPlaylist, setAddingToPlaylist] = useState(null);
  const [showCollaborators, setShowCollaborators] = useState(false);
  const [collabSearch, setCollabSearch] = useState('');
  const [collabResults, setCollabResults] = useState([]);

  useEffect(() => {
    fetchPlaylists();
  }, []);

  useEffect(() => {
    if (playlistId) fetchPlaylistDetail(playlistId);
  }, [playlistId]);

  const fetchPlaylists = async () => {
    try {
      const res = await api.get('/api/playlists/my');
      setPlaylists(res.data.playlists);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPlaylistDetail = async (id) => {
    try {
      const res = await api.get(`/api/playlists/${id}`);
      setSelectedPlaylist(res.data.playlist);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/api/playlists', newPlaylist);
      setPlaylists([res.data.playlist, ...playlists]);
      setShowCreate(false);
      setNewPlaylist({ name: '', description: '', visibility: 'public', coverImage: '' });
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this playlist?')) return;
    try {
      await api.delete(`/api/playlists/${id}`);
      setPlaylists(playlists.filter(p => p._id !== id));
      if (selectedPlaylist?._id === id) setSelectedPlaylist(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete');
    }
  };

  const handleFollow = async (id) => {
    try {
      const res = await api.post(`/api/playlists/${id}/follow`);
      fetchPlaylistDetail(id);
    } catch (err) {
      alert(err.response?.data?.error);
    }
  };

  const removeSong = async (playlistId, songId) => {
    try {
      await api.delete(`/api/playlists/${playlistId}/songs/${songId}`);
      fetchPlaylistDetail(playlistId);
    } catch (err) {
      alert(err.response?.data?.error);
    }
  };

  const searchSongs = async () => {
    if (!songSearch.trim()) return;
    try {
      const res = await api.get(`/api/songs/search?q=${encodeURIComponent(songSearch)}`);
      setSongResults([
        ...(res.data.results?.youtube || []),
        ...(res.data.results?.local || []),
      ]);
    } catch (err) { console.error(err); }
  };

  const addSongToPlaylistDirect = async (songData) => {
    if (!selectedPlaylist?._id) return;
    setAddingToPlaylist(songData.sourceId);
    try {
      const songRes = await api.post('/api/songs', songData);
      const songId = songRes.data.song._id;
      await api.post(`/api/playlists/${selectedPlaylist._id}/songs`, { songId });
      fetchPlaylistDetail(selectedPlaylist._id);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add song');
    } finally {
      setAddingToPlaylist(null);
    }
  };

  const searchUsers = async () => {
    if (!collabSearch.trim()) return;
    try {
      const res = await api.get('/api/users');
      setCollabResults(res.data.users.filter(u =>
        u.username.toLowerCase().includes(collabSearch.toLowerCase()) &&
        u._id !== user?._id
      ));
    } catch (err) { console.error(err); }
  };

  const addCollaborator = async (userId) => {
    try {
      await api.post(`/api/playlists/${selectedPlaylist._id}/collaborators`, { userId });
      fetchPlaylistDetail(selectedPlaylist._id);
      setCollabSearch('');
      setCollabResults([]);
    } catch (err) { alert(err.response?.data?.error || 'Failed to add collaborator'); }
  };

  if (selectedPlaylist) {
    const isOwner = selectedPlaylist.owner?._id === user?._id;
    const isFollowing = selectedPlaylist.followers?.some(f => f._id === user?._id || f === user?._id);
    return (
      <div className="page-container">
        <button className="btn btn-ghost" onClick={() => { setSelectedPlaylist(null); navigate('/playlist'); }} style={{ marginBottom: 'var(--space-4)' }}>
          ← Back to Playlists
        </button>
        <div className="glass-card" style={{ padding: 'var(--space-8)', marginBottom: 'var(--space-6)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 800 }}>{selectedPlaylist.name}</h1>
              <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>{selectedPlaylist.description}</p>
              <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-3)' }}>
                <span className={`badge badge-${selectedPlaylist.visibility}`}>{selectedPlaylist.visibility}</span>
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-tertiary)' }}>
                  🎵 {selectedPlaylist.songs?.length || 0} songs • 👥 {selectedPlaylist.followers?.length || 0} followers
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              {!isOwner && (
                <button className={`btn ${isFollowing ? 'btn-secondary' : 'btn-primary'}`} onClick={() => handleFollow(selectedPlaylist._id)}>
                  {isFollowing ? '✓ Following' : '+ Follow'}
                </button>
              )}
              {isOwner && (
                <button className="btn btn-secondary btn-sm" onClick={() => setShowCollaborators(true)}>👥 Collaborators ({selectedPlaylist.collaborators?.length || 0})</button>
              )}
              {isOwner && <button className="btn btn-danger btn-sm" onClick={() => handleDelete(selectedPlaylist._id)}>Delete</button>}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddSongs(true)}>➕ Add Songs</button>
        </div>

        {/* Songs */}
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          {selectedPlaylist.songs?.map((song, i) => (
            <div key={song._id} style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-4)',
              padding: 'var(--space-4) var(--space-5)',
              borderBottom: i < selectedPlaylist.songs.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none',
            }}>
              <span style={{ color: 'var(--text-muted)', fontWeight: 700, width: 24, textAlign: 'center' }}>{i + 1}</span>
              {song.thumbnail && <img src={song.thumbnail} alt="" style={{ width: 44, height: 44, borderRadius: 'var(--radius-sm)', objectFit: 'cover' }} />}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>{song.title}</div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>{song.artist}</div>
              </div>
              {isOwner && (
                <button className="btn btn-ghost btn-sm" onClick={() => removeSong(selectedPlaylist._id, song._id)}>✕</button>
              )}
            </div>
          ))}
          {(!selectedPlaylist.songs || selectedPlaylist.songs.length === 0) && (
            <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
              No songs yet. Add songs from a channel room!
            </div>
          )}
        </div>

        {showAddSongs && (
          <>
            <div className="modal-backdrop" onClick={() => { setShowAddSongs(false); setSongResults([]); setSongSearch(''); }} />
            <div className="modal" style={{ maxWidth: 600 }}>
              <div className="modal-header">
                <h2>🔍 Add Songs to Playlist</h2>
                <button className="modal-close" onClick={() => { setShowAddSongs(false); setSongResults([]); setSongSearch(''); }}>✕</button>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); searchSongs(); }} style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                <input className="input-field" placeholder="Search YouTube..." value={songSearch}
                  onChange={(e) => setSongSearch(e.target.value)} autoFocus style={{ flex: 1 }} />
                <button type="submit" className="btn btn-primary">Search</button>
              </form>
              <div style={{ maxHeight: 360, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {songResults.map((song, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3)', background: 'var(--surface-glass)', borderRadius: 'var(--radius-md)' }}>
                    {song.thumbnail && <img src={song.thumbnail} alt="" style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover' }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.title}</div>
                      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>{song.artist}</div>
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={addingToPlaylist === song.sourceId}
                      onClick={() => addSongToPlaylistDirect(song)}
                    >
                      {addingToPlaylist === song.sourceId ? 'Adding...' : '+ Add'}
                    </button>
                  </div>
                ))}
                {songResults.length === 0 && (
                  <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>Search for songs to add</div>
                )}
              </div>
            </div>
          </>
        )}

        {showCollaborators && (
          <>
            <div className="modal-backdrop" onClick={() => { setShowCollaborators(false); setCollabResults([]); setCollabSearch(''); }} />
            <div className="modal" style={{ maxWidth: 480 }}>
              <div className="modal-header">
                <h2>👥 Collaborators</h2>
                <button className="modal-close" onClick={() => { setShowCollaborators(false); setCollabResults([]); setCollabSearch(''); }}>✕</button>
              </div>
              {selectedPlaylist.collaborators?.length > 0 && (
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 'var(--space-2)' }}>Current Collaborators</div>
                  {selectedPlaylist.collaborators.map(c => (
                    <div key={c._id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', background: 'var(--surface-glass)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-1)' }}>
                      <span style={{ fontSize: 'var(--font-size-sm)' }}>👤 {c.username}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: 'var(--space-2)' }}>Add Collaborator</div>
              <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                <input className="input-field" placeholder="Search by username..." value={collabSearch}
                  onChange={(e) => setCollabSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchUsers()}
                  style={{ flex: 1 }} />
                <button className="btn btn-primary btn-sm" onClick={searchUsers}>Search</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {collabResults.map(u => (
                  <div key={u._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-2) var(--space-3)', background: 'var(--surface-glass)', borderRadius: 'var(--radius-md)' }}>
                    <span style={{ fontSize: 'var(--font-size-sm)' }}>👤 {u.username}</span>
                    <button className="btn btn-primary btn-sm" onClick={() => addCollaborator(u._id)}>+ Add</button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
        <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 800 }}>📋 Your Playlists</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>➕ New Playlist</button>
      </div>

      {loading ? (
        <div className="channel-grid">{[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 150 }} />)}</div>
      ) : (
        <div className="channel-grid">
          {playlists.map(p => (
            <div key={p._id} className="channel-card" onClick={() => { navigate(`/playlist/${p._id}`); fetchPlaylistDetail(p._id); }}>
              {p.coverImage && (
                <img src={p.coverImage} alt="" style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-3)' }} />
              )}
              <div className="channel-card-header">
                <h3 className="channel-card-title">{p.name}</h3>
                <span className={`badge badge-${p.visibility}`}>{p.visibility}</span>
              </div>
              <p className="channel-card-description">{p.description || 'No description'}</p>
              <div className="channel-card-footer">
                <span className="channel-card-members">🎵 {p.songs?.length || 0} songs</span>
              </div>
            </div>
          ))}
          {playlists.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 'var(--space-16)', color: 'var(--text-secondary)' }}>
              <p style={{ fontSize: '48px', marginBottom: 'var(--space-4)' }}>📋</p>
              <p>No playlists yet. Create your first one!</p>
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <>
          <div className="modal-backdrop" onClick={() => setShowCreate(false)} />
          <div className="modal">
            <div className="modal-header">
              <h2>Create Playlist</h2>
              <button className="modal-close" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="form-group"><label>Name</label>
                <input className="input-field" value={newPlaylist.name} onChange={(e) => setNewPlaylist({ ...newPlaylist, name: e.target.value })} placeholder="My Playlist" autoFocus /></div>
              <div className="form-group"><label>Description</label>
                <textarea className="input-field" value={newPlaylist.description} onChange={(e) => setNewPlaylist({ ...newPlaylist, description: e.target.value })} placeholder="Describe your playlist" rows={3} style={{ resize: 'vertical' }} /></div>
              <div className="form-group">
                <label>Cover Image URL <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>(optional)</span></label>
                <input
                  className="input-field"
                  placeholder="https://..."
                  value={newPlaylist.coverImage}
                  onChange={(e) => setNewPlaylist({ ...newPlaylist, coverImage: e.target.value })}
                />
              </div>
              <div className="form-group"><label>Visibility</label>
                <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                  <button type="button" className={`btn ${newPlaylist.visibility === 'public' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setNewPlaylist({ ...newPlaylist, visibility: 'public' })}>🌐 Public</button>
                  <button type="button" className={`btn ${newPlaylist.visibility === 'private' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setNewPlaylist({ ...newPlaylist, visibility: 'private' })}>🔒 Private</button>
                </div></div>
              <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }}>Create Playlist</button>
            </form>
          </div>
        </>
      )}
    </div>
  );
};

export default PlaylistPage;
