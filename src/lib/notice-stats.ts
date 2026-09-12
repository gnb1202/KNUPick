import { validDate } from './dates';

export interface NoticeStats {
  date: string;
  timeZone: 'Asia/Seoul';
  todayCount: number;
  recentCount: number;
}

export function isNoticeStats(value: unknown): value is NoticeStats {
  if (!value || typeof value !== 'object') return false;
  const stats = value as Partial<NoticeStats>;
  return typeof stats.date === 'string' && validDate(stats.date) &&
    stats.timeZone === 'Asia/Seoul' &&
    Number.isSafeInteger(stats.todayCount) && Number.isSafeInteger(stats.recentCount) &&
    stats.todayCount! >= 0 && stats.recentCount! >= stats.todayCount!;
}

export function noticeDateLabel(date: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long',
  }).format(new Date(`${date}T12:00:00+09:00`));
}
