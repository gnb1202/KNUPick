import { env } from '@/env';
import { z } from 'zod';
import { observationIdentitySchema, type ObservationIdentity, type ObservationRow, type ObservationWrite } from './chat-observation-types';

export class ObservationHttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
export function privateJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Authorization' } });
}
export function observationError(error: unknown) {
  return error instanceof ObservationHttpError
    ? privateJson({ code: error.code, error: error.message }, error.status)
    : privateJson({ code: 'OBSERVATION_UNAVAILABLE', error: '실행 기록을 처리하지 못했어요. 잠시 후 다시 시도해주세요.' }, 503);
}
// Lazy import keeps ordinary, non-observed chat independent of this storage path.
export async function observationDb() {
  const { supabaseAdmin } = await import('./supabase');
  if (!supabaseAdmin) throw new ObservationHttpError(503, 'DATABASE_UNAVAILABLE', '기록 저장소를 사용할 수 없어요.');
  return supabaseAdmin;
}
export const captureEnabled = () => env.CHAT_OBSERVABILITY_MODE === 'testers';
export async function requireTester(request: Request, writing = false): Promise<string> {
  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) throw new ObservationHttpError(401, 'AUTH_REQUIRED', '로그인이 필요해요.');
  const db = await observationDb();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let result: Awaited<ReturnType<typeof db.auth.getUser>>;
  try {
    result = await Promise.race([db.auth.getUser(token), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ObservationHttpError(503, 'AUTH_UNAVAILABLE', '로그인 확인이 지연되고 있어요. 다시 시도해주세요.')), 3000);
    })]);
  } finally { clearTimeout(timer); }
  const { data, error } = result;
  if (error || !data.user || data.user.is_anonymous) throw new ObservationHttpError(401, 'INVALID_TOKEN', '로그인을 다시 확인해주세요.');
  const allowed = (env.CHAT_OBSERVER_USER_IDS ?? '').split(',').map(id => id.trim()).filter(Boolean);
  if (!allowed.includes(data.user.id)) throw new ObservationHttpError(403, 'TESTER_REQUIRED', '허용된 테스트 계정만 사용할 수 있어요.');
  if (writing && !captureEnabled()) throw new ObservationHttpError(403, 'CAPTURE_DISABLED', '현재 대화 기록이 꺼져 있어요.');
  return data.user.id;
}
export function requestObservationIdentity(request: Request): ObservationIdentity | null {
  const consent = request.headers.get('x-chat-observation');
  if (consent === null) return null;
  const parsed = observationIdentitySchema.safeParse({ consentVersion: consent,
    sessionId: request.headers.get('x-chat-session-id'), previousRequestId: request.headers.get('x-chat-previous-request-id') ?? undefined });
  if (!parsed.success) throw new ObservationHttpError(400, 'INVALID_OBSERVATION', '테스트 대화를 새로 시작해주세요.');
  return parsed.data;
}
export async function ownedObservation(userId: string, requestId: string): Promise<ObservationRow> {
  if (!z.uuid().safeParse(requestId).success) throw new ObservationHttpError(404, 'NOT_FOUND', '기록을 찾을 수 없어요.');
  const db = await observationDb();
  const { data, error } = await db.from('chat_observations').select('*').eq('request_id', requestId)
    .eq('tester_user_id', userId).gt('expires_at', new Date().toISOString())
    .abortSignal(AbortSignal.timeout(3000)).maybeSingle();
  if (error) throw new ObservationHttpError(503, 'READ_FAILED', '기록을 불러오지 못했어요.');
  if (!data) throw new ObservationHttpError(404, 'NOT_FOUND', '기록을 찾을 수 없어요.');
  return data as ObservationRow;
}
export async function validateObservationParent(userId: string, identity: ObservationIdentity) {
  if (!identity.previousRequestId) return;
  const parent = await ownedObservation(userId, identity.previousRequestId);
  if (parent.session_id !== identity.sessionId) throw new ObservationHttpError(400, 'INVALID_OBSERVATION_PARENT', '테스트 대화 연결이 올바르지 않아요.');
}
export async function writeObservation(record: ObservationWrite) {
  const db = await observationDb();
  const { error } = await db.rpc('save_chat_observation', { p_record: record }).abortSignal(AbortSignal.timeout(1500));
  if (error) throw new Error('CAPTURE_WRITE_FAILED');
}
export async function observationWriteLimit(userId: string) {
  const { checkRateLimit } = await import('./rate-limit');
  if (!(await checkRateLimit(`chat-observation-write:${userId}`, 30, 60_000)).ok)
    throw new ObservationHttpError(429, 'RATE_LIMITED', '잠시 후 다시 저장해주세요.');
}
