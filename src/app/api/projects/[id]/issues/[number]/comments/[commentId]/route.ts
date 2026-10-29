import { NextResponse } from "next/server";
import { parseIssueCommentInput, parseIssueNumber, updateIssueComment } from "@/lib/api/issues.server";
import { withAuth } from "@/lib/api/route-handler";

type Context = { params: Promise<{ id: string; number: string; commentId: string }> };

async function patchHandler(request: Request, { params }: Context) {
  const { id, number: raw, commentId } = await params;
  const number = parseIssueNumber(raw);
  if (!number) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const input = parseIssueCommentInput(await request.json());
  if (!input) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const issue = await updateIssueComment(id, number, commentId, input.body);
  if (!issue) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(issue);
}

export const PATCH = withAuth(patchHandler);
