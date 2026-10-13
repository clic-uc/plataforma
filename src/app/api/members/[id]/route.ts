import { NextResponse } from "next/server";
import { deleteMember, getMember, parseUpdateMemberInput, updateMember } from "@/lib/api/members.server";
import { withAuth } from "@/lib/api/route-handler";

type Context = { params: Promise<{ id: string }> };

async function getHandler(_request: Request, { params }: Context) {
  const { id } = await params;
  const member = await getMember(id);
  if (!member) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(member);
}

async function patchHandler(request: Request, { params }: Context) {
  const { id } = await params;

  const input = parseUpdateMemberInput(await request.json());
  if (!input) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const member = await updateMember(id, input);
  if (!member) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(member);
}

async function deleteHandler(_request: Request, { params }: Context) {
  const { id } = await params;

  const deleted = await deleteMember(id);
  if (!deleted) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);
