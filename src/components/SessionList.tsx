import type { SessionOut } from '../api/types';
import { formatCount, formatRelativeTime } from '../lib/format';

interface SessionListProps {
  sessions: SessionOut[];
  activeSessionId: string | null;
  onSelect: (sessionId: string) => void;
}

export function SessionList({
  sessions,
  activeSessionId,
  onSelect,
}: SessionListProps) {
  if (sessions.length === 0) {
    return <p className="sidebar-empty">هنوز گفتگویی ثبت نشده است.</p>;
  }

  return (
    <ul className="session-list">
      {sessions.map((session) => {
        const active = session.session_id === activeSessionId;
        return (
          <li key={session.session_id}>
            <button
              type="button"
              className={`session-item${active ? ' active' : ''}`}
              onClick={() => onSelect(session.session_id)}
              aria-current={active ? 'true' : undefined}
            >
              <span className="session-title">
                {session.has_pending ? (
                  <span className="live-dot" aria-label="در حال پردازش" />
                ) : null}
                <span className="session-title-text">
                  {session.title || 'بدون عنوان'}
                </span>
              </span>
              <span className="session-meta">
                <span>{formatCount(session.message_count)} پیام</span>
                {session.last_activity_at ? (
                  <span>{formatRelativeTime(session.last_activity_at)}</span>
                ) : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
