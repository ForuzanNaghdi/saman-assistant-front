import type { DisplayMessage } from '../types';
import { Companion } from './Companion';
import { Markdown } from './Markdown';

interface MessageBubbleProps {
  message: DisplayMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const { userQuery, answer, status, streamingText, retrievedDocs, note } = message;
  const visibleAnswer = answer ?? streamingText;

  return (
    <article className="turn">
      <div className="bubble bubble-user">
        <p>{userQuery}</p>
      </div>

      <div className="bubble bubble-bot">
        {visibleAnswer ? <Markdown source={visibleAnswer} /> : null}

        {status === 'pending' && visibleAnswer ? (
          <span className="cursor" aria-hidden="true" />
        ) : null}

        {!visibleAnswer && status === 'pending' ? (
          <div className="waiting-row">
            <span className="waiting-mark" aria-hidden="true">
              <Companion size={56} thinking />
            </span>
            <span className="muted">در حال دریافت پاسخ…</span>
          </div>
        ) : null}

        {note ? (
          <p className="turn-note" role="note">
            <span>{note.message}</span>
            {note.code ? <code>{note.code}</code> : null}
          </p>
        ) : null}

        {status === 'completed' && retrievedDocs.length > 0 ? (
          <details className="sources">
            <summary>منابع ({retrievedDocs.length.toLocaleString('fa-IR')})</summary>
            <ul>
              {retrievedDocs.map((doc, index) => (
                <li key={`${doc.episode_id}-${index}`}>
                  <span className="source-title">
                    {doc.title || doc.document_id || doc.episode_id}
                  </span>
                  {doc.text ? <p className="source-text">{doc.text}</p> : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </article>
  );
}
