import { NextResponse } from "next/server";
import {
  createProjectDocComment,
  getProjectDocComments,
  parseCreateDocCommentInput,
} from "@/lib/api/projects.server";
import { withAuth } from "@/lib/api/route-handler";

type Context = { params: Promise<{ id: string; docId: string }> };

async function getHandler(_request: Request, { params }: Context) {
  const { id, docId } = await params;
  const comments = await getProjectDocComments(id, docId);
  if (!comments) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(comments);
}

async function postHandler(request: Request, { params }: Context) {
  const { id, docId } = await params;

  const input = parseCreateDocCommentInput(await request.json());
  if (!input) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const comment = await createProjectDocComment(id, docId, input);
  if (!comment) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(comment, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
