import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';

const JoinPage = () => {
  const { inviteCode } = useParams();
  const navigate = useNavigate();
  const [channelInfo, setChannelInfo] = useState(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    const fetchAndJoin = async () => {
      try {
        const res = await api.get(`/api/channels/invite/${inviteCode}`);
        const info = res.data.channel;
        setChannelInfo(info);
        if (info.type === 'public') {
          // Auto-join public channels immediately
          const joinRes = await api.post(`/api/channels/join/${inviteCode}`);
          navigate(`/channel/${joinRes.data.channel._id}`, { replace: true });
        }
      } catch (err) {
        setError(err.response?.data?.error || 'Invalid invite link');
      } finally {
        setLoading(false);
      }
    };
    fetchAndJoin();
  }, [inviteCode, navigate]);

  const handleJoin = async (e) => {
    e.preventDefault();
    setJoining(true);
    setError('');
    try {
      const res = await api.post(`/api/channels/join/${inviteCode}`, { password });
      navigate(`/channel/${res.data.channel._id}`, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to join channel');
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="auth-page">
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎵</div>
          <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (error && !channelInfo) {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 48, marginBottom: 16 }}>❌</p>
          <h2 style={{ marginBottom: 8 }}>Invalid Invite</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>{error}</p>
          <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <p style={{ fontSize: 48, marginBottom: 8 }}>🎧</p>
          <h2 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, marginBottom: 8 }}>
            Join <span className="gradient-text">{channelInfo?.name}</span>
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            {channelInfo?.memberCount} members · {channelInfo?.type === 'private' ? '🔒 Private' : '🌐 Public'}
          </p>
          {channelInfo?.description && (
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', marginTop: 8 }}>
              {channelInfo.description}
            </p>
          )}
        </div>

        {error && (
          <div className="form-error" style={{ marginBottom: 16 }}>{error}</div>
        )}

        <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {channelInfo?.type === 'private' && (
            <div className="form-group">
              <label>Channel Password</label>
              <input
                type="password"
                className="input-field"
                placeholder="Enter channel password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
              />
            </div>
          )}
          <button
            type="submit"
            className="btn btn-primary btn-lg"
            style={{ width: '100%' }}
            disabled={joining}
          >
            {joining ? 'Joining...' : '🚀 Join Channel'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ width: '100%' }}
            onClick={() => navigate('/dashboard')}
          >
            Back to Dashboard
          </button>
        </form>
      </div>
    </div>
  );
};

export default JoinPage;
