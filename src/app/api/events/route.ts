import { NextResponse } from "next/server";
import { createEvent, getEvents, parseCreateEventInput, parseEventRange } from "@/lib/api/events.server";
import { withAuth } from "@/lib/api/route-handler";

async function getHandler(request: Request) {
  const { searchParams } = new URL(request.url);
  const range = parseEventRange(searchParams.get("from"), searchParams.get("to"));
  if (!range) return NextResponse.json({ error: "Rango de fechas inválido" }, { status: 400 });

  const events = await getEvents(range.from, range.to);
  return NextResponse.json(events);
}

async function postHandler(request: Request) {
  const input = parseCreateEventInput(await request.json());
  if (!input) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const events = await createEvent(input);
  return NextResponse.json(events, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
