import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  buildEmbeddingText,
  generateEmbeddingsBatch,
  EMBEDDING_MODEL_ID,
} from '@/lib/embeddings';
import { env } from '@/env';

// 공급자(OpenAI/Ollama) 양쪽에서 안전한 크기. 시퀀셜로 처리한다.
const BATCH_SIZE = 16;

/**
 * 기존 게시물에 임베딩을 일괄 생성한다.
 * - embedding이 NULL인 게시물만 대상
 * - ?limit=N 으로 한 번에 처리할 최대 개수 제한 가능 (기본 500)
 * - ?force=true 면 모든 게시물 재생성
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '500', 10);
  const force = request.nextUrl.searchParams.get('force') === 'true';

  let query = supabaseAdmin
    .from('posts')
    .select('id, title, summary, content, keywords, activity_types, campus, deadline, event_start_date')
    .order('id', { ascending: false })
    .limit(limit);

  if (!force) {
    query = query.is('embedding', null);
  }

  const { data: posts, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Fetch failed', details: error.message }, { status: 500 });
  }

  if (!posts || posts.length === 0) {
    return NextResponse.json({ message: 'No posts to embed', count: 0 });
  }

  console.log(`임베딩 백필 시작: ${posts.length}건`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE);
    const texts = batch.map((p) => buildEmbeddingText(p));

    const embeddings = await generateEmbeddingsBatch(texts);

    for (let j = 0; j < batch.length; j++) {
      const post = batch[j];
      const embedding = embeddings[j];

      if (!embedding) {
        failCount++;
        continue;
      }

      const { error: updateError } = await supabaseAdmin
        .from('posts')
        .update({
          embedding: JSON.stringify(embedding),
          embedding_model: EMBEDDING_MODEL_ID,
        })
        .eq('id', post.id);

      if (updateError) {
        console.error(`임베딩 저장 실패 (id: ${post.id}):`, updateError);
        failCount++;
      } else {
        successCount++;
      }
    }

    console.log(`진행: ${Math.min(i + BATCH_SIZE, posts.length)}/${posts.length}`);
  }

  return NextResponse.json({
    success: true,
    total: posts.length,
    embedded: successCount,
    failed: failCount,
  });
}
