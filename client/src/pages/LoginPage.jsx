import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { validateEmail } from '../utils/validators';

const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!validateEmail(formData.email)) {
      setError('Please enter a valid email address');
      return;
    }
    if (!formData.password) {
      setError('Please enter your password');
      return;
    }
    setLoading(true);
    try {
      await login(formData.email, formData.password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <h1 className="gradient-text">🎵 BeatRoom</h1>
          <p>Stream music together with friends</p>
        </div>

        {error && (
          <div style={{
            padding: 'var(--space-3) var(--space-4)',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--accent-error)',
            fontSize: 'var(--font-size-sm)',
            marginBottom: 'var(--space-4)',
          }}>
            {error}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              className="input-field"
              placeholder="Enter your email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              className="input-field"
              placeholder="Enter your password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          </div>

          <button type="submit" className="btn btn-primary btn-lg" disabled={loading}
                  style={{ width: '100%', marginTop: 'var(--space-2)' }}>
            {loading ? '⏳ Signing in...' : '🎵 Sign In to BeatRoom'}
          </button>
        </form>

        <div className="auth-footer">
          Don't have an account? <Link to="/register">Create one</Link>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
