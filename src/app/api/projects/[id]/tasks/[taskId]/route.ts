import { NextResponse } from "next/server";
import { deleteTask, parseUpdateTaskInput, updateTask } from "@/lib/api/projects.server";
import { withAuth } from "@/lib/api/route-handler";

type Context = { params: Promise<{ id: string; taskId: string }> };

async function patchHandler(request: Request, { params }: Context) {
  const { id, taskId } = await params;

  const input = parseUpdateTaskInput(await request.json());
  if (!input) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const project = await updateTask(id, taskId, input);
  if (!project) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(project);
}

async function deleteHandler(_request: Request, { params }: Context) {
  const { id, taskId } = await params;

  const project = await deleteTask(id, taskId);
  if (!project) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(project);
}

export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);
