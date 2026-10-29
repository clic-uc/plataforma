import { NextResponse } from "next/server";
import { getActivityReport, parseRangeParam } from "@/lib/api/analytics.server";
import { withAuth } from "@/lib/api/route-handler";

async function getHandler(request: Request) {
  const weeks = parseRangeParam(new URL(request.url).searchParams.get("weeks"));
  if (!weeks) return NextResponse.json({ error: "Rango inválido" }, { status: 400 });

  return NextResponse.json(await getActivityReport(weeks));
}

export const GET = withAuth(getHandler);
