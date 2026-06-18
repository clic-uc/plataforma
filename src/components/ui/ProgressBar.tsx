export function ProgressBar({ progress, className = "progress-track", fillClassName = "progress-fill" }: { progress: number; className?: string; fillClassName?: string }) {
  return (
    <div className={className}>
      <div className={fillClassName} style={{ width: `${progress}%` }} />
    </div>
  );
}
