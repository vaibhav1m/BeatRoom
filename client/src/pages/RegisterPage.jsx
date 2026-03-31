import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { validateEmail, validatePassword, validateUsername } from '../utils/validators';

const RegisterPage = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ username: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!validateUsername(formData.username)) {
      setError('Username must be 3-30 characters'); return;
    }
    if (!validateEmail(formData.email)) {
      setError('Please enter a valid email address'); return;
    }
    if (!validatePassword(formData.password)) {
      setError('Password must be at least 6 characters'); return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match'); return;
    }
    setLoading(true);
    try {
      await register(formData.username, formData.email, formData.password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <h1 className="gradient-text">🎵 BeatRoom</h1>
          <p>Create your account & start jamming</p>
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
            <label>Username</label>
            <input type="text" className="input-field" placeholder="Choose a username"
              value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} autoFocus />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" className="input-field" placeholder="Enter your email"
              value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" className="input-field" placeholder="Create a password (min. 6 characters)"
              value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Confirm Password</label>
            <input type="password" className="input-field" placeholder="Confirm your password"
              value={formData.confirmPassword} onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })} />
          </div>
          <button type="submit" className="btn btn-primary btn-lg" disabled={loading}
                  style={{ width: '100%', marginTop: 'var(--space-2)' }}>
            {loading ? '⏳ Creating account...' : '🚀 Create Account'}
          </button>
        </form>

        <div className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
