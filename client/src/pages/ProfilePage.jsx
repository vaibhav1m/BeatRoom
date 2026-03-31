import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { getInitials, formatTimeAgo } from '../utils/helpers';
import { getAvatarColor } from '../utils/constants';

const ProfilePage = () => {
  const { userId } = useParams();
  const { user: currentUser, updateUser } = useAuth();
  const navigate = useNavigate();
  const [profileUser, setProfileUser] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [friends, setFriends] = useState([]);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({ username: '', bio: '', avatar: '' });
  const [loading, setLoading] = useState(true);

  const isOwnProfile = !userId || userId === currentUser?._id;

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const id = userId || currentUser?._id;
        const res = await api.get(`/api/users/${id}`);
        setProfileUser(res.data.user);
        setPlaylists(res.data.playlists || []);
        setFriends(res.data.user.friends || []);
        setEditData({ username: res.data.user.username, bio: res.data.user.bio || '', avatar: res.data.user.avatar || '' });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [userId, currentUser?._id]);

  const handleSave = async () => {
    try {
      const res = await api.put('/api/users/profile', editData);
      setProfileUser(res.data.user);
      updateUser(res.data.user);
      setEditing(false);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update');
    }
  };

  const handleSendFriendRequest = async () => {
    try {
      await api.post(`/api/users/friend-request/${profileUser._id}`);
      alert('Friend request sent!');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to send request');
    }
  };

  if (loading) return <div className="page-container"><div className="skeleton" style={{ height: 300 }} /></div>;

  return (
    <div className="page-container">
      {/* Profile Header */}
      <div className="glass-card" style={{ padding: 'var(--space-8)', marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)' }}>
          <div className="avatar avatar-xl avatar-placeholder"
            style={{ background: getAvatarColor(profileUser?.username || ''), width: 120, height: 120, fontSize: '42px', borderRadius: '50%' }}>
            {profileUser?.avatar ? <img src={profileUser.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : getInitials(profileUser?.username || '')}
          </div>
          <div style={{ flex: 1 }}>
            {editing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <input className="input-field" value={editData.username} onChange={(e) => setEditData({ ...editData, username: e.target.value })} placeholder="Username" />
                <textarea className="input-field" value={editData.bio} onChange={(e) => setEditData({ ...editData, bio: e.target.value })} placeholder="Tell us about yourself..." rows={3} style={{ resize: 'vertical' }} />
                <input className="input-field" value={editData.avatar} onChange={(e) => setEditData({ ...editData, avatar: e.target.value })} placeholder="Avatar URL" />
                <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                  <button className="btn btn-primary" onClick={handleSave}>Save</button>
                  <button className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 800 }}>{profileUser?.username}</h1>
                <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>{profileUser?.bio || 'No bio yet'}</p>
                <div style={{ display: 'flex', gap: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
                  <span className={`badge badge-${profileUser?.isOnline ? 'online' : 'private'}`}>
                    {profileUser?.isOnline ? '🟢 Online' : '⚫ Offline'}
                  </span>
                  <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-tertiary)' }}>
                    Joined {formatTimeAgo(profileUser?.createdAt)}
                  </span>
                  <span className="badge" style={{ background: 'var(--accent-primary-glow)', color: 'var(--accent-primary)' }}>
                    {profileUser?.role}
                  </span>
                </div>
                <div style={{ marginTop: 'var(--space-4)', display: 'flex', gap: 'var(--space-3)' }}>
                  {isOwnProfile ? (
                    <button className="btn btn-secondary" onClick={() => setEditing(true)}>✏️ Edit Profile</button>
                  ) : (
                    <button className="btn btn-primary" onClick={handleSendFriendRequest}>👋 Add Friend</button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Friends */}
      {friends.length > 0 && (
        <div style={{ marginBottom: 'var(--space-8)' }}>
          <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>👥 Friends ({friends.length})</h2>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            {friends.map(friend => (
              <div key={friend._id} className="glass-card" style={{ padding: 'var(--space-3) var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', cursor: 'pointer' }}
                onClick={() => navigate(`/profile/${friend._id}`)}>
                <div className="avatar avatar-sm avatar-placeholder" style={{ background: getAvatarColor(friend.username) }}>
                  {getInitials(friend.username)}
                </div>
                <span style={{ fontWeight: 500, fontSize: 'var(--font-size-sm)' }}>{friend.username}</span>
                {friend.isOnline && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-success)' }} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Playlists */}
      <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, marginBottom: 'var(--space-4)' }}>📋 Playlists</h2>
      {playlists.length > 0 ? (
        <div className="channel-grid">
          {playlists.map(playlist => (
            <div key={playlist._id} className="channel-card" onClick={() => navigate(`/playlist/${playlist._id}`)}>
              <div className="channel-card-header">
                <h3 className="channel-card-title">{playlist.name}</h3>
                <span className={`badge badge-${playlist.visibility}`}>{playlist.visibility}</span>
              </div>
              <p className="channel-card-description">{playlist.description || 'No description'}</p>
              <div className="channel-card-footer">
                <span className="channel-card-members">🎵 {playlist.songs?.length || 0} songs</span>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
                  👥 {playlist.followers?.length || 0} followers
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-card" style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <p>No playlists yet</p>
          {isOwnProfile && <button className="btn btn-primary" style={{ marginTop: 'var(--space-4)' }} onClick={() => navigate('/playlist')}>Create Playlist</button>}
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
