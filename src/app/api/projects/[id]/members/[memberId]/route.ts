import { NextResponse } from "next/server";
import { removeProjectMember } from "@/lib/api/projects.server";
import { withAuth } from "@/lib/api/route-handler";

type Context = { params: Promise<{ id: string; memberId: string }> };

async function deleteHandler(_request: Request, { params }: Context) {
  const { id, memberId } = await params;

  const project = await removeProjectMember(id, memberId);
  if (!project) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(project);
}

export const DELETE = withAuth(deleteHandler);
