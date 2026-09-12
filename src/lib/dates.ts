export function todayKST(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(now);
}

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addDays(value: string, days: number): string {
  if (!validDate(value)) throw new Error('INVALID_DATE');
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}

export type RelativePeriod = 'today' | 'tomorrow' | 'yesterday' | 'last_month' | 'this_week' | 'next_week' | 'this_month' | 'next_month' | 'soon';
export function dateRange(period: RelativePeriod, today: string) {
  if (!validDate(today)) throw new Error('INVALID_DATE');
  const d = new Date(`${today}T00:00:00Z`);
  if (['today','tomorrow','yesterday'].includes(period)) {
    const day = addDays(today, period === 'tomorrow' ? 1 : period === 'yesterday' ? -1 : 0);
    return { from:day,to:day };
  }
  if (period === 'last_month') return {
    from: new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-1,1)).toISOString().slice(0,10),
    to: addDays(today.slice(0,7)+'-01',-1),
  };
  const endOfWeek = (7 - d.getUTCDay()) % 7;
  if (period === 'soon') return { from: today, to: addDays(today, 7) };
  if (period === 'this_week') return { from: today, to: addDays(today, endOfWeek) };
  if (period === 'next_week')
    return { from: addDays(today, endOfWeek + 1), to: addDays(today, endOfWeek + 7) };
  const nextMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);
  if (period === 'this_month') return { from: today.slice(0, 7) + '-01', to: addDays(nextMonth, -1) };
  const followingMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 2, 1))
    .toISOString()
    .slice(0, 10);
  return { from: nextMonth, to: addDays(followingMonth, -1) };
}
