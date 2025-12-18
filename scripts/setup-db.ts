import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setupDatabase() {
  console.log('Setting up database...');
  console.log('Supabase URL:', supabaseUrl);

  // 1. posts 테이블 확인
  console.log('\n1. Checking posts table...');
  const { data: postsData, error: postsError } = await supabase
    .from('posts')
    .select('id, campus')
    .limit(1);

  if (postsError) {
    console.error('Posts table error:', postsError.message);
  } else {
    console.log('✓ Posts table exists');
    if (postsData && postsData.length > 0 && 'campus' in postsData[0]) {
      console.log('✓ Campus column exists');
    } else {
      console.log('⚠ Campus column may not exist - needs to be added manually');
    }
  }

  // 2. profiles 테이블 확인
  console.log('\n2. Checking profiles table...');
  const { data: profilesData, error: profilesError } = await supabase
    .from('profiles')
    .select('id')
    .limit(1);

  if (profilesError) {
    if (profilesError.code === '42P01' || profilesError.message.includes('does not exist')) {
      console.log('✗ Profiles table does not exist');
      console.log('\n⚠ Please run the following SQL in Supabase Dashboard > SQL Editor:\n');
      printSQL();
    } else {
      console.error('Profiles error:', profilesError.message);
    }
  } else {
    console.log('✓ Profiles table exists');

    // username 컬럼 확인
    const { data: profileCheck } = await supabase
      .from('profiles')
      .select('username')
      .limit(1);

    if (profileCheck !== null) {
      console.log('✓ Username column exists');
    }
  }

  // 3. auth 설정 안내
  console.log('\n3. Auth settings reminder:');
  console.log('   - Go to Supabase Dashboard > Authentication > Providers > Email');
  console.log('   - Turn OFF "Confirm email" option');

  console.log('\nSetup check complete!');
}

function printSQL() {
  console.log(`
-- profiles 테이블 생성
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  nickname TEXT,
  campus TEXT,
  department_id INTEGER,
  preferred_activity_types INTEGER[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS 활성화
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 정책 설정
CREATE POLICY "Anyone can check username" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- posts 테이블에 campus 컬럼 추가 (없는 경우)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS campus TEXT DEFAULT 'common';
`);
}

setupDatabase().catch(console.error);
