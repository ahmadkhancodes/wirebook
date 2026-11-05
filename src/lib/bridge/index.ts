import { appName, dbDriver, env } from '@/lib/env';
import { createMemoryBridge, type Bridge } from './store';

export * from './store';

declare global {
  var __wirebookBridge: Bridge | undefined;
}

/** Driver follows the kit's DB_DRIVER rule: Mongo when MONGODB_URI is set, otherwise the memory driver (stub mode). */
export async function getBridge(): Promise<Bridge> {
  const e = env();
  if (dbDriver(e) === 'memory') return (globalThis.__wirebookBridge ??= createMemoryBridge());
  if (!e.MONGODB_URI) throw new Error('MONGODB_URI not set');
  const { createMongoBridge } = await import('./mongo');
  return createMongoBridge(e.MONGODB_URI, e.MONGODB_DB ?? appName(e));
}
