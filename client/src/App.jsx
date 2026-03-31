import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { PlayerProvider } from './context/PlayerContext';
import { ThemeProvider } from './context/ThemeContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ChannelPage from './pages/ChannelPage';
import ProfilePage from './pages/ProfilePage';
import PlaylistPage from './pages/PlaylistPage';
import SearchPage from './pages/SearchPage';
import AdminPage from './pages/AdminPage';
import Layout from './components/layout/Layout';
import './App.css';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-page">
        <div style={{ textAlign: 'center' }}>
          <div className="sidebar-logo-icon" style={{ width: 56, height: 56, margin: '0 auto 16px', fontSize: '28px' }}>🎵</div>
          <p style={{ color: 'var(--text-secondary)' }}>Loading BeatRoom...</p>
        </div>
      </div>
    );
  }

  return user ? children : <Navigate to="/login" replace />;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/dashboard" replace /> : children;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="channel/:channelId" element={<ChannelPage />} />
        <Route path="profile/:userId?" element={<ProfilePage />} />
        <Route path="playlist/:playlistId?" element={<PlaylistPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="admin" element={<AdminPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SocketProvider>
          <PlayerProvider>
            <Router>
              <AppRoutes />
            </Router>
          </PlayerProvider>
        </SocketProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
