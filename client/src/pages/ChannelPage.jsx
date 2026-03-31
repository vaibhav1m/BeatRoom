import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import api from '../services/api';
import { formatTimeAgo, getInitials, formatDuration } from '../utils/helpers';
import { getAvatarColor, EMOJIS } from '../utils/constants';

const ChannelPage = () => {
  const { channelId } = useParams();
  const { user } = useAuth();
  const { socket, joinChannel, leaveChannel, setActiveChannelId } = useSocket();
  const navigate = useNavigate();

  useEffect(() => {
    setActiveChannelId(channelId);
    return () => setActiveChannelId(null);
  }, [channelId, setActiveChannelId]);

  const [channel, setChannel] = useState(null);
  const [queue, setQueue] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearch, setShowSearch] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [currentSong, setCurrentSong] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [typing, setTyping] = useState([]);
  const chatEndRef = useRef(null);
  const playerRef = useRef(null);
  const typingTimeout = useRef(null);

  // Fetch channel data
  useEffect(() => {
    const fetchChannel = async () => {
      try {
        const res = await api.get(`/api/channels/${channelId}`);
        setChannel(res.data.channel);
        setQueue(res.data.queue);
        setCurrentSong(res.data.channel.currentSong);
        setIsPlaying(res.data.channel.playbackState?.isPlaying || false);
      } catch (err) {
        console.error(err);
        navigate('/dashboard');
      } finally {
        setLoading(false);
      }
    };
    fetchChannel();
  }, [channelId]);

  // Socket handlers
  useEffect(() => {
    if (!socket || !channelId) return;
    joinChannel(channelId);
    socket.emit('chat:history', { channelId });
    socket.emit('player:request-sync', { channelId });

    const handleMessage = (msg) => setMessages(prev => [...prev, msg]);
    const handleHistory = (msgs) => setMessages(msgs);
    const handleReaction = ({ messageId, reactions }) => {
      setMessages(prev => prev.map(m => m._id === messageId ? { ...m, reactions } : m));
    };
    const handleDeleted = ({ messageId }) => {
      setMessages(prev => prev.filter(m => m._id !== messageId));
    };
    const handlePlayerState = ({ isPlaying: playing, currentTime, song }) => {
      setIsPlaying(playing);
      setCurrentSong(song);
    };
    const handleQueueUpdate = (q) => setQueue(q);
    const handleUserJoined = ({ user: joinedUser }) => {
      setChannel(prev => prev ? { ...prev, members: [...(prev.members || []), joinedUser] } : prev);
    };
    const handleUserLeft = ({ userId }) => {
      setChannel(prev => prev ? { ...prev, members: (prev.members || []).filter(m => m._id !== userId) } : prev);
    };
    const handleTyping = ({ username }) => {
      setTyping(prev => [...new Set([...prev, username])]);
    };
    const handleStopTyping = ({ userId }) => {
      setTyping(prev => prev.filter(u => u !== userId));
    };

    socket.on('chat:message', handleMessage);
    socket.on('chat:history', handleHistory);
    socket.on('chat:reaction-update', handleReaction);
    socket.on('chat:deleted', handleDeleted);
    socket.on('player:state', handlePlayerState);
    socket.on('queue:updated', handleQueueUpdate);
    socket.on('channel:user-joined', handleUserJoined);
    socket.on('channel:user-left', handleUserLeft);
    socket.on('chat:typing', handleTyping);
    socket.on('chat:stop-typing', handleStopTyping);

    return () => {
      leaveChannel(channelId);
      socket.off('chat:message', handleMessage);
      socket.off('chat:history', handleHistory);
      socket.off('chat:reaction-update', handleReaction);
      socket.off('chat:deleted', handleDeleted);
      socket.off('player:state', handlePlayerState);
      socket.off('queue:updated', handleQueueUpdate);
      socket.off('channel:user-joined', handleUserJoined);
      socket.off('channel:user-left', handleUserLeft);
      socket.off('chat:typing', handleTyping);
      socket.off('chat:stop-typing', handleStopTyping);
    };
  }, [socket, channelId]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !socket) return;
    socket.emit('chat:message', {
      channelId, content: chatInput, replyTo: replyTo?._id,
    });
    setChatInput('');
    setReplyTo(null);
    socket.emit('chat:stop-typing', { channelId });
  };

  const handleTypingInput = (e) => {
    setChatInput(e.target.value);
    socket?.emit('chat:typing', { channelId });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socket?.emit('chat:stop-typing', { channelId });
    }, 2000);
  };

  const toggleReaction = (messageId, emoji) => {
    socket?.emit('chat:reaction', { messageId, emoji });
  };

  const togglePlayback = () => {
    if (isPlaying) {
      socket?.emit('player:pause', { channelId, currentTime: 0 });
    } else {
      socket?.emit('player:play', { channelId, songId: currentSong?._id, currentTime: 0 });
    }
  };

  const skipNext = () => {
    socket?.emit('queue:next', { channelId });
  };

  const searchSongs = async () => {
    if (!searchQuery.trim()) return;
    try {
      const res = await api.get(`/api/songs/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchResults([
        ...(res.data.results.youtube || []),
        ...(res.data.results.local || []),
      ]);
    } catch (err) {
      console.error('Search failed:', err);
    }
  };

  const addToQueue = (songData) => {
    socket?.emit('queue:add', { channelId, songData });
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const upvoteSong = (index) => socket?.emit('queue:upvote', { channelId, itemIndex: index });
  const downvoteSong = (index) => socket?.emit('queue:downvote', { channelId, itemIndex: index });
  const removeFromQueue = (index) => socket?.emit('queue:remove', { channelId, itemIndex: index });

  const isAdmin = channel?.admin?._id === user?._id || user?.role === 'superadmin';

  if (loading) {
    return <div className="page-container"><div className="skeleton" style={{ height: '60vh', borderRadius: 'var(--radius-lg)' }} /></div>;
  }

  return (
    <div className="page-container" style={{ maxWidth: '100%', padding: 'var(--space-4)' }}>
      {/* Channel Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 'var(--space-4)', padding: 'var(--space-4) var(--space-5)',
        background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', border: 'var(--border-default)',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <h1 style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800 }}>{channel?.name}</h1>
            <span className={`badge badge-${channel?.type}`}>{channel?.type === 'private' ? '🔒' : '🌐'}</span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>{channel?.description}</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowMembers(!showMembers)}>
            👥 {channel?.members?.length || 0}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowSearch(true)}>
            ➕ Add Song
          </button>
          {isAdmin && (
            <button className="btn btn-secondary btn-sm" onClick={async () => {
              const res = await api.post(`/api/channels/${channelId}/toggle-control`);
              setChannel(prev => ({ ...prev, allowAllControl: res.data.allowAllControl }));
            }}>
              {channel?.allowAllControl ? '🔓 All Control' : '🔒 Admin Only'}
            </button>
          )}
          <button className="btn btn-ghost btn-sm" title="Invite Code" onClick={() => {
            navigator.clipboard.writeText(channel?.inviteCode || '');
            alert(`Invite code copied: ${channel?.inviteCode}`);
          }}>📋 Invite</button>
        </div>
      </div>

      {/* Main Layout: Player + Chat + Queue */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 'var(--space-4)', height: 'calc(100vh - 220px)' }}>
        {/* Left: Player + Queue */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', minHeight: 0 }}>
          {/* Player */}
          <div className="glass-card" style={{ padding: 'var(--space-6)' }}>
            {currentSong ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-5)' }}>
                  {currentSong.thumbnail && (
                    <img src={currentSong.thumbnail} alt="" style={{ width: 100, height: 100, borderRadius: 'var(--radius-md)', objectFit: 'cover' }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <h2 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700 }}>{currentSong.title}</h2>
                    <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-1)' }}>{currentSong.artist}</p>
                    {currentSong.source === 'youtube' && (
                      <div style={{ marginTop: 'var(--space-4)' }}>
                        <iframe
                          ref={playerRef}
                          width="100%"
                          height="200"
                          src={`https://www.youtube.com/embed/${currentSong.sourceId}?autoplay=${isPlaying ? 1 : 0}&enablejsapi=1`}
                          allow="autoplay; encrypted-media"
                          allowFullScreen
                          style={{ borderRadius: 'var(--radius-md)', border: 'none' }}
                        />
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
                  <button className="btn btn-ghost btn-icon" onClick={skipNext} title="Skip">⏭️</button>
                  <button className="player-btn-play" onClick={togglePlayback} style={{ cursor: 'pointer', border: 'none', width: 56, height: 56, borderRadius: '50%', background: 'var(--gradient-primary)', color: 'white', fontSize: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isPlaying ? '⏸' : '▶'}
                  </button>
                  <button className="btn btn-ghost btn-icon" onClick={skipNext} title="Next">⏩</button>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 'var(--space-10)', color: 'var(--text-secondary)' }}>
                <p style={{ fontSize: '48px', marginBottom: 'var(--space-4)' }}>🎵</p>
                <p>No song playing. Add songs to the queue!</p>
                <button className="btn btn-primary" style={{ marginTop: 'var(--space-4)' }} onClick={() => setShowSearch(true)}>
                  ➕ Search & Add Songs
                </button>
              </div>
            )}
          </div>

          {/* Queue */}
          <div className="queue-container" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="queue-header">
              <h3 style={{ fontWeight: 700 }}>📋 Queue ({queue?.items?.length || 0})</h3>
              {isAdmin && queue?.items?.length > 0 && (
                <button className="btn btn-danger btn-sm" onClick={() => socket?.emit('queue:clear', { channelId })}>Clear</button>
              )}
            </div>
            <div className="queue-list" style={{ flex: 1, overflow: 'auto' }}>
              {queue?.items?.map((item, i) => (
                <div key={i} className="queue-item">
                  <span className="queue-item-position">{i + 1}</span>
                  {item.song?.thumbnail && <img src={item.song.thumbnail} alt="" className="queue-item-thumbnail" />}
                  <div className="queue-item-info">
                    <div className="queue-item-title">{item.song?.title}</div>
                    <div className="queue-item-artist">{item.song?.artist} • Added by {item.addedBy?.username}</div>
                  </div>
                  <div className="queue-item-votes">
                    <button className={`queue-vote-btn ${item.upvotes?.includes(user?._id) ? 'upvoted' : ''}`}
                      onClick={() => upvoteSong(i)}>👍</button>
                    <span className="queue-vote-count">{(item.upvotes?.length || 0) - (item.downvotes?.length || 0)}</span>
                    <button className={`queue-vote-btn ${item.downvotes?.includes(user?._id) ? 'downvoted' : ''}`}
                      onClick={() => downvoteSong(i)}>👎</button>
                    <button className="queue-vote-btn" onClick={() => removeFromQueue(i)}>✕</button>
                  </div>
                </div>
              ))}
              {(!queue?.items || queue.items.length === 0) && (
                <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Queue is empty. Add some songs!
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Chat */}
        <div className="chat-container" style={{ height: '100%' }}>
          <div className="chat-header">
            <h3 style={{ fontWeight: 700 }}>💬 Chat</h3>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
              {channel?.members?.length} online
            </span>
          </div>
          <div className="chat-messages" style={{ flex: 1, overflow: 'auto' }}>
            {messages.map((msg) => (
              <div key={msg._id} className="chat-message">
                <div className="avatar avatar-sm avatar-placeholder"
                  style={{ background: getAvatarColor(msg.sender?.username || ''), fontSize: '11px' }}>
                  {getInitials(msg.sender?.username || '')}
                </div>
                <div className="chat-message-content">
                  <div className="chat-message-header">
                    <span className="chat-message-username">{msg.sender?.username}</span>
                    <span className="chat-message-time">{formatTimeAgo(msg.createdAt)}</span>
                  </div>
                  {msg.replyTo && (
                    <div style={{ padding: '4px 8px', background: 'var(--surface-glass)', borderLeft: '2px solid var(--accent-primary)', borderRadius: '4px', marginBottom: '4px', fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
                      ↩ {msg.replyTo.content?.substring(0, 60)}
                    </div>
                  )}
                  <div className="chat-message-text">{msg.content}</div>
                  {msg.reactions?.length > 0 && (
                    <div className="chat-message-reactions">
                      {msg.reactions.map((r, i) => (
                        <button key={i} className={`chat-reaction ${r.users?.includes(user?._id) ? 'active' : ''}`}
                          onClick={() => toggleReaction(msg._id, r.emoji)}>
                          {r.emoji} {r.users?.length}
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '4px', marginTop: '4px', opacity: 0 }}
                    className="msg-actions"
                    onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = 0}>
                    <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: '12px' }}
                      onClick={() => setReplyTo(msg)}>↩</button>
                    {EMOJIS.slice(0, 5).map(emoji => (
                      <button key={emoji} className="btn btn-ghost" style={{ padding: '2px 4px', fontSize: '14px' }}
                        onClick={() => toggleReaction(msg._id, emoji)}>{emoji}</button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          {typing.length > 0 && (
            <div style={{ padding: '4px 20px', fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
              {typing.join(', ')} typing...
            </div>
          )}
          {replyTo && (
            <div style={{ padding: '8px 20px', background: 'var(--surface-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--font-size-xs)' }}>
              <span>↩ Replying to <strong>{replyTo.sender?.username}</strong>: {replyTo.content?.substring(0, 40)}</span>
              <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>✕</button>
            </div>
          )}
          <form className="chat-input-bar" onSubmit={sendMessage}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowEmoji(!showEmoji)}>😀</button>
            <input className="chat-input" placeholder="Type a message..." value={chatInput}
              onChange={handleTypingInput} />
            <button type="submit" className="btn btn-primary btn-sm">Send</button>
          </form>
          {showEmoji && (
            <div style={{
              position: 'absolute', bottom: 80, right: 20, background: 'var(--bg-secondary)',
              border: 'var(--border-default)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)',
              display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px', zIndex: 100,
            }}>
              {EMOJIS.map(emoji => (
                <button key={emoji} onClick={() => { setChatInput(prev => prev + emoji); setShowEmoji(false); }}
                  style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', padding: '4px' }}>
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Members Panel */}
      {showMembers && (
        <>
          <div className="modal-backdrop" onClick={() => setShowMembers(false)} />
          <div className="modal">
            <div className="modal-header">
              <h2>👥 Members ({channel?.members?.length})</h2>
              <button className="modal-close" onClick={() => setShowMembers(false)}>✕</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {channel?.members?.map(member => (
                <div key={member._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--surface-glass)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <div className="avatar avatar-sm avatar-placeholder" style={{ background: getAvatarColor(member.username) }}>
                      {getInitials(member.username)}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>{member.username}</div>
                      {member._id === channel.admin?._id && <span className="badge" style={{ background: 'var(--accent-primary-glow)', color: 'var(--accent-primary)', fontSize: '10px' }}>Admin</span>}
                    </div>
                  </div>
                  {isAdmin && member._id !== user?._id && member._id !== channel.admin?._id && (
                    <button className="btn btn-danger btn-sm" onClick={async () => {
                      await api.post(`/api/channels/${channelId}/kick/${member._id}`);
                      setChannel(prev => ({ ...prev, members: prev.members.filter(m => m._id !== member._id) }));
                    }}>Kick</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Search Songs Modal */}
      {showSearch && (
        <>
          <div className="modal-backdrop" onClick={() => { setShowSearch(false); setSearchResults([]); setSearchQuery(''); }} />
          <div className="modal" style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <h2>🔍 Search Songs</h2>
              <button className="modal-close" onClick={() => { setShowSearch(false); setSearchResults([]); setSearchQuery(''); }}>✕</button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); searchSongs(); }} style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
              <input className="input-field" placeholder="Search for songs..." value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)} autoFocus style={{ flex: 1 }} />
              <button type="submit" className="btn btn-primary">Search</button>
            </form>
            <div style={{ maxHeight: 400, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {searchResults.map((song, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                  padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
                  background: 'var(--surface-glass)', cursor: 'pointer',
                }} onClick={() => addToQueue(song)}>
                  {song.thumbnail && <img src={song.thumbnail} alt="" style={{ width: 48, height: 48, borderRadius: 'var(--radius-sm)', objectFit: 'cover' }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{song.title}</div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>{song.artist}</div>
                  </div>
                  <button className="btn btn-primary btn-sm">+ Add</button>
                </div>
              ))}
              {searchResults.length === 0 && searchQuery && (
                <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--text-muted)' }}>
                  Search for songs to add to the queue
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ChannelPage;
