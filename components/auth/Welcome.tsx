"use client";

import { ArrowLeft, Keyboard, Loader2, Mic, Square } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { Textarea } from "@/components/ui/textarea";
import { MAX_RECORDING_MS, useVoiceIntro } from "@/hooks/useVoiceIntro";
import { ApiError, api, type Identity } from "@/lib/client/api";
import { createProfile } from "@/lib/client/profile";
import type { ProfileInput } from "@/lib/types";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;
const NETWORK_MESSAGE = "Couldn't reach Orbit. Check your connection and try again.";
const isNetworkError = (e: unknown) => !(e instanceof ApiError) || e.status >= 500;

const LINES = ["Welcome to Orbit.", "Before we begin, could you tell us a little about yourself?"];
/** per-word stagger, and the pause between the two lines */
const WORD_S = 0.09;
const LINE_GAP_S = 0.7;
const lineStart = (i: number) => LINES.slice(0, i).reduce((t, l) => t + l.split(" ").length * WORD_S + LINE_GAP_S, 0.3);
const MIC_IN_S = lineStart(LINES.length) + 0.2;

/** Fewer words than this isn't worth sending anywhere. */
const MIN_WORDS = 4;

type Stage = "ask" | "type" | "thinking" | "review";
type Suggestion = { interestIds: number[]; bio: string | null; source: "ai" | "keywords" };

const quietButton =
  "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";

const primaryButton =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-[var(--elev)] transition-[filter,opacity] outline-none hover:brightness-105 focus-visible:ring-3 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60";

/**
 * The page right after "Create account": a gentle greeting, then a mic. The spoken intro is transcribed
 * live by OCI Speech, then turned into suggested interests and a bio the user reviews before entering.
 */
