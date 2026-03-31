import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useTheme } from '../../context/ThemeContext';
import { getInitials } from '../../utils/helpers';
import { getAvatarColor } from '../../utils/constants';

const Layout = () => {
  const { user, logout } = useAuth();
  const { socket, connected } = useSocket();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef(null);

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

  // Fetch unread count on connect and listen for notification events
  useEffect(() => {
    if (!socket) return;
    socket.emit('notification:unread-count');
    socket.on('notification:unread-count', (count) => setUnreadCount(count));
    socket.on('notification:list', (list) => setNotifications(list));
    return () => {
      socket.off('notification:unread-count');
      socket.off('notification:list');
    };
  }, [socket]);

  const openNotifications = () => {
    const next = !showNotifications;
    setShowNotifications(next);
    if (next) {
      socket?.emit('notification:get');
      socket?.emit('notification:read', { notificationId: 'all' });
      setUnreadCount(0);
    }
  };

  const notifIcons = {
    user_joined: '👋',
    friend_request: '🤝',
    channel_invite: '📩',
    song_added: '🎵',
    system: '🔔',
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

          {/* Notification bell */}
          <div style={{ position: 'relative' }} ref={notifRef}>
            <button
              className="btn btn-ghost btn-icon"
              onClick={openNotifications}
              title="Notifications"
              style={{ position: 'relative' }}
            >
              🔔
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: 2, right: 2,
                  background: 'var(--accent-error)', color: 'white',
                  borderRadius: '50%', width: 16, height: 16,
                  fontSize: 10, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  pointerEvents: 'none',
                }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div style={{
                position: 'absolute', top: '48px', right: 0,
                background: 'var(--bg-secondary)', border: 'var(--border-default)',
                borderRadius: 'var(--radius-md)', zIndex: 200,
                width: 320, maxHeight: 400, overflowY: 'auto',
                boxShadow: 'var(--shadow-lg)',
              }}>
                <div style={{
                  padding: 'var(--space-3) var(--space-4)',
                  borderBottom: 'var(--border-default)',
                  fontWeight: 700, fontSize: 'var(--font-size-sm)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span>🔔 Notifications</span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowNotifications(false)}
                    style={{ padding: '2px 6px' }}
                  >✕</button>
                </div>
                {notifications.length === 0 ? (
                  <div style={{
                    padding: 'var(--space-8)', textAlign: 'center',
                    color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)',
                  }}>
                    No notifications
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div key={n._id} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)',
                      padding: 'var(--space-3) var(--space-4)',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background: n.read ? 'transparent' : 'var(--accent-primary-glow)',
                    }}>
                      <span style={{ fontSize: 18, flexShrink: 0 }}>
                        {notifIcons[n.type] || '🔔'}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 'var(--font-size-sm)', lineHeight: 1.4 }}>{n.message}</div>
                        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
                          {new Date(n.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
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
