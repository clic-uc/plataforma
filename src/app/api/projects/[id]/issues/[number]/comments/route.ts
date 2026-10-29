import { NextResponse } from "next/server";
import { createIssueComment, parseIssueCommentInput, parseIssueNumber } from "@/lib/api/issues.server";
import { withAuth } from "@/lib/api/route-handler";

type Context = { params: Promise<{ id: string; number: string }> };

async function postHandler(request: Request, { params }: Context) {
  const { id, number: raw } = await params;
  const number = parseIssueNumber(raw);
  if (!number) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const input = parseIssueCommentInput(await request.json());
  if (!input) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const issue = await createIssueComment(id, number, input.body);
  if (!issue) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(issue, { status: 201 });
}

export const POST = withAuth(postHandler);
