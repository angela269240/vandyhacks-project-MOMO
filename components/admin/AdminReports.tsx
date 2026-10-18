"use client";

import { ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api, roomPath } from "@/lib/client/api";
import type { Report, ReportCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

const CATEGORY_LABEL: Record<ReportCategory, string> = {
  chat: "Chat",
  note: "Note",
  username: "Username",
  group: "Group name",
};

const button =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-[filter,opacity] outline-none hover:brightness-105 focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-60";
const link = "rounded text-sm text-muted-foreground underline underline-offset-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

type State = { kind: "loading" } | { kind: "signin" } | { kind: "error"; message: string } | { kind: "ready"; email: string; reports: Report[] };

export function AdminReports() {
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(async () => {
    try {
      const data = await api<{ email: string; reports: Report[] }>("/api/admin/reports", { identity: null });
      setState({ kind: "ready", ...data });
    } catch (e) {
      setState(e instanceof ApiError && e.status === 401 ? { kind: "signin" } : { kind: "error", message: "Couldn't load reports." });
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- first load after mount
  useEffect(() => void load(), [load]);

  const signOut = async () => {
    await api("/api/admin/auth/logout", { method: "POST", identity: null }).catch(() => {});
    setState({ kind: "signin" });
  };

  return (
    <main className="relative min-h-dvh bg-background px-4 py-10 text-foreground sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        {state.kind === "loading" && <Loader2 className="mx-auto mt-24 size-6 animate-spin text-muted-foreground" aria-label="Loading" />}
        {state.kind === "error" && (
          <p role="alert" className="mt-24 text-center text-sm text-muted-foreground">
            {state.message}{" "}
            <button type="button" onClick={load} className={link}>
              Try again
            </button>
          </p>
        )}
        {state.kind === "signin" && <SignIn onSignedIn={load} />}
        {state.kind === "ready" && (
          <>
            <header className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
              <h1 className="font-heading text-2xl font-semibold tracking-tight">Reports</h1>
              <p className="text-xs text-muted-foreground">
                {state.email} ·{" "}
                <button type="button" onClick={signOut} className={cn(link, "text-xs")}>
                  Sign out
                </button>
              </p>
            </header>
            <ReportList reports={state.reports} />
          </>
        )}
      </div>
    </main>
  );
}

function ReportList({ reports }: { reports: Report[] }) {
  const [open, setOpen] = useState<string | null>(null);

  if (!reports.length) {
    return (
      <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
        No reports yet. Every night the moderator reviews the day&apos;s chats, notes, usernames and group names.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="grid grid-cols-[7.5rem_1fr_1.25rem] gap-3 border-b border-border px-4 py-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <span>Category</span>
        <span>Summary</span>
      </div>
      <ul>
        {reports.map((r) => {
          const expanded = open === r.id;
          return (
            <li key={r.id} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : r.id)}
                aria-expanded={expanded}
                aria-controls={`report-${r.id}`}
                className="grid w-full grid-cols-[7.5rem_1fr_1.25rem] items-center gap-3 px-4 py-3 text-left text-sm transition-colors outline-none hover:bg-accent focus-visible:bg-accent"
              >
                <span className="text-muted-foreground">{CATEGORY_LABEL[r.category]}</span>
                <span className={cn("min-w-0", !expanded && "truncate")}>{r.summary}</span>
                <ChevronRight
                  className={cn("size-4 text-muted-foreground transition-transform duration-200", expanded && "rotate-90")}
                  aria-hidden
                />
              </button>
              {expanded && <ReportDetails report={r} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ReportDetails({ report: r }: { report: Report }) {
  const href = r.groupName ? roomPath(r.groupName) : null;
  const who = r.category === "username" ? "User" : r.category === "group" ? "Created by" : "Posted by";
  const rows: [string, React.ReactNode][] = [
    ["Severity", <span key="s" className={cn("capitalize", r.severity === "high" && "font-semibold text-destructive")}>{r.severity}</span>],
    ["Why", r.reason || "No reason given."],
    ["Flagged text", <q key="q" className="break-words whitespace-pre-wrap">{r.excerpt}</q>],
    ...(r.userName || r.userId ? ([[who, r.userName ?? r.userId]] as [string, React.ReactNode][]) : []),
    ["Room", r.groupName ?? (r.category === "username" ? "Not in a room right now" : "Unknown")],
    ...(r.itemAt ? ([["Written", when(r.itemAt)]] as [string, React.ReactNode][]) : []),
    ["Reported", when(r.createdAt)],
  ];
  return (
    <div id={`report-${r.id}`} className="space-y-3 bg-muted px-4 pt-1 pb-4 text-sm">
      <dl className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0">{value}</dd>
          </div>
        ))}
      </dl>
      {href && (
        <Link href={href} className="inline-block text-sm font-medium text-primary underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Open {r.groupName} →
        </Link>
      )}
    </div>
  );
}

/** Email, then the code emailed to it. Every sign-in needs a fresh code. */
function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!sentTo) {
        const address = email.trim().toLowerCase();
        await api("/api/admin/auth/start", { body: { email: address }, identity: null });
        setSentTo(address);
      } else {
        await api("/api/admin/auth/verify", { body: { email: sentTo, code: code.trim() }, identity: null });
        onSignedIn();
        return;
      }
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : "Couldn't reach Orbit. Try again.");
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} noValidate className="mx-auto mt-16 flex max-w-sm flex-col gap-4 rounded-xl border border-border bg-card p-6">
      <div>
        <h1 className="font-heading text-xl font-semibold">Admin sign-in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {sentTo ? `If ${sentTo} is an admin account, a 6-digit code is on its way.` : "We'll email a code to your admin address."}
        </p>
      </div>
      {!sentTo ? (
        <div className="space-y-1.5">
          <Label htmlFor="admin-email">Email</Label>
          <Input id="admin-email" type="email" autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="admin-code">Code</Label>
          <Input
            id="admin-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="tracking-[0.3em]"
          />
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy || (!sentTo ? !email.trim() : code.length !== 6)} className={button}>
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {sentTo ? "Sign in" : "Email me a code"}
      </button>
      {sentTo && (
        <button
          type="button"
          onClick={() => {
            setSentTo(null);
            setCode("");
            setError(null);
          }}
          className={cn(link, "self-center")}
        >
          Use a different email
        </button>
      )}
    </form>
  );
}
