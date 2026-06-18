import type { BadgeColor } from "@/lib/types";

export function Badge({
  color,
  children,
  style,
}: {
  color: BadgeColor;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <span className={`badge badge-${color}`} style={style}>
      {children}
    </span>
  );
}
