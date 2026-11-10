/** Lazy, once-per-instance index creation for the live Mongo DB. Never throws, never blocks callers. */
type Runner = () => Promise<unknown>;

declare global {
  var __kitIndexes: Promise<void> | undefined;
}

const scrub = (e: unknown, uri: string) => {
  let m = e instanceof Error ? e.message : String(e);
  if (uri) m = m.split(uri).join("[uri]");
  return m.replace(/mongodb(\+srv)?:\/\/[^\s"']+/g, "[uri]").slice(0, 300);
};

/** Fire-and-forget: memoized on globalThis; skipped during `next build`; failures are logged and retried next cold start. */
export function scheduleIndexes(uri: string, runners: Runner[]): void {
  if (globalThis.__kitIndexes || process.env.NEXT_PHASE === "phase-production-build") return;
  globalThis.__kitIndexes = (async () => {
    for (const run of runners) {
      try {
        await run();
      } catch (e) {
        console.warn(`[db] ensureIndexes failed: ${scrub(e, uri)}`);
      }
    }
  })();
}
