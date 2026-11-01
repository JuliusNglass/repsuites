// "Confirm your email" bar for people who signed up themselves.
// No em dashes in this copy (AGENTS.md).
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import {
  confirmEmailCodeFn,
  getEmailCheckFn,
  resendEmailCodeFn,
} from "../../lib/email-check.functions";

export function EmailCheckBar() {
  const load = useServerFn(getEmailCheckFn);
  const confirm = useServerFn(confirmEmailCodeFn);
  const resend = useServerFn(resendEmailCodeFn);
  const [email, setEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    load()
      .then((r) => setEmail(r.ok && r.needed ? r.email : null))
      .catch(() => null);
  }, [load]);

  if (!email) return null;
  return (
    <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-2 text-amber-950">
      <p className="font-bold flex items-center gap-1.5">
        <MailCheck className="w-4 h-4" /> Confirm your email
      </p>
      <p className="text-base">
        We sent a 6-digit code to <b>{email}</b>. Type it here.{" "}
        <b>You can print your QR card now.</b>
      </p>
      <p className="text-base">
        Private feedback from customers starts coming to your email once you confirm. You also need
        this before you can upgrade or ask customers for reviews.
      </p>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await confirm({ data: { code } }).catch(() => null);
          setBusy(false);
          if (r?.ok) {
            toast.success("Email confirmed. Thank you.");
            setEmail(null);
          } else toast.error(r?.error ?? "Something went wrong. Try again.");
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          aria-label="6-digit code"
          className="w-32 rounded-lg border border-amber-300 bg-white px-3 py-2 text-lg tracking-widest font-bold"
        />
        <button
          type="submit"
          disabled={busy || code.length !== 6}
          className="rounded-lg bg-amber-500 text-amber-950 font-bold px-4 py-2 text-base disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Confirm
        </button>
        <button
          type="button"
          onClick={async () => {
            const r = await resend().catch(() => null);
            if (r?.ok) toast.success("New code sent. Check your inbox and spam folder.");
            else toast.error(r?.error ?? "Could not send. Try again.");
          }}
          className="text-base underline px-1"
        >
          Send a new code
        </button>
      </form>
      <p className="text-base">Connecting a Google account with the same email confirms it too.</p>
    </section>
  );
}
