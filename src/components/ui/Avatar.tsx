export function AvatarStack({ count, accentFirst = false }: { count: number; accentFirst?: boolean }) {
  const shown = Math.min(count, 4);
  const extra = count - shown;
  return (
    <div className="avatars">
      {Array.from({ length: shown }).map((_, i) => (
        <div key={i} className={`ava${accentFirst && i === 0 ? " accent-ava" : ""}`} />
      ))}
      {extra > 0 && <div className="ava">+{extra}</div>}
    </div>
  );
}
