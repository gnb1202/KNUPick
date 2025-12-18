import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkProfiles() {
  console.log('Checking profiles table structure...\n');

  // 모든 컬럼을 가져와서 구조 확인
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  if (data && data.length > 0) {
    console.log('Existing columns:', Object.keys(data[0]));
    console.log('Sample data:', data[0]);
  } else {
    // 빈 테이블이면 insert 시도로 구조 확인
    console.log('Table is empty. Checking by attempting insert...');

    const testData = {
      id: '00000000-0000-0000-0000-000000000000',
      username: 'test_user_check',
      nickname: null,
      campus: null,
      department_id: null,
      preferred_activity_types: []
    };

    const { error: insertError } = await supabase
      .from('profiles')
      .insert(testData);

    if (insertError) {
      if (insertError.message.includes('username')) {
        console.log('✗ username column issue:', insertError.message);
        console.log('\n⚠ Need to add username column. Run this SQL:');
        console.log(`
-- email 컬럼이 있다면 username으로 이름 변경
ALTER TABLE profiles RENAME COLUMN email TO username;

-- 또는 새로 추가
ALTER TABLE profiles ADD COLUMN username TEXT UNIQUE;
`);
      } else if (insertError.message.includes('email')) {
        console.log('Table has email column instead of username');
        console.log('\n⚠ Run this SQL to rename:');
        console.log(`ALTER TABLE profiles RENAME COLUMN email TO username;`);
      } else {
        console.log('Insert error (expected for fake ID):', insertError.message);
      }
    }
  }
}

checkProfiles().catch(console.error);
