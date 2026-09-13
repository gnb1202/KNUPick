import { z } from 'zod';
import type { UsageReport } from './usage-meter';

export const OBSERVATION_VERSION = 'chat-observation-v1';
export const RETENTION_DAYS = 30;
export const CAPTURE_LIMIT_BYTES = 256 * 1024;
export const observationStatusSchema = z.enum(['in_progress', 'completed', 'error', 'cancelled', 'timed_out', 'unknown']);
export type ObservationStatus = z.infer<typeof observationStatusSchema>;
export const observationIdentitySchema = z.object({
  sessionId: z.uuid(), previousRequestId: z.uuid().optional(), consentVersion: z.literal(OBSERVATION_VERSION),
}).strict();
export type ObservationIdentity = z.infer<typeof observationIdentitySchema>;
export type Json = null | string | number | boolean | Json[] | { [key: string]: Json };
export type CallRecord = {
  seq: number; name: string; startedMs: number; durationMs?: number;
  status: 'running' | 'success' | 'error'; input: Json; output?: Json; errorCode?: string;
};
export type ObservationPayload = {
  schemaVersion: typeof OBSERVATION_VERSION; redactionVersion: 'pii-patterns-v1';
  question: string; history: { role: 'user' | 'assistant'; content: string }[];
  versions: Record<string, string>; calls: CallRecord[]; reference: Json;
  search: Json; posts: Json[]; evidence: Json[]; answer: string;
  captureTruncated: boolean; usage: UsageReport | null;
};
export type ObservationWrite = {
  request_id: string; tester_user_id: string; session_id: string; previous_request_id: string | null;
  consent_version: string; started_at: string; status: ObservationStatus;
  revision: number; ended_at: string | null; duration_ms: number | null; first_text_ms: number | null;
  error_code: string | null; payload: ObservationPayload;
};
export type ObservationRow = ObservationWrite & { expires_at: string };

/** Stale, nonterminal rows indicate missing finalization, not successful answers. */
export function effectiveStatus(row: Pick<ObservationRow, 'status' | 'started_at'>, now = Date.now()): ObservationStatus {
  return row.status === 'in_progress' && now - Date.parse(row.started_at) > 300_000 ? 'unknown' : row.status;
}
