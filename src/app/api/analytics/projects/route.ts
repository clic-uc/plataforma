import { NextResponse } from "next/server";
import { getProjectsReport } from "@/lib/api/analytics.server";
import { withAuth } from "@/lib/api/route-handler";

async function getHandler() {
  return NextResponse.json(await getProjectsReport());
}

export const GET = withAuth(getHandler);
