"use client";
import { useEffect } from "react";

/** Press "/" anywhere outside a field to jump to the request id search (the shortcut engineers expect from a log). */
export function SearchShortcut({ selector }: { selector: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      const el = document.querySelector<HTMLInputElement>(selector);
      if (!el) return;
      e.preventDefault();
      el.focus();
      el.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selector]);
  return null;
}
