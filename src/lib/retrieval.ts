export const normalizeSearch = (s: string) =>
  s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

export function lexicalScore(title: string, keywords: string[], query: string): number {
  const q = normalizeSearch(query);
  if (!q) return 0;
  const t = normalizeSearch(title);
  const k = keywords.map(normalizeSearch);
  return (
    (t.includes(q) ? 3 : 0) +
    (k.some((x) => x === q) ? 2 : 0) +
    q.split(' ').filter((word) => `${t} ${k.join(' ')}`.includes(word)).length / q.split(' ').length
  );
}

export function reciprocalRankFusion(lists: number[][], count = 5): number[] {
  const scores = new Map<number, number>();
  for (const list of lists)
    [...new Set(list)]
      .slice(0, 30)
      .forEach((id, i) => scores.set(id, (scores.get(id) ?? 0) + 1 / (60 + i + 1)));
  return [...scores]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, count)
    .map(([id]) => id);
}

export function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] ** 2;
    bb += b[i] ** 2;
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
