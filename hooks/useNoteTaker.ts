"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { AIServiceSpeechRealtimeApi, RealtimeMessageResult } from "@oracle/oci-ai-speech-realtime-web";
import { api } from "@/lib/client/api";

/**
 * AI notetaking in a room. While your mic is on, a level meter listens locally; nothing leaves the browser until
 * you speak above SPEAK_DBFS. Then a realtime OCI Speech session transcribes you, and the text goes to the server in
 * chunks, where the AI files any events or topic facts into the room's notes. Transcripts are never stored.
 */

export type NoteTakerStatus = "off" | "unavailable" | "waiting" | "listening" | "error";

/** Loudness that counts as speaking (dBFS, i.e. relative to the mic's full scale; room noise sits around -60). */
const SPEAK_DBFS = -45;
/** How long the level has to stay above the threshold to open a session, so a cough or a door doesn't. */
const TRIGGER_MS = 250;
/** Quiet this long closes the speech session. */
const SILENCE_MS = 8_000;
/** Longest single speech session; a long talk just opens the next one. */
const MAX_SESSION_MS = 5 * 60_000;
/** Send buffered speech once it has this many words, or once the oldest of it is this old. */
const FLUSH_WORDS = 40;
const FLUSH_MS = 45_000;
/** Shorter chunks ("yeah", "okay so") aren't worth a model call. */
const MIN_WORDS = 6;
/** After a failure, wait before trying again rather than hammering the service. */
const RETRY_MS = 30_000;
const METER_MS = 50;
const FINAL_WAIT_MS = 1500;

type Session = { token: string; compartmentId: string; endpoint: string };

// ---- the on/off switch: a per-person preference, on by default ----

const PREF_KEY = "orbit.notetaking";
const prefListeners = new Set<() => void>();
const readPref = () => {
  try {
    return localStorage.getItem(PREF_KEY) !== "off";
  } catch {
    return true;
  }
};

