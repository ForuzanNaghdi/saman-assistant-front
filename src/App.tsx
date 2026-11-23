import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteSession, listSessions, listTurns } from './api/chat';
import { ApiError, messageForCode } from './api/errors';
import { streamTurn } from './api/sse';
import type { MessageOut, SessionOut } from './api/types';
import { Banner } from './components/Banner';
import { ChatHeader } from './components/ChatHeader';
import { Composer } from './components/Composer';
import { MessageList } from './components/MessageList';
import { Sidebar } from './components/Sidebar';
import { Toast } from './components/Toast';
import { useServiceStatus } from './hooks/useServiceStatus';
import { useToast } from './hooks/useToast';
import { isAbortError, sleep } from './lib/async';
import { newDevUserId, newId } from './lib/ids';
import { createOperationId, describeError, logger } from './lib/logger';
import { readStorage, removeStorage, writeStorage } from './lib/storage';
import type { DisplayMessage } from './types';

const USER_KEY = 'saman.user';
const SESSION_KEY = 'saman.session';
const IDENTITY_PATTERN = /^[A-Za-z0-9._:@-]{1,128}$/;
const PENDING_POLL_MS = 2500;
const PENDING_WINDOW_MS = 5 * 60 * 1000;

function loadUserId(): string {
  const stored = readStorage(USER_KEY)?.trim() ?? '';
  if (IDENTITY_PATTERN.test(stored)) return stored;
  const generated = newDevUserId();
  writeStorage(USER_KEY, generated);
  return generated;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'ارتباط با سرویس برقرار نشد.';
}

function toDisplay(message: MessageOut): DisplayMessage {
  return {
    key: message.id,
    recordId: message.id,
    userQuery: message.user_query,
    answer: message.answer,
    status: message.status === 'pending' ? 'pending' : 'completed',
    streamingText: '',
    retrievedDocs: message.retrieved_docs ?? [],
  };
}

/**
 * Replaces the view with the server's turns while keeping optimistic turns the
 * server has not persisted (yet), so a failed request never erases the question.
 */
function mergeTurns(items: MessageOut[], current: DisplayMessage[]): DisplayMessage[] {
  const displayed = items.map(toDisplay);
  const known = new Set<string>();
  for (const message of displayed) {
    known.add(message.key);
    if (message.recordId) known.add(message.recordId);
  }

  const optimistic = current.filter(
    (message) =>
      message.status !== 'completed' &&
      !known.has(message.key) &&
      (!message.recordId || !known.has(message.recordId)),
  );

  return optimistic.length > 0 ? [...displayed, ...optimistic] : displayed;
}

