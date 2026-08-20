import { NextResponse } from "next/server";
import { createProjectDoc, getProjectDoc, updateProjectDoc } from "@/lib/api/projects.server";
import { withAuth } from "@/lib/api/route-handler";

type Context = { params: Promise<{ id: string; docId: string }> };

async function getHandler(_request: Request, { params }: Context) {
  const { id, docId } = await params;
  const doc = await getProjectDoc(id, docId);
  if (!doc) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(doc);
}

async function patchHandler(request: Request, { params }: Context) {
  const { id, docId } = await params;

  const body = await request.json();
  const content = typeof body?.content === "string" ? body.content : null;
  if (content === null) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const doc = await updateProjectDoc(id, docId, content);
  if (!doc) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(doc);
}

async function postHandler(_request: Request, { params }: Context) {
  const { id, docId } = await params;

  const project = await createProjectDoc(id, docId);
  if (!project) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(project);
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
export const POST = withAuth(postHandler);
