import { useEffect, useRef } from 'react';
import type { DisplayMessage } from '../types';
import { MessageBubble } from './MessageBubble';
import { Welcome } from './Welcome';

interface MessageListProps {
  messages: DisplayMessage[];
  loading: boolean;
  onAsk: (question: string) => void;
}

const STICK_THRESHOLD_PX = 120;

export function MessageList({ messages, loading, onAsk }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    if (stickRef.current) element.scrollTop = element.scrollHeight;
  }, [messages]);

  function handleScroll(): void {
    const element = scrollRef.current;
    if (!element) return;
    const distanceFromBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    stickRef.current = distanceFromBottom <= STICK_THRESHOLD_PX;
  }

  if (loading) {
    return (
      <div className="message-scroll">
        <div className="loading-row">
          <span className="spinner" aria-hidden="true" />
          <span>در حال بارگذاری گفتگو…</span>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="message-scroll">
        <Welcome onAsk={onAsk} />
      </div>
    );
  }

  return (
    <div className="message-scroll" ref={scrollRef} onScroll={handleScroll}>
      {messages.map((message) => (
        <MessageBubble key={message.key} message={message} />
      ))}
    </div>
  );
}
