import { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useTheme } from '../../context/ThemeContext';
import { getInitials } from '../../utils/helpers';
import { getAvatarColor } from '../../utils/constants';

const Layout = () => {
  const { user, logout } = useAuth();
  const { connected } = useSocket();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/dashboard', icon: '🏠', label: 'Dashboard' },
    { path: '/search', icon: '🔍', label: 'Search' },
  ];

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? '' : 'closed'}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">🎵</div>
            <span className="sidebar-logo-text gradient-text">BeatRoom</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section">
            <div className="sidebar-section-title">Menu</div>
            {navItems.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
              >
                <span className="sidebar-item-icon">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>

          <div className="sidebar-section">
            <div className="sidebar-section-title">Your Music</div>
            <NavLink to="/playlist" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
              <span className="sidebar-item-icon">📋</span>
              <span>Playlists</span>
            </NavLink>
            <NavLink to={`/profile/${user?._id}`} className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
              <span className="sidebar-item-icon">👤</span>
              <span>Profile</span>
            </NavLink>
          </div>

          {user?.role === 'superadmin' && (
            <div className="sidebar-section">
              <div className="sidebar-section-title">Admin</div>
              <NavLink to="/admin" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
                <span className="sidebar-item-icon">⚙️</span>
                <span>Admin Panel</span>
              </NavLink>
            </div>
          )}

          <div className="sidebar-section" style={{ marginTop: 'auto' }}>
            <div className="sidebar-item" style={{ color: connected ? 'var(--accent-success)' : 'var(--accent-error)' }}>
              <span className="sidebar-item-icon">{connected ? '🟢' : '🔴'}</span>
              <span>{connected ? 'Connected' : 'Disconnected'}</span>
            </div>
          </div>
        </nav>
      </aside>

      {/* Navbar */}
      <header className="navbar">
        <div className="navbar-left">
          <button className="btn btn-ghost btn-icon" onClick={() => setSidebarOpen(!sidebarOpen)} style={{ fontSize: '20px' }}>
            ☰
          </button>
          <form className="navbar-search" onSubmit={handleSearch}>
            <span className="navbar-search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search songs, channels, users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </form>
        </div>

        <div className="navbar-right">
          <button className="btn btn-ghost btn-icon" onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <div className="navbar-user" onClick={() => setShowUserMenu(!showUserMenu)}>
            <div className="navbar-user-info">
              <div className="name">{user?.username}</div>
              <div className="role">{user?.role}</div>
            </div>
            {user?.avatar ? (
              <img src={user.avatar} alt={user.username} className="avatar" />
            ) : (
              <div className="avatar avatar-placeholder" style={{ background: getAvatarColor(user?.username || '') }}>
                {getInitials(user?.username || '')}
              </div>
            )}
          </div>
          {showUserMenu && (
            <div style={{
              position: 'absolute', top: '60px', right: '16px',
              background: 'var(--bg-secondary)', border: 'var(--border-default)',
              borderRadius: 'var(--radius-md)', padding: 'var(--space-2)',
              zIndex: 'var(--z-dropdown)', minWidth: '160px',
            }}>
              <button className="sidebar-item" onClick={() => { navigate(`/profile/${user._id}`); setShowUserMenu(false); }}>
                <span className="sidebar-item-icon">👤</span> Profile
              </button>
              <button className="sidebar-item" onClick={handleLogout} style={{ color: 'var(--accent-error)' }}>
                <span className="sidebar-item-icon">🚪</span> Logout
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        <div className="page-enter">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
