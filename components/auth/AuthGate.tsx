"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useMe } from "@/hooks/useMe";
import type { Identity } from "@/lib/client/api";
import { AuthWindow, type VerifiedEmail } from "./AuthWindow";
import { PreviewGraph } from "./PreviewGraph";
import { Welcome } from "./Welcome";

/** Window fades out, then the graph un-dims, then the preview cross-fades into the real map. */
const WINDOW_OUT_MS = 300;
const PREVIEW_OUT_MS = 900;
/** login window ↔ welcome page cross-fade */
const WELCOME_FADE_MS = 700;

/**
 * Shows the login screen until this tab has entered Orbit, and only then mounts the real map
 * (so nothing about real users is fetched or drawn before that).
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { ready, signedIn, signIn } = useMe();
  const [entering, setEntering] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  /** set once "Create account" is pressed: the login window gives way to the welcome page */
  const [welcomeName, setWelcomeName] = useState<string | null>(null);
  const [backName, setBackName] = useState("");
  /** the school email verified on the register step; kept if the user steps back from the welcome page */
  const [verified, setVerified] = useState<VerifiedEmail | null>(null);

  useEffect(() => {
    if (!entering) return;
    const timer = setTimeout(() => setEntering(false), WINDOW_OUT_MS);
    return () => clearTimeout(timer);
  }, [entering]);

  if (!ready) return null;
  const showLogin = !signedIn || entering;

  // Once inside (overlay gone), forget the signup step so a later sign-out lands on login, not a stale welcome.
  if (!showLogin && (welcomeName !== null || backName || verified)) {
    setWelcomeName(null);
    setBackName("");
    setVerified(null);
  }

  return (
    <MotionConfig reducedMotion="user">
      {signedIn && (
        <motion.div
          initial={entering ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={{ duration: PREVIEW_OUT_MS / 1000, delay: WINDOW_OUT_MS / 1000, ease: "easeOut" }}
        >
          {children}
        </motion.div>
      )}

      <AnimatePresence>
        {showLogin && (
          <motion.div
            key="login"
            className="fixed inset-0 z-50"
            exit={{ opacity: 0, transition: { duration: PREVIEW_OUT_MS / 1000, ease: "easeOut" } }}
          >
            <AnimatePresence mode="wait">
              {welcomeName === null ? (
                <motion.div
                  key="auth"
                  className="absolute inset-0"
                  exit={{ opacity: 0, transition: { duration: WELCOME_FADE_MS / 1000, ease: "easeInOut" } }}
                >
                  <PreviewGraph mode={authMode} dim={!signedIn} />
                  <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-end overflow-y-auto px-5 py-7 sm:px-[5vw] max-[760px]:top-[34dvh] max-[760px]:items-start max-[760px]:justify-center max-[760px]:bg-[#f6efe2] max-[760px]:px-5 max-[760px]:py-5">
                    <AuthWindow
                      leaving={signedIn}
                      initialName={backName}
                      initialVerified={verified}
                      onEntered={() => setEntering(true)}
                      onRegistered={(name, email) => {
                        setVerified(email);
                        setWelcomeName(name);
                      }}
                      onModeChange={setAuthMode}
                    />
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="welcome"
                  className="absolute inset-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: WELCOME_FADE_MS / 1000 } }}
                  transition={{ duration: WELCOME_FADE_MS / 1000, ease: "easeInOut" }}
                >
                  <Welcome
                    name={welcomeName}
                    emailToken={verified?.token ?? ""}
                    onBack={() => {
                      setBackName(welcomeName);
                      setWelcomeName(null);
                    }}
                    onCreated={(identity: Identity) => {
                      signIn(identity);
                      setEntering(true);
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
