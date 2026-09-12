'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isNoticeStats, type NoticeStats } from '@/lib/notice-stats';

export function useNoticeStats() {
  const [stats, setStats] = useState<NoticeStats | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const requestRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    try {
      const response = await fetch('/api/posts/stats', { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Stats unavailable');
      const data: unknown = await response.json();
      if (!isNoticeStats(data)) throw new Error('Invalid stats');
      if (controller.signal.aborted) return;
      setStats(data);
      setError(false);
    } catch {
      if (controller.signal.aborted) return;
      setStats(null);
      setError(true);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const refreshVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    // Recheck the server's Korean date across midnight and when returning to the tab.
    const interval = window.setInterval(refreshVisible, 60_000);
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      requestRef.current?.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [refresh]);

  return { stats, error, loading, refresh };
}
