"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AIServiceSpeechRealtimeApi, RealtimeMessageResult } from "@oracle/oci-ai-speech-realtime-web";
import { api } from "@/lib/client/api";

export type VoiceStatus = "idle" | "connecting" | "listening" | "finishing" | "done" | "error";

/** Hard stop so a forgotten mic doesn't keep a paid speech session open. */
export const MAX_RECORDING_MS = 60_000;
/** How long to wait for the service's last final result after asking for it. */
const FINAL_WAIT_MS = 1500;

type Session = { token: string; compartmentId: string; endpoint: string };

/**
 * Records a spoken intro with OCI Speech realtime: the browser streams mic audio straight to OCI over a
 * websocket (authorized by a short-lived token from our server) and gets text back as the user talks.
 */
export function useVoiceIntro({ onDone }: { onDone: (transcript: string) => void }) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [finals, setFinals] = useState<string[]>([]);
  const [partial, setPartial] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** 0..1 mic loudness, for the pulsing ring */
  const [level, setLevel] = useState(0);

  const client = useRef<AIServiceSpeechRealtimeApi | null>(null);
  const finalsRef = useRef<string[]>([]);
  const stopping = useRef(false);
  const onFinal = useRef<(() => void) | null>(null);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);
  const timers = useRef<{ cap?: ReturnType<typeof setTimeout>; raf?: number; audio?: AudioContext }>({});

  const teardown = useCallback(() => {
    const t = timers.current;
    clearTimeout(t.cap);
    if (t.raf) cancelAnimationFrame(t.raf);
    t.audio?.close().catch(() => {});
    timers.current = {};
    const c = client.current;
    client.current = null;
    try {
      c?.close();
    } catch {
      // already closed
    }
    setLevel(0);
  }, []);

  useEffect(() => teardown, [teardown]);

  const stop = useCallback(async () => {
    const c = client.current;
    if (!c || stopping.current) return;
    stopping.current = true;
    setStatus("finishing");
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, FINAL_WAIT_MS);
      onFinal.current = () => {
        clearTimeout(timeout);
        resolve();
      };
      try {
        c.requestFinalResult();
      } catch {
        resolve();
      }
    });
    onFinal.current = null;
    teardown();
    setPartial("");
    setStatus("done");
    onDoneRef.current(finalsRef.current.join(" ").trim());
  }, [teardown]);

  const stopRef = useRef(stop);
  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  /** Follows the mic loudness once the SDK has opened the stream. */
  const meter = useCallback((c: AIServiceSpeechRealtimeApi) => {
    const tick = () => {
      if (client.current !== c) return;
      const t = timers.current;
      if (!t.audio && c.mediaStream) {
        t.audio = new AudioContext();
        const analyser = t.audio.createAnalyser();
        analyser.fftSize = 512;
        t.audio.createMediaStreamSource(c.mediaStream).connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        const read = () => {
          if (client.current !== c) return;
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += ((v - 128) / 128) ** 2;
          setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
          t.raf = requestAnimationFrame(read);
        };
        read();
        return;
      }
      t.raf = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const start = useCallback(async () => {
    if (client.current) return;
    stopping.current = false;
    setError(null);
    setFinals([]);
    setPartial("");
    finalsRef.current = [];
    setStatus("connecting");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser can't record audio.");
      // Ask for the mic first so a denied permission doesn't cost a speech session.
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      probe.getTracks().forEach((t) => t.stop());

      const [{ AIServiceSpeechRealtimeApi, RealtimeParametersPunctuationEnum, RealtimeParametersStabilizePartialResultsEnum }, session] =
        await Promise.all([
          import("@oracle/oci-ai-speech-realtime-web"),
          api<Session>("/api/onboarding/speech", { method: "POST", identity: null }),
        ]);

      const c: AIServiceSpeechRealtimeApi = new AIServiceSpeechRealtimeApi(
        {
          onConnect: () => {},
          onConnectMessage: () => {
            if (client.current !== c) return;
            setStatus("listening");
            meter(c);
            timers.current.cap = setTimeout(() => void stopRef.current(), MAX_RECORDING_MS);
          },
          onResult: (msg: RealtimeMessageResult) => {
            const t = msg.transcriptions?.[0];
            if (!t) return;
            if (t.isFinal) {
              finalsRef.current = [...finalsRef.current, t.transcription.trim()].filter(Boolean);
              setFinals(finalsRef.current);
              setPartial("");
              onFinal.current?.();
            } else {
              setPartial(t.transcription);
            }
          },
          onAckAudio: () => {},
          onError: (e: Error) => {
            if (client.current !== c) return;
            console.error("[voice intro]", e);
            teardown();
            setError("We lost the connection to the transcriber. Try again, or type instead.");
            setStatus("error");
          },
          onClose: () => {
            // closing after stop() is expected; an unexpected close keeps whatever we heard
            if (client.current === c) void stopRef.current();
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
          stabilizePartialResults: RealtimeParametersStabilizePartialResultsEnum.MEDIUM,
          punctuation: RealtimeParametersPunctuationEnum.AUTO,
          partialSilenceThresholdInMs: 0,
          finalSilenceThresholdInMs: 1000,
        } as never,
      );
      client.current = c;
      c.connect();
    } catch (e) {
      teardown();
      const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
      setError(
        denied
          ? "Orbit needs microphone access for this. You can allow it in your browser, or type instead."
          : ((e as Error).message ?? "Couldn't start recording."),
      );
      setStatus("error");
    }
  }, [meter, teardown]);

  const reset = useCallback(() => {
    teardown();
    finalsRef.current = [];
    setFinals([]);
    setPartial("");
    setError(null);
    setStatus("idle");
  }, [teardown]);

  return { status, transcript: [...finals, partial].filter(Boolean).join(" "), level, error, start, stop, reset };
}
