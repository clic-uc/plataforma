import { NextResponse } from "next/server";
import { getMembers } from "@/lib/api/members.server";

export async function GET() {
  const members = await getMembers();
  return NextResponse.json(members);
}
