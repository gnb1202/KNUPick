import { createHash } from 'node:crypto';
export const EVIDENCE_VERSION = 'paragraph-v1';
export const contentHash = (text: string) => createHash('sha256').update(text).digest('hex');
export function needsOCR(body: string | null, images: string[]) {
  return (
    images.length > 0 &&
    ((body?.trim().length ?? 0) < 100 ||
      /(?:포스터|이미지|붙임|첨부)[\s\S]{0,12}(?:참조|참고|확인)/.test(body ?? ''))
  );
}
export function chunkText(text: string): { text: string; start: number; end: number }[] {
  const chunks: { text: string; start: number; end: number }[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + 1000, text.length);
    if (end < text.length) {
      const boundary = text.lastIndexOf('\n', end - 1);
      if (boundary > start + 500) end = boundary + 1;
    }
    if (text.slice(start, end).trim()) chunks.push({ text: text.slice(start, end), start, end });
    if (end === text.length) break;
    start = end - 150;
  }
  return chunks;
}
