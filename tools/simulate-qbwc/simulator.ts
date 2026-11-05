import { XMLParser } from 'fast-xml-parser';

/**
 * Spec-faithful QuickBooks Web Connector simulator for tests and the dashboard "try it".
 * It speaks the real SOAP 1.1 operations and answers qbXML from a tiny fake company file.
 * It proves our contract with the QBWC protocol; it is NOT real QuickBooks.
 */
const xp = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: false, isArray: (n) => n === 'InvoiceLineAdd' });
const xmlp = new XMLParser({ removeNSPrefix: true, parseTagValue: false, trimValues: false });
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const NS = 'xmlns="http://developer.intuit.com/"';

export type Post = (soapXml: string) => Promise<{ status: number; body: string }>;

interface Cust { ListID: string; Name: string; EditSequence: string; IsActive: boolean; Email?: string }
interface Inv { TxnID: string; RefNumber?: string; Customer: string; total: number }

export class FakeCompanyFile {
  customers: Cust[] = [];
  invoices: Inv[] = [];
  private n = 0;
  /** if set, the next request throws as if QuickBooks hung after receiving it */
  hangNext = false;
  constructor(public readonly version = '16.0') {}
  seedCustomer(name: string) { const c = { ListID: `80000001-${++this.n}`, Name: name, EditSequence: '1700000000', IsActive: true }; this.customers.push(c); return c; }

  respond(qbxml: string): string {
    const doc = xp.parse(qbxml);
    const msgs = doc?.QBXML?.QBXMLMsgsRq ?? {};
    const rq = Object.keys(msgs).find((k) => k.endsWith('Rq'));
    if (!rq) return this.wrap('', 3000, 'Error', 'no request');
    const node = msgs[rq];
    const id = node['@_requestID'] ?? '';
    const rs = rq.replace(/Rq$/, 'Rs');
    const head = (code: number, sev: string, msg: string) => `<${rs} requestID="${esc(id)}" statusCode="${code}" statusSeverity="${sev}" statusMessage="${esc(msg)}"`;
    switch (rq) {
      case 'CustomerQueryRq': {
        const rows = this.customers.map((c) => `<CustomerRet><ListID>${c.ListID}</ListID><EditSequence>${c.EditSequence}</EditSequence><Name>${esc(c.Name)}</Name><FullName>${esc(c.Name)}</FullName><IsActive>${c.IsActive}</IsActive></CustomerRet>`).join('');
        return this.wrap(rows ? `${head(0, 'Info', 'Status OK')}>${rows}</${rs}>` : `${head(1, 'Info', 'A query request did not find a matching object in QuickBooks')} />`);
      }
      case 'CustomerAddRq': {
        const name: string = node.CustomerAdd?.Name ?? '';
        if (this.customers.some((c) => c.Name === name)) return this.wrap(`${head(3100, 'Error', `The name "${name}" of the list element is already in use.`)} />`);
        const c = this.seedCustomer(name);
        return this.wrap(`${head(0, 'Info', 'Status OK')}><CustomerRet><ListID>${c.ListID}</ListID><EditSequence>${c.EditSequence}</EditSequence><Name>${esc(name)}</Name></CustomerRet></${rs}>`);
      }
      case 'InvoiceAddRq': {
        const a = node.InvoiceAdd ?? {};
        const who: string = a.CustomerRef?.FullName ?? '';
        if (!this.customers.some((c) => c.Name === who || c.ListID === a.CustomerRef?.ListID)) return this.wrap(`${head(3140, 'Error', `There is an invalid reference to QuickBooks Customer "${who}" in the Invoice.`)} />`);
        const lines: any[] = a.InvoiceLineAdd ?? [];
        const total = lines.reduce((s, l) => s + (l.Amount ? Number(l.Amount) : Number(l.Quantity ?? 1) * Number(l.Rate ?? 0)), 0);
        const inv: Inv = { TxnID: `9000-${this.invoices.length + 1}`, RefNumber: a.RefNumber, Customer: who, total };
        this.invoices.push(inv);
        return this.wrap(`${head(0, 'Info', 'Status OK')}><InvoiceRet><TxnID>${inv.TxnID}</TxnID><CustomerRef><FullName>${esc(who)}</FullName></CustomerRef><RefNumber>${esc(inv.RefNumber ?? '')}</RefNumber><Subtotal>${total.toFixed(2)}</Subtotal></InvoiceRet></${rs}>`);
      }
      default:
        return this.wrap(`${head(3000, 'Error', `unsupported request ${rq}`)} />`);
    }
  }
  private wrap(inner: string, code?: number, sev?: string, msg?: string) {
    const body = inner || `<Rs statusCode="${code}" statusSeverity="${sev}" statusMessage="${msg}" />`;
    return `<?xml version="1.0" ?><QBXML><QBXMLMsgsRs>${body}</QBXMLMsgsRs></QBXML>`;
  }
}

