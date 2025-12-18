import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// service_role 키로 클라이언트 생성 - DB 관리자 권한
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  db: { schema: 'public' },
  auth: { persistSession: false }
});

async function migrateProfiles() {
  console.log('Migrating profiles table...\n');

  // Postgres 함수를 사용해서 SQL 실행 시도
  // 먼저 기존 email 컬럼 확인
  const { data: emailCheck, error: emailError } = await supabase
    .from('profiles')
    .select('email')
    .limit(1);

  if (!emailError) {
    console.log('Found email column - table has old structure');
    console.log('\n⚠ Supabase REST API cannot run DDL (ALTER TABLE).');
    console.log('Please go to Supabase Dashboard > SQL Editor and run:\n');
    console.log(`
-- 1. email 컬럼을 username으로 이름 변경
ALTER TABLE profiles RENAME COLUMN email TO username;

-- 2. username에 UNIQUE 제약 추가 (없는 경우)
ALTER TABLE profiles ADD CONSTRAINT profiles_username_unique UNIQUE (username);
`);
    return;
  }

  // email 컬럼이 없으면 username 추가 필요
  console.log('email column not found, checking for username...');

  const { error: usernameError } = await supabase
    .from('profiles')
    .select('username')
    .limit(1);

  if (usernameError) {
    console.log('username column not found either.');
    console.log('\n⚠ Please go to Supabase Dashboard > SQL Editor and run:\n');
    console.log(`
-- profiles 테이블에 username 컬럼 추가
ALTER TABLE profiles ADD COLUMN username TEXT UNIQUE;

-- 기존 데이터가 있다면 (없으면 무시해도 됨)
-- UPDATE profiles SET username = SPLIT_PART(email, '@', 1) WHERE username IS NULL;
`);
  } else {
    console.log('✓ username column exists!');
  }
}

migrateProfiles().catch(console.error);
