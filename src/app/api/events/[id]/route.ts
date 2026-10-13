import { NextResponse } from "next/server";
import { deleteEvent, parseUpdateEventInput, updateEvent } from "@/lib/api/events.server";
import { withAuth } from "@/lib/api/route-handler";

type Context = { params: Promise<{ id: string }> };

async function patchHandler(request: Request, { params }: Context) {
  const { id } = await params;

  const input = parseUpdateEventInput(await request.json());
  if (!input) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const event = await updateEvent(id, input);
  if (!event) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(event);
}

async function deleteHandler(_request: Request, { params }: Context) {
  const { id } = await params;

  const deleted = await deleteEvent(id);
  if (!deleted) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);
