import { NextResponse } from "next/server";
import { getMember } from "@/lib/api/members.server";
import { withAuth } from "@/lib/api/route-handler";

async function getHandler(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await getMember(id);
  if (!member) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(member);
}

export const GET = withAuth(getHandler);
