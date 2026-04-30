import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
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
  // Clock skew = serverTime - clientTime (ms). Stays current across reconnects.
  const clockSkewRef = useRef(0);

  // Use stable primitive deps (string IDs) instead of the whole user object.
  // This prevents a new socket being created every time AuthContext re-renders
  // with a new user object reference (same data, different identity).
  const userId = user?._id ?? null;

  useEffect(() => {
    if (!userId || !token) {
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

    // NTP-style clock sync. Repeated to filter out RTT outliers.
    const syncClock = () => {
      const samples = [];
      let attempts = 0;
      const sample = () => {
        const t0 = Date.now();
        newSocket.timeout(2000).emit('time:sync', t0, (err, resp) => {
          attempts++;
          if (!err && resp?.serverTime) {
            const t3 = Date.now();
            const rtt = t3 - t0;
            // Best-estimate server clock at t3 ≈ resp.serverTime + rtt/2
            const skew = resp.serverTime + rtt / 2 - t3;
            samples.push({ skew, rtt });
          }
          if (attempts < 5) sample();
          else if (samples.length) {
            // Pick the sample with the lowest RTT (least jittered)
            samples.sort((a, b) => a.rtt - b.rtt);
            clockSkewRef.current = samples[0].skew;
          }
        });
      };
      sample();
    };

    newSocket.on('connect', () => {
      console.log('🔌 Socket connected');
      setConnected(true);
      syncClock();
    });

    newSocket.on('disconnect', () => {
      console.log('🔌 Socket disconnected');
      setConnected(false);
    });

    newSocket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
    });

    // Re-sync clock periodically to absorb client clock drift
    const skewInterval = setInterval(() => {
      if (newSocket.connected) syncClock();
    }, 60_000);

    setSocket(newSocket);

    return () => {
      clearInterval(skewInterval);
      newSocket.disconnect();
    };
  }, [userId, token]); // stable string deps — no spurious reconnects

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

  // Convert a server timestamp to local Date.now()-compatible time
  const serverNow = useCallback(() => Date.now() + clockSkewRef.current, []);

  return (
    <SocketContext.Provider value={{ socket, connected, joinChannel, leaveChannel, activeChannelId, setActiveChannelId, clockSkewRef, serverNow }}>
      {children}
    </SocketContext.Provider>
  );
};

export default SocketContext;
