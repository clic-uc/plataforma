import { NextResponse } from "next/server";
import { deleteTimeEntry, parseTimeEntryInput, updateTimeEntry } from "@/lib/api/tiempo.server";
import { withAuth } from "@/lib/api/route-handler";

type Context = { params: Promise<{ id: string }> };

async function patchHandler(request: Request, { params }: Context) {
  const { id } = await params;

  const input = parseTimeEntryInput(await request.json());
  if (!input) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const entry = await updateTimeEntry(id, input);
  if (!entry) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(entry);
}

async function deleteHandler(_request: Request, { params }: Context) {
  const { id } = await params;

  const deleted = await deleteTimeEntry(id);
  if (!deleted) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);
