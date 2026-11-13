import { NextResponse } from "next/server";
import { deleteInvitation } from "@/lib/api/members.server";
import { withAuth } from "@/lib/api/route-handler";

async function deleteHandler(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const deleted = await deleteInvitation(id);
  if (!deleted) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export const DELETE = withAuth(deleteHandler);
