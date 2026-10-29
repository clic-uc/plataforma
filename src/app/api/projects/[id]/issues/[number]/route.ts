import { NextResponse } from "next/server";
import { deleteIssue, getIssue, parseIssueInput, parseIssueNumber, updateIssue } from "@/lib/api/issues.server";
import { withAuth } from "@/lib/api/route-handler";

type Context = { params: Promise<{ id: string; number: string }> };

const notFound = () => NextResponse.json({ error: "No encontrado" }, { status: 404 });

async function getHandler(_request: Request, { params }: Context) {
  const { id, number: raw } = await params;
  const number = parseIssueNumber(raw);
  if (!number) return notFound();

  const issue = await getIssue(id, number);
  if (!issue) return notFound();
  return NextResponse.json(issue);
}

async function patchHandler(request: Request, { params }: Context) {
  const { id, number: raw } = await params;
  const number = parseIssueNumber(raw);
  if (!number) return notFound();

  const input = parseIssueInput(await request.json());
  if (!input) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const issue = await updateIssue(id, number, input);
  if (!issue) return notFound();
  return NextResponse.json(issue);
}

async function deleteHandler(_request: Request, { params }: Context) {
  const { id, number: raw } = await params;
  const number = parseIssueNumber(raw);
  if (!number) return notFound();

  const deleted = await deleteIssue(id, number);
  if (!deleted) return notFound();
  return new NextResponse(null, { status: 204 });
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);
