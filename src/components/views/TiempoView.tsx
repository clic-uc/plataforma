import { PlaceholderBox } from "@/components/ui/PlaceholderBox";
import { Badge } from "@/components/ui/Badge";
import { historial, standupWeek } from "../../../prisma/seed/data/tiempo";

export function TiempoView() {
  return (
    <section className="tiempo-layout">
      <div className="tiempo-top">
        <div className="forms-col">
          <div className="card" style={{ flex: 1 }}>
            <div className="card-label">StandUp Semanal</div>
            <div style={{ fontFamily: "var(--font-space-mono)", fontSize: 9.5, color: "var(--text-3)", marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}>
              {standupWeek.range}
              {standupWeek.pending && <Badge color="amber" style={{ fontSize: 9 }}>Pendiente</Badge>}
            </div>
            <div className="form-field">
              <div className="f-label">¿Qué hice esta semana?</div>
              <div className="f-textarea" style={{ height: 76 }} />
            </div>
            <div className="form-field">
              <div className="f-label">¿Qué aprendí?</div>
              <div className="f-textarea" style={{ height: 60 }} />
            </div>
            <button className="btn-primary" style={{ width: "100%" }}>Enviar StandUp</button>
          </div>
        </div>

        <div className="history-col">
          <div className="card" style={{ flex: 1 }}>
            <div className="card-label">Horas registradas esta semana</div>
            <PlaceholderBox text={<>Gráfico de barras apiladas<br />Horas × proyecto × día</>} style={{ flex: 1, minHeight: 160 }} />
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div className="card-label" style={{ marginBottom: 0 }}>HISTORIAL DE TAREAS</div>
          <div style={{ display: "flex", gap: 6 }}>
            <div className="select-mock" style={{ height: 28 }}><span style={{ fontSize: 10 }}>Proyecto ▾</span></div>
            <div className="select-mock" style={{ height: 28 }}><span style={{ fontSize: 10 }}>Semana ▾</span></div>
          </div>
        </div>
        <table className="dir-table">
          <thead>
            <tr>
              <th style={{ width: 110 }}>Fecha</th>
              <th style={{ width: 160 }}>Proyecto</th>
              <th style={{ width: 56 }}>Horas</th>
              <th>Descripción</th>
            </tr>
          </thead>
          <tbody>
            {historial.map((h, i) => (
              <tr key={i}>
                <td style={{ fontFamily: "var(--font-space-mono)", fontSize: 11, color: "var(--text-3)" }}>{h.date}</td>
                <td><span className="task-feat-tag">{h.project}</span></td>
                <td style={{ fontFamily: "var(--font-space-mono)", fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>{h.hours}</td>
                <td style={{ fontSize: 13, color: "var(--text-2)" }}>{h.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
