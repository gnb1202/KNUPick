import * as cheerio from 'cheerio';
import chromium from '@sparticuz/chromium';
import puppeteerCore, { Browser } from 'puppeteer-core';
import { categorizeActivityTypes, extractKeywords, parseDeadline } from './categorizer';
import { APP_CONFIG, CAMPUS_KEYWORDS } from './constants';
import type { Campus } from '@/types';

export interface CrawledPost {
  title: string;
  content: string;
  original_url: string;
  posted_date: string | null;
  deadline: string | null;
  activity_types: number[];
  keywords: string[];
  campus: Campus;
}

const BASE_URL = 'https://www.kongju.ac.kr';

/**
 * 키워드 기반 캠퍼스 추론
 */
function inferCampusFromKeywords(text: string): Campus {
  for (const [campusKey, keywords] of Object.entries(CAMPUS_KEYWORDS)) {
    const hasMatch = keywords.some((keyword) => text.includes(keyword));
    if (hasMatch) {
      return campusKey as Campus;
    }
  }
  return 'common';
}
// 실제 게시판 URL (학생소식란)
const LIST_URL = `${BASE_URL}/bbs/KNU/2132/artclList.do`;

// 로컬 환경 감지 (Vercel 서버리스가 아닌 경우)
const isLocal = !process.env.AWS_LAMBDA_FUNCTION_NAME && !process.env.VERCEL;

// Browser instance for reuse
let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance) {
    if (isLocal) {
      // 로컬 개발 환경: puppeteer 사용
      const puppeteer = await import('puppeteer');
      browserInstance = await puppeteer.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      }) as unknown as Browser;
    } else {
      // Vercel 서버리스 환경: @sparticuz/chromium 사용
      const executablePath = await chromium.executablePath();

      browserInstance = await puppeteerCore.launch({
        args: chromium.args,
        defaultViewport: { width: 1280, height: 720 },
        executablePath,
        headless: true,
      });
    }
  }
  return browserInstance;
}

/**
 * HTTP 요청 (Puppeteer 사용 - 비표준 서버 응답 처리)
 */
async function fetchHtml(url: string): Promise<string> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.goto(url, { waitUntil: 'networkidle0', timeout: APP_CONFIG.CRAWLER.PAGE_TIMEOUT });
    const html = await page.content();
    return html;
  } finally {
    await page.close();
  }
}

/**
 * Browser 정리
 */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

/**
 * 학생소식란 목록 페이지 크롤링
 */
export async function crawlPostList(page: number = 1): Promise<{ posts: CrawledPost[]; hasMore: boolean }> {
  try {
    const url = `${LIST_URL}?page=${page}`;
    console.log(`Crawling page ${page}: ${url}`);

    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    const posts: CrawledPost[] = [];

    // 공주대 학생소식란 테이블 구조
    // table.board-table.horizon1 tbody tr
    const rows = $('table.board-table tbody tr');
    console.log(`Found ${rows.length} rows`);

    rows.each((_, element) => {
      try {
        const $row = $(element);

        // 제목과 링크 추출 (td.td-subject 안의 a 태그)
        const $titleLink = $row.find('td.td-subject a').first();

        // 전체 제목 텍스트 (카테고리 포함)
        const fullTitleText = $titleLink.text().trim();

        // 캠퍼스 정보 추출 [공통], [Kongju:공주], [Cheonan:천안], [Yesan:예산]
        let campus: Campus = 'common';
        const campusMatch = fullTitleText.match(/\[(공통|Kongju:공주|Cheonan:천안|Yesan:예산)\]/);
        if (campusMatch) {
          const campusTag = campusMatch[1];
          if (campusTag === 'Kongju:공주') campus = 'kongju';
          else if (campusTag === 'Cheonan:천안') campus = 'cheonan';
          else if (campusTag === 'Yesan:예산') campus = 'yesan';
          else campus = 'common';
        }

        // 태그가 없거나 공통인 경우, 키워드 기반으로 캠퍼스 추론
        if (campus === 'common') {
          campus = inferCampusFromKeywords(fullTitleText);
        }

        // strong 태그에서 실제 제목 텍스트 추출
        let title = $titleLink.find('strong').text().trim();
        if (!title) {
          title = fullTitleText;
        }

        // 카테고리 제거 [공통], [Kongju:공주] 등
        title = title.replace(/^\s*\[.*?\]\s*/, '').trim();
        // "새글" 텍스트 제거
        title = title.replace(/새글$/, '').trim();

        const href = $titleLink.attr('href');

        if (!title || !href) {
          console.log('Skipping row - no title or href');
          return;
        }

        // 상대 경로를 절대 경로로 변환
        const original_url = href.startsWith('http') ? href : `${BASE_URL}${href}`;

        // 날짜 추출 (td.td-date)
        const dateText = $row.find('td.td-date').text().trim();
        const posted_date = parseDateString(dateText);

        // 활동유형 분류
        const activity_types = categorizeActivityTypes(title, '');

        // 키워드 추출
        const keywords = extractKeywords(title, '');

        // 마감일 파싱
        const deadline = parseDeadline(title);

        posts.push({
          title,
          content: '',
          original_url,
          posted_date,
          deadline,
          activity_types,
          keywords,
          campus,
        });

        console.log(`Parsed [${campus}]: ${title.substring(0, 50)}...`);
      } catch (err) {
        console.error('Row parsing error:', err);
      }
    });

    // 다음 페이지 존재 여부 확인
    const totalPosts = parseInt($('.util-search strong').text().trim()) || 0;
    // 페이지당 실제 항목 수로 계산한다. 10으로 하드코딩돼 있었는데
    // 목록은 12건씩 내려와서 진행 추정이 어긋나 있었다.
    const hasMore = posts.length > 0 && page * posts.length < totalPosts;

    console.log(`Page ${page}: Found ${posts.length} posts, hasMore: ${hasMore}`);
    return { posts, hasMore };
  } catch (error) {
    console.error('Crawl error:', error);
    return { posts: [], hasMore: false };
  }
}

