"use client";

import { Loader2, MonitorSmartphone, RotateCw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { OrbitLogo } from "@/components/brand/OrbitLogo";
import { Avatar } from "@/components/profile/Avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMe } from "@/hooks/useMe";
import { ApiError, api, type Identity } from "@/lib/client/api";
import { INTERESTS } from "@/lib/interests";
import type { FriendState } from "@/lib/types";
import { cn } from "@/lib/utils";

type Mode = "login" | "register";
type Failure = { kind: "auth" | "network"; message: string };

const EASE = [0.22, 1, 0.36, 1] as const;
const NETWORK_MESSAGE = "Couldn't reach Orbit. Check your connection and try again.";

/** fetch() rejects with a TypeError when the request never reached the server; 5xx is the server's fault. */
const isNetworkError = (e: unknown) => !(e instanceof ApiError) || e.status >= 500;

export const primaryButton =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] px-4 text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(99,102,241,0.7)] transition-[filter,box-shadow,opacity] duration-200 outline-none hover:brightness-110 hover:shadow-[0_10px_30px_-8px_rgba(124,58,237,0.8)] focus-visible:ring-3 focus-visible:ring-[#60A5FA]/60 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:brightness-100";

const linkButton =
  "rounded font-medium text-[#93C5FD] underline-offset-4 transition-colors outline-none hover:text-white hover:underline focus-visible:ring-2 focus-visible:ring-[#60A5FA]/60";

/**
 * The floating window over the decorative graph. Orbit uses demo device identity (see lib/auth.ts),
 * so instead of email/password fields it restores the profile saved in this browser or creates a new one.
 */
export function AuthWindow({
  leaving,
  initialName = "",
  onEntered,
  onRegistered,
}: {
  leaving: boolean;
  /** coming back from the welcome page: reopen on the register step with the name kept */
  initialName?: string;
  onEntered: () => void;
  /** "Create account" hands off to the welcome page */
  onRegistered: (name: string) => void;
}) {
  const { identity, me, signIn } = useMe();
  const [mode, setMode] = useState<Mode>(initialName ? "register" : "login");
  const [name, setName] = useState(initialName);

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
        "relative w-full max-w-[440px] overflow-x-hidden overflow-y-auto overscroll-contain rounded-[20px] border border-[rgba(129,140,248,0.22)] p-6 sm:w-[420px] sm:p-8",
        "max-h-[calc(100dvh-32px)] bg-[rgba(14,22,44,0.94)] backdrop-blur-md",
        "shadow-[0_30px_80px_-20px_rgba(0,0,0,0.75),0_0_0_1px_rgba(255,255,255,0.03)_inset,0_0_60px_-30px_rgba(124,58,237,0.6)]",
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
              savedColor={INTERESTS.find((i) => i.id === me?.interestIds[0])?.color ?? "#60A5FA"}
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
    <header className="flex flex-col items-center text-center">
      <OrbitLogo size={52} className="drop-shadow-[0_0_18px_rgba(34,211,238,0.45)]" />
      <p className="mt-2 font-heading text-lg font-semibold tracking-[0.18em] text-white/90 uppercase">Orbit</p>
      <h1 id="auth-heading" className="mt-5 font-heading text-2xl font-semibold tracking-tight text-white">
        {heading}
      </h1>
      <p className="mt-1.5 text-sm text-[#A9B4D9]">{subtitle}</p>
    </header>
  );
}

function DemoNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-[rgba(129,140,248,0.18)] bg-white/[0.03] px-3 py-2.5 text-xs leading-relaxed text-[#A9B4D9]">
      <MonitorSmartphone className="mt-px size-4 shrink-0 text-[#93C5FD]" aria-hidden />
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
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <Brand heading="Welcome to Orbit" subtitle="Find your people. Explore your campus." />

      {identity ? (
        <div className="flex items-center gap-3 rounded-xl border border-[rgba(129,140,248,0.2)] bg-[#0A1230]/70 px-3.5 py-3">
          <Avatar name={savedName ?? "?"} url={savedAvatar} color={savedColor} size={40} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{savedName ?? "Your saved profile"}</p>
            <p className="text-xs text-[#A9B4D9]">Saved on this device</p>
          </div>
        </div>
      ) : (
        <DemoNote>
          No Orbit profile on this device yet. This demo doesn&apos;t use passwords: your profile is tied to this browser.
        </DemoNote>
      )}

      <div aria-live="polite" className="empty:hidden">
        {failure && (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-xl border border-[#fb7185]/35 bg-[#fb7185]/10 px-3.5 py-2.5 text-sm text-[#FECDD3]"
          >
            <p>{failure.message}</p>
            {failure.kind === "auth" && (
              <button type="button" onClick={onRegister} className={cn(linkButton, "self-start text-[#FECDD3]")}>
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
            "Continue on this device"
          )}
        </button>
      ) : (
        <button type="button" onClick={onRegister} className={primaryButton}>
          Get started
        </button>
      )}

      <p className="text-center text-sm text-[#A9B4D9]">
        New to Orbit?{" "}
        <button type="button" onClick={onRegister} className={linkButton}>
          Create an account
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
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <Brand heading="Create your Orbit account" subtitle="Find your people. Explore your campus." />

      <DemoNote>
        Demo mode: your account lives in this browser, so there&apos;s no email or password. Next you&apos;ll tell us a
        little about yourself.
      </DemoNote>

      <div className="space-y-1.5">
        <Label htmlFor="auth-name" className="text-[#C7D0F0]">
          Your name
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
          className="h-11 rounded-xl border-[rgba(129,140,248,0.25)] bg-[#070C1F] px-3.5 text-[15px] focus-visible:border-[#60A5FA] focus-visible:ring-[#60A5FA]/30 dark:bg-[#070C1F]"
          placeholder="Alex Rivera"
        />
        {error && (
          <p id="auth-name-error" role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>

      {replacing && (
        <p className="text-xs text-[#FCD34D]/90">
          Creating an account replaces {replacing} on this device. You won&apos;t be able to switch back.
        </p>
      )}

      <button type="submit" className={primaryButton}>
        Create account
      </button>

      <p className="text-center text-sm text-[#A9B4D9]">
        Already have an account?{" "}
        <button type="button" onClick={onLogin} className={linkButton}>
          Log in
        </button>
      </p>
    </form>
  );
}
