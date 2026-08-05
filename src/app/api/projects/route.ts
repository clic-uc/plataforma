import { NextResponse } from "next/server";
import { createProject, getProjects, parseCreateProjectInput } from "@/lib/api/projects.server";

export async function GET() {
  const projects = await getProjects();
  return NextResponse.json(projects);
}

export async function POST(request: Request) {
  const input = parseCreateProjectInput(await request.json());
  if (!input) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const project = await createProject(input);
  return NextResponse.json(project, { status: 201 });
}
