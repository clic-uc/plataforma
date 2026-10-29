import { NextResponse } from "next/server";
import { createIssue, getProjectIssues, parseIssueInput } from "@/lib/api/issues.server";
import { withAuth } from "@/lib/api/route-handler";

type Context = { params: Promise<{ id: string }> };

async function getHandler(_request: Request, { params }: Context) {
  const { id } = await params;
  const issues = await getProjectIssues(id);
  if (!issues) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(issues);
}

async function postHandler(request: Request, { params }: Context) {
  const { id } = await params;

  const input = parseIssueInput(await request.json());
  if (!input) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const issue = await createIssue(id, input);
  if (!issue) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(issue, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
