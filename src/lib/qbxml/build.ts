import { OPS, keyOf, type Field, type OpName, type Spec } from './spec';

export class QbxmlValidationError extends Error {
  constructor(public readonly path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'QbxmlValidationError';
  }
}

export const MAX_QBXML_VERSION = '16.0';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const num = (path: string, v: unknown): number => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new QbxmlValidationError(path, 'must be a number');
  return n;
};

function scalar(f: Field, v: unknown, path: string): string {
  switch (f.kind) {
    case 'str': {
      if (typeof v !== 'string') throw new QbxmlValidationError(path, 'must be a string');
      if (f.max !== undefined && v.length > f.max) throw new QbxmlValidationError(path, `must be at most ${f.max} characters`);
      return esc(v);
    }
    case 'amount': return num(path, v).toFixed(2);
    case 'price': { const s = num(path, v).toFixed(5).replace(/0{1,3}$/, ''); return s; }
    case 'quan': return String(num(path, v));
    case 'int': {
      const n = num(path, v);
      if (!Number.isInteger(n)) throw new QbxmlValidationError(path, 'must be an integer');
      return String(n);
    }
    case 'bool': {
      if (typeof v !== 'boolean') throw new QbxmlValidationError(path, 'must be true or false');
      return v ? 'true' : 'false';
    }
    case 'date': {
      if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v)))
        throw new QbxmlValidationError(path, 'must be a date as YYYY-MM-DD');
      return v;
    }
    default: throw new QbxmlValidationError(path, 'not a scalar');
  }
}

function fields(spec: Spec, data: unknown, path: string): string {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw new QbxmlValidationError(path || '$', 'must be an object');
  const rec = data as Record<string, unknown>;
  const known = new Set(spec.map(keyOf));
  for (const k of Object.keys(rec)) if (!known.has(k)) throw new QbxmlValidationError(`${path}.${k}`.replace(/^\./, ''), 'unknown field');
  let out = '';
  for (const f of spec) {
    const k = keyOf(f);
    const p = path ? `${path}.${k}` : k;
    const v = rec[k];
    if (v === undefined || v === null) {
      if (f.required) throw new QbxmlValidationError(p, 'is required');
      continue;
    }
    if (f.kind === 'obj') out += `<${f.name}>${fields(f.children ?? [], v, p)}</${f.name}>`;
    else if (f.kind === 'list') {
      if (!Array.isArray(v)) throw new QbxmlValidationError(p, 'must be an array');
      v.forEach((item, i) => {
        const ip = `${p}[${i}]`;
        if (f.children && f.children.length > 0) out += `<${f.name}>${fields(f.children, item, ip)}</${f.name}>`;
        else out += `<${f.name}>${scalar({ ...f, kind: 'str' }, item, ip)}</${f.name}>`;
      });
    } else out += `<${f.name}>${scalar(f, v, p)}</${f.name}>`;
  }
  return out;
}

const verParts = (v: string): [number, number] => {
  const [a = '0', b = '0'] = v.split('.');
  return [Number(a), Number(b)];
};
/** min(MAX_QBXML_VERSION, version reported by the Web Connector) */
export function negotiateVersion(reportedMajor: string | number, reportedMinor: string | number = 0): string {
  const rep: [number, number] = [Number(reportedMajor), Number(reportedMinor)];
  if (!Number.isFinite(rep[0]) || !Number.isFinite(rep[1]) || rep[0] <= 0) return MAX_QBXML_VERSION;
  const max = verParts(MAX_QBXML_VERSION);
  const use = rep[0] < max[0] || (rep[0] === max[0] && rep[1] < max[1]) ? rep : max;
  return `${use[0]}.${use[1]}`;
}

export interface BuildOptions {
  requestId: string;
  version?: string;
}

/** Build a complete qbXML document for one request. Never concatenates caller strings unescaped. */
export function buildRequest(op: OpName, body: unknown, opts: BuildOptions): string {
  const def = OPS[op] as { rq: string; wrapper?: string; spec: Spec };
  if (!/^[A-Za-z0-9_-]{1,50}$/.test(opts.requestId)) throw new QbxmlValidationError('requestId', 'invalid');
  const inner = fields(def.spec, body ?? {}, '');
  const content = def.wrapper ? `<${def.wrapper}>${inner}</${def.wrapper}>` : inner;
  return `<?xml version="1.0" encoding="utf-8"?><?qbxml version="${opts.version ?? MAX_QBXML_VERSION}"?><QBXML><QBXMLMsgsRq onError="stopOnError"><${def.rq} requestID="${opts.requestId}">${content}</${def.rq}></QBXMLMsgsRq></QBXML>`;
}
