import { useToast } from '../context/ToastContext';

const ICONS = { success: '✅', error: '❌', warn: '⚠️', info: 'ℹ️' };
const COLORS = {
  success: 'rgba(16,185,129,0.15)',
  error: 'rgba(239,68,68,0.15)',
  warn: 'rgba(245,158,11,0.15)',
  info: 'rgba(124,58,237,0.15)',
};
const BORDER_COLORS = {
  success: 'rgba(16,185,129,0.4)',
  error: 'rgba(239,68,68,0.4)',
  warn: 'rgba(245,158,11,0.4)',
  info: 'rgba(124,58,237,0.4)',
};

const Toast = () => {
  const { toasts, dismiss } = useToast();
  if (!toasts.length) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24,
      display: 'flex', flexDirection: 'column', gap: 10,
      zIndex: 9999, maxWidth: 360, width: '100%',
      pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px',
          background: 'var(--bg-secondary)',
          border: `1px solid ${BORDER_COLORS[t.type] || BORDER_COLORS.info}`,
          borderLeft: `4px solid ${BORDER_COLORS[t.type] || BORDER_COLORS.info}`,
          borderRadius: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          backdropFilter: 'blur(8px)',
          pointerEvents: 'auto',
          animation: 'toast-in 0.25s ease both',
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>{ICONS[t.type] || 'ℹ️'}</span>
          <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.4 }}>{t.message}</span>
          <button onClick={() => dismiss(t.id)} style={{
            background: 'none', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0, padding: '0 2px',
          }}>✕</button>
        </div>
      ))}
    </div>
  );
};

export default Toast;
