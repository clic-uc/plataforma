import { NextResponse } from "next/server";
import { parseIssueNumber, parseIssueStatusInput, setIssueStatus } from "@/lib/api/issues.server";
import { withAuth } from "@/lib/api/route-handler";

type Context = { params: Promise<{ id: string; number: string }> };

async function putHandler(request: Request, { params }: Context) {
  const { id, number: raw } = await params;
  const number = parseIssueNumber(raw);
  if (!number) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const input = parseIssueStatusInput(await request.json());
  if (!input) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const issue = await setIssueStatus(id, number, input);
  if (!issue) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(issue);
}

export const PUT = withAuth(putHandler);
