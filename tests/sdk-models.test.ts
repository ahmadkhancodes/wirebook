import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generatePy, generateTs, models, TYPE_NAMES } from '../tools/gen-sdk-models/generate';
import { OBJECTS } from '../src/lib/v1/objects';
import { MODELS } from '../packages/sdk-ts/src/models';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('generated SDK models', () => {
  it('the committed files match the generator (run `npm run gen:sdk` after changing a spec)', () => {
    expect(read('packages/sdk-ts/src/models.ts')).toBe(generateTs());
    expect(read('packages/sdk-py/src/wirebook/models.py')).toBe(generatePy());
  });

  it('covers every API object, and update exists exactly where the API has a Mod operation', () => {
    expect(Object.keys(MODELS).sort()).toEqual(Object.keys(OBJECTS).sort());
    expect(Object.keys(TYPE_NAMES).sort()).toEqual(Object.keys(OBJECTS).sort());
    for (const m of models()) expect(!!m.update, m.object).toBe(!!OBJECTS[m.object]!.mod);
    expect(MODELS.payments.updatable).toBe(false);
    expect(MODELS.estimates.updatable).toBe(true);
  });

  it('reflects the field specs: required fields, line types, update leaves the id out', () => {
    const ts = generateTs();
    expect(ts).toMatch(/export interface CustomerCreate \{\n {2}name: string;/);
    expect(ts).toMatch(/export interface EstimateUpdate \{\n {2}revisionNumber: string;/);
    expect(ts).toContain('lines?: EstimateLine[];');
    expect(ts).toContain('lines?: EstimateUpdateLine[];');
    expect(ts).toMatch(/export interface EstimateUpdateLine \{\n {2}txnLineId: string;/);
    expect(ts).not.toMatch(/export interface CustomerUpdate \{[^}]*listId/);
    expect(ts).not.toContain('PaymentUpdate');
  });
});
