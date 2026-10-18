"use client";

import { Loader2, MonitorSmartphone, RotateCw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/profile/Avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMe } from "@/hooks/useMe";
import { ApiError, api, type Identity } from "@/lib/client/api";
import { hueVar, identityColor } from "@/lib/colors";
import type { FriendState } from "@/lib/types";
import { cn } from "@/lib/utils";

type Mode = "login" | "register";
type Failure = { kind: "auth" | "network"; message: string };

const EASE = [0.22, 1, 0.36, 1] as const;
const NETWORK_MESSAGE = "Couldn't reach Orbit. Check your connection and try again.";

/** fetch() rejects with a TypeError when the request never reached the server; 5xx is the server's fault. */
const isNetworkError = (e: unknown) => !(e instanceof ApiError) || e.status >= 500;

export const primaryButton =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-[#a8553a] px-4 text-[15px] font-semibold text-white transition-colors outline-none hover:bg-[#8f4630] focus-visible:ring-2 focus-visible:ring-[#a8553a] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f6efe2] disabled:cursor-not-allowed disabled:opacity-60";

const linkButton =
  "rounded font-medium text-[#a8553a] underline underline-offset-2 transition-colors outline-none hover:text-[#8f4630] focus-visible:ring-2 focus-visible:ring-[#a8553a]/60";

/**
 * The floating window over the decorative graph. Orbit uses demo device identity (see lib/auth.ts),
 * so instead of email/password fields it restores the profile saved in this browser or creates a new one.
 */
export function AuthWindow({
  leaving,
  initialName = "",
  onEntered,
  onRegistered,
  onModeChange,
}: {
  leaving: boolean;
  /** coming back from the welcome page: reopen on the register step with the name kept */
  initialName?: string;
  onEntered: () => void;
  /** "Create account" hands off to the welcome page */
  onRegistered: (name: string) => void;
  onModeChange: (mode: Mode) => void;
}) {
  const { identity, me, signIn } = useMe();
  const [mode, setMode] = useState<Mode>(initialName ? "register" : "login");
  const [name, setName] = useState(initialName);

  useEffect(() => onModeChange(mode), [mode, onModeChange]);

  const enter = (next: Identity) => {
    signIn(next);
    onEntered();
  };

  return (
    <motion.main
      aria-labelledby="auth-heading"
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={leaving ? { opacity: 0, scale: 0.98 } : { opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: leaving ? 0.3 : 0.4, ease: EASE }}
      inert={leaving}
      className={cn(
        "pointer-events-auto relative w-full max-w-[400px] overflow-x-hidden overflow-y-auto overscroll-contain rounded-[18px] border border-[#cdbba4] bg-[#f6efe2] p-6 text-[#3a2a20] sm:p-7",
        "max-h-[calc(100dvh-56px)] shadow-[0_18px_55px_-32px_rgba(58,42,32,0.38)]",
        "max-[760px]:max-h-[calc(66dvh-20px)] max-[760px]:rounded-none max-[760px]:border-0 max-[760px]:p-0 max-[760px]:shadow-none",
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={mode}
          initial={{ opacity: 0, x: mode === "login" ? -12 : 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: mode === "login" ? 12 : -12 }}
          transition={{ duration: 0.18, ease: EASE }}
        >
          {mode === "login" && (
            <LoginPanel
              identity={identity}
              savedName={me?.name ?? null}
              savedAvatar={me?.avatarUrl ?? null}
              savedColor={me ? identityColor(me) : hueVar("stone")}
              onEnter={enter}
              onRegister={() => setMode("register")}
            />
          )}
          {mode === "register" && (
            <RegisterPanel
              name={name}
              setName={setName}
              replacing={identity ? (me?.name ?? "your saved profile") : null}
              onNext={() => onRegistered(name.trim())}
              onLogin={() => setMode("login")}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </motion.main>
  );
}

function Brand({ heading, subtitle }: { heading: string; subtitle: string }) {
  return (
    <header>
      <p className="mb-[18px] text-[22px] font-semibold tracking-[0.02em]">Orbit</p>
      <h1 id="auth-heading" className="text-[22px] leading-tight font-semibold tracking-[-0.01em]">
        {heading}
      </h1>
      <p className="mt-1 text-sm text-[#7a6552]">{subtitle}</p>
    </header>
  );
}

function DemoNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-[10px] border border-[#cdbba4] bg-[#fffaf0] px-3 py-2.5 text-xs leading-relaxed text-[#7a6552]">
      <MonitorSmartphone className="mt-px size-4 shrink-0 text-[#a8553a]" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

function LoginPanel({
  identity,
  savedName,
  savedAvatar,
  savedColor,
  onEnter,
  onRegister,
}: {
  identity: Identity | null;
  savedName: string | null;
  savedAvatar: string | null;
  savedColor: string;
  onEnter: (identity: Identity) => void;
  onRegister: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  // Check the saved device key against the server before entering (the friends list requires it).
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identity || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await api<FriendState>("/api/friends", { identity });
      onEnter(identity);
    } catch (err) {
      setFailure(
        isNetworkError(err)
          ? { kind: "network", message: NETWORK_MESSAGE }
          : { kind: "auth", message: "We couldn't sign you in with the profile saved here. Create a new one to continue." },
      );
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-[18px]">
      <Brand heading="Welcome back to Orbit" subtitle="Pick up where you left off." />

      {identity ? (
        <div className="flex items-center gap-3 rounded-[10px] border border-[#cdbba4] bg-[#fffaf0] px-3.5 py-3">
          <Avatar name={savedName ?? "?"} url={savedAvatar} color={savedColor} size={40} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[#3a2a20]">{savedName ?? "Your saved profile"}</p>
            <p className="text-xs text-[#7a6552]">Saved on this device</p>
          </div>
        </div>
      ) : (
        <DemoNote>
          No Orbit profile is saved here yet. This demo keeps your profile on this browser, so there&apos;s no password to remember.
        </DemoNote>
      )}

      <div aria-live="polite" className="empty:hidden">
        {failure && (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-[10px] border border-[#f09595] bg-[#fcebeb] px-3.5 py-2.5 text-sm text-[#a32d2d]"
          >
            <p>{failure.message}</p>
            {failure.kind === "auth" && (
              <button type="button" onClick={onRegister} className={cn(linkButton, "self-start text-[#a32d2d]")}>
                Create a new profile
              </button>
            )}
          </div>
        )}
      </div>

      {identity ? (
        <button type="submit" disabled={busy} aria-busy={busy} className={primaryButton}>
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden /> Signing in…
            </>
          ) : failure?.kind === "network" ? (
            <>
              <RotateCw className="size-4" aria-hidden /> Retry
            </>
          ) : (
            "Log in"
          )}
        </button>
      ) : (
        <button type="button" onClick={onRegister} className={primaryButton}>
          Create your profile
        </button>
      )}

      <p className="text-center text-[13px] text-[#7a6552]">
        New to Orbit?{" "}
        <button type="button" onClick={onRegister} className={linkButton}>
          Sign up
        </button>
      </p>
    </form>
  );
}

function RegisterPanel({
  name,
  setName,
  replacing,
  onNext,
  onLogin,
}: {
  name: string;
  setName: (name: string) => void;
  replacing: string | null;
  onNext: () => void;
  onLogin: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Enter the name people will see on the map.");
    setError(null);
    onNext();
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-[18px]">
      <Brand heading="Become a node" subtitle="Create your account to join the network." />

      <DemoNote>
        Your demo profile lives in this browser. Next, you&apos;ll add a few details so Orbit can place you near your people.
      </DemoNote>

      <div className="space-y-1.5">
        <Label htmlFor="auth-name" className="text-[13px] font-normal text-[#7a6552]">
          Full name
        </Label>
        <Input
          id="auth-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          autoComplete="name"
          autoFocus
          aria-invalid={!!error}
          aria-describedby={error ? "auth-name-error" : undefined}
          className="h-10 rounded-[10px] border-[#cdbba4] bg-[#fffaf0] px-3 text-sm text-[#3a2a20] placeholder:text-[#a89886] focus-visible:border-[#a8553a] focus-visible:ring-2 focus-visible:ring-[#a8553a]/25 dark:bg-[#fffaf0]"
          placeholder="Maya Chen"
        />
        {error && (
          <p id="auth-name-error" role="alert" className="text-xs text-[#a32d2d]">
            {error}
          </p>
        )}
      </div>

      {replacing && (
        <p className="text-xs text-[#8f5f22]">
          Creating an account replaces {replacing} on this device. You won&apos;t be able to switch back.
        </p>
      )}

      <button type="submit" className={primaryButton}>
        Create account
      </button>

      <p className="text-center text-[13px] text-[#7a6552]">
        Have an account?{" "}
        <button type="button" onClick={onLogin} className={linkButton}>
          Log in
        </button>
      </p>
    </form>
  );
}
