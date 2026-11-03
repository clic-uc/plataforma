import { MAX_RANK } from "@/lib/api/member-fields";

export function RankStars({ filled, size = "12px" }: { filled: number; size?: string }) {
  const empty = MAX_RANK - filled;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }} aria-label={`Rango ${filled} de ${MAX_RANK}`}>
      <span className="dir-rank-stars" style={{ fontSize: size }}>{"★".repeat(filled)}</span>
      {empty > 0 && <span className="dir-rank-stars-empty" style={{ fontSize: size }}>{"☆".repeat(empty)}</span>}
    </span>
  );
}
