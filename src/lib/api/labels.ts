import "server-only";

import { createHash } from "node:crypto";

// La API direcciona features y tareas por label (F-01, T-01), y esos labels se
// renumeran al borrar. Para que un cliente con un snapshot viejo no edite o
// borre la entidad equivocada, cada ProjectDetail lleva un labelsToken: la
// huella de los pares label→id hasta el label más alto que vio ese snapshot.
// Las mutaciones que reciben labels lo mandan en If-Match.
//
// Crear entidades no invalida el token (los labels nuevos quedan por encima del
// máximo del snapshot); cualquier borrado de algo que el cliente vio, sí.

export type LabelPrefix = "F" | "T";

export interface LabelledRow {
  id: string;
  label: string;
}

/** Número de un label con el prefijo dado ("T-07" → 7), o 0 si no tiene ese formato. */
export function labelNumber(prefix: LabelPrefix, label: string): number {
  const match = new RegExp(`^${prefix}-(\\d+)$`).exec(label);
  return match ? Number(match[1]) : 0;
}

export function formatLabel(prefix: LabelPrefix, n: number): string {
  return `${prefix}-${String(n).padStart(2, "0")}`;
}

/** Label siguiente al más alto existente; los huecos no se reutilizan. */
export function nextLabel(prefix: LabelPrefix, existingLabels: string[]): string {
  const max = existingLabels.reduce((acc, label) => Math.max(acc, labelNumber(prefix, label)), 0);
  return formatLabel(prefix, max + 1);
}

function maxLabelNumber(prefix: LabelPrefix, rows: LabelledRow[]): number {
  return rows.reduce((max, row) => Math.max(max, labelNumber(prefix, row.label)), 0);
}

function labelsDigest(features: LabelledRow[], tasks: LabelledRow[], maxFeature: number, maxTask: number): string {
  const pairs = [
    ...features.filter((f) => labelNumber("F", f.label) <= maxFeature),
    ...tasks.filter((t) => labelNumber("T", t.label) <= maxTask),
  ]
    .map((row) => `${row.label}=${row.id}`)
    .sort();
  return createHash("sha256").update(pairs.join("\n")).digest("base64url").slice(0, 22);
}

export function labelsToken(features: LabelledRow[], tasks: LabelledRow[]): string {
  const maxFeature = maxLabelNumber("F", features);
  const maxTask = maxLabelNumber("T", tasks);
  return `${maxFeature}.${maxTask}.${labelsDigest(features, tasks, maxFeature, maxTask)}`;
}

/**
 * true si los labels que vio el snapshot del token siguen apuntando a las mismas
 * entidades. Acepta el valor crudo de If-Match: con o sin comillas, y como ETag débil.
 */
export function matchesLabelsToken(ifMatch: string, features: LabelledRow[], tasks: LabelledRow[]): boolean {
  const match = /^(\d+)\.(\d+)\.([\w-]+)$/.exec(ifMatch.trim().replace(/^(W\/)?"(.*)"$/, "$2"));
  return !!match && labelsDigest(features, tasks, Number(match[1]), Number(match[2])) === match[3];
}