export function Welcome({
  name,
  onBack,
  onCreated,
}: {
  name: string;
  onBack: () => void;
  onCreated: (identity: Identity) => void;
}) {
  const [stage, setStage] = useState<Stage>("ask");
  const [typed, setTyped] = useState("");
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  const suggest = async (transcript: string) => {
    const words = transcript.trim().split(/\s+/).filter(Boolean).length;
    if (words < MIN_WORDS) {
      setSuggestError("We didn't catch much. Try again with a sentence or two about what you study or love doing.");
      return;
    }
    setSuggestError(null);
    setStage("thinking");
    try {
      setSuggestion(
        await api<Suggestion>("/api/onboarding/suggest", { method: "POST", body: { transcript }, identity: null }),
      );
    } catch {
      // Not worth blocking on: the user picks interests by hand.
      setSuggestion({ interestIds: [], bio: null, source: "keywords" });
      toast.error("Couldn't read your intro. Pick a few interests below.");
    }
    setStage("review");
  };

  // fires on tap-to-finish, on the 60s cap, and if the service hangs up early
  const voice = useVoiceIntro({ onDone: (transcript) => void suggest(transcript) });

  return (
    <div className="welcome fixed inset-0 overflow-y-auto">
      {/* soft clay glow that breathes with your voice */}
      <motion.div
        aria-hidden
        className="pointer-events-none fixed top-1/2 left-1/2 size-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, var(--welcome-glow), transparent 65%)" }}
        animate={{ scale: 1 + voice.level * 0.25, opacity: stage === "review" ? 0.4 : 1 }}
        transition={{ duration: 0.2 }}
      />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-xl flex-col px-4 py-6 sm:px-6">
        <div className="flex h-9 items-center">
          {stage !== "thinking" && voice.status !== "listening" && voice.status !== "finishing" && (
            <button
              type="button"
              className={quietButton}
              onClick={() => {
                voice.reset();
                if (stage === "ask") onBack();
                else setStage("ask");
              }}
            >
              <ArrowLeft className="size-4" aria-hidden /> Back
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {(stage === "ask" || stage === "type") && (
            <motion.section
              key="ask"
              className="flex flex-1 flex-col items-center justify-center gap-10 pb-16 text-center"
              exit={{ opacity: 0, y: -8, transition: { duration: 0.35 } }}
            >
              <h1 className="font-heading text-[clamp(1.6rem,4.5vw,2.4rem)] leading-snug font-semibold tracking-tight">
                {LINES.map((line, li) => (
                  <span key={li} className={cn("block", li > 0 && "mt-3 text-[0.62em] font-normal text-muted-foreground")}>
                    {line.split(" ").map((word, wi) => (
                      <motion.span
                        key={wi}
                        className="inline-block whitespace-pre"
                        initial={{ opacity: 0, y: 6, filter: "blur(6px)" }}
                        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                        transition={{ delay: lineStart(li) + wi * WORD_S, duration: 0.6, ease: EASE }}
                      >
                        {word}{" "}
                      </motion.span>
                    ))}
                  </span>
                ))}
              </h1>

              <motion.div
                className="flex w-full flex-col items-center gap-5"
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: MIC_IN_S, duration: 0.9, ease: EASE }}
              >
                {stage === "ask" ? (
                  <Recorder voice={voice} />
                ) : (
                  <form
                    className="flex w-full flex-col gap-3 text-left"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void suggest(typed);
                    }}
                  >
                    <Textarea
                      autoFocus
                      value={typed}
                      onChange={(e) => setTyped(e.target.value.slice(0, 1000))}
                      rows={4}
                      placeholder="I'm a sophomore studying CS. I climb on weekends and I'm trying to get into film photography…"
                      className="rounded-xl bg-card text-[15px]"
                    />
                    <button type="submit" className={primaryButton}>
                      Continue
                    </button>
                  </form>
                )}

                <div aria-live="polite" className="min-h-5 max-w-md text-sm text-destructive empty:hidden">
                  {suggestError ?? voice.error}
                </div>

                {voice.status !== "listening" && voice.status !== "finishing" && voice.status !== "connecting" && (
                  <div className="flex items-center gap-2">
                    {stage === "ask" ? (
                      <button type="button" className={quietButton} onClick={() => setStage("type")}>
                        <Keyboard className="size-4" aria-hidden /> Type instead
                      </button>
                    ) : (
                      <button type="button" className={quietButton} onClick={() => setStage("ask")}>
                        <Mic className="size-4" aria-hidden /> Speak instead
                      </button>
                    )}
                    <span className="text-muted-foreground/50" aria-hidden>
                      ·
                    </span>
                    <button
                      type="button"
                      className={quietButton}
                      onClick={() => {
                        setSuggestion({ interestIds: [], bio: null, source: "keywords" });
                        setStage("review");
                      }}
                    >
                      Skip
                    </button>
                  </div>
                )}
              </motion.div>
            </motion.section>
          )}

          {stage === "thinking" && (
            <motion.section
              key="thinking"
              className="flex flex-1 flex-col items-center justify-center gap-4 pb-16 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.3 } }}
            >
              <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
              <p className="text-muted-foreground">Finding your people…</p>
            </motion.section>
          )}

          {stage === "review" && suggestion && (
            <motion.section
              key="review"
              className="flex flex-1 flex-col justify-center pb-10"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: EASE }}
            >
              <header className="mb-6 text-center">
                <h1 className="font-heading text-2xl font-semibold tracking-tight">
                  {suggestion.interestIds.length ? "Here's what we heard" : "Set up your profile"}
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {suggestion.interestIds.length
                    ? "We picked these from your intro. Change anything that's off."
                    : "Pick what you're into so Orbit can place you near your people."}
                </p>
              </header>
              <div className="rounded-[20px] border border-border bg-card p-5 shadow-[var(--elev)] backdrop-blur-md sm:p-7">
                <ProfileForm
                  initial={{ name: name.trim(), bio: suggestion.bio, interestIds: suggestion.interestIds } satisfies Partial<ProfileInput>}
                  submitLabel="Enter Orbit"
                  submitClassName={primaryButton}
                  onSubmit={async ({ avatarFile, ...values }) => {
                    try {
                      const { user, identity, avatarFailed } = await createProfile(values, avatarFile);
                      if (avatarFailed) toast.error("Couldn't upload your photo");
                      onCreated(identity);
                      toast.success(`Welcome to Orbit, ${user.name.split(" ")[0]}!`, {
                        description: "Click a colored group to step inside.",
                      });
                    } catch (err) {
                      throw new Error(isNetworkError(err) ? NETWORK_MESSAGE : (err as Error).message);
                    }
                  }}
                />
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Recorder({ voice }: { voice: ReturnType<typeof useVoiceIntro> }) {
  const listening = voice.status === "listening";
  const busy = voice.status === "connecting" || voice.status === "finishing";
  const remaining = useCountdown(listening);

  return (
    <>
      <div className="relative flex size-28 items-center justify-center">
        {/* rings that swell with mic level */}
        {[0, 1].map((i) => (
          <motion.span
            key={i}
            aria-hidden
            className="absolute inset-0 rounded-full border border-primary/40"
            animate={
              listening
                ? { scale: 1 + voice.level * (0.35 + i * 0.3), opacity: 0.25 + voice.level * 0.6 }
                : { scale: 1, opacity: i === 0 ? 0.35 : 0 }
            }
            transition={{ duration: 0.15 }}
          />
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={() => void (listening ? voice.stop() : voice.start())}
          aria-label={listening ? "Stop recording" : "Start recording your intro"}
          aria-pressed={listening}
          className={cn(
            "relative flex size-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[var(--elev)] transition-[transform,filter] outline-none",
            "hover:scale-[1.04] hover:brightness-105 focus-visible:ring-4 focus-visible:ring-ring disabled:cursor-wait disabled:hover:scale-100",
          )}
        >
          {busy ? (
            <Loader2 className="size-7 animate-spin" aria-hidden />
          ) : listening ? (
            <Square className="size-6 fill-current" aria-hidden />
          ) : (
            <Mic className="size-8" aria-hidden />
          )}
        </button>
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {voice.status === "connecting"
          ? "Getting ready…"
          : voice.status === "finishing"
            ? "Wrapping up…"
            : listening
              ? `Listening · tap to finish · ${remaining}s`
              : "Tap the mic and tell us what you study and what you're into."}
      </p>

      <AnimatePresence>
        {voice.transcript && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="max-h-32 max-w-md overflow-y-auto text-[15px] leading-relaxed text-foreground/85 italic"
          >
            “{voice.transcript}”
          </motion.p>
        )}
      </AnimatePresence>
    </>
  );
}

function useCountdown(running: boolean) {
  const [left, setLeft] = useState(MAX_RECORDING_MS / 1000);
  useEffect(() => {
    if (!running) return;
    const startedAt = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restart the clock with each recording
    setLeft(MAX_RECORDING_MS / 1000);
    const id = setInterval(
      () => setLeft(Math.max(0, Math.ceil((MAX_RECORDING_MS - (Date.now() - startedAt)) / 1000))),
      250,
    );
    return () => clearInterval(id);
  }, [running]);
  return left;
}
