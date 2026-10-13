"use client";

import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { errorMessage } from "@/lib/api/http";
import { useDeleteEvent, type CalendarEventView } from "@/lib/api/events";
import { eventKindColor, eventKindLabel } from "@/lib/api/status";
import { formatEventWhen } from "@/lib/calendar";

function isUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text);
}

export function EventDetailModal({
  event,
  onEdit,
  onClose,
}: {
  event: CalendarEventView;
  onEdit: () => void;
  onClose: () => void;
}) {
  const deleteEvent = useDeleteEvent();

  function handleDelete() {
    const series = event.seriesId ? " Solo se elimina esta ocurrencia; el resto de la serie se mantiene." : "";
    if (!window.confirm(`¿Eliminar "${event.title}"?${series}`)) return;
    deleteEvent.mutate(event.id, { onSuccess: onClose });
  }

  return (
    <Modal title={event.title} onClose={onClose}>
      <div className="cal-detail-tags">
        <span className={`cal-kind cal-ev-${eventKindColor[event.kind]}`}>{eventKindLabel[event.kind]}</span>
        {event.seriesId && <span className="cal-detail-series">Serie semanal</span>}
      </div>

      <dl className="cal-detail">
        <dt>Cuándo</dt>
        <dd>{formatEventWhen(event)}</dd>

        {event.location && (
          <>
            <dt>Lugar</dt>
            <dd>
              {isUrl(event.location) ? (
                <a href={event.location} target="_blank" rel="noopener noreferrer">{event.location}</a>
              ) : (
                event.location
              )}
            </dd>
          </>
        )}

        {event.project && (
          <>
            <dt>Proyecto</dt>
            <dd>
              <Link href={`/proyectos/${event.project.id}`}>{event.project.name}</Link>
            </dd>
          </>
        )}

        <dt>Creado por</dt>
        <dd>{event.createdBy?.name ?? "Ex miembro"}</dd>

        {event.description && (
          <>
            <dt>Descripción</dt>
            <dd className="cal-detail-desc">{event.description}</dd>
          </>
        )}
      </dl>

      {deleteEvent.isError && (
        <div className="modal-error">{errorMessage(deleteEvent.error, "No se pudo eliminar. Intenta de nuevo.")}</div>
      )}

      {event.canEdit && (
        <div className="modal-footer" style={{ padding: 0, border: "none", marginTop: 16 }}>
          <button type="button" className="btn-ghost" onClick={handleDelete} disabled={deleteEvent.isPending}>
            {deleteEvent.isPending ? "Eliminando…" : "Eliminar"}
          </button>
          <button type="button" className="btn-primary" onClick={onEdit}>Editar</button>
        </div>
      )}
    </Modal>
  );
}