export function App() {
  const [userId, setUserId] = useState<string>(loadUserId);
  const [sessions, setSessions] = useState<SessionOut[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [loadingTurns, setLoadingTurns] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { message: toast, show: showToast } = useToast();
  const serviceState = useServiceStatus();

  const generationRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const userIdRef = useRef(userId);
  const streamingRef = useRef(false);
  const identityInputRef = useRef<HTMLInputElement | null>(null);
  const bootedRef = useRef(false);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  /** Invalidates every in-flight async continuation and cancels the stream. */
  const bumpAndAbort = useCallback((): number => {
    generationRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    streamingRef.current = false;
    setStreaming(false);
    return generationRef.current;
  }, []);

  const refreshSessions = useCallback(async (quiet = false): Promise<void> => {
    try {
      // A quiet refresh is background maintenance: its failure is reported here
      // once instead of interrupting the user with a banner.
      const result = await listSessions(userIdRef.current, undefined, {
        background: quiet,
      });
      setSessions(result.items ?? []);
    } catch (error) {
      if (!quiet) {
        // The foreground client request already reported this failure.
        setBanner(errorMessage(error));
        return;
      }
      if (isAbortError(error)) return;
      const details = describeError(error, false);
      logger.warn('sessions.refresh_failed', {
        message: 'به‌روزرسانی فهرست گفتگوها ناموفق بود.',
        route: '/chat/sessions',
        method: 'GET',
        errorCode: details.errorCode,
        httpStatus: details.httpStatus,
        errorKind: details.errorKind,
        requestId: details.requestId,
      });
    }
  }, []);

  const markUnanswered = useCallback((): void => {
    setMessages((current) =>
      current.map((message) =>
        message.status === 'pending'
          ? {
              ...message,
              status: 'failed',
              note: {
                message: 'پاسخ این پرسش دریافت نشد. دوباره تلاش کنید.',
                code: 'CLIENT_DISCONNECTED',
              },
            }
          : message,
      ),
    );
  }, []);

  /**
   * After a dropped or interrupted stream the server may still be finishing the
   * turn. Poll the turns endpoint until the row settles or the window closes.
   */
  const watchPending = useCallback(
    async (sid: string, generation: number, deadline: number): Promise<void> => {
      const operationId = createOperationId();
      const startedAt = Date.now();
      let attempts = 0;

      while (generation === generationRef.current && Date.now() < deadline) {
        await sleep(PENDING_POLL_MS);
        if (generation !== generationRef.current) return;

        attempts += 1;
        try {
          const result = await listTurns(sid, userIdRef.current, undefined, {
            background: true,
            operationId,
          });
          if (generation !== generationRef.current) return;
          const items = result.items ?? [];

          setMessages((current) => mergeTurns(items, current));

          if (!items.some((item) => item.status === 'pending')) {
            logger.info('turns.poll_settled', {
              message: 'وضعیت نهایی پرسش در انتظار مشخص شد.',
              operationId,
              route: '/chat/sessions/:id/turns',
              method: 'GET',
              attempt: attempts,
              durationMs: Date.now() - startedAt,
              result: 'settled',
            });
            setMessages((current) =>
              current.map((message) =>
                message.status === 'pending'
                  ? {
                      ...message,
                      status: 'failed',
                      note: {
                        message: 'پاسخ در زمان مورد انتظار دریافت نشد.',
                        code: 'POLL_TIMEOUT',
                      },
                    }
                  : message,
              ),
            );
            void refreshSessions(true);
            return;
          }
        } catch (error) {
          // Transient failures: keep polling until the deadline. The client
          // already recorded each failed attempt at debug level.
          if (isAbortError(error)) return;
        }
      }

      if (generation !== generationRef.current) {
        // Deliberate cancellation (session switch / new turn): not an error.
        logger.debug('turns.poll_cancelled', {
          message: 'انتظار برای وضعیت پرسش لغو شد.',
          operationId,
          route: '/chat/sessions/:id/turns',
          method: 'GET',
          attempt: attempts,
          durationMs: Date.now() - startedAt,
          result: 'cancelled',
        });
        return;
      }

      logger.warn('turns.poll_timeout', {
        message: 'وضعیت پرسش در بازهٔ انتظار مشخص نشد.',
        operationId,
        route: '/chat/sessions/:id/turns',
        method: 'GET',
        attempt: attempts,
        durationMs: Date.now() - startedAt,
        result: 'timeout',
        errorCode: 'POLL_TIMEOUT',
        errorKind: 'timeout',
      });
    },
    [refreshSessions],
  );

  const settleTurn = useCallback(
    async (sid: string, generation: number): Promise<void> => {
      const operationId = createOperationId();
      const startedAt = Date.now();
      try {
        const result = await listTurns(sid, userIdRef.current, undefined, {
          background: true,
          operationId,
        });
        if (generation !== generationRef.current) return;
        const items = result.items ?? [];
        setMessages((current) => mergeTurns(items, current));
      } catch (error) {
        // Keep whatever was streamed locally.
        if (generation === generationRef.current && !isAbortError(error)) {
          const details = describeError(error, false);
          logger.warn('turns.settle_failed', {
            message: 'دریافت وضعیت نهایی پرسش ناموفق بود.',
            operationId,
            route: '/chat/sessions/:id/turns',
            method: 'GET',
            durationMs: Date.now() - startedAt,
            errorCode: details.errorCode,
            httpStatus: details.httpStatus,
            errorKind: details.errorKind,
            requestId: details.requestId,
          });
        }
      }
      if (generation === generationRef.current) void refreshSessions(true);
    },
    [refreshSessions],
  );

  const loadTurns = useCallback(
    async (sid: string, generation: number): Promise<DisplayMessage[] | null> => {
      const operationId = createOperationId();
      const startedAt = Date.now();
      setLoadingTurns(true);
      try {
        // This layer owns the report so a stale session can be an info event
        // instead of an error the transport logs before the 404 is understood.
        const result = await listTurns(sid, userIdRef.current, undefined, {
          operationId,
          failureLevel: 'none',
        });
        if (generation !== generationRef.current) return null;
        const display = (result.items ?? []).map(toDisplay);
        setMessages(display);
        return display;
      } catch (error) {
        if (generation !== generationRef.current || isAbortError(error)) return null;

        if (
          error instanceof ApiError &&
          (error.code === 'SESSION_NOT_FOUND' || error.status === 404)
        ) {
          logger.info('session.restore_dropped', {
            message: 'گفتگوی ذخیره‌شده دیگر روی سرور موجود نبود.',
            operationId,
            route: '/chat/sessions/:id/turns',
            method: 'GET',
            httpStatus: error.status,
            errorCode: error.code,
            errorKind: 'http',
            requestId: error.requestId,
            result: 'missing',
          });
          removeStorage(SESSION_KEY);
          sessionIdRef.current = null;
          setSessionId(null);
          setMessages([]);
          return null;
        }

        const details = describeError(error, false);
        logger.warn('turns.load_failed', {
          message: 'دریافت پیام‌های گفتگو ناموفق بود.',
          operationId,
          route: '/chat/sessions/:id/turns',
          method: 'GET',
          durationMs: Date.now() - startedAt,
          errorCode: details.errorCode,
          httpStatus: details.httpStatus,
          errorKind: details.errorKind,
          requestId: details.requestId,
        });
        setBanner(errorMessage(error));
        return null;
      } finally {
        if (generation === generationRef.current) setLoadingTurns(false);
      }
    },
    [],
  );

  const selectSession = useCallback(
    async (target: string): Promise<void> => {
      bumpAndAbort();
      const generation = generationRef.current;

      sessionIdRef.current = target;
      setSessionId(target);
      writeStorage(SESSION_KEY, target);
      setMessages([]);
      setDraft('');
      setBanner(null);

      const loaded = await loadTurns(target, generation);
      if (
        loaded &&
        generation === generationRef.current &&
        loaded.some((message) => message.status === 'pending')
      ) {
        void watchPending(target, generation, Date.now() + PENDING_WINDOW_MS);
      }
    },
    [bumpAndAbort, loadTurns, watchPending],
  );

  const ensureSession = useCallback((): string => {
    const existing = sessionIdRef.current;
    if (existing) return existing;

    const created = newId();
    sessionIdRef.current = created;
    setSessionId(created);
    writeStorage(SESSION_KEY, created);
    logger.info('session.created', {
      message: 'گفتگوی جدید ساخته شد.',
      result: 'implicit',
    });
    return created;
  }, []);

  const startTurn = useCallback(
    async (question: string, sid: string): Promise<void> => {
      // One stream per turn. Without this guard a second call would abort the
      // running stream and POST /turns/stream again instead of being ignored.
      if (streamingRef.current) {
        logger.debug('chat.turn_ignored', {
          message: 'درخواست پرسش تازه تا پایان پرسش در جریان نادیده گرفته شد.',
          operationId: createOperationId(),
          route: '/chat/sessions/:id/turns/stream',
          method: 'POST',
          result: 'ignored',
          errorCode: 'TURN_IN_PROGRESS',
          errorKind: 'contract',
        });
        return;
      }

      const generation = bumpAndAbort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const operationId = createOperationId();

      const localKey = `local-${newId()}`;
      const local: DisplayMessage = {
        key: localKey,
        userQuery: question,
        answer: null,
        status: 'pending',
        streamingText: '',
        retrievedDocs: [],
      };

      setMessages((current) => [...current, local]);
      setDraft('');
      setBanner(null);
      setLoadingTurns(false);
      streamingRef.current = true;
      setStreaming(true);

      const turnState = { terminal: false };

      try {
        await streamTurn({
          sessionId: sid,
          question,
          userId: userIdRef.current,
          signal: controller.signal,
          operationId,
          onEvent: (event) => {
            if (generation !== generationRef.current) return;

            if (event.type === 'turn.started') {
              const recordId = event.id;
              setMessages((current) =>
                current.map((message) =>
                  message.key === localKey ? { ...message, recordId } : message,
                ),
              );
              return;
            }

            if (event.type === 'turn.delta') {
              const delta = event.text;
              setMessages((current) =>
                current.map((message) =>
                  message.key === localKey
                    ? { ...message, streamingText: message.streamingText + delta }
                    : message,
                ),
              );
              return;
            }

            if (event.type === 'turn.completed') {
              turnState.terminal = true;
              const { id, answer, retrieved_docs } = event;
              setMessages((current) =>
                current.map((message) =>
                  message.key === localKey
                    ? {
                        ...message,
                        recordId: id,
                        answer,
                        status: 'completed',
                        streamingText: '',
                        retrievedDocs: retrieved_docs,
                        note: undefined,
                      }
                    : message,
                ),
              );
              return;
            }

            turnState.terminal = true;
            const { code, message: reason } = event.error;
            setMessages((current) =>
              current.map((message) =>
                message.key === localKey
                  ? {
                      ...message,
                      status: 'failed',
                      note: {
                        message: reason || messageForCode(code),
                        code,
                      },
                    }
                  : message,
              ),
            );
          },
        });

        if (generation !== generationRef.current) return;

        streamingRef.current = false;
        setStreaming(false);

        if (turnState.terminal) {
          void refreshSessions(true);
        } else {
          await settleTurn(sid, generation);
          if (generation === generationRef.current) {
            void watchPending(sid, generation, Date.now() + PENDING_WINDOW_MS);
          }
        }
      } catch (error) {
        if (generation !== generationRef.current) return;

        if (isAbortError(error)) {
          // Deliberate stop / session switch: never an error.
          logger.debug('chat.turn_cancelled', {
            message: 'استریم پرسش به‌دست کاربر یا با تغییر گفتگو لغو شد.',
            operationId,
            route: '/chat/sessions/:id/turns/stream',
            method: 'POST',
            result: 'cancelled',
            errorKind: 'abort',
            errorCode: 'ABORTED',
          });
          markUnanswered();
        } else {
          // streamTurn already reported the failed stream; do not report twice.
          setMessages((current) =>
            current.map((message) =>
              message.key === localKey
                ? {
                    ...message,
                    status: 'failed',
                    note: {
                      message: errorMessage(error),
                      code: error instanceof ApiError ? error.code : undefined,
                    },
                  }
                : message,
            ),
          );
        }
        void refreshSessions(true);
      } finally {
        if (generation === generationRef.current) {
          controllerRef.current = null;
          streamingRef.current = false;
          setStreaming(false);
        }
      }
    },
    [
      bumpAndAbort,
      markUnanswered,
      refreshSessions,
      settleTurn,
      watchPending,
    ],
  );

  const send = useCallback((): void => {
    const question = draft.trim();
    if (!question || streamingRef.current) return;
    void startTurn(question, ensureSession());
  }, [draft, ensureSession, startTurn]);

  const ask = useCallback(
    (question: string): void => {
      const text = question.trim();
      if (!text || streamingRef.current) return;
      void startTurn(text, ensureSession());
    },
    [ensureSession, startTurn],
  );

  const handleNewSession = useCallback((): void => {
    bumpAndAbort();
    setSidebarOpen(false);
    const created = newId();
    sessionIdRef.current = created;
    setSessionId(created);
    writeStorage(SESSION_KEY, created);
    setMessages([]);
    setDraft('');
    setBanner(null);
    setLoadingTurns(false);
    logger.info('session.created', {
      message: 'گفتگوی جدید ساخته شد.',
      result: 'manual',
    });
  }, [bumpAndAbort]);

  const deleteCurrent = useCallback(async (): Promise<void> => {
    const sid = sessionIdRef.current;
    if (!sid) return;

    const confirmed = window.confirm('این گفتگو و همهٔ پیام‌های آن حذف شود؟');
    if (!confirmed) return;

    const operationId = createOperationId();
    try {
      await deleteSession(sid, userIdRef.current, { operationId });
      removeStorage(SESSION_KEY);
      bumpAndAbort();
      sessionIdRef.current = null;
      setSessionId(null);
      setMessages([]);
      setDraft('');
      setLoadingTurns(false);
      await refreshSessions(true);
      logger.info('session.deleted', {
        message: 'گفتگو حذف شد.',
        operationId,
        route: '/chat/sessions/:id',
        method: 'DELETE',
        result: 'deleted',
      });
      showToast('گفتگو حذف شد.');
    } catch (error) {
      if (isAbortError(error)) return;
      // The foreground client request already reported this failure.
      setBanner(errorMessage(error));
    }
  }, [bumpAndAbort, refreshSessions, showToast]);

  const saveIdentity = useCallback(
    (value: string): void => {
      const trimmed = value.trim();
      if (!IDENTITY_PATTERN.test(trimmed)) return;

      bumpAndAbort();
      writeStorage(USER_KEY, trimmed);
      userIdRef.current = trimmed;
      setUserId(trimmed);

      removeStorage(SESSION_KEY);
      sessionIdRef.current = null;
      setSessionId(null);
      setMessages([]);
      setSessions([]);
      setDraft('');
      setBanner(null);
      setLoadingTurns(false);

      logger.info('identity.updated', {
        message: 'شناسهٔ کاربر به‌روزرسانی شد.',
        result: 'updated',
      });
      showToast('شناسهٔ کاربر ذخیره شد.');
      void refreshSessions(true);
    },
    [bumpAndAbort, refreshSessions, showToast],
  );

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    const generation = generationRef.current;

    void (async () => {
      try {
        const result = await listSessions(userIdRef.current);
        if (generation !== generationRef.current) return;
        setSessions(result.items ?? []);
      } catch (error) {
        if (generation === generationRef.current) setBanner(errorMessage(error));
      }

      const saved = readStorage(SESSION_KEY);
      if (saved && generation === generationRef.current) {
        await selectSession(saved);
      }
    })();

    return () => {
      generationRef.current += 1;
      controllerRef.current?.abort();
    };
  }, [selectSession]);

  const activeSession = sessions.find((item) => item.session_id === sessionId) ?? null;
  const title =
    activeSession?.title?.trim() || (sessionId ? 'گفتگوی جدید' : 'دستیار بیمهٔ سامان');
  const canDelete =
    sessionId !== null && sessions.some((item) => item.session_id === sessionId);
  const pendingCount = messages.filter((message) => message.status === 'pending').length;

  return (
    <div className={sidebarOpen ? 'app sidebar-open' : 'app'}>
      <Sidebar
        sessions={sessions}
        activeSessionId={sessionId}
        userId={userId}
        identityInputRef={identityInputRef}
        serviceState={serviceState}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSelect={(target) => {
          setSidebarOpen(false);
          void selectSession(target);
        }}
        onNew={handleNewSession}
        onSaveIdentity={saveIdentity}
      />

      <main className="chat">
        <ChatHeader
          title={title}
          canDelete={canDelete}
          sessionCount={sessions.length}
          messageCount={messages.length}
          pendingCount={pendingCount}
          sidebarOpen={sidebarOpen}
          onOpenSidebar={() => setSidebarOpen(true)}
          onDelete={() => void deleteCurrent()}
        />

        <Banner message={banner} onClose={() => setBanner(null)} />

        <MessageList messages={messages} loading={loadingTurns} onAsk={ask} />

        <Composer
          value={draft}
          busy={streaming}
          onChange={setDraft}
          onSend={send}
        />
      </main>

      <Toast message={toast} />
    </div>
  );
}
