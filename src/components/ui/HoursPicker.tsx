"use client";

import { TIME_SHORTCUTS } from "@/lib/task-move";
import { formatEffort } from "@/lib/task-history";
import { hoursInputToMinutes, MAX_ENTRY_MINUTES, MINUTES_STEP, minutesToHoursInput } from "@/lib/tiempo";

/** Lo escrito en el campo de horas: vacío es omitirlas; algo que no es un tramo de 15 min, inválido. */
export function parseTimeSpent(hours: string): { minutes: number | null; invalid: boolean } {
  if (!hours.trim()) return { minutes: null, invalid: false };
  const minutes = hoursInputToMinutes(hours);
  return { minutes, invalid: minutes === null };
}

export const HOURS_STEP_ERROR = "Las horas van en tramos de 15 minutos (0.25), hasta 24.";

/**
 * Atajos 30 min / 1 h / 2 h / 4 h y un campo libre para otra cantidad. Los atajos escriben el
 * valor en el campo; pulsar el elegido lo borra. `size="sm"` es la versión de una fila (Dashboard).
 */
export function HoursPicker({
  hours,
  onChange,
  size = "md",
  inputLabel = "Otra",
  showError = true,
  disabled = false,
}: {
  hours: string;
  onChange: (hours: string) => void;
  size?: "md" | "sm";
  inputLabel?: string;
  showError?: boolean;
  disabled?: boolean;
}) {
  const { minutes, invalid } = parseTimeSpent(hours);
  const sm = size === "sm";
  return (
    <div className="min-w-0">
      <div className={`flex flex-wrap items-center ${sm ? "gap-1" : "gap-1.5"}`}>
        {TIME_SHORTCUTS.map((value) => {
          const selected = minutes === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onChange(selected ? "" : minutesToHoursInput(value))}
              className={`rounded-md border tabular-nums transition-colors duration-100 disabled:opacity-55 ${
                sm ? "h-7 px-2 text-xs" : "h-8 px-3 text-sm"
              } ${
                selected
                  ? "border-accent bg-accent-dim font-semibold text-accent-ink"
                  : "border-border-dash bg-surface text-text-2 hover:border-text-3"
              }`}
            >
              {formatEffort(value)}
            </button>
          );
        })}
        <label className={`inline-flex items-center gap-1.5 text-text-2 ${sm ? "ml-0.5 text-xs" : "ml-1 text-sm"}`}>
          {inputLabel}
          <input
            type="number"
            inputMode="decimal"
            className={`field-input tabular-nums ${sm ? "h-7! min-h-7! w-16! px-2! py-0! text-xs!" : "w-20!"}`}
            value={hours}
            min={MINUTES_STEP / 60}
            max={MAX_ENTRY_MINUTES / 60}
            step={MINUTES_STEP / 60}
            placeholder="1.5"
            aria-invalid={invalid}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
          h
        </label>
      </div>
      {showError && invalid && <p className="mt-1.5 text-xs text-danger">{HOURS_STEP_ERROR}</p>}
    </div>
  );
}
