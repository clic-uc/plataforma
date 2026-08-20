import { NextResponse } from "next/server";
import { createProject, getProjects, parseCreateProjectInput } from "@/lib/api/projects.server";
import { withAuth } from "@/lib/api/route-handler";

async function getHandler() {
  const projects = await getProjects();
  return NextResponse.json(projects);
}

async function postHandler(request: Request) {
  const input = parseCreateProjectInput(await request.json());
  if (!input) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const project = await createProject(input);
  return NextResponse.json(project, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
