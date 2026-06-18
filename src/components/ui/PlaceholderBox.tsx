export function PlaceholderBox({ text, style }: { text: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="ph" style={style}>
      <div className="ph-text">{text}</div>
    </div>
  );
}
