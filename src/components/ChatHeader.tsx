import { Companion } from './Companion';

interface ChatHeaderProps {
  title: string;
  canDelete: boolean;
  sessionCount: number;
  messageCount: number;
  pendingCount: number;
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
  onDelete: () => void;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="stat">
      <strong>{value.toLocaleString('fa-IR')}</strong>
      <span>{label}</span>
    </span>
  );
}

export function ChatHeader({
  title,
  canDelete,
  sessionCount,
  messageCount,
  pendingCount,
  sidebarOpen,
  onOpenSidebar,
  onDelete,
}: ChatHeaderProps) {
  return (
    <header className="chat-header">
      <div className="chat-header-start">
        <button
          type="button"
          className="sidebar-toggle"
          onClick={onOpenSidebar}
          aria-label="نمایش فهرست گفتگوها"
          aria-controls="session-sidebar"
          aria-expanded={sidebarOpen}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span>گفتگوها</span>
        </button>

        <div className="chat-identity">
          <span className="chat-avatar" aria-hidden="true">
            <Companion size={40} compact />
          </span>
          <div className="chat-heading">
            <h1>{title}</h1>
            <div className="chat-stats">
              <Stat label="گفتگو" value={sessionCount} />
              <Stat label="پیام" value={messageCount} />
              <Stat label="در انتظار" value={pendingCount} />
            </div>
          </div>
        </div>
      </div>

      {canDelete ? (
        <button type="button" className="danger-button" onClick={onDelete}>
          حذف گفتگو
        </button>
      ) : null}
    </header>
  );
}
