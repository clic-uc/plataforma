import { NextResponse } from "next/server";
import { getTimeEntryTaskOptions } from "@/lib/api/tiempo.server";
import { withAuth } from "@/lib/api/route-handler";

async function getHandler(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId")?.trim();
  if (!projectId) return NextResponse.json({ error: "Falta el proyecto" }, { status: 400 });

  const tasks = await getTimeEntryTaskOptions(projectId);
  if (!tasks) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json(tasks);
}

export const GET = withAuth(getHandler);