export function useNotetakingPref() {
  const on = useSyncExternalStore(
    (cb) => {
      prefListeners.add(cb);
      window.addEventListener("storage", cb);
      return () => {
        prefListeners.delete(cb);
        window.removeEventListener("storage", cb);
      };
    },
    readPref,
    () => true,
  );
  const setOn = useCallback((next: boolean) => {
    try {
      localStorage.setItem(PREF_KEY, next ? "on" : "off");
    } catch {
      // storage blocked: the switch still works until reload
    }
    prefListeners.forEach((cb) => cb());
  }, []);
  return [on, setOn] as const;
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/**
 * Runs while `active` (notetaking on, mic on, room live). `available` is false when the server has no
 * speech/GenAI configured. Returns what the notes button shows.
 */
export function useNoteTaker({ groupName, active, available }: { groupName: string | null; active: boolean; available: boolean }) {
  const [state, setState] = useState<"waiting" | "listening" | "error">("waiting");
  const running = active && available && !!groupName;

  useEffect(() => {
    if (!running || !groupName) return;
    const room = groupName; // speech is filed in the room it was spoken in
    let cancelled = false;
    /** finalized speech not yet sent, and when its oldest part arrived */
    let buffer = { text: [] as string[], since: 0 };
    const flush = () => {
      const text = buffer.text.join(" ").trim();
      buffer = { text: [], since: 0 };
      if (words(text) < MIN_WORDS) return;
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      api(`/api/groups/${encodeURIComponent(room)}/notes/transcript`, { body: { text, timeZone } }).catch((e) =>
        console.warn("[notes] couldn't file notes", (e as Error).message),
      );
    };
    let stream: MediaStream | null = null;
    let audio: AudioContext | null = null;
    let meter: ReturnType<typeof setInterval> | undefined;
    let client: AIServiceSpeechRealtimeApi | null = null;
    let opening = false;
    let loudSince = 0;
    let lastLoud = 0;
    let sessionStart = 0;
    let retryAt = 0;
    let onFinal: (() => void) | null = null;

    const closeSession = async (keep: boolean) => {
      const c = client;
      if (!c) return;
      client = null;
      if (keep) {
        // Ask for whatever's still pending so the end of the sentence isn't lost.
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, FINAL_WAIT_MS);
          onFinal = () => {
            clearTimeout(t);
            resolve();
          };
          try {
            c.requestFinalResult();
          } catch {
            resolve();
          }
        });
        onFinal = null;
      }
      try {
        c.close();
      } catch {
        // already closed
      }
      if (keep) flush();
      else buffer = { text: [], since: 0 };
      if (!cancelled) setState("waiting");
    };

    const openSession = async () => {
      if (client || opening) return;
      opening = true;
      try {
        const [sdk, session] = await Promise.all([
          import("@oracle/oci-ai-speech-realtime-web"),
          api<Session>(`/api/groups/${encodeURIComponent(room)}/notes/speech`, { method: "POST" }),
        ]);
        if (cancelled) return;
        const c: AIServiceSpeechRealtimeApi = new sdk.AIServiceSpeechRealtimeApi(
          {
            onConnect: () => {},
            onConnectMessage: () => {
              if (client === c && !cancelled) setState("listening");
            },
            onResult: (msg: RealtimeMessageResult) => {
              const t = msg.transcriptions?.[0];
              if (!t?.isFinal) return;
              const text = t.transcription.trim();
              if (text) {
                if (!buffer.text.length) buffer.since = Date.now();
                buffer.text.push(text);
                if (words(buffer.text.join(" ")) >= FLUSH_WORDS) flush();
              }
              onFinal?.();
            },
            onAckAudio: () => {},
            onError: (e: Error) => {
              if (client !== c) return;
              console.warn("[notes] transcriber error", e.message);
              retryAt = Date.now() + RETRY_MS;
              void closeSession(true);
              if (!cancelled) setState("error");
            },
            onClose: () => {
              if (client === c) void closeSession(true);
            },
          },
          session.token,
          session.compartmentId,
          session.endpoint,
          {
            isAckEnabled: false,
            encoding: "audio/raw;rate=16000",
            languageCode: "en-US",
            modelDomain: "GENERIC",
            punctuation: sdk.RealtimeParametersPunctuationEnum.AUTO,
            partialSilenceThresholdInMs: 0,
            finalSilenceThresholdInMs: 1000,
          } as never,
        );
        client = c;
        sessionStart = Date.now();
        c.connect();
      } catch (e) {
        console.warn("[notes] couldn't start transcribing", (e as Error).message);
        retryAt = Date.now() + RETRY_MS;
        if (!cancelled) setState("error");
      } finally {
        opening = false;
      }
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        if (!cancelled) setState("error");
        return;
      }
      if (cancelled) return stream.getTracks().forEach((t) => t.stop());
      audio = new AudioContext();
      const analyser = audio.createAnalyser();
      analyser.fftSize = 1024;
      audio.createMediaStreamSource(stream).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      setState("waiting");

      // An interval, not requestAnimationFrame, so it keeps going while the room is minimized or the tab is hidden.
      meter = setInterval(() => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        const dbfs = 20 * Math.log10(Math.sqrt(sum / buf.length) || 1e-8);
        const now = Date.now();
        if (dbfs > SPEAK_DBFS) {
          loudSince ||= now;
          lastLoud = now;
          if (!client && now - loudSince >= TRIGGER_MS && now >= retryAt) void openSession();
        } else loudSince = 0;

        if (client && (now - lastLoud > SILENCE_MS || now - sessionStart > MAX_SESSION_MS)) void closeSession(true);
        if (buffer.text.length && now - buffer.since > FLUSH_MS) flush();
      }, METER_MS);
    })();

    return () => {
      cancelled = true;
      clearInterval(meter);
      // Muting, leaving or switching rooms files what you already said. Turning notetaking off discards it.
      void closeSession(readPref());
      stream?.getTracks().forEach((t) => t.stop());
      audio?.close().catch(() => {});
    };
  }, [running, groupName]);

  const status: NoteTakerStatus = !available ? "unavailable" : !running ? "off" : state;
  return status;
}
