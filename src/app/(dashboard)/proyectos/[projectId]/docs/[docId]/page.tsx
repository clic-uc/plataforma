import { notFound } from "next/navigation";
import { getProject, getDoc } from "../../../../../../../prisma/seed/data/projects";
import { DocEditorView } from "@/components/views/DocEditorView";

export default async function DocEditorPage({
  params,
}: {
  params: Promise<{ projectId: string; docId: string }>;
}) {
  const { projectId, docId } = await params;
  const project = getProject(projectId);
  if (!project) notFound();
  const doc = getDoc(project, docId);
  if (!doc) notFound();
  return <DocEditorView doc={doc} projectName={project.name} />;
}
