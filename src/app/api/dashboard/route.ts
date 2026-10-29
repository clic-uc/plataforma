import { NextResponse } from "next/server";
import { getDashboard } from "@/lib/api/dashboard.server";
import { withAuth } from "@/lib/api/route-handler";

async function getHandler() {
  return NextResponse.json(await getDashboard());
}

export const GET = withAuth(getHandler);
