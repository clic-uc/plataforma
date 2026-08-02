import { NextResponse } from "next/server";
import { createTask, parseCreateTaskInput } from "@/lib/api/projects.server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const input = parseCreateTaskInput(await request.json());
  if (!input) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const project = await createTask(id, input);
  if (!project) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(project);
}
