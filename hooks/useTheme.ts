"use client";

import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light";
const KEY = "sm.theme";

/** Runs before paint (inlined in <head>) so there's no flash of the wrong theme. */
export const themeBootScript = `try{var t=localStorage.getItem("${KEY}");if(t==="light"){var c=document.documentElement.classList;c.remove("dark");c.add("light")}}catch(e){}`;

const read = (): Theme => (document.documentElement.classList.contains("light") ? "light" : "dark");

function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}

export function setTheme(theme: Theme) {
  const c = document.documentElement.classList;
  c.toggle("light", theme === "light");
  c.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(KEY, theme);
  } catch {}
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, read, () => "dark");
}
