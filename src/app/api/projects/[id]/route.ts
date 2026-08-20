import { NextResponse } from "next/server";
import { deleteProject, getProject, parseUpdateProjectInput, updateProject } from "@/lib/api/projects.server";
import { withAuth } from "@/lib/api/route-handler";

type Context = { params: Promise<{ id: string }> };

async function getHandler(_request: Request, { params }: Context) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(project);
}

async function patchHandler(request: Request, { params }: Context) {
  const { id } = await params;

  const input = parseUpdateProjectInput(await request.json());
  if (!input) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const project = await updateProject(id, input);
  if (!project) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(project);
}

async function deleteHandler(_request: Request, { params }: Context) {
  const { id } = await params;

  const deleted = await deleteProject(id);
  if (!deleted) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);
