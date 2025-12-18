import { NextResponse } from 'next/server';
import { DEPARTMENTS_WITH_KEYWORDS } from '@/lib/constants';

export async function GET() {
  // 학과 목록을 캠퍼스/단과대학별로 그룹화
  const grouped = DEPARTMENTS_WITH_KEYWORDS.reduce(
    (acc, dept, index) => {
      const key = `${dept.campus}-${dept.college}`;
      if (!acc[key]) {
        acc[key] = {
          campus: dept.campus,
          college: dept.college,
          departments: [],
        };
      }
      acc[key].departments.push({
        id: index + 1,
        name: dept.name,
        keywords: dept.keywords,
      });
      return acc;
    },
    {} as Record<string, { campus: string; college: string; departments: { id: number; name: string; keywords: string[] }[] }>
  );

  return NextResponse.json({
    grouped: Object.values(grouped),
    flat: DEPARTMENTS_WITH_KEYWORDS.map((dept, index) => ({
      id: index + 1,
      ...dept,
    })),
  });
}
