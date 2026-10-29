import { NextResponse } from "next/server";
import { parseIssueNumber } from "@/lib/api/issues.server";
import { setIssueLink } from "@/lib/api/projects.server";
import { LABELS_TOKEN_HEADER } from "@/lib/api/http";
import { withAuth } from "@/lib/api/route-handler";

type Context = { params: Promise<{ id: string; featureId: string; number: string }> };

/** PUT vincula la feature con el issue; DELETE la desvincula. */
function handler(linked: boolean) {
  return async (request: Request, { params }: Context) => {
    const { id, featureId, number: raw } = await params;
    const number = parseIssueNumber(raw);
    if (!number) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    const project = await setIssueLink(id, "feature", featureId, number, linked, request.headers.get(LABELS_TOKEN_HEADER));
    if (!project) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json(project);
  };
}

export const PUT = withAuth(handler(true));
export const DELETE = withAuth(handler(false));
