import { describe, expect, it } from 'vitest';
import { CATALOGUE } from '@/lib/errors/catalogue';
import { buildOpenApi } from '@/lib/openapi/document';
import { specToZod } from '@/lib/openapi/zod';
import { CUSTOMER_ADD, CUSTOMER_MOD } from '@/lib/qbxml/spec';
import { OBJECTS } from '@/lib/v1/objects';

const doc = buildOpenApi('https://wirebook.test') as any;

function resolve(node: unknown, root: any, bad: string[]) {
  if (Array.isArray(node)) return node.forEach((n) => resolve(n, root, bad));
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    if (k === '$ref' && typeof v === 'string') {
      let cur: any = root;
      for (const part of v.replace(/^#\//, '').split('/')) cur = cur?.[part.replace(/~1/g, '/').replace(/~0/g, '~')];
      if (cur === undefined) bad.push(v);
    } else resolve(v, root, bad);
  }
}

describe('OpenAPI document', () => {
  it('is 3.1.0 with bearer security and the end user header', () => {
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.components.securitySchemes.bearerAuth).toMatchObject({ type: 'http', scheme: 'bearer' });
    expect(doc.components.parameters.EndUserId.name).toBe('X-End-User-Id');
    expect(doc.security).toEqual([{ bearerAuth: [] }]);
  });

  it('has list and create for every object, update only where mod exists', () => {
    for (const d of Object.values(OBJECTS)) {
      const p = doc.paths[`/v1/qbd/${d.name}`];
      expect(p.get, d.name).toBeTruthy();
      expect(p.post.responses['201'], d.name).toBeTruthy();
      expect(p.post.responses['202'], d.name).toBeTruthy();
      const names = p.get.parameters.map((x: any) => x.name);
      for (const f of Object.keys(d.filters)) expect(names).toContain(f);
      expect(names).toEqual(expect.arrayContaining(['limit', 'cursor']));
      const item = doc.paths[`/v1/qbd/${d.name}/{id}`];
      expect(item.get).toBeTruthy();
      expect(!!item.post, d.name).toBe(!!d.mod);
    }
    for (const p of ['/v1/qbd/raw', '/v1/connect-links', '/v1/requests/{id}']) expect(doc.paths[p]).toBeTruthy();
  });

  it('resolves every $ref', () => {
    const bad: string[] = [];
    resolve(doc, doc, bad);
    expect(bad).toEqual([]);
  });

  it('enumerates exactly the catalogue error codes', () => {
    expect(doc.components.schemas.ErrorObject.properties.code.enum).toEqual(CATALOGUE.map((c) => c.code));
  });

  it('is serialisable JSON', () => {
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
  });
});

describe('specToZod', () => {
  it('enforces required, max length and strictness', () => {
    const s = specToZod(CUSTOMER_ADD);
    expect(s.safeParse({ name: 'A' }).success).toBe(true);
    expect(s.safeParse({}).success).toBe(false);
    expect(s.safeParse({ name: 'x'.repeat(42) }).success).toBe(false);
    expect(s.safeParse({ name: 'A', bogus: 1 }).success).toBe(false);
    expect(s.safeParse({ name: 'A', billAddress: { city: 'Z' } }).success).toBe(true);
  });

  it('mod requires revisionNumber and can omit listId', () => {
    const s = specToZod(CUSTOMER_MOD, { omit: ['listId'] });
    expect(s.safeParse({ revisionNumber: '1' }).success).toBe(true);
    expect(s.safeParse({ email: 'a' }).success).toBe(false);
  });
});
