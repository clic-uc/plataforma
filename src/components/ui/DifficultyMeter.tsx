import type { TaskDifficulty } from "@/generated/prisma/enums";
import { taskDifficultyLabel } from "@/lib/api/status";

const level: Record<TaskDifficulty, number> = { BAJA: 1, MEDIA: 2, ALTA: 3 };
const barHeights = ["h-1.5", "h-2.5", "h-3.5"];

/**
 * Indicador compacto de dificultad: tres barras crecientes, tantas llenas como el nivel.
 * Sin estimar no muestra nada; `withLabel` agrega el nombre al lado (detalle de la tarea).
 */
export function DifficultyMeter({ difficulty, withLabel = false }: { difficulty: TaskDifficulty | null; withLabel?: boolean }) {
  if (!difficulty) return null;
  const label = `Dificultad ${taskDifficultyLabel[difficulty].toLowerCase()}`;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-text-2" title={withLabel ? undefined : label}>
      <span role="img" aria-label={label} className="inline-flex items-end gap-0.5">
        {barHeights.map((h, i) => (
          <span key={h} className={`w-[3px] rounded-[1px] ${h} ${i < level[difficulty] ? "bg-text-2" : "bg-border-dash"}`} />
        ))}
      </span>
      {withLabel && <span aria-hidden>{label}</span>}
    </span>
  );
}
