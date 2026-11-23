import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { SessionOut } from '../api/types';
import type { ServiceState } from '../hooks/useServiceStatus';
import { IdentityPanel } from './IdentityPanel';
import { ServiceStatus } from './ServiceStatus';
import { SessionList } from './SessionList';

interface SidebarProps {
  sessions: SessionOut[];
  activeSessionId: string | null;
  userId: string;
  identityInputRef: RefObject<HTMLInputElement>;
  serviceState: ServiceState;
  open: boolean;
  onClose: () => void;
  onSelect: (sessionId: string) => void;
  onNew: () => void;
  onSaveIdentity: (value: string) => void;
}

export function Sidebar({
  sessions,
  activeSessionId,
  userId,
  identityInputRef,
  serviceState,
  open,
  onClose,
  onSelect,
  onNew,
  onSaveIdentity,
}: SidebarProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="sidebar-backdrop"
        tabIndex={-1}
        aria-label="بستن فهرست گفتگوها"
        onClick={onClose}
      />
      <aside id="session-sidebar" className="sidebar" aria-label="فهرست گفتگوها">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          <div className="brand-text">
            <strong>دستیار بیمهٔ سامان</strong>
            <small>پاسخ بر پایهٔ دانش بیمه</small>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="sidebar-close"
            onClick={onClose}
            aria-label="بستن فهرست گفتگوها"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <button type="button" className="new-chat" onClick={onNew}>
          گفتگوی جدید
        </button>

        <section className="sidebar-section">
          <h2>گفتگوها</h2>
          <SessionList
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelect={onSelect}
          />
        </section>

        <div className="sidebar-footer">
          <section className="sidebar-section">
            <h2>هویت</h2>
            <IdentityPanel
              userId={userId}
              inputRef={identityInputRef}
              onSave={onSaveIdentity}
            />
          </section>

          <ServiceStatus state={serviceState} />
        </div>
      </aside>
    </>
  );
}
