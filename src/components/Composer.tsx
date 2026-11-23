import { useEffect, useRef, type KeyboardEvent } from 'react';

interface ComposerProps {
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
}

const MAX_HEIGHT_PX = 160;

export function Composer({ value, busy, onChange, onSend }: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== 'Enter' || event.shiftKey) return;
    if (event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (!busy && value.trim().length > 0) onSend();
  }

  const canSend = !busy && value.trim().length > 0;

  return (
    <div className="composer">
      <div className="composer-bar">
        <textarea
          ref={textareaRef}
          className="composer-input"
          value={value}
          rows={1}
          maxLength={20000}
          placeholder="سؤال خود را بنویسید…"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={busy}
          aria-label="متن سؤال"
        />
        <button
          type="button"
          className="composer-send"
          onClick={onSend}
          disabled={!canSend}
          aria-label={busy ? 'در حال پاسخ…' : 'ارسال سؤال'}
        >
          {busy ? (
            <span className="composer-spinner" aria-hidden="true" />
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 19V5" />
              <path d="m5 12 7-7 7 7" />
            </svg>
          )}
        </button>
      </div>
      <p className="composer-hint">
        Enter برای ارسال · Shift+Enter برای خط جدید
      </p>
    </div>
  );
}
