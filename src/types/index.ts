// 캠퍼스 타입
export type Campus = 'common' | 'kongju' | 'cheonan' | 'yesan';

// 게시글 타입
export interface Post {
  id: number;
  title: string;
  content: string | null;
  summary: string | null;  // LLM 생성 요약 (200자 이내)
  original_url: string | null;
  posted_date: string | null;
  deadline: string | null;           // 모집/신청 마감일
  event_start_date: string | null;   // 행사/교육/활동 시작일
  event_end_date: string | null;     // 행사/교육/활동 종료일
  activity_types: number[];
  keywords: string[];
  campus: Campus;
  created_at: string;
  updated_at: string;
}

// 학과 타입
export interface Department {
  id: number;
  campus: string;
  college: string;
  name: string;
  keywords: string[];
}

// 활동유형 타입
export interface ActivityType {
  id: number;
  name: string;
  icon?: string;
  keywords: string[];
}

// 필터 상태 타입
export interface FilterState {
  departmentId: number | null;
  activityTypes: number[];
  campus: Campus | null;
}

// API 응답 타입
export interface PostsResponse {
  posts: Post[];
  total: number;
  page: number;
  pageSize: number;
}

// 사용자 프로필 타입
export interface UserProfile {
  id: string;
  username: string;
  nickname: string | null;
  campus: Campus | null;
  department_id: number | null;
  preferred_activity_types: number[];
  custom_keywords: string[];       // 사용자 맞춤 키워드
  excluded_keywords: string[];     // 제외 키워드
  reminder_enabled: boolean;       // 마감 알림 활성화
  reminder_days_before: number;    // 마감 며칠 전 알림
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

// 북마크 타입
export interface Bookmark {
  id: number;
  user_id: string;
  post_id: number;
  created_at: string;
}

// 북마크 포함 게시글 타입
export interface PostWithBookmark extends Post {
  isBookmarked?: boolean;
}

// 게시물 조회 기록 타입
export interface PostView {
  id: number;
  user_id: string;
  post_id: number;
  viewed_at: string;
}

// 게시물 클릭 기록 타입
export interface PostClick {
  id: number;
  user_id: string | null;
  post_id: number;
  clicked_at: string;
}

// 관리자 통계 타입
export interface AdminStats {
  totalPosts: number;
  todayPosts: number;
  totalUsers: number;
  postsWithDeadline: number;
  postsByActivityType: Record<number, number>;
}

// 크롤링 로그 타입
export interface CrawlLog {
  id: number;
  crawled_at: string;
  total_crawled: number;
  new_posts: number;
  llm_analyzed: number;
  status: 'success' | 'failed';
  error_message: string | null;
}
