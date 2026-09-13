import { captureEnabled, requireTester, privateJson, observationError } from '@/lib/chat-observation-store';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try { await requireTester(request); return privateJson({ canRead: true, canRecord: captureEnabled() }); }
  catch (error) { return observationError(error); }
}