/**
 * 게시글 상세 페이지 크롤링
 */
export async function crawlPostDetail(url: string): Promise<{ content: string; deadline: string | null; shortUrl: string | null; imageUrls: string[] } | null> {
  try {
    console.log(`Crawling detail: ${url}`);
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    // 본문 내용 추출 (공주대 게시판 구조: div.view-con)
    const content = $('.view-con')
      .text()
      .trim()
      .replace(/\s+/g, ' ');

    // 본문 이미지 URL 추출
    const imageUrls: string[] = [];
    $('.view-con img').each((_, el) => {
      const src = $(el).attr('src');
      if (src) {
        const absoluteUrl = src.startsWith('http') ? src : `${BASE_URL}${src}`;
        imageUrls.push(absoluteUrl);
      }
    });

    // 마감일 재파싱
    const deadline = parseDeadline(content);

    // 단축 URL 생성 (layout=unknown 파라미터 추가)
    const shortUrl = url.includes('?')
      ? `${url}&layout=unknown`
      : `${url}?layout=unknown`;

    console.log(`Detail content length: ${content.length}, images: ${imageUrls.length}, shortUrl: ${shortUrl}`);
    return { content, deadline, shortUrl, imageUrls };
  } catch (error) {
    console.error('Detail crawl error:', error);
    return null;
  }
}

/**
 * 날짜 문자열 파싱
 */
function parseDateString(dateStr: string): string | null {
  if (!dateStr) return null;

  // YYYY.MM.DD, YYYY-MM-DD, YYYY/MM/DD 형식
  const match = dateStr.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
  if (match) {
    const [, year, month, day] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // MM.DD 형식 (현재 연도)
  const shortMatch = dateStr.match(/(\d{1,2})[.\-\/](\d{1,2})/);
  if (shortMatch) {
    const year = new Date().getFullYear();
    const [, month, day] = shortMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  return null;
}

/**
 * 전체 크롤링 실행 (여러 페이지)
 */
export async function crawlAllPosts(maxPages: number = APP_CONFIG.CRAWLER.MAX_PAGES): Promise<CrawledPost[]> {
  const allPosts: CrawledPost[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const { posts, hasMore } = await crawlPostList(page);
    allPosts.push(...posts);

    if (!hasMore) break;

    // Rate limiting
    await new Promise((resolve) => setTimeout(resolve, APP_CONFIG.CRAWLER.RATE_LIMIT_DELAY));
  }

  return allPosts;
}

/**
 * DB original_url을 비교 가능한 정규화 형태로 변환.
 *
 * crawlPostDetail이 항상 ?layout=unknown(또는 &layout=unknown)을 붙여 저장하기 때문에,
 * 목록 페이지에서 추출한 단순 URL과 직접 비교하면 100% miss가 발생한다.
 * 이 함수는 layout=unknown 파라미터만 제거해 양쪽을 같은 키 공간으로 정규화한다.
 *
 * 다른 query string은 보존한다 (학교가 향후 ?artclNo= 등을 추가할 경우 안전).
 *
 * @example
 *   normalizeOriginalUrl('https://x.kr/a/artclView.do?layout=unknown')        → 'https://x.kr/a/artclView.do'
 *   normalizeOriginalUrl('https://x.kr/a?page=2&layout=unknown')               → 'https://x.kr/a?page=2'
 *   normalizeOriginalUrl('https://x.kr/a?layout=unknown&page=2')               → 'https://x.kr/a?page=2'
 *   normalizeOriginalUrl('https://x.kr/a/artclView.do')                        → 'https://x.kr/a/artclView.do'
 */
export function normalizeOriginalUrl(url: string | null | undefined): string {
  if (!url) return '';
  return url
    .replace(/([?&])layout=unknown(&|$)/g, (_, pre, post) => (post === '&' ? pre : ''))
    .replace(/[?&]$/, '');
}
