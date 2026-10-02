import { NextResponse } from "next/server";
import { getMembers } from "@/lib/api/members.server";
import { withAuth } from "@/lib/api/route-handler";

async function getHandler() {
  const members = await getMembers();
  return NextResponse.json(members);
}

export const GET = withAuth(getHandler);
