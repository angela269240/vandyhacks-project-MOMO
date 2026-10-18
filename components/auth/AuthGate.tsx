"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useMe } from "@/hooks/useMe";
import { AuthWindow } from "./AuthWindow";
import { PreviewGraph } from "./PreviewGraph";

/** Window fades out, then the graph un-dims, then the preview cross-fades into the real map. */
const WINDOW_OUT_MS = 300;
const PREVIEW_OUT_MS = 900;

/**
 * Shows the login screen until this tab has entered Orbit, and only then mounts the real map
 * (so nothing about real users is fetched or drawn before that).
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { ready, signedIn } = useMe();
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    if (!entering) return;
    const timer = setTimeout(() => setEntering(false), WINDOW_OUT_MS);
    return () => clearTimeout(timer);
  }, [entering]);

  if (!ready) return null;
  const showLogin = !signedIn || entering;

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
            <PreviewGraph dim={!signedIn} />
            <div className="absolute inset-0 flex items-center justify-center overflow-y-auto p-4">
              <AuthWindow leaving={signedIn} onEntered={() => setEntering(true)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
