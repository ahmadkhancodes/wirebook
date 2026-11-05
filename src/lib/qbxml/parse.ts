import { XMLParser } from 'fast-xml-parser';
import { camel } from './spec';

export interface QbxmlResponse {
  requestId: string | null;
  statusCode: number;
  severity: string;
  message: string;
  /** element name of the response, e.g. CustomerQueryRs */
  rs: string;
  /** parsed Ret objects with camelCase keys; EditSequence is exposed as revisionNumber */
  rows: Record<string, unknown>[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  isArray: (name) => name.endsWith('Ret') || /Line(Ret)?$/.test(name) || name.endsWith('LineRet'),
});

function normalise(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(normalise);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (k.startsWith('@_')) continue;
      out[k === 'EditSequence' ? 'revisionNumber' : camel(k)] = normalise(val);
    }
    return out;
  }
  return v;
}

export class QbxmlParseError extends Error {}

/** Parse a QuickBooks qbXML response (one response message). Throws QbxmlParseError if malformed. */
export function parseResponse(xml: string): QbxmlResponse {
  let doc: any;
  try { doc = parser.parse(xml); } catch (e) { throw new QbxmlParseError(`not well formed XML: ${(e as Error).message}`); }
  const msgs = doc?.QBXML?.QBXMLMsgsRs;
  if (!msgs || typeof msgs !== 'object') throw new QbxmlParseError('missing QBXML/QBXMLMsgsRs');
  const rs = Object.keys(msgs).find((k) => k.endsWith('Rs'));
  if (!rs) throw new QbxmlParseError('no response element');
  const node = msgs[rs];
  const code = Number(node['@_statusCode']);
  if (!Number.isInteger(code)) throw new QbxmlParseError('missing statusCode');
  const rows: Record<string, unknown>[] = [];
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k.endsWith('Ret') && Array.isArray(v)) for (const r of v) rows.push((normalise(r) ?? {}) as Record<string, unknown>);
  }
  return {
    requestId: node['@_requestID'] ?? null,
    statusCode: code,
    severity: node['@_statusSeverity'] ?? '',
    message: node['@_statusMessage'] ?? '',
    rs,
    rows,
  };
}
