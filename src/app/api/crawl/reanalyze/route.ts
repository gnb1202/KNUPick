import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { crawlPostDetail, closeBrowser, normalizeOriginalUrl } from '@/lib/crawler';
import { analyzeImagePostWithLLM, isLLMEnabled, testVisionModelConnection } from '@/lib/llm';
import { env } from '@/env';

/**
 * 이미지 전용 공지 재분석 API
 * 기존에 "이미지로 작성된 공지입니다" 안내문으로 저장된 게시물을 비전 모델로 재분석
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

  if (!isLLMEnabled() || !(await testVisionModelConnection())) {
    return NextResponse.json({ error: 'Vision model not available' }, { status: 503 });
  }

  try {
    // 특정 ID 지정 시 해당 게시물만 재분석
    const idsParam = request.nextUrl.searchParams.get('ids');
    let query = supabaseAdmin
      .from('posts')
      .select('id, title, original_url');

    if (idsParam) {
      const ids = idsParam.split(',').map(Number).filter(Boolean);
      query = query.in('id', ids);
    } else {
      query = query.or('content.is.null,content.eq.');
    }

    const { data: imagePosts, error } = await query.order('id');

    if (error) throw error;
    if (!imagePosts || imagePosts.length === 0) {
      return NextResponse.json({ message: 'No image-only posts to reanalyze', count: 0 });
    }

    console.log(`재분석 대상: ${imagePosts.length}건`);

    let successCount = 0;

    for (const post of imagePosts) {
      try {
        // original_url에서 layout=unknown 제거하여 원본 URL 복원
        const originalUrl = normalizeOriginalUrl(post.original_url);

        // 상세 페이지 크롤링하여 이미지 URL 추출
        const detail = await crawlPostDetail(originalUrl);
        const imageUrls = detail?.imageUrls || [];

        if (imageUrls.length === 0) {
          console.log(`이미지 없음, 스킵: ${post.title.slice(0, 30)}...`);
          continue;
        }

        // CLOVA OCR + EXAONE 분석
        const result = await analyzeImagePostWithLLM(post.title, imageUrls);
        if (!result) {
          console.log(`비전 분석 실패, 스킵: ${post.title.slice(0, 30)}...`);
          continue;
        }

        // DB 업데이트
        const updateData: Record<string, unknown> = {};
        if (result.summary) updateData.summary = result.summary;
        if (result.activity_types.length > 0) updateData.activity_types = result.activity_types;
        if (result.keywords.length > 0) updateData.keywords = result.keywords;
        if (result.deadline) updateData.deadline = result.deadline;
        if (result.event_start_date) updateData.event_start_date = result.event_start_date;
        if (result.event_end_date) updateData.event_end_date = result.event_end_date;

        if (Object.keys(updateData).length > 0) {
          const { error: updateError } = await supabaseAdmin
            .from('posts')
            .update(updateData)
            .eq('id', post.id);

          if (updateError) {
            console.error(`업데이트 실패 (id: ${post.id}):`, updateError);
          } else {
            successCount++;
            console.log(`재분석 성공: ${post.title.slice(0, 30)}... → ${result.summary?.slice(0, 50)}`);
          }
        }

        // Rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (err) {
        console.error(`재분석 에러 (id: ${post.id}):`, err);
      }
    }

    await closeBrowser();

    return NextResponse.json({
      success: true,
      total: imagePosts.length,
      reanalyzed: successCount,
    });
  } catch (error) {
    await closeBrowser();
    return NextResponse.json({ error: 'Reanalyze failed', details: String(error) }, { status: 500 });
  }
}
