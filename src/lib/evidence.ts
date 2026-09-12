// Shared wire type only. This release does not query a v2 evidence index.
export interface Evidence {
  ref: string;
  post_id: number;
  source_key: string;
  kind: 'body' | 'ocr';
  url: string | null;
  text_content: string;
  start_offset: number;
  end_offset: number;
}
