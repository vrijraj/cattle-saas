import { and, eq, inArray, isNull } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { farmMembers, invites, users } from "@/db/schema";
import { CopyLink } from "@/components/copy-link";
import { RecordDialog } from "@/components/record-dialog";
import { EmptyRow, inputClass, Notice, Submit, Summary, Table, Td } from "@/components/workspace";
import { formatDisplayDate } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { canManageTeam, ROLES } from "@/lib/permissions";
import { inviteIsOpen, roleLabel } from "@/lib/team";
import { createInvite, disableMember, enableMember, revokeInvite, updateRoles } from "./actions";

const messages: Record<string, string> = {
  form: "Enter an email and at least one role.",
  self: "You cannot disable your own sign-in.",
  member: "That person is already on this farm.",
  invite: "An open invite already exists for that email.",
  last: "This farm needs one owner or admin who can still sign in.",
  farms: "This person also belongs to another farm, so their sign-in stays as it is.",
  roles: "Choose at least one role.",
  reason: "Enter the reason for turning off this sign-in.",
};

export const metadata = { title: "Team" };

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; q?: string }>;
}) {
  const farm = await requireFarm();
  if (!canManageTeam(farm.roles)) redirect("/dashboard");
  const query = await searchParams;
  const term = query.q?.trim().toLowerCase() ?? "";
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
  const links = members.length
    ? await db
        .select({ userId: farmMembers.userId, farmId: farmMembers.farmId })
        .from(farmMembers)
        .where(inArray(farmMembers.userId, members.map((member) => member.userId)))
    : [];
  const shared = new Set(links.filter((link) => link.farmId !== farm.farmId).map((link) => link.userId));
  const pending = await db.select().from(invites).where(and(eq(invites.farmId, farm.farmId), isNull(invites.acceptedAt)));
  const origin = process.env.AUTH_URL ?? "http://localhost:3007";
  const people = members
    .filter((member) => !term || member.name?.toLowerCase().includes(term) || member.email.toLowerCase().includes(term))
    .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));
  const openInvites = pending.filter((invite) => inviteIsOpen(invite)).sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());
  const expiredInvites = pending.filter((invite) => !inviteIsOpen(invite)).sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime());
  const visibleInvites = [...openInvites, ...expiredInvites].filter((invite) => !term || invite.email.toLowerCase().includes(term));
  const active = members.filter((member) => !member.disabledAt).length;

  return (
    <div className="space-y-5">
      <Summary
        title="Team"
        description="Invite a person by email and choose their roles. Each invite lasts 7 days. Turning off a sign-in keeps that person's earlier records."
        facts={[
          { label: "People", value: String(members.length) },
          { label: "Active", value: String(active) },
          { label: "Open invites", value: String(openInvites.length) },
        ]}
        action={
          <RecordDialog title="Invite someone" button="Invite" notice={query.error === "form" ? messages.form : undefined} open={query.error === "form"}>
            <form action={createInvite} className="grid gap-3">
              <input name="email" type="email" required placeholder="Email" className={inputClass} />
              <RoleChoices />
              <Submit>Send invite</Submit>
            </form>
          </RecordDialog>
        }
      />
      <form className="flex flex-wrap items-end gap-2" method="get">
        <label className="text-sm">
          <span className="mb-1 block text-muted-foreground">Search</span>
          <input className="h-10 rounded-lg border border-border bg-background px-3" name="q" defaultValue={query.q ?? ""} placeholder="Name or email" />
        </label>
        <button className="h-10 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground" type="submit">
          Apply
        </button>
        {term ? (
          <Link href="/team" className="inline-flex h-10 items-center rounded-full border border-border px-4 text-sm font-medium">
            Clear
          </Link>
        ) : null}
      </form>
      {query.sent === "1" ? <Notice>The invitation email was sent. The link is also in the table below.</Notice> : null}
      {query.sent === "0" ? <Notice>Email is not configured, so the invite was not mailed. Copy the link from the table.</Notice> : null}
      {query.error && messages[query.error] && query.error !== "form" ? <Notice tone="danger">{messages[query.error]}</Notice> : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">People</h2>
        <Table headers={["Name", "Email", "Roles", "Access", ""]}>
          {people.length === 0 ? <EmptyRow cols={5}>{term ? "Nothing is filled in for this filter." : "No one is on this farm yet."}</EmptyRow> : null}
          {people.map((member) => {
            const mine = member.userId === farm.userId;
            const elsewhere = shared.has(member.userId);
            return (
              <tr key={member.userId}>
                <Td>{member.name ?? "—"}</Td>
                <Td>{member.email}</Td>
                <Td>{member.roles.map((role) => roleLabel[role] ?? role).join(", ")}</Td>
                <Td>{member.disabledAt ? "Disabled" : mine ? "You" : "Active"}</Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-3">
                    <RecordDialog quiet title={`Roles for ${member.name ?? member.email}`} button="Roles">
                      <form action={updateRoles} className="grid gap-3">
                        <input type="hidden" name="userId" value={member.userId} />
                        <RoleChoices selected={member.roles} />
                        <Submit>Save roles</Submit>
                      </form>
                    </RecordDialog>
                    {member.disabledAt && !elsewhere ? (
                      <form action={enableMember}>
                        <input type="hidden" name="userId" value={member.userId} />
                        <button type="submit" className="text-sm font-medium text-primary">
                          Enable
                        </button>
                      </form>
                    ) : null}
                    {!member.disabledAt && !mine && !elsewhere ? (
                      <RecordDialog quiet title={`Disable ${member.name ?? member.email}`} button="Disable">
                        <form action={disableMember} className="grid gap-3">
                          <input type="hidden" name="userId" value={member.userId} />
                          <p className="text-sm text-muted-foreground">Their earlier records stay on the farm. They cannot sign in until you enable them.</p>
                          <input name="reason" required placeholder="Reason" className={inputClass} />
                          <Submit>Disable sign-in</Submit>
                        </form>
                      </RecordDialog>
                    ) : null}
                  </div>
                </Td>
              </tr>
            );
          })}
        </Table>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Invites</h2>
        <Table headers={["Email", "Roles", "Expires", "Status", ""]}>
          {visibleInvites.length === 0 ? <EmptyRow cols={5}>{term ? "Nothing is filled in for this filter." : "No open invites."}</EmptyRow> : null}
          {visibleInvites.map((invite) => {
            const open = inviteIsOpen(invite);
            const day = new Intl.DateTimeFormat("en-CA", { timeZone: farm.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(invite.expiresAt);
            return (
              <tr key={invite.id}>
                <Td>{invite.email}</Td>
                <Td>{invite.roles.map((role) => roleLabel[role] ?? role).join(", ")}</Td>
                <Td>{formatDisplayDate(day)}</Td>
                <Td>{open ? "Open" : "Expired"}</Td>
                <Td>
                  {open ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <CopyLink href={`${origin}/invite/${invite.token}`} />
                      <form action={revokeInvite}>
                        <input type="hidden" name="id" value={invite.id} />
                        <button type="submit" className="text-sm font-medium text-primary">
                          Revoke
                        </button>
                      </form>
                    </div>
                  ) : (
                    "—"
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      </section>
    </div>
  );
}

function RoleChoices({ selected = [] }: { selected?: string[] }) {
  return (
    <fieldset className="grid gap-2 sm:grid-cols-2">
      <legend className="mb-1 text-sm text-muted-foreground">Roles</legend>
      {ROLES.map((role) => (
        <label key={role} className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="roles" value={role} defaultChecked={selected.includes(role)} />
          <span>{roleLabel[role]}</span>
        </label>
      ))}
    </fieldset>
  );
}
