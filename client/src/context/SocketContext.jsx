import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used within SocketProvider');
  return context;
};

export const SocketProvider = ({ children }) => {
  const { user, token } = useAuth();
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user || !token) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setConnected(false);
      }
      return;
    }

    const newSocket = io({
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    newSocket.on('connect', () => {
      console.log('🔌 Socket connected');
      setConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('🔌 Socket disconnected');
      setConnected(false);
    });

    newSocket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [user, token]);

  const [activeChannelId, setActiveChannelId] = useState(null);
  
  const joinChannel = useCallback((channelId) => {
    if (socket) {
      socket.emit('channel:join', channelId);
      setActiveChannelId(channelId);
    }
  }, [socket]);

  const leaveChannel = useCallback((channelId) => {
    if (socket) {
      socket.emit('channel:leave', channelId);
      if (activeChannelId === channelId) setActiveChannelId(null);
    }
  }, [socket, activeChannelId]);

  return (
    <SocketContext.Provider value={{ socket, connected, joinChannel, leaveChannel, activeChannelId, setActiveChannelId }}>
      {children}
    </SocketContext.Provider>
  );
};

export default SocketContext;
