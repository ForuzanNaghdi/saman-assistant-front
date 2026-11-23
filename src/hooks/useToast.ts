import { useCallback, useEffect, useRef, useState } from 'react';

const TOAST_DURATION_MS = 3200;

export function useToast(): { message: string | null; show: (text: string) => void } {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const show = useCallback((text: string) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setMessage(text);
    timerRef.current = window.setTimeout(() => {
      setMessage(null);
      timerRef.current = null;
    }, TOAST_DURATION_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  return { message, show };
}
