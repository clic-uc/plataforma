import { NextResponse } from "next/server";
import { approveMember, parseApproveMemberInput } from "@/lib/api/members.server";
import { withAuth } from "@/lib/api/route-handler";

async function postHandler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const input = parseApproveMemberInput(await request.json());
  if (!input) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const member = await approveMember(id, input);
  if (!member) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(member);
}

export const POST = withAuth(postHandler);
