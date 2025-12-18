import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { crawlAllPosts, crawlPostDetail, closeBrowser } from '@/lib/crawler';
import { categorizeActivityTypes, extractKeywords, parseDeadline } from '@/lib/categorizer';
import { analyzePostWithLLM, isLLMEnabled, testLLMConnection } from '@/lib/llm';
import { APP_CONFIG } from '@/lib/constants';

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
  const cronSecret = process.env.CRON_SECRET;
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
    console.log(`LLM 사용: ${llmAvailable ? '활성화' : '비활성화 (키워드 방식 사용)'}`);

    // 기존 게시글 URL 목록 가져오기 (중복 방지)
    const { data: existingPosts } = await supabaseAdmin
      .from('posts')
      .select('original_url');

    const existingUrls = new Set(existingPosts?.map((p) => p.original_url) || []);

    // 크롤링 실행 (10페이지)
    const crawledPosts = await crawlAllPosts(10);

    // 새 게시글만 필터링
    const newPosts = crawledPosts.filter((post) => !existingUrls.has(post.original_url));

    console.log(`Found ${crawledPosts.length} posts, ${newPosts.length} are new`);

    // 상세 페이지 크롤링 및 DB 저장
    const results = [];
    let llmSuccessCount = 0;

    for (const post of newPosts) {
      try {
        // 상세 페이지에서 추가 정보 가져오기
        const detail = await crawlPostDetail(post.original_url);
        const fullContent = detail?.content || post.content;

        // 기본값: 기존 키워드 방식
        let activity_types = categorizeActivityTypes(post.title, fullContent);
        let keywords = extractKeywords(post.title, fullContent);
        let deadline = detail?.deadline || post.deadline || parseDeadline(`${post.title} ${fullContent}`);
        let summary: string | null = null;
        let event_start_date: string | null = null;
        let event_end_date: string | null = null;

        // 이미지 공지 체크 (content가 비어있는 경우)
        const isImageOnly = !fullContent || fullContent.trim().length === 0;

        // LLM 분석 시도 (이미지 공지가 아닌 경우만)
        if (llmAvailable && !isImageOnly) {
          try {
            const llmResult = await analyzePostWithLLM(post.title, fullContent);

            if (llmResult) {
              // LLM 결과가 있으면 사용 (없는 항목은 기존 방식 유지)
              if (llmResult.summary) summary = llmResult.summary;
              if (llmResult.activity_types.length > 0) activity_types = llmResult.activity_types;
              if (llmResult.keywords.length > 0) keywords = llmResult.keywords;
              if (llmResult.deadline) deadline = llmResult.deadline;
              if (llmResult.event_start_date) event_start_date = llmResult.event_start_date;
              if (llmResult.event_end_date) event_end_date = llmResult.event_end_date;

              llmSuccessCount++;
              console.log(`LLM 분석 성공: ${post.title.slice(0, 30)}...`);
            }
          } catch (llmError) {
            console.error('LLM 분석 실패, 키워드 방식 사용:', llmError);
          }
        }

        // 이미지 공지인 경우 안내 문구 설정
        if (isImageOnly) {
          summary = '이미지로 작성된 공지입니다. 원문에서 상세 내용을 확인하세요.';
        }

        // 단축 URL이 있으면 사용, 없으면 기존 URL 사용
        const finalUrl = detail?.shortUrl || post.original_url;

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
          console.error('Insert error:', error);
        } else {
          results.push(data);

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