export interface SessionReport { ticket: string; authResult: string; exchanges: number; ended: 'done' | 'none' | 'badauth' | 'unknown_ticket' }

export class QbwcSimulator {
  constructor(private post: Post, private creds: { user: string; pass: string }, readonly qb = new FakeCompanyFile()) {}

  private async call(op: string, args: Record<string, string>) {
    const inner = Object.entries(args).map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join('');
    const xml = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><${op} ${NS}>${inner}</${op}></soap:Body></soap:Envelope>`;
    const res = await this.post(xml);
    const body = xmlp.parse(res.body)?.Envelope?.Body ?? {};
    const r = body[`${op}Response`]?.[`${op}Result`];
    return { status: res.status, result: r, raw: res.body };
  }

  /** One Web Connector run: authenticate, exchange until no work, close. */
  async runSession(): Promise<SessionReport> {
    const a = await this.call('authenticate', { strUserName: this.creds.user, strPassword: this.creds.pass });
    const strs: string[] = [].concat(a.result?.string ?? []);
    const ticket = strs[0] ?? '';
    const authResult = strs[1] ?? '';
    if (authResult === 'nvu') return { ticket, authResult, exchanges: 0, ended: 'badauth' };
    let exchanges = 0;
    let ended: SessionReport['ended'] = 'none';
    if (authResult !== 'NONE') {
      for (;;) {
        const [maj = '16', min = '0'] = this.qb.version.split('.');
        const s = await this.call('sendRequestXML', { ticket, strHCPResponse: '', strCompanyFileName: 'sample.qbw', qbXMLCountry: 'US', qbXMLMajorVers: maj, qbXMLMinorVers: min });
        const req = typeof s.result === 'string' ? s.result : '';
        if (req === '') break;
        exchanges++;
        if (this.qb.hangNext) { this.qb.hangNext = false; ended = 'done'; break; } // QuickBooks never answers: session dies after the send
        const r = await this.call('receiveResponseXML', { ticket, response: this.qb.respond(req), hresult: '', message: '' });
        ended = 'done';
        if (Number(r.result) >= 100) break;
        if (Number(r.result) < 0) { await this.call('getLastError', { ticket }); break; }
      }
    }
    await this.call('closeConnection', { ticket });
    return { ticket, authResult, exchanges, ended };
  }

  /** Simulates QuickBooks being unavailable at session start. */
  async reportConnectionError(ticket: string, hresult = '0x80040408', message = 'Could not start QuickBooks.') {
    return this.call('connectionError', { ticket, hresult, message });
  }

  /** Simulates the Web Connector handing the bridge an unknown/expired ticket. */
  async sendWithTicket(ticket: string) {
    return this.call('sendRequestXML', { ticket, strHCPResponse: '', strCompanyFileName: '', qbXMLCountry: 'US', qbXMLMajorVers: '16', qbXMLMinorVers: '0' });
  }
}
