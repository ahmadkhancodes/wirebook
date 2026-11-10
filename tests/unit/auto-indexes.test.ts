import { beforeEach, describe, expect, it, vi } from "vitest";

const ensure = vi.fn();
const bridge = vi.fn();
vi.mock("@/lib/db/mongo", () => ({ ensureIndexes: (...a: unknown[]) => ensure(...a), createMongoDb: () => ({ app: "wirebook" }) }));
vi.mock("@/lib/bridge/mongo", () => ({ ensureBridgeIndexes: (...a: unknown[]) => bridge(...a) }));

const setup = async (env: Record<string, string | undefined>) => {
  vi.resetModules();
  globalThis.__kitIndexes = undefined;
  for (const k of ["MONGODB_URI", "MONGODB_DB", "DB_DRIVER", "NEXT_PHASE"]) delete process.env[k];
  Object.assign(process.env, env);
  return (await import("@/lib/db")).getDb;
};
const flush = async () => { await globalThis.__kitIndexes; };

describe("lazy index creation", () => {
  beforeEach(() => { ensure.mockReset(); bridge.mockReset(); vi.spyOn(console, "warn").mockImplementation(() => {}); });

  it("runs once and not again on a second getDb()", async () => {
    const getDb = await setup({ MONGODB_URI: "mongodb://u:p@h/x", MONGODB_DB: "t" });
    await getDb(); await flush();
    await getDb(); await flush();
    expect(ensure).toHaveBeenCalledTimes(1);
    expect(ensure).toHaveBeenCalledWith("mongodb://u:p@h/x", "t");
    expect(bridge).toHaveBeenCalledTimes(1);
  });

  it("is skipped for the memory driver", async () => {
    const getDb = await setup({ DB_DRIVER: "memory" });
    await getDb();
    expect(globalThis.__kitIndexes).toBeUndefined();
    expect(ensure).not.toHaveBeenCalled();
  });

  it("is skipped during next build", async () => {
    const getDb = await setup({ MONGODB_URI: "mongodb://h/x", NEXT_PHASE: "phase-production-build" });
    await getDb();
    expect(ensure).not.toHaveBeenCalled();
  });

  it("an index error does not break getDb() and is logged scrubbed", async () => {
    ensure.mockRejectedValue(new Error("boom mongodb://u:secret@h/x"));
    const getDb = await setup({ MONGODB_URI: "mongodb://u:secret@h/x" });
    await expect(getDb()).resolves.toBeTruthy();
    await flush();
    expect(bridge).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify((console.warn as ReturnType<typeof vi.fn>).mock.calls);
    expect(logged).toContain("ensureIndexes failed");
    expect(logged).not.toContain("secret");
  });
});
