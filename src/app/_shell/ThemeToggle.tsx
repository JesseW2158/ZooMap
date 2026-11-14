"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * The light/dark switch in the top-right corner of the map. Until someone uses it, the theme
 * follows the device setting (and changes with it); once toggled, the choice is saved in this
 * browser and wins. The theme is the `dark` class on <html> (see globals.css).
 */

const STORAGE_KEY = "zoomap-theme";
type Theme = "light" | "dark";

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null; // storage blocked (private mode, site data off): fall back to the device setting
  }
}

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

/** Toggles in this tab notify subscribers through this event; the device setting through matchMedia. */
const CHANGE_EVENT = "zoomap-theme-change";

function currentTheme(): Theme {
  return storedTheme() ?? systemTheme();
}

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange); // another tab toggled
  return () => {
    query.removeEventListener("change", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function ThemeToggle() {
  // null while server-rendering; the page starts light and switches on the first client render
  const theme = useSyncExternalStore<Theme | null>(subscribe, currentTheme, () => null);

  useEffect(() => {
    if (theme) applyTheme(theme);
  }, [theme]);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      applyTheme(next); // not saved (storage blocked): apply it for this page view only
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className="pointer-events-auto absolute right-2 top-[max(0.75rem,env(safe-area-inset-top))] z-[8] flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-200 bg-white/95 text-neutral-800 shadow-md hover:bg-neutral-100"
    >
      {dark ? (
        // sun: shown in dark mode, switches to light
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        // moon: shown in light mode, switches to dark
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
