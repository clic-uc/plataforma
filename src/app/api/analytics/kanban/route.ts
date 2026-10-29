import { NextResponse } from "next/server";
import { getKanbanReport, parseProjectParam, parseRangeParam } from "@/lib/api/analytics.server";
import { withAuth } from "@/lib/api/route-handler";

async function getHandler(request: Request) {
  const params = new URL(request.url).searchParams;
  const weeks = parseRangeParam(params.get("weeks"));
  if (!weeks) return NextResponse.json({ error: "Rango inválido" }, { status: 400 });

  const report = await getKanbanReport(weeks, parseProjectParam(params.get("project")));
  if (!report) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  return NextResponse.json(report);
}

export const GET = withAuth(getHandler);
