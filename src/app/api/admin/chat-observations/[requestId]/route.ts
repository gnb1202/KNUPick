import { requireTester, ownedObservation, privateJson, observationError } from '@/lib/chat-observation-store';
import { effectiveStatus } from '@/lib/chat-observation-types';
export const runtime = 'nodejs';
export async function GET(request: Request, context: { params: Promise<{ requestId: string }> }) {
  try {
    const userId = await requireTester(request);
    const row = await ownedObservation(userId, (await context.params).requestId);
    return privateJson({ ...row, effective_status: effectiveStatus(row) });
  } catch (error) { return observationError(error); }
}
