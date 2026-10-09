import { NextResponse } from "next/server";
import {
  parseUpdateProjectMemberInput,
  removeProjectMember,
  updateProjectMemberRole,
} from "@/lib/api/projects.server";
import { withAuth } from "@/lib/api/route-handler";

type Context = { params: Promise<{ id: string; memberId: string }> };

async function patchHandler(request: Request, { params }: Context) {
  const { id, memberId } = await params;

  const input = parseUpdateProjectMemberInput(await request.json());
  if (!input) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const project = await updateProjectMemberRole(id, memberId, input.role);
  if (!project) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(project);
}

async function deleteHandler(_request: Request, { params }: Context) {
  const { id, memberId } = await params;

  const project = await removeProjectMember(id, memberId);
  if (!project) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(project);
}

export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);
