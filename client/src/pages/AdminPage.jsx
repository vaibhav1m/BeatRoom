import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { formatNumber, getInitials, formatTimeAgo } from '../utils/helpers';
import { getAvatarColor } from '../utils/constants';

const AdminPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.role !== 'superadmin') { navigate('/dashboard'); return; }
    fetchStats();
  }, [user]);

  const fetchStats = async () => {
    try {
      const res = await api.get('/api/admin/stats');
      setStats(res.data.stats);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const deleteChannel = async (id) => {
    if (!confirm('Delete this channel?')) return;
    try {
      await api.delete(`/api/admin/channels/${id}`);
      fetchStats();
    } catch (err) { alert(err.response?.data?.error); }
  };

  const banUser = async (id) => {
    if (!confirm('Ban this user?')) return;
    try {
      await api.post(`/api/admin/users/${id}/ban`);
      fetchStats();
    } catch (err) { alert(err.response?.data?.error); }
  };

  if (loading) return <div className="page-container"><div className="skeleton" style={{ height: 400 }} /></div>;

  return (
    <div className="page-container">
      <h1 style={{ fontSize: 'var(--font-size-3xl)', fontWeight: 800, marginBottom: 'var(--space-6)' }}>
        ⚙️ Admin Panel
      </h1>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: 'var(--space-8)' }}>
        {[
          { icon: '👥', value: stats?.totalUsers, label: 'Total Users', color: 'rgba(124,58,237,0.2)' },
          { icon: '🟢', value: stats?.onlineUsers, label: 'Online Now', color: 'rgba(16,185,129,0.2)' },
          { icon: '📺', value: stats?.totalChannels, label: 'Channels', color: 'rgba(6,182,212,0.2)' },
          { icon: '🎵', value: stats?.totalSongs, label: 'Songs', color: 'rgba(244,63,94,0.2)' },
        ].map((s, i) => (
          <div className="stat-card" key={i}>
            <div className="stat-card-icon" style={{ background: s.color }}>{s.icon}</div>
            <div className="stat-card-value gradient-text">{formatNumber(s.value)}</div>
            <div className="stat-card-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
        {/* Active Channels */}
        <div className="glass-card" style={{ padding: 'var(--space-6)' }}>
          <h3 style={{ fontWeight: 700, marginBottom: 'var(--space-4)' }}>📺 Active Channels</h3>
          {stats?.mostActiveChannels?.map(ch => (
            <div key={ch._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3) 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
              <div><div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>{ch.name}</div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>👥 {ch.members?.length} members</div></div>
              <button className="btn btn-danger btn-sm" onClick={() => deleteChannel(ch._id)}>Delete</button>
            </div>
          ))}
        </div>

        {/* Recent Users */}
        <div className="glass-card" style={{ padding: 'var(--space-6)' }}>
          <h3 style={{ fontWeight: 700, marginBottom: 'var(--space-4)' }}>👥 Recent Users</h3>
          {stats?.recentUsers?.map(u => (
            <div key={u._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3) 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <div className="avatar avatar-sm avatar-placeholder" style={{ background: getAvatarColor(u.username) }}>{getInitials(u.username)}</div>
                <div><div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>{u.username}</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>{formatTimeAgo(u.createdAt)}</div></div>
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => banUser(u._id)}>Ban</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminPage;
