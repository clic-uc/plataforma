import { NextResponse } from "next/server";
import { dismissPendingHours } from "@/lib/api/dashboard.server";
import { withAuth } from "@/lib/api/route-handler";

type Context = { params: Promise<{ transitionId: string }> };

async function postHandler(_request: Request, { params }: Context) {
  const { transitionId } = await params;

  const dismissed = await dismissPendingHours(transitionId);
  if (!dismissed) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export const POST = withAuth(postHandler);
