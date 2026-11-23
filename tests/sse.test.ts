import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { streamTurn } from '../src/api/sse';

/**
 * The stream endpoint must be hit once per turn. These tests pin the
 * transport-level guard: a second call for a session that already has an open
 * stream resolves without a second fetch.
 */

interface OpenStream {
  response: Response;
  close: () => void;
}

function openStream(): OpenStream {
  let close: () => void = () => undefined;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        new TextEncoder().encode(
          'event: turn.completed\ndata: {"id":"turn-1","answer":"ok"}\n\n',
        ),
      );
      close = () => controller.close();
    },
  });
  return {
    response: new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    }),
    close,
  };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  // The shared logger prints to the console in development; keep test output clean.
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('streamTurn single-flight', () => {
  it('ignores a second request for a session whose stream is still open', async () => {
    const { response, close } = openStream();
    const fetchMock = vi.fn(async () => response);
    vi.stubGlobal('fetch', fetchMock);

    const events: string[] = [];
    const first = streamTurn({
      sessionId: 'session-1',
      question: 'first',
      userId: 'user-1',
      onEvent: (event) => events.push(event.type),
    });

    await flush(); // let the first call reach the read loop

    await streamTurn({
      sessionId: 'session-1',
      question: 'second',
      userId: 'user-1',
      onEvent: (event) => events.push(event.type),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    close();
    await first;

    expect(events).toEqual(['turn.completed']);
  });

  it('opens a stream for another session in parallel', async () => {
    const first = openStream();
    const second = openStream();
    const fetchMock = vi.fn(async () => first.response);
    fetchMock.mockResolvedValueOnce(first.response);
    fetchMock.mockResolvedValueOnce(second.response);
    vi.stubGlobal('fetch', fetchMock);

    const runA = streamTurn({
      sessionId: 'session-a',
      question: 'a',
      userId: 'user-1',
      onEvent: () => undefined,
    });
    await flush();
    const runB = streamTurn({
      sessionId: 'session-b',
      question: 'b',
      userId: 'user-1',
      onEvent: () => undefined,
    });
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(2);

    first.close();
    second.close();
    await Promise.all([runA, runB]);
  });
});
