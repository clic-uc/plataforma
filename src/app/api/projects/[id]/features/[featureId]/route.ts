import { NextResponse } from "next/server";
import { deleteFeature, parseUpdateFeatureInput, updateFeature } from "@/lib/api/projects.server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; featureId: string }> }) {
  const { id, featureId } = await params;

  const input = parseUpdateFeatureInput(await request.json());
  if (!input) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const project = await updateFeature(id, featureId, input);
  if (!project) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(project);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; featureId: string }> }) {
  const { id, featureId } = await params;

  const project = await deleteFeature(id, featureId);
  if (!project) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(project);
}
