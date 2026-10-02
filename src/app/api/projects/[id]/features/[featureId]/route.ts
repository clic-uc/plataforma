import { NextResponse } from "next/server";
import { deleteFeature, parseUpdateFeatureInput, updateFeature } from "@/lib/api/projects.server";
import { withAuth } from "@/lib/api/route-handler";

type Context = { params: Promise<{ id: string; featureId: string }> };

async function patchHandler(request: Request, { params }: Context) {
  const { id, featureId } = await params;

  const input = parseUpdateFeatureInput(await request.json());
  if (!input) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const project = await updateFeature(id, featureId, input);
  if (!project) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(project);
}

async function deleteHandler(_request: Request, { params }: Context) {
  const { id, featureId } = await params;

  const project = await deleteFeature(id, featureId);
  if (!project) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(project);
}

export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);
