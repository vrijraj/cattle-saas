import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { farmMembers, invites, users } from "@/db/schema";
import { CopyLink } from "@/components/copy-link";
import { RecordDialog } from "@/components/record-dialog";
import { EmptyRow, inputClass, Notice, Submit, Summary, Table, Td } from "@/components/workspace";
import { formatDisplayDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { canManageTeam, ROLES } from "@/lib/permissions";
import { createInvite, disableMember } from "./actions";

function roleLabel(role: string) {
  return role.replaceAll("_", " ");
}

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const farm = await requireFarm();
  if (!canManageTeam(farm.roles)) redirect("/dashboard");
  const query = await searchParams;
  const members = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      roles: farmMembers.roles,
      disabledAt: users.disabledAt,
    })
    .from(farmMembers)
    .innerJoin(users, eq(users.id, farmMembers.userId))
    .where(eq(farmMembers.farmId, farm.farmId));
  const pending = await db
    .select()
    .from(invites)
    .where(and(eq(invites.farmId, farm.farmId), isNull(invites.acceptedAt)));
  const origin = process.env.AUTH_URL ?? "http://localhost:3007";

  return (
    <div className="space-y-5">
      <Summary
        title="Team"
        description="Invite a person by email and choose their roles. Each invite lasts 7 days."
        facts={[
          { label: "People", value: String(members.length) },
          { label: "Open invites", value: String(pending.length) },
        ]}
        action={
          <RecordDialog title="Invite someone" button="Invite" notice={query.error === "form" ? "Enter an email and at least one role." : undefined} open={query.error === "form"}>
            <form action={createInvite} className="grid gap-3">
              <input name="email" type="email" required placeholder="Email" className={inputClass} />
              <fieldset className="grid gap-2 sm:grid-cols-2">
                <legend className="mb-1 text-sm text-muted-foreground">Roles</legend>
                {ROLES.map((role) => (
                  <label key={role} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="roles" value={role} />
                    <span className="capitalize">{roleLabel(role)}</span>
                  </label>
                ))}
              </fieldset>
              <Submit>Send invite</Submit>
            </form>
          </RecordDialog>
        }
      />
      {query.sent === "1" ? <Notice>The invitation email was sent. The link is also in the table below.</Notice> : null}
      {query.sent === "0" ? <Notice>Email is not configured, so the invite was not mailed. Copy the link from the table.</Notice> : null}
      {query.error === "self" ? <Notice tone="danger">You cannot disable your own sign-in.</Notice> : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">People</h2>
        <Table headers={["Name", "Email", "Roles", ""]}>
          {members.length === 0 ? (
            <EmptyRow cols={4}>No one is on this farm yet.</EmptyRow>
          ) : (
            members.map((member) => (
              <tr key={member.userId}>
                <Td>{member.name ?? "—"}</Td>
                <Td>{member.email}</Td>
                <Td className="capitalize">{member.roles.map(roleLabel).join(", ")}</Td>
                <Td>
                  {member.disabledAt ? (
                    "Disabled"
                  ) : member.userId === farm.userId ? (
                    "You"
                  ) : (
                    <form action={disableMember}>
                      <input type="hidden" name="userId" value={member.userId} />
                      <button type="submit" className="text-sm font-medium text-danger">
                        Disable
                      </button>
                    </form>
                  )}
                </Td>
              </tr>
            ))
          )}
        </Table>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Open invites</h2>
        <Table headers={["Email", "Roles", "Expires", "Link"]}>
          {pending.length === 0 ? (
            <EmptyRow cols={4}>No open invites.</EmptyRow>
          ) : (
            pending.map((invite) => (
              <tr key={invite.id}>
                <Td>{invite.email}</Td>
                <Td className="capitalize">{invite.roles.map(roleLabel).join(", ")}</Td>
                <Td>{formatDisplayDate(new Intl.DateTimeFormat("en-CA", { timeZone: farm.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(invite.expiresAt))}</Td>
                <Td>
                  <CopyLink href={`${origin}/invite/${invite.token}`} />
                </Td>
              </tr>
            ))
          )}
        </Table>
      </section>
    </div>
  );
}
