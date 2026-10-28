import { NextResponse } from "next/server";
import { getProjectDocVersions } from "@/lib/api/projects.server";
import { withAuth } from "@/lib/api/route-handler";

type Context = { params: Promise<{ id: string; docId: string }> };

async function getHandler(_request: Request, { params }: Context) {
  const { id, docId } = await params;
  const versions = await getProjectDocVersions(id, docId);
  if (!versions) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(versions);
}

export const GET = withAuth(getHandler);
