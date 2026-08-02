import { NextResponse } from "next/server";
import { getProjects } from "@/lib/api/projects.server";

export async function GET() {
  const projects = await getProjects();
  return NextResponse.json(projects);
}
