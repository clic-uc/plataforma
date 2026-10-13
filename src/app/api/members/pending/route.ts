import { NextResponse } from "next/server";
import { getPendingMembers } from "@/lib/api/members.server";
import { withAuth } from "@/lib/api/route-handler";

async function getHandler() {
  const pending = await getPendingMembers();
  return NextResponse.json(pending);
}

export const GET = withAuth(getHandler);
