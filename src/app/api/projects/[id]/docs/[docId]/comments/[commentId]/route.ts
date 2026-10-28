import { NextResponse } from "next/server";
import { resolveProjectDocComment } from "@/lib/api/projects.server";
import { withAuth } from "@/lib/api/route-handler";

type Context = { params: Promise<{ id: string; docId: string; commentId: string }> };

async function deleteHandler(_request: Request, { params }: Context) {
  const { id, docId, commentId } = await params;

  const resolved = await resolveProjectDocComment(id, docId, commentId);
  if (!resolved) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}

export const DELETE = withAuth(deleteHandler);
