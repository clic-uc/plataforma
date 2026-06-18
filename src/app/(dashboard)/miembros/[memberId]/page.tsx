import { notFound } from "next/navigation";
import { getMember } from "../../../../../prisma/seed/data/members";
import { MemberProfileView } from "@/components/views/MemberProfileView";

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const { memberId } = await params;
  const member = getMember(memberId);
  if (!member) notFound();
  return <MemberProfileView member={member} />;
}
