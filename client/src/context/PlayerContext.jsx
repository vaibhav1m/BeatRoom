import { createContext, useContext, useState, useCallback } from 'react';

const PlayerContext = createContext(null);

export const usePlayer = () => {
  const context = useContext(PlayerContext);
  if (!context) throw new Error('usePlayer must be used within PlayerProvider');
  return context;
};

export const PlayerProvider = ({ children }) => {
  const [currentSong, setCurrentSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [queue, setQueue] = useState([]);
  const [currentChannelId, setCurrentChannelId] = useState(null);
  const [channelName, setChannelName] = useState(null);

  const playSong = useCallback((song) => {
    setCurrentSong(song);
    setIsPlaying(true);
    setProgress(0);
  }, []);

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const play = useCallback(() => {
    if (currentSong) setIsPlaying(true);
  }, [currentSong]);

  const skipNext = useCallback(() => {
    if (queue.length > 0) {
      const nextSong = queue[0];
      setQueue((prev) => prev.slice(1));
      playSong(nextSong.song || nextSong);
    }
  }, [queue, playSong]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const addToQueue = useCallback((item) => {
    setQueue((prev) => [...prev, item]);
  }, []);

  const removeFromQueue = useCallback((index) => {
    setQueue((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
  }, []);

  return (
    <PlayerContext.Provider
      value={{
        currentSong, isPlaying, progress, duration, volume, isMuted, queue,
        currentChannelId, channelName,
        setCurrentSong, setIsPlaying, setProgress, setDuration, setVolume,
        setIsMuted, setQueue, setCurrentChannelId, setChannelName,
        playSong, togglePlay, pause, play, skipNext, toggleMute,
        addToQueue, removeFromQueue, clearQueue,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
};

export default PlayerContext;
