import { timingSafeEqual } from 'node:crypto';
import { env } from '@/env';
import { observationDb, privateJson, observationError } from '@/lib/chat-observation-store';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  const received = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  if (!env.CRON_SECRET || received.length !== expected.length || !timingSafeEqual(received, expected))
    return privateJson({ error: 'Unauthorized' }, 401);
  try {
    const db = await observationDb();
    const { error, count } = await db.from('chat_observations').delete({ count: 'exact' })
      .lte('expires_at', new Date().toISOString()).abortSignal(AbortSignal.timeout(10_000));
    if (error) throw new Error('PURGE_FAILED');
    return privateJson({ deleted: count ?? 0 });
  } catch (error) { return observationError(error); }
}
