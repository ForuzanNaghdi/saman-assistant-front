export interface DocOut {
  episode_id: string;
  title?: string | null;
  document_id?: string | null;
  chunk_id?: string | null;
  text?: string | null;
}

export type MessageStatus = 'completed' | 'pending';

export interface MessageOut {
  id: string;
  session_id: string;
  user_query: string;
  answer: string | null;
  retrieved_docs: DocOut[];
  created_at: string | null;
  status: MessageStatus;
}

export interface MessageListOut {
  items: MessageOut[];
}

export interface SessionOut {
  session_id: string;
  title: string;
  created_at: string;
  last_activity_at: string;
  message_count: number;
  has_pending: boolean;
}

export interface SessionListOut {
  items: SessionOut[];
}

export type HealthStatus = 'alive' | 'ready' | 'not_ready';

export interface HealthResponse {
  status: HealthStatus;
}

export type TurnEvent =
  | {
      type: 'turn.started';
      id: string;
      session_id: string;
      created_at: string;
    }
  | {
      type: 'turn.delta';
      text: string;
    }
  | {
      type: 'turn.completed';
      id: string;
      answer: string;
      retrieved_docs: DocOut[];
      finish_reason: string;
    }
  | {
      type: 'turn.failed';
      error: {
        code: string;
        message: string;
        correlation_id?: string;
      };
    };
