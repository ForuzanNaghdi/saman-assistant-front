import { requestJson, type FailureLogLevel } from './client';
import type { MessageListOut, SessionListOut } from './types';

const SESSION_LIMIT = 100;
const TURN_LIMIT = 500;

export interface ChatRequestOptions {
  operationId?: string;
  /** Background polling: failures are logged at debug; the caller reports the outcome. */
  background?: boolean;
  /** Explicit owner: `none` means the caller reports the failure itself. */
  failureLevel?: FailureLogLevel;
}

function failureLevel(options: ChatRequestOptions): FailureLogLevel {
  if (options.failureLevel) return options.failureLevel;
  return options.background ? 'debug' : 'error';
}

export function listSessions(
  userId: string,
  signal?: AbortSignal,
  options: ChatRequestOptions = {},
): Promise<SessionListOut> {
  return requestJson<SessionListOut>(`/chat/sessions?limit=${SESSION_LIMIT}`, {
    userId,
    signal,
    operationId: options.operationId,
    failureLevel: failureLevel(options),
  });
}

export function listTurns(
  sessionId: string,
  userId: string,
  signal?: AbortSignal,
  options: ChatRequestOptions = {},
): Promise<MessageListOut> {
  return requestJson<MessageListOut>(
    `/chat/sessions/${encodeURIComponent(sessionId)}/turns?limit=${TURN_LIMIT}`,
    {
      userId,
      signal,
      operationId: options.operationId,
      failureLevel: failureLevel(options),
    },
  );
}

export function deleteSession(
  sessionId: string,
  userId: string,
  options: ChatRequestOptions = {},
): Promise<null> {
  return requestJson<null>(`/chat/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
    userId,
    operationId: options.operationId,
    failureLevel: failureLevel(options),
  });
}
