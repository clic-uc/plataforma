export interface ShellSnapshot {
  sidebarCollapsed: boolean;
  theme: "light" | "dark";
}

const STORAGE_KEY = "clic-shell";
const SERVER_SNAPSHOT: ShellSnapshot = { sidebarCollapsed: false, theme: "light" };

function loadFromStorage(): ShellSnapshot {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return {
      sidebarCollapsed: typeof saved.sidebarCollapsed === "boolean" ? saved.sidebarCollapsed : false,
      theme: saved.theme === "dark" ? "dark" : "light",
    };
  } catch {
    return SERVER_SNAPSHOT;
  }
}

let snapshot = loadFromStorage();
const listeners = new Set<() => void>();

export function getSnapshot(): ShellSnapshot {
  return snapshot;
}

export function getServerSnapshot(): ShellSnapshot {
  return SERVER_SNAPSHOT;
}

export function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function setShellState(update: Partial<ShellSnapshot>): void {
  snapshot = { ...snapshot, ...update };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore storage errors
  }
  listeners.forEach((listener) => listener());
}
