import { NextResponse } from "next/server";
import { createProjectDoc, getProjectDoc, updateProjectDoc } from "@/lib/api/projects.server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  const doc = await getProjectDoc(id, docId);
  if (!doc) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(doc);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;

  const body = await request.json();
  const content = typeof body?.content === "string" ? body.content : null;
  if (content === null) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const doc = await updateProjectDoc(id, docId, content);
  if (!doc) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(doc);
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;

  const project = await createProjectDoc(id, docId);
  if (!project) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(project);
}
