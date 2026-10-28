import { NextResponse } from "next/server";
import { getStandup, parseSaveStandupInput, parseWeekParam, saveStandup } from "@/lib/api/tiempo.server";
import { withAuth } from "@/lib/api/route-handler";

async function getHandler(request: Request) {
  const { searchParams } = new URL(request.url);
  const week = parseWeekParam(searchParams.get("week"));
  if (!week) return NextResponse.json({ error: "Semana inválida" }, { status: 400 });

  const standup = await getStandup(week);
  return NextResponse.json(standup);
}

async function putHandler(request: Request) {
  const input = parseSaveStandupInput(await request.json());
  if (!input) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const standup = await saveStandup(input);
  return NextResponse.json(standup);
}

export const GET = withAuth(getHandler);
export const PUT = withAuth(putHandler);
