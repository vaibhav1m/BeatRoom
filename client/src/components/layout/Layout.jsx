import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useTheme, THEMES } from '../../context/ThemeContext';
import { getInitials } from '../../utils/helpers';
import { getAvatarColor } from '../../utils/constants';
import MiniPlayer from '../MiniPlayer';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';

const Layout = () => {
  const { user, logout } = useAuth();
  const { socket, connected } = useSocket();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef(null);
  const [showThemePicker, setShowThemePicker] = useState(false);

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
    socket.on('error', (err) => toast.error(err?.message || 'Something went wrong'));
    return () => {
      socket.off('notification:unread-count');
      socket.off('notification:list');
      socket.off('error');
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
    <>
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
      <header className={`navbar ${!sidebarOpen ? 'no-sidebar' : ''}`}>
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
          <div style={{ position: 'relative' }}>
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => setShowThemePicker(p => !p)}
              title="Change theme"
            >
              {THEMES.find(t => t.id === theme)?.emoji || '🎨'}
            </button>
            {showThemePicker && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowThemePicker(false)} />
                <div style={{
                  position: 'absolute', top: '48px', right: 0,
                  background: 'var(--bg-secondary)', border: 'var(--border-default)',
                  borderRadius: 'var(--radius-md)', padding: 'var(--space-3)',
                  zIndex: 200, minWidth: 200, boxShadow: 'var(--shadow-lg)',
                }}>
                  <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-2)', padding: '0 var(--space-2)' }}>
                    Color Theme
                  </div>
                  {THEMES.map(t => (
                    <button
                      key={t.id}
                      onClick={() => { setTheme(t.id); setShowThemePicker(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                        width: '100%', padding: 'var(--space-2) var(--space-3)',
                        background: theme === t.id ? 'var(--accent-primary-glow)' : 'none',
                        border: 'none', borderRadius: 'var(--radius-md)',
                        color: 'var(--text-primary)', cursor: 'pointer',
                        fontSize: 'var(--font-size-sm)', fontWeight: theme === t.id ? 700 : 400,
                      }}
                    >
                      <span style={{ width: 14, height: 14, borderRadius: '50%', background: t.preview, display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ fontSize: 16 }}>{t.emoji}</span>
                      {t.name}
                      {theme === t.id && <span style={{ marginLeft: 'auto', color: 'var(--accent-primary)' }}>✓</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

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
                        {n.type === 'friend_request' ? (
                          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                            <button className="btn btn-primary btn-sm" style={{ fontSize: 11 }}
                              onClick={async () => {
                                try {
                                  await api.post(`/api/users/friend-request/${n.data?.requestId}/respond`, { action: 'accept' });
                                  toast.success('Friend request accepted!');
                                  setNotifications(prev => prev.filter(x => x._id !== n._id));
                                } catch (err) { toast.error('Failed to respond'); }
                              }}>Accept</button>
                            <button className="btn btn-secondary btn-sm" style={{ fontSize: 11 }}
                              onClick={async () => {
                                try {
                                  await api.post(`/api/users/friend-request/${n.data?.requestId}/respond`, { action: 'reject' });
                                  setNotifications(prev => prev.filter(x => x._id !== n._id));
                                } catch (err) { toast.error('Failed to respond'); }
                              }}>Decline</button>
                          </div>
                        ) : null}
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
      <main className={`main-content ${!sidebarOpen ? 'no-sidebar' : ''}`}>
        <div className="page-enter">
          <Outlet />
        </div>
      </main>
    </div>
    <MiniPlayer />
    </>
  );
};

export default Layout;
