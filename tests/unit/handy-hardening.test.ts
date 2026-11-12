import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { csvCell, csvRow } from '../../src/lib/csv';
import { securityHeaders } from '../../src/lib/security/headers';
import { RULES } from '../../src/lib/security/ratelimit';

describe('csv export', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('x\ny')).toBe('"x\ny"');
  });
  it('defuses spreadsheet formulas', () => {
    for (const bad of ['=1+1', '+SUM(A1)', '-2', '@cmd', '\tx']) expect(csvCell(bad).startsWith("'") || csvCell(bad).startsWith('"\'')).toBe(true);
  });
  it('handles empty, dates and unicode', () => {
    expect(csvRow([undefined, null, new Date('2026-01-02T03:04:05Z'), 'Zoë 😀 <b>x</b>'])).toBe(',,2026-01-02T03:04:05.000Z,Zoë 😀 <b>x</b>');
  });
  it('has a rate limit', () => expect(RULES.export.limit).toBeGreaterThan(0));
});

describe('CSP covers every origin the app really uses', () => {
  const csp = securityHeaders().find((h) => h.key === 'Content-Security-Policy')!.value;
  const dir = (n: string) => csp.split('; ').find((d) => d.startsWith(n + ' '))!;
  it('forms may post to self and Stripe only; frames are denied; no object/base injection', () => {
    expect(dir('form-action')).toBe("form-action 'self' https://checkout.stripe.com https://billing.stripe.com");
    expect(dir('frame-ancestors')).toContain("'none'");
    expect(dir('object-src')).toContain("'none'");
    expect(dir('base-uri')).toContain("'self'");
  });
  it('fetch/XHR is same-origin plus Vercel vitals only', () => {
    expect(dir('connect-src')).not.toMatch(/\*|http:/);
  });
  it('every external URL fetched by client code is allowed', () => {
    const hosts = new Set<string>();
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f) && readFileSync(p, 'utf8').startsWith('"use client"')) {
          for (const m of readFileSync(p, 'utf8').matchAll(/(?:fetch|new WebSocket|new EventSource)\(\s*[`'"](https?:\/\/[^/`'"]+)/g)) hosts.add(m[1]!);
        }
      }
    };
    walk(join(__dirname, '../../src'));
    expect([...hosts]).toEqual([]);
  });
});

describe('secrets never reach the client bundle', () => {
  const static_ = join(__dirname, '../../.next/static');
  it.skipIf(!existsSync(static_))('built static output contains no server secret names or key material', () => {
    const bad = [/STRIPE_WEBHOOK_SECRET/, /STRIPE_SECRET_KEY/, /CRON_SECRET/, /RESEND_API_KEY/, /MONGODB_URI/, /sk_live_[A-Za-z0-9]{10,}/, /sk_test_[A-Za-z0-9]{10,}/, /whsec_[A-Za-z0-9]{10,}/, /re_[A-Za-z0-9]{20,}/, /mongodb(\+srv)?:\/\/[^\s"']+:[^\s"']+@/];
    const hits: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(js|css|html|json|txt)$/.test(f)) { const t = readFileSync(p, 'utf8'); for (const r of bad) if (r.test(t)) hits.push(`${p}: ${r}`); }
      }
    };
    walk(static_);
    expect(hits).toEqual([]);
  });
});
