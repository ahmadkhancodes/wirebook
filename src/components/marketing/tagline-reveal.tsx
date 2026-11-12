"use client";
import { useEffect, useMemo, useRef } from "react";
import { Section } from "@/components/ui/layout";

const STEP_MS = 60;

/**
 * B11 tagline reveal: a large statement whose words light up one at a time, in reading order, as each word crosses a
 * trigger line 40% above the bottom of the viewport. One IntersectionObserver watches every word; a lit word stays lit.
 * Unlit words sit at 30% of the text colour (globals.css `.kit-word`). Under reduced motion every word is lit at once.
 */
export function TaglineReveal({ text, label }: { text: string; label?: string }) {
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const spans = Array.from(el.querySelectorAll<HTMLElement>("[data-word]"));
    const lightAll = () => spans.forEach((s) => (s.dataset.on = "true"));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof IntersectionObserver === "undefined") {
      lightAll();
      return;
    }
    // Words on one line cross the trigger line together; a short queue still lights them one after another.
    const queue: HTMLElement[] = [];
    const lit = new Set<HTMLElement>();
    let timer = 0;
    const drain = () => {
      const next = queue.shift();
      if (next) next.dataset.on = "true";
      timer = queue.length ? window.setTimeout(drain, STEP_MS) : 0;
    };
    const io = new IntersectionObserver(
      (entries) => {
        // A word counts once it is above the trigger line. A fast scroll can carry words from below the line to
        // above the viewport without a callback of their own, so any change on the paragraph sweeps them up too.
        const line = window.innerHeight * 0.6;
        const crossed = (entries.some((e) => e.target === el) ? spans : entries.map((e) => e.target as HTMLElement))
          .filter((span) => spans.includes(span) && !lit.has(span) && span.getBoundingClientRect().top < line)
          .sort((x, y) => spans.indexOf(x) - spans.indexOf(y));
        for (const span of crossed) {
          lit.add(span);
          io.unobserve(span);
          queue.push(span);
        }
        if (crossed.length && !timer) drain();
      },
      { rootMargin: "0px 0px -40% 0px" },
    );
    spans.forEach((s) => io.observe(s));
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
  }, [words.length]);

  return (
    <Section tone="inverse" pad="lg">
      {label ? <p className="index-label mb-6 text-text-inverse-subtle">{label}</p> : null}
      <p ref={ref} className="heading-4 md:heading-1 hero-measure text-text-inverse">
        {words.map((w, i) => (
          <span key={i} data-word className="kit-word">
            {w}{i < words.length - 1 ? " " : ""}
          </span>
        ))}
      </p>
    </Section>
  );
}
