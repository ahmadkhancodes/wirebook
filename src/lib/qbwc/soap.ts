import { XMLParser } from 'fast-xml-parser';

export const QBWC_NS = 'http://developer.intuit.com/';
export const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const parser = new XMLParser({ removeNSPrefix: true, parseTagValue: false, trimValues: false, processEntities: true });

export interface SoapCall { op: string; args: Record<string, string> }

export function parseSoap(xml: string): SoapCall | null {
  let doc: any;
  try { doc = parser.parse(xml); } catch { return null; }
  const body = doc?.Envelope?.Body;
  if (!body || typeof body !== 'object') return null;
  const op = Object.keys(body).find((k) => !k.startsWith('?') && !k.startsWith('@_'));
  if (!op) return null;
  const raw = body[op];
  const args: Record<string, string> = {};
  if (raw && typeof raw === 'object') for (const [k, v] of Object.entries(raw)) if (!k.startsWith('@_')) args[k] = v == null || typeof v === 'object' ? '' : String(v);
  return { op, args };
}

const envelope = (inner: string) =>
  `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema"><soap:Body>${inner}</soap:Body></soap:Envelope>`;

export const simpleResponse = (op: string, value: string) =>
  envelope(`<${op}Response xmlns="${QBWC_NS}"><${op}Result>${xmlEsc(value)}</${op}Result></${op}Response>`);

export const arrayResponse = (op: string, values: string[]) =>
  envelope(`<${op}Response xmlns="${QBWC_NS}"><${op}Result>${values.map((v) => `<string>${xmlEsc(v)}</string>`).join('')}</${op}Result></${op}Response>`);

export const faultResponse = (message: string) =>
  envelope(`<soap:Fault><faultcode>soap:Client</faultcode><faultstring>${xmlEsc(message)}</faultstring></soap:Fault>`);
