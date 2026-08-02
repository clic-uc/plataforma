import { NextResponse } from "next/server";
import { createActa, parseCreateActaInput } from "@/lib/api/projects.server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const input = parseCreateActaInput(await request.json());
  if (!input) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const project = await createActa(id, input);
  if (!project) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(project);
}
