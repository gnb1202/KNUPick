import { BRAND } from '@/lib/brand';

export default function BrandMark({ size = 36, inverse = false, className = '' }: {
  size?: number;
  inverse?: boolean;
  className?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true" className={`brand-mark ${className}`}>
      <path d={BRAND.bookmark} fill={inverse ? BRAND.mint : 'var(--brand-green)'} />
      <path d={BRAND.pick} fill={inverse ? '#FFFFFF' : 'var(--brand-blue)'} />
    </svg>
  );
}
