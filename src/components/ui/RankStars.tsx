export function RankStars({ filled, number, size = "12px" }: { filled: number; number: number; size?: string }) {
  const empty = 4 - filled;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span className="dir-rank-stars" style={{ fontSize: size }}>{"★".repeat(filled)}</span>
      {empty > 0 && <span className="dir-rank-stars-empty" style={{ fontSize: size }}>{"☆".repeat(empty)}</span>}
      <span className="dir-rank-num">{number}</span>
    </span>
  );
}
