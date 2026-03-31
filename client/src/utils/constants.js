export const APP_NAME = 'BeatRoom';

export const CHANNEL_TYPES = {
  PUBLIC: 'public',
  PRIVATE: 'private',
};

export const USER_ROLES = {
  USER: 'user',
  ADMIN: 'admin',
  SUPERADMIN: 'superadmin',
};

export const MUSIC_SOURCES = {
  YOUTUBE: 'youtube',
  SPOTIFY: 'spotify',
};

export const NOTIFICATION_TYPES = {
  JOIN_REQUEST: 'join_request',
  FRIEND_REQUEST: 'friend_request',
  CHANNEL_INVITE: 'channel_invite',
  SONG_ADDED: 'song_added',
  USER_JOINED: 'user_joined',
};

export const EMOJIS = [
  '😀', '😂', '🥰', '😎', '🤘', '🔥', '❤️', '💜', '🎵', '🎶',
  '🎸', '🥁', '🎤', '🎧', '🎹', '🎺', '🎷', '💃', '🕺', '👏',
  '👍', '👎', '🙌', '✨', '⚡', '💫', '🌟', '🎉', '🎊', '💯',
];

export const DEFAULT_AVATAR_COLORS = [
  '#7c3aed', '#06b6d4', '#f43f5e', '#10b981', '#f59e0b',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1',
];

export const getAvatarColor = (name) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return DEFAULT_AVATAR_COLORS[Math.abs(hash) % DEFAULT_AVATAR_COLORS.length];
};
