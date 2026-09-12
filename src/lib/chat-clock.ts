import { env } from '@/env';
import { todayKST, validDate } from './dates';
export function chatDate() {
  if (env.EVALUATION_AS_OF && process.env.NODE_ENV !== 'production') {
    if (!validDate(env.EVALUATION_AS_OF)) throw new Error('INVALID_EVALUATION_DATE');
    return env.EVALUATION_AS_OF;
  }
  return todayKST();
}
