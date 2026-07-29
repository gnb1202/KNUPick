import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { crawlAllPosts, crawlPostDetail, closeBrowser, normalizeOriginalUrl } from '@/lib/crawler';
import { categorizeActivityTypes, extractKeywords, parseDeadline } from '@/lib/categorizer';
import { analyzePostWithLLM, analyzeImagePostWithLLM, isLLMEnabled, testLLMConnection, testVisionModelConnection } from '@/lib/llm';
import { buildEmbeddingText, generateEmbedding, EMBEDDING_MODEL_ID } from '@/lib/embeddings';
import { APP_CONFIG } from '@/lib/constants';
import { env } from '@/env';

// 관리자 권한 확인 함수
async function checkAdminAuth(request: NextRequest): Promise<boolean> {
  const userId = request.headers.get('x-user-id');
  if (!userId || !supabaseAdmin) return false;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .single();

  return profile?.is_admin === true;
}

// Vercel Cron 또는 수동 트리거용
export async function GET(request: NextRequest) {
  // CRON_SECRET 또는 관리자 인증 확인
  const authHeader = request.headers.get('authorization');
  const cronSecret = env.CRON_SECRET;
  const isCronAuth = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const isAdminAuth = await checkAdminAuth(request);

  if (!isCronAuth && !isAdminAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Supabase 미연결 시 에러
  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: 'Database not configured', message: 'Supabase credentials are missing' },
      { status: 503 }
    );
  }

  const startTime = Date.now();

  try {
    console.log('Starting crawl...');

    // LLM 연결 상태 확인
    const llmAvailable = isLLMEnabled() && await testLLMConnection();
    const visionAvailable = llmAvailable && await testVisionModelConnection();
    console.log(`LLM 사용: ${llmAvailable ? '활성화' : '비활성화 (키워드 방식 사용)'}`);
    console.log(`비전 모델: ${visionAvailable ? '활성화' : '비활성화 (이미지 공지 스킵)'}`);

    // 기존 게시글 URL 목록 가져오기 (중복 방지)
    // DB에는 historically ?layout=unknown suffix 있는 행과 없는 행이 섞여 있음.
    // crawlPostDetail이 항상 ?layout=unknown을 추가하므로 정규화로 비교 키 공간 통일.
    const { data: existingPosts } = await supabaseAdmin
      .from('posts')
      .select('original_url');

    const existingUrls = new Set(
      (existingPosts ?? [])
        .map((p) => normalizeOriginalUrl(p.original_url))
        .filter(Boolean)
    );

    // 크롤링 실행 (10페이지)
    // ?pages=N 으로 조정 가능. 기본값은 정기 실행 기준(MAX_PAGES)이고,
    // 오래 안 돌려서 과거 구간이 비었을 때만 크게 올려 메운다.
    // 목록 페이지만 더 읽는 비용이라 이미 있는 글은 dedupe에서 걸러진다.
    const pagesParam = parseInt(request.nextUrl.searchParams.get('pages') || '', 10);
    const maxPages =
      Number.isInteger(pagesParam) && pagesParam > 0 && pagesParam <= APP_CONFIG.CRAWLER.MAX_PAGES_LIMIT
        ? pagesParam
        : APP_CONFIG.CRAWLER.MAX_PAGES;

    console.log(`크롤링 페이지 수: ${maxPages}`);
    const crawledPosts = await crawlAllPosts(maxPages);

    // 새 게시글만 필터링 (정규화된 URL로 비교)
    const newPosts = crawledPosts.filter(
      (post) => !existingUrls.has(normalizeOriginalUrl(post.original_url))
    );

    const skippedExisting = crawledPosts.length - newPosts.length;
    console.log(
      `Found ${crawledPosts.length} posts, ${newPosts.length} new, ${skippedExisting} already in DB`
    );

    // 상세 페이지 크롤링 및 DB 저장
    const results = [];
    let llmSuccessCount = 0;

    for (const post of newPosts) {
      try {
        // 상세 페이지에서 추가 정보 가져오기
        const detail = await crawlPostDetail(post.original_url);
        const fullContent = detail?.content || post.content;

        // 단축 URL 결정 (DB 저장용 + 2차 dedupe용)
        const finalUrl = detail?.shortUrl || post.original_url;

        // 2차 dedupe: detail 후 ?layout=unknown 붙은 URL을 정규화하여 한 번 더 체크.
        // 1차에서 막혔어야 정상이지만, 미래에 URL 변형 로직이 바뀌어도 LLM 분석 전에 걸러주는 안전망.
        if (existingUrls.has(normalizeOriginalUrl(finalUrl))) {
          console.log(`2차 dedupe로 스킵: ${post.title.slice(0, 30)}...`);
          continue;
        }

        // 기본값: 기존 키워드 방식
        let activity_types = categorizeActivityTypes(post.title, fullContent);
        let keywords = extractKeywords(post.title, fullContent);
        let deadline = detail?.deadline || post.deadline || parseDeadline(`${post.title} ${fullContent}`);
        let summary: string | null = null;
        let event_start_date: string | null = null;
        let event_end_date: string | null = null;

        // 이미지 공지 체크 (content가 비어있는 경우)
        const isImageOnly = !fullContent || fullContent.trim().length === 0;
        const imageUrls = detail?.imageUrls || [];

        // LLM 분석 시도
        if (llmAvailable) {
          try {
            let llmResult = null;

            if (isImageOnly && visionAvailable && imageUrls.length > 0) {
              // 이미지 공지 → CLOVA OCR + EXAONE 분석
              console.log(`이미지 공지 OCR 분석 시도 (${imageUrls.length}장): ${post.title.slice(0, 30)}...`);
              llmResult = await analyzeImagePostWithLLM(post.title, imageUrls);
            } else if (!isImageOnly) {
              // 텍스트 공지 → 기존 텍스트 분석
              llmResult = await analyzePostWithLLM(post.title, fullContent);
            }

            if (llmResult) {
              if (llmResult.summary) summary = llmResult.summary;
              if (llmResult.activity_types.length > 0) activity_types = llmResult.activity_types;
              if (llmResult.keywords.length > 0) keywords = llmResult.keywords;
              if (llmResult.deadline) deadline = llmResult.deadline;
              if (llmResult.event_start_date) event_start_date = llmResult.event_start_date;
              if (llmResult.event_end_date) event_end_date = llmResult.event_end_date;

              llmSuccessCount++;
              console.log(`${isImageOnly ? '비전' : 'LLM'} 분석 성공: ${post.title.slice(0, 30)}...`);
            }
          } catch (llmError) {
            console.error('LLM 분석 실패, 키워드 방식 사용:', llmError);
          }
        }

        // 이미지 공지인데 분석 실패한 경우 안내 문구 설정
        if (isImageOnly && !summary) {
          summary = '이미지로 작성된 공지입니다. 원문에서 상세 내용을 확인하세요.';
        }

        const { data, error } = await supabaseAdmin.from('posts').insert({
          title: post.title,
          content: fullContent,
          summary,
          original_url: finalUrl,
          posted_date: post.posted_date,
          deadline,
          event_start_date,
          event_end_date,
          activity_types,
          keywords,
          campus: post.campus,
        }).select();

        if (error) {
          // 23505 = unique_violation. dedupe가 누락한 케이스의 마지막 안전망이며,
          // 정상적으로는 dedupe에서 막혀야 하므로 노이즈로 다루지 않고 INFO로 격하.
          // 다른 에러 코드는 그대로 ERROR로 보고.
          if ((error as { code?: string }).code === '23505') {
            console.log(
              `Insert skipped (dedupe missed, unique conflict): ${post.title.slice(0, 30)}...`
            );
          } else {
            console.error('Insert error:', error);
          }
        } else {
          results.push(data);

          // 임베딩 생성 (OpenAI 사용 가능 시)
          if (data && data[0]) {
            try {
              const embedding = await generateEmbedding(
                buildEmbeddingText({
                  title: post.title,
                  summary,
                  content: fullContent,
                  keywords,
                  activity_types,
                  campus: post.campus,
                  deadline,
                  event_start_date,
                })
              );
              if (embedding) {
                await supabaseAdmin
                  .from('posts')
                  .update({
                    embedding: JSON.stringify(embedding),
                    embedding_model: EMBEDDING_MODEL_ID,
                  })
                  .eq('id', data[0].id);
              }
            } catch (embErr) {
              console.error('임베딩 생성 실패:', embErr);
            }
          }

          // 학과 매핑 생성 (post_department_relevance)
          if (data && data[0]) {
            const postId = data[0].id;
            const postKeywords = keywords || [];
            const postTitle = post.title.toLowerCase();

            // 학과 목록 조회하여 키워드 매칭
            const { data: departments } = await supabaseAdmin
              .from('departments')
              .select('id, keywords');

            if (departments) {
              const relevanceData = departments
                .filter(dept => {
                  if (!dept.keywords || dept.keywords.length === 0) return false;
                  // 키워드 매칭 확인
                  return dept.keywords.some((kw: string) =>
                    postKeywords.some((pk: string) => pk.toLowerCase().includes(kw.toLowerCase())) ||
                    postTitle.includes(kw.toLowerCase())
                  );
                })
                .map(dept => ({
                  post_id: postId,
                  department_id: dept.id,
                  matched_keywords: dept.keywords.filter((kw: string) =>
                    postKeywords.some((pk: string) => pk.toLowerCase().includes(kw.toLowerCase())) ||
                    postTitle.includes(kw.toLowerCase())
                  ),
                }));

              if (relevanceData.length > 0) {
                await supabaseAdmin.from('post_department_relevance').insert(relevanceData);
              }
            }
          }
        }

        // Rate limiting
        await new Promise((resolve) => setTimeout(resolve, APP_CONFIG.CRAWLER.DETAIL_DELAY));
      } catch (err) {
        console.error('Post processing error:', err);
      }
    }

    // 브라우저 정리
    await closeBrowser();

    const durationMs = Date.now() - startTime;

    // 크롤링 로그 저장
    await supabaseAdmin.from('crawl_logs').insert({
      total_crawled: crawledPosts.length,
      new_posts: newPosts.length,
      llm_analyzed: llmSuccessCount,
      status: 'success',
      duration_ms: durationMs,
    });

    return NextResponse.json({
      success: true,
      crawled: crawledPosts.length,
      newPosts: newPosts.length,
      inserted: results.length,
      llmAnalyzed: llmSuccessCount,
      llmEnabled: llmAvailable,
      visionEnabled: visionAvailable,
      durationMs,
    });
  } catch (error) {
    console.error('Crawl API error:', error);
    // 에러 시에도 브라우저 정리
    await closeBrowser();

    const durationMs = Date.now() - startTime;

    // 실패 로그 저장
    await supabaseAdmin?.from('crawl_logs').insert({
      total_crawled: 0,
      new_posts: 0,
      llm_analyzed: 0,
      status: 'failed',
      error_message: String(error),
      duration_ms: durationMs,
    });

    return NextResponse.json(
      { error: 'Crawl failed', details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // POST도 같은 로직 사용 (수동 트리거용)
  return GET(request);
}
