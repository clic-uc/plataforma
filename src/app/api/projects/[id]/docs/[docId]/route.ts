import { NextResponse } from "next/server";
import { getProjectDoc } from "@/lib/api/projects.server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  const doc = await getProjectDoc(id, docId);
  if (!doc) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(doc);
}
