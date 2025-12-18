import { NextRequest, NextResponse } from 'next/server';
import { testLLMConnection, isLLMEnabled, analyzePostWithLLM } from '@/lib/llm';

/**
 * LLM 연결 테스트 및 샘플 분석 API
 */
export async function GET(request: NextRequest) {
  // 인증 검증
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const enabled = isLLMEnabled();
  const connected = await testLLMConnection();

  return NextResponse.json({
    enabled,
    connected,
    model: process.env.OLLAMA_MODEL || 'exaone3.5:7.8b',
    host: process.env.OLLAMA_HOST || 'http://localhost:11434',
  });
}

/**
 * 샘플 텍스트로 LLM 분석 테스트
 */
export async function POST(request: NextRequest) {
  // 인증 검증
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title, content } = body;

    if (!title || !content) {
      return NextResponse.json(
        { error: 'title과 content가 필요합니다' },
        { status: 400 }
      );
    }

    const connected = await testLLMConnection();
    if (!connected) {
      return NextResponse.json(
        { error: 'LLM 서버에 연결할 수 없습니다. Ollama가 실행 중인지 확인하세요.' },
        { status: 503 }
      );
    }

    const startTime = Date.now();
    const result = await analyzePostWithLLM(title, content);
    const elapsed = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      elapsed: `${elapsed}ms`,
      result,
    });
  } catch (error) {
    console.error('LLM test error:', error);
    return NextResponse.json(
      { error: 'LLM 분석 실패', details: String(error) },
      { status: 500 }
    );
  }
}
