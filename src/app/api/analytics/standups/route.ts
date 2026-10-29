import { NextResponse } from "next/server";
import { getWeekStandups, parseStandupWeekParam } from "@/lib/api/analytics.server";
import { withAuth } from "@/lib/api/route-handler";

async function getHandler(request: Request) {
  const week = parseStandupWeekParam(new URL(request.url).searchParams.get("week"));
  if (!week) return NextResponse.json({ error: "Semana inválida" }, { status: 400 });

  return NextResponse.json(await getWeekStandups(week));
}

export const GET = withAuth(getHandler);
