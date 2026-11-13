import { NextResponse } from "next/server";
import { createInvitation, getInvitations, parseCreateInvitationInput } from "@/lib/api/members.server";
import { withAuth } from "@/lib/api/route-handler";

async function getHandler() {
  const invitations = await getInvitations();
  return NextResponse.json(invitations);
}

async function postHandler(request: Request) {
  const input = parseCreateInvitationInput(await request.json());
  if (!input) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  const invitation = await createInvitation(input);
  return NextResponse.json(invitation, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
