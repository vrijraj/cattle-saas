import { inputClass, Notice, PageHeader, Panel, Pill, Submit } from "@/components/workspace";
import { requireFarm } from "@/lib/farm-context";
import { roleLabel } from "@/lib/team";
import { changePassword, switchFarm, updateProfileName } from "./actions";

export const metadata = { title: "Profile" };

const errorMessages: Record<string, string> = {
  name: "Enter a name between 2 and 120 characters.",
  password: "Enter your current password and a new password of at least 8 characters.",
  mismatch: "New password and confirmation did not match.",
  current: "Current password did not match.",
  farm: "You do not have access to that farm.",
};

function initials(name: string) {
  const letters = name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return letters || "•";
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const farm = await requireFarm();
  const query = await searchParams;
  const name = farm.userName ?? farm.email;
  const roles = farm.roles.map((role) => roleLabel[role] ?? role);

  return (
    <div className="space-y-5">
      <PageHeader title="Profile" description="Your sign-in, password, and active farm workspace." />
      {query.saved === "name" ? <Notice>Your display name was updated.</Notice> : null}
      {query.saved === "password" ? <Notice>Your password was changed.</Notice> : null}
      {query.error && errorMessages[query.error] ? <Notice tone="danger">{errorMessages[query.error]}</Notice> : null}

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-primary text-xl font-semibold text-primary-foreground">{initials(name)}</span>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold tracking-tight">{name}</h2>
            <p className="mt-1 truncate text-sm text-muted-foreground">{farm.email}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {roles.map((role) => (
                <Pill key={role} tone="good">
                  {role}
                </Pill>
              ))}
              {farm.canRecordVaccines && farm.roles.includes("worker") ? <Pill tone="warn">Vaccine entry</Pill> : null}
            </div>
          </div>
        </div>
      </section>

      <Panel title="This farm" description="The active farm attached to your workspace session.">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Farm</dt>
            <dd className="mt-1 text-sm font-medium">{farm.farmName}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Timezone</dt>
            <dd className="mt-1 text-sm font-medium">{farm.timezone}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Animal prefix</dt>
            <dd className="mt-1 text-sm font-medium">{farm.animalPrefix}</dd>
          </div>
        </dl>
        {farm.farms.length > 1 ? (
          <div className="mt-5 border-t border-border pt-4">
            <p className="text-xs font-medium text-muted-foreground">Switch farm</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {farm.farms.map((entry) => {
                const active = entry.id === farm.farmId;
                return (
                  <form key={entry.id} action={switchFarm}>
                    <input type="hidden" name="farmId" value={entry.id} />
                    <button
                      type="submit"
                      disabled={active}
                      className={`inline-flex h-10 items-center rounded-full border px-4 text-sm font-medium transition-colors ${
                        active
                          ? "border-primary/30 bg-accent text-accent-foreground"
                          : "border-border bg-card text-foreground hover:bg-muted"
                      }`}
                    >
                      {entry.name} {active ? "(active)" : ""}
                    </button>
                  </form>
                );
              })}
            </div>
          </div>
        ) : null}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Profile, WhatsApp & language" description="Shown on records and audit entries. Linking your phone enables WhatsApp shed commands.">
          <form action={updateProfileName} className="grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Name</span>
              <input name="name" required minLength={2} maxLength={120} defaultValue={farm.userName ?? ""} className={inputClass} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Phone / WhatsApp (optional)</span>
              <input name="phone" type="tel" maxLength={20} defaultValue={farm.userPhone ?? ""} placeholder="+919876543210" className={inputClass} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Interface language</span>
              <select name="locale" defaultValue={farm.locale} className={inputClass}>
                <option value="en">English</option>
                <option value="hi">हिन्दी (Hindi)</option>
                <option value="gu">ગુજરાતી (Gujarati)</option>
                <option value="mr">मराठी (Marathi)</option>
              </select>
            </label>
            <div>
              <Submit>Save profile</Submit>
            </div>
          </form>
        </Panel>

        <Panel title="Change password" description="Use at least 8 characters.">
          <form action={changePassword} className="grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Current password</span>
              <input name="currentPassword" type="password" required autoComplete="current-password" className={inputClass} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">New password</span>
              <input name="nextPassword" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className={inputClass} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Confirm new password</span>
              <input name="confirmPassword" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className={inputClass} />
            </label>
            <div>
              <Submit>Change password</Submit>
            </div>
          </form>
        </Panel>
      </div>
    </div>
  );
}
