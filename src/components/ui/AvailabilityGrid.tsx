import {
  AVAILABILITY_BLOCKS,
  AVAILABILITY_DAYS,
  availabilitySlot,
  type AvailabilitySlot,
} from "@/lib/api/member-fields";

/** Grilla Lun–Vie × mañana/tarde/noche. Con `onToggle` cada bloque es un botón. */
export function AvailabilityGrid({
  value,
  onToggle,
}: {
  value: AvailabilitySlot[];
  onToggle?: (slot: AvailabilitySlot) => void;
}) {
  return (
    <div className="avail-grid">
      <div />
      {AVAILABILITY_DAYS.map((day) => (
        <div key={day.value} className="avail-head">{day.label}</div>
      ))}
      {AVAILABILITY_BLOCKS.map((block) => (
        <AvailabilityRow key={block.value} block={block} value={value} onToggle={onToggle} />
      ))}
    </div>
  );
}

function AvailabilityRow({
  block,
  value,
  onToggle,
}: {
  block: (typeof AVAILABILITY_BLOCKS)[number];
  value: AvailabilitySlot[];
  onToggle?: (slot: AvailabilitySlot) => void;
}) {
  return (
    <>
      <div className="avail-row-label">{block.label}</div>
      {AVAILABILITY_DAYS.map((day) => {
        const slot = availabilitySlot(day.value, block.value);
        const on = value.includes(slot);
        const label = `${day.label} · ${block.label}`;
        return onToggle ? (
          <button
            key={slot}
            type="button"
            className={`avail-cell${on ? " on" : ""}`}
            aria-pressed={on}
            aria-label={label}
            title={label}
            onClick={() => onToggle(slot)}
          />
        ) : (
          <div key={slot} className={`avail-cell${on ? " on" : ""}`} title={on ? `${label}: disponible` : label} />
        );
      })}
    </>
  );
}
