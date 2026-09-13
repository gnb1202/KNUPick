// Reverse the reel so each next word arrives from above. The duplicated first
// word makes the end-to-start reset visually identical.
const REEL_WORDS = ['공지', '장학금', '교육', '봉사활동', '인턴십', '대외활동', '공모전', '공지'];

export default function HeroWordSlot() {
  return (
    <span className="hero-word-slot" aria-hidden="true">
      <span className="hero-slot-track">
        {REEL_WORDS.map((word, index) => (
          <span className="hero-slot-item" key={`${word}-${index}`}>{word},</span>
        ))}
      </span>
    </span>
  );
}
