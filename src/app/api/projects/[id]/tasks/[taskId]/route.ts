import { NextResponse } from "next/server";
import { deleteTask, parseUpdateTaskInput, updateTask } from "@/lib/api/projects.server";
import { LABELS_TOKEN_HEADER } from "@/lib/api/http";
import { withAuth } from "@/lib/api/route-handler";

type Context = { params: Promise<{ id: string; taskId: string }> };

async function patchHandler(request: Request, { params }: Context) {
  const { id, taskId } = await params;

  const input = parseUpdateTaskInput(await request.json());
  if (!input) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const project = await updateTask(id, taskId, input, request.headers.get(LABELS_TOKEN_HEADER));
  if (!project) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(project);
}

async function deleteHandler(request: Request, { params }: Context) {
  const { id, taskId } = await params;

  const project = await deleteTask(id, taskId, request.headers.get(LABELS_TOKEN_HEADER));
  if (!project) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(project);
}

export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);
