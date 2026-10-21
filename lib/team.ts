export const roleLabel: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  vet: "Vet",
  ai_technician: "AI technician",
  worker: "Worker",
  accountant: "Accountant",
  genetics: "Genetics",
  admin: "Admin",
};

export function inviteIsOpen(invite: { acceptedAt: Date | null; expiresAt: Date }, now = Date.now()) {
  return !invite.acceptedAt && invite.expiresAt.getTime() >= now;
}

export function keepsTeamAdmin(
  members: { userId: string; roles: string[]; disabled: boolean }[],
  userId: string,
  next: string[] | "disabled",
) {
  const person = members.find((member) => member.userId === userId);
  const manages = (roles: string[]) => roles.includes("owner") || roles.includes("admin");
  if (!person || person.disabled || !manages(person.roles)) return true;
  if (next !== "disabled" && manages(next)) return true;
  return members.some((member) => member.userId !== userId && !member.disabled && manages(member.roles));
}
