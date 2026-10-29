import { NextResponse } from "next/server";
import { parseIssueNumber, setIssueReviewed } from "@/lib/api/issues.server";
import { withAuth } from "@/lib/api/route-handler";

// Revisado por quien llama: PUT lo marca, DELETE lo desmarca. Ambos devuelven el detalle.

type Context = { params: Promise<{ id: string; number: string }> };

function handler(reviewed: boolean) {
  return async (_request: Request, { params }: Context) => {
    const { id, number: raw } = await params;
    const number = parseIssueNumber(raw);
    if (!number) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    const issue = await setIssueReviewed(id, number, reviewed);
    if (!issue) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json(issue);
  };
}

export const PUT = withAuth(handler(true));
export const DELETE = withAuth(handler(false));
