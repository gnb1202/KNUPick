import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { searchPlanSchema, SearchPlan } from './search-plan';
const payloadSchema = z.object({
  version: z.literal(1),
  expires: z.number(),
  ids: z.array(z.number().int().positive()).max(20),
  plan: searchPlanSchema,
});
export function signContext(ids: number[], plan: SearchPlan, secret: string, now = Date.now()) {
  if (secret.length < 32) throw new Error('CONTEXT_SECRET_REQUIRED');
  const value = Buffer.from(
    JSON.stringify({
      version: 1,
      expires: now + 3_600_000,
      ids,
      plan: { ...plan, inherit_previous: false, reference_index: undefined, reference_indices: undefined },
    })
  ).toString('base64url');
  return `${value}.${createHmac('sha256', secret).update(value).digest('base64url')}`;
}
export function verifyContext(token: string, secret: string, now = Date.now()) {
  if (token.length > 12000 || secret.length < 32) throw new Error('INVALID_CONTEXT');
  const [payload, sig, ...extra] = token.split('.');
  if (!payload || !sig || extra.length) throw new Error('INVALID_CONTEXT');
  const expected = createHmac('sha256', secret).update(payload).digest();
  const actual = Buffer.from(sig, 'base64url');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    throw new Error('INVALID_CONTEXT');
  const value = payloadSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString()));
  if (value.expires <= now) throw new Error('EXPIRED_CONTEXT');
  return value;
}

export function validReferences(text: string, count: number, evidenceIds: Set<string>) {
  for (const m of text.matchAll(/\[#(\d+)\]/g))
    if (Number(m[1]) < 1 || Number(m[1]) > count) return false;
  for (const m of text.matchAll(/\[(E\d+)\]/g)) if (!evidenceIds.has(m[1])) return false;
  return true;
}
