// Accelur8 team only: add a client business by hand. Find its Google listing
// (or just type a name), optionally give the owner access, pick a plan.
// No em dashes in this copy (AGENTS.md).
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Search, X } from "lucide-react";
import { searchProspects } from "../../lib/prospects.functions";
import { addClientBusiness } from "../../lib/add-business.functions";
import { ADD_PLANS, type AddPlan } from "../../lib/add-business";

interface Hit {
  placeId: string;
  name: string;
  address: string;
}

export function AddBusinessForm({
  onDone,
  onCancel,
}: {
  onDone: (tenantId: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const search = useServerFn(searchProspects);
  const add = useServerFn(addClientBusiness);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [looking, setLooking] = useState(false);
  const [pick, setPick] = useState<Hit | null>(null);
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [plan, setPlan] = useState<AddPlan>("free");
  const [busy, setBusy] = useState(false);

  const find = async () => {
    if (q.trim().length < 3) return;
    setLooking(true);
    const r = await search({ data: { q: q.trim() } }).catch(() => null);
    setLooking(false);
    if (!r?.ok) {
      toast.error((r && "error" in r && r.error) || "Search did not work. Try again.");
      return;
    }
    setHits(r.hits);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await add({
      data: {
        name: name.trim(),
        placeId: pick?.placeId ?? "",
        ownerName: ownerName.trim(),
        ownerEmail: ownerEmail.trim(),
        plan,
      },
    }).catch(() => null);
    setBusy(false);
    if (!r?.ok) {
      toast.error((r && "error" in r && r.error) || "Could not add the business. Try again.");
      return;
    }
    toast.success(`${name.trim()} added.`);
    if (r.owner.status === "invited") toast.success("We emailed the owner a link to sign in.");
    if (r.owner.status === "access")
      toast.success("The owner already had an account. They now have access.");
    if (r.owner.status === "failed") toast.error(r.owner.note || "The owner part did not work.");
    if (r.prospectLinked) toast.success("Their prospect is now marked won.");
    await onDone(r.tenantId);
  };

  const input = "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm";

  return (
    <form onSubmit={submit} className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Add a business</h2>
        <button type="button" onClick={onCancel} aria-label="Close" className="p-1">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold block">Google listing</label>
        {pick ? (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-sm">
            <div className="min-w-0">
              <div className="font-semibold truncate">{pick.name}</div>
              <div className="text-muted-foreground truncate">{pick.address}</div>
            </div>
            <button
              type="button"
              className="text-sm text-muted-foreground shrink-0"
              onClick={() => setPick(null)}
            >
              Change
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                aria-label="Search for the business on Google"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void find();
                  }
                }}
                placeholder="Business name and town"
                className={input}
              />
              <button
                type="button"
                onClick={() => void find()}
                disabled={looking || q.trim().length < 3}
                className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-border px-3 text-sm font-semibold disabled:opacity-50"
              >
                <Search className="w-4 h-4" />
                {looking ? "Searching" : "Search"}
              </button>
            </div>
            {hits && (
              <ul className="max-h-60 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                {hits.map((h) => (
                  <li key={h.placeId}>
                    <button
                      type="button"
                      onClick={() => {
                        setPick(h);
                        setName(h.name);
                        setHits(null);
                      }}
                      className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted"
                    >
                      <div className="font-semibold">{h.name}</div>
                      <div className="text-muted-foreground">{h.address}</div>
                    </button>
                  </li>
                ))}
                {hits.length === 0 && (
                  <li className="px-3 py-2.5 text-sm text-muted-foreground">
                    No match. You can still type the name below.
                  </li>
                )}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              Optional, but without it there is no Google review link.
            </p>
          </>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-semibold block" htmlFor="ab-name">
          Business name
        </label>
        <input
          id="ab-name"
          required
          minLength={2}
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={input}
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-sm font-semibold block" htmlFor="ab-owner">
            Owner name <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <input
            id="ab-owner"
            value={ownerName}
            maxLength={120}
            onChange={(e) => setOwnerName(e.target.value)}
            className={input}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-semibold block" htmlFor="ab-email">
            Owner email <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <input
            id="ab-email"
            type="email"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            className={input}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        With an email, the owner gets a link to choose their own password. If they already have an
        account, they just get access.
      </p>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold mb-2">Plan</legend>
        <div className="flex flex-wrap gap-2">
          {ADD_PLANS.map((p) => (
            <label
              key={p.id}
              className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${
                plan === p.id ? "border-primary font-semibold" : "border-border"
              }`}
            >
              <input
                type="radio"
                name="ab-plan"
                value={p.id}
                checked={plan === p.id}
                onChange={() => setPlan(p.id)}
                className="sr-only"
              />
              {p.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2 text-sm">
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || name.trim().length < 2}
          className="rounded-lg bg-primary text-primary-foreground font-semibold px-4 py-2 text-sm disabled:opacity-50"
        >
          {busy ? "Adding" : "Add business"}
        </button>
      </div>
    </form>
  );
}
