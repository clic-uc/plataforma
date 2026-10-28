import { NextResponse } from "next/server";
import { createTimeEntry, getTimeEntries, parseTimeEntryFilter, parseTimeEntryInput } from "@/lib/api/tiempo.server";
import { withAuth } from "@/lib/api/route-handler";

async function getHandler(request: Request) {
  const { searchParams } = new URL(request.url);
  const filter = parseTimeEntryFilter(searchParams.get("week"), searchParams.get("projectId"));
  if (!filter) return NextResponse.json({ error: "Semana inválida" }, { status: 400 });

  const entries = await getTimeEntries(filter);
  return NextResponse.json(entries);
}

async function postHandler(request: Request) {
  const input = parseTimeEntryInput(await request.json());
  if (!input) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const entry = await createTimeEntry(input);
  return NextResponse.json(entry, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
