import { XMLParser } from 'fast-xml-parser';

/**
 * Spec-faithful QuickBooks Web Connector simulator for tests and the dashboard "try it".
 * It speaks the real SOAP 1.1 operations and answers qbXML from a tiny fake company file.
 * It proves our contract with the QBWC protocol; it is NOT real QuickBooks.
 */
const xp = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: false, isArray: (n) => ['InvoiceLineAdd', 'ExpenseLineAdd', 'ItemLineAdd', 'AppliedToTxnAdd'].includes(n) });
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
  seedCustomer(name: string) { const c: Cust = { ListID: `80000001-${++this.n}`, Name: name, EditSequence: '1700000000', IsActive: true }; this.customers.push(c); return c; }

  /** generic stores for the objects added in M2 (vendor, item, account, bill, receive payment), keyed by Ret element */
  store: Record<string, Record<string, any>[]> = {};
  private iters = new Map<string, { rows: string[]; offset: number }>();
  private seq = 0;

  /** applies MaxReturned and the iterator protocol to a list of serialized Ret rows */
  private page(rows: string[], node: any, rs: string, id: string, head: (code: number, sev: string, msg: string) => string): string {
    const mode = node['@_iterator'];
    let list = rows;
    let offset = 0;
    let iterId: string | undefined;
    if (mode === 'Continue') {
      iterId = node['@_iteratorID'];
      const st = iterId ? this.iters.get(iterId) : undefined;
      if (!st) return this.wrap(`${head(3231, 'Error', 'The iterator ID is invalid or has expired.')} />`);
      list = st.rows;
      offset = st.offset;
    } else if (mode === 'Start') iterId = `{sim-iter-${++this.seq}}`;
    const max = node.MaxReturned ? Number(node.MaxReturned) : list.length;
    const slice = list.slice(offset, offset + max);
    const remaining = list.length - offset - slice.length;
    if (iterId) this.iters.set(iterId, { rows: list, offset: offset + slice.length });
    const attrs = iterId ? ` iteratorID="${iterId}" iteratorRemainingCount="${remaining}"` : '';
    if (!slice.length) return this.wrap(`${head(1, 'Info', 'A query request did not find a matching object in QuickBooks')}${attrs} />`);
    return this.wrap(`${head(0, 'Info', 'Status OK')}${attrs}>${slice.join('')}</${rs}>`);
  }

  private toXml(o: any, ret = false): string {
    return Object.entries(o)
      .filter(([k]) => !k.startsWith('@_'))
      .map(([k, v]) => {
        const name = ret ? k.replace(/Add$/, 'Ret') : k;
        return (Array.isArray(v) ? v : [v]).map((x) => (x && typeof x === 'object' ? `<${name}>${this.toXml(x, ret)}</${name}>` : `<${name}>${esc(String(x))}</${name}>`)).join('');
      })
      .join('');
  }

  private names(type: string, key: string, v: string) {
    const rows = type === 'Customer' ? this.customers : (this.store[`${type}Ret`] ?? []);
    return rows.some((r: any) => r[key === 'ListID' ? 'ListID' : 'FullName'] === v || r.Name === v);
  }

  respond(qbxml: string): string {
    const doc = xp.parse(qbxml);
    const msgs = doc?.QBXML?.QBXMLMsgsRq ?? {};
    const rq = Object.keys(msgs).find((k) => k.endsWith('Rq'));
    if (!rq) return this.wrap('', 3000, 'Error', 'no request');
    const node = msgs[rq];
    const id = node['@_requestID'] ?? '';
    const rs = rq.replace(/Rq$/, 'Rs');
    const head = (code: number, sev: string, msg: string) => `<${rs} requestID="${esc(id)}" statusCode="${code}" statusSeverity="${sev}" statusMessage="${esc(msg)}"`;
    const wanted = (k: string): string[] => ([] as string[]).concat(node[k] ?? []);
    switch (rq) {
      case 'CustomerQueryRq': {
        const ids = wanted('ListID');
        const starts: string | undefined = node.NameFilter?.MatchCriterion === 'StartsWith' ? node.NameFilter.Name : undefined;
        const rows = this.customers
          .filter((c) => (!ids.length || ids.includes(c.ListID)) && (!starts || c.Name.startsWith(starts)))
          .map((c) => `<CustomerRet><ListID>${c.ListID}</ListID><EditSequence>${c.EditSequence}</EditSequence><Name>${esc(c.Name)}</Name><FullName>${esc(c.Name)}</FullName><IsActive>${c.IsActive}</IsActive>${c.Email ? `<Email>${esc(c.Email)}</Email>` : ''}</CustomerRet>`);
        return this.page(rows, node, rs, id, head);
      }
      case 'CustomerAddRq': {
        const name: string = node.CustomerAdd?.Name ?? '';
        if (this.customers.some((c) => c.Name === name)) return this.wrap(`${head(3100, 'Error', `The name "${name}" of the list element is already in use.`)} />`);
        const c = this.seedCustomer(name);
        if (node.CustomerAdd?.Email) c.Email = node.CustomerAdd.Email;
        return this.wrap(`${head(0, 'Info', 'Status OK')}><CustomerRet><ListID>${c.ListID}</ListID><EditSequence>${c.EditSequence}</EditSequence><Name>${esc(name)}</Name></CustomerRet></${rs}>`);
      }
      case 'CustomerModRq': {
        const m = node.CustomerMod ?? {};
        const c = this.customers.find((x) => x.ListID === m.ListID);
        if (!c) return this.wrap(`${head(3140, 'Error', 'Invalid reference: customer not found.')} />`);
        if (c.EditSequence !== m.EditSequence) return this.wrap(`${head(3200, 'Error', 'The provided edit sequence is out-of-date.')} />`);
        if (m.Name) c.Name = m.Name;
        if (m.Email) c.Email = m.Email;
        c.EditSequence = String(Number(c.EditSequence) + 1);
        return this.wrap(`${head(0, 'Info', 'Status OK')}><CustomerRet><ListID>${c.ListID}</ListID><EditSequence>${c.EditSequence}</EditSequence><Name>${esc(c.Name)}</Name></CustomerRet></${rs}>`);
      }
      case 'InvoiceQueryRq': {
        const ids = wanted('TxnID');
        const rows = this.invoices
          .filter((i) => !ids.length || ids.includes(i.TxnID))
          .map((i) => `<InvoiceRet><TxnID>${i.TxnID}</TxnID><CustomerRef><FullName>${esc(i.Customer)}</FullName></CustomerRef><RefNumber>${esc(i.RefNumber ?? '')}</RefNumber><Subtotal>${i.total.toFixed(2)}</Subtotal></InvoiceRet>`);
        return this.page(rows, node, rs, id, head);
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
      default: {
        const m = /^(Vendor|Item|Account|Bill|ReceivePayment)(Service)?(Query|Add|Mod)Rq$/.exec(rq);
        if (!m) return this.wrap(`${head(3000, 'Error', `unsupported request ${rq}`)} />`);
        const [, type, svc, kind] = m as unknown as [string, string, string | undefined, string];
        const ret = `${type}${svc ?? ''}Ret`;
        const rowsOf = (t: string) => (this.store[t === 'Item' ? 'ItemServiceRet' : `${t}Ret`] ??= []);
        const list = rowsOf(type);
        const isTxn = type === 'Bill' || type === 'ReceivePayment';
        const idTag = isTxn ? 'TxnID' : 'ListID';
        if (kind === 'Query') {
          const ids = wanted(idTag);
          const starts: string | undefined = node.NameFilter?.MatchCriterion === 'StartsWith' ? node.NameFilter.Name : undefined;
          const rows = list
            .filter((r) => (!ids.length || ids.includes(r[idTag])) && (!starts || String(r.Name).startsWith(starts)))
            .map((r) => `<${ret}>${this.toXml(r)}</${ret}>`);
          return this.page(rows, node, rs, id, head);
        }
        if (kind === 'Mod') {
          const mod = node[`${type}Mod`] ?? {};
          const r = list.find((x) => x.ListID === mod.ListID);
          if (!r) return this.wrap(`${head(3140, 'Error', `Invalid reference: ${type} not found.`)} />`);
          if (r.EditSequence !== mod.EditSequence) return this.wrap(`${head(3200, 'Error', 'The provided edit sequence is out-of-date.')} />`);
          for (const [k, v] of Object.entries(mod)) if (k !== 'ListID' && k !== 'EditSequence') r[k] = v;
          if (mod.Name) r.FullName = mod.Name;
          r.EditSequence = String(Number(r.EditSequence) + 1);
          return this.wrap(`${head(0, 'Info', 'Status OK')}><${ret}>${this.toXml(r)}</${ret}></${rs}>`);
        }
        const a = node[`${type}${svc ?? ''}Add`] ?? {};
        if (type === 'Bill' && !this.names('Vendor', a.VendorRef?.ListID ? 'ListID' : 'FullName', a.VendorRef?.ListID ?? a.VendorRef?.FullName)) return this.wrap(`${head(3140, 'Error', `There is an invalid reference to QuickBooks Vendor "${a.VendorRef?.FullName ?? ''}" in the Bill.`)} />`);
        if (type === 'ReceivePayment' && !this.names('Customer', a.CustomerRef?.ListID ? 'ListID' : 'FullName', a.CustomerRef?.ListID ?? a.CustomerRef?.FullName)) return this.wrap(`${head(3140, 'Error', `There is an invalid reference to QuickBooks Customer "${a.CustomerRef?.FullName ?? ''}" in the payment.`)} />`);
        if (!isTxn && list.some((r) => r.Name === a.Name)) return this.wrap(`${head(3100, 'Error', `The name "${a.Name}" of the list element is already in use.`)} />`);
        const row: Record<string, any> = isTxn
          ? { TxnID: `9500-${++this.seq}`, ...a }
          : { ListID: `80000100-${++this.seq}`, EditSequence: '1700000000', ...a, FullName: a.Name };
        if (type === 'Bill') row.AmountDue = ([] as any[]).concat(a.ExpenseLineAdd ?? [], a.ItemLineAdd ?? []).reduce((s, l) => s + Number(l.Amount ?? Number(l.Quantity ?? 1) * Number(l.Cost ?? 0)), 0).toFixed(2);
        const out = this.toXml(row, true);
        list.push(row);
        return this.wrap(`${head(0, 'Info', 'Status OK')}><${ret}>${out}</${ret}></${rs}>`);
      }
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
