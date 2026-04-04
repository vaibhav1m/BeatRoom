import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};

export const THEMES = [
  { id: 'dark',     name: 'Dark',     emoji: '🌑', preview: '#7c3aed' },
  { id: 'light',    name: 'Light',    emoji: '☀️',  preview: '#7c3aed' },
  { id: 'midnight', name: 'Midnight', emoji: '🌊', preview: '#06b6d4' },
  { id: 'sunset',   name: 'Sunset',   emoji: '🌅', preview: '#f97316' },
  { id: 'forest',   name: 'Forest',   emoji: '🌿', preview: '#10b981' },
  { id: 'galaxy',   name: 'Galaxy',   emoji: '💜', preview: '#ec4899' },
];

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(() => {
    return localStorage.getItem('beatroom_theme') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('beatroom_theme', theme);
  }, [theme]);

  const setTheme = (id) => setThemeState(id);
  const toggleTheme = () => setThemeState(prev => prev === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeContext;
