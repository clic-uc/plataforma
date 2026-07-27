"use client";

import { useEffect, useRef, useState } from "react";

export interface ContextMenuItem {
  label: string;
  onSelect?: () => void;
  danger?: boolean;
  active?: boolean;
  children?: ContextMenuItem[];
}

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [openSubmenu, setOpenSubmenu] = useState<number | null>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("contextmenu", onOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("contextmenu", onOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="context-menu" style={{ top: y, left: x }}>
      {items.map((item, i) => (
        <div key={item.label} className="context-menu-item-wrap" onMouseEnter={() => setOpenSubmenu(item.children ? i : null)}>
          <button
            type="button"
            className={`context-menu-item${item.danger ? " danger" : ""}${item.active ? " active" : ""}`}
            onClick={() => {
              if (item.children) {
                setOpenSubmenu((cur) => (cur === i ? null : i));
                return;
              }
              item.onSelect?.();
              onClose();
            }}
          >
            <span>{item.label}</span>
            {item.children && <span className="context-menu-arrow">›</span>}
          </button>

          {item.children && openSubmenu === i && (
            <div className="context-menu-sub">
              {item.children.map((sub) => (
                <button
                  key={sub.label}
                  type="button"
                  className={`context-menu-item${sub.active ? " active" : ""}`}
                  onClick={() => {
                    sub.onSelect?.();
                    onClose();
                  }}
                >
                  <span>{sub.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
