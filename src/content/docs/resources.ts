import { product as p } from "@/config/product";
import { OBJECTS, type ObjectDef } from "@/lib/v1/objects";
import { OPS, keyOf, type Field, type Spec } from "@/lib/qbxml/spec";
import type { DocPage, DocSection } from "./types";

/** Per object copy that the specs cannot give: what it is, and the SDK accessor names. */
const META: Record<string, { title: string; what: string; ts: string; py: string; note?: string }> = {
  customers: { title: "Customers", what: "People or companies you sell to (QuickBooks Customer list).", ts: "customers", py: "customers" },
  vendors: { title: "Vendors", what: "People or companies you buy from (QuickBooks Vendor list).", ts: "vendors", py: "vendors" },
  items: { title: "Items", what: "Things you sell or buy (QuickBooks Item list). Items are created as service items for now.", ts: "items", py: "items" },
  accounts: { title: "Accounts", what: "The chart of accounts. List also takes a type filter.", ts: "accounts", py: "accounts" },
  invoices: { title: "Invoices", what: "Invoices you send to customers (QuickBooks Invoice transaction).", ts: "invoices", py: "invoices" },
  bills: { title: "Bills", what: "Bills you owe to vendors (QuickBooks Bill transaction), with expense lines and item lines.", ts: "bills", py: "bills" },
  payments: { title: "Payments", what: "Customer payments received (QuickBooks ReceivePayment transaction).", ts: "payments", py: "payments" },
  estimates: { title: "Estimates", what: "Quotes you send to customers (QuickBooks Estimate transaction).", ts: "estimates", py: "estimates" },
  "sales-orders": { title: "Sales orders", what: "Customer orders before invoicing (QuickBooks SalesOrder transaction).", ts: "salesOrders", py: "sales_orders" },
  "sales-receipts": { title: "Sales receipts", what: "Sales paid in full at the time of sale (QuickBooks SalesReceipt transaction).", ts: "salesReceipts", py: "sales_receipts" },
  "credit-memos": { title: "Credit memos", what: "Credits you give to customers (QuickBooks CreditMemo transaction).", ts: "creditMemos", py: "credit_memos" },
  "purchase-orders": { title: "Purchase orders", what: "Orders you place with vendors (QuickBooks PurchaseOrder transaction).", ts: "purchaseOrders", py: "purchase_orders" },
  classes: { title: "Classes", what: "Classes for tracking income and expenses by department or job (QuickBooks Class list).", ts: "classes", py: "classes" },
  terms: { title: "Terms", what: "Payment terms such as Net 30. Terms are standard terms.", ts: "terms", py: "terms" },
  employees: { title: "Employees", what: "Employees (QuickBooks Employee list).", ts: "employees", py: "employees" },
};

export const resourceSlug = (segment: string) => `resource-${segment}`;

const TYPE: Record<string, string> = { str: "string", amount: "number", price: "number", quan: "number", int: "integer", bool: "boolean", date: "date (YYYY-MM-DD)", obj: "object", list: "array" };

/** Flatten a spec into table rows (path, type, required, max). */
export function fieldRows(spec: Spec, prefix = ""): { path: string; type: string; required: boolean; max?: number }[] {
  const rows: { path: string; type: string; required: boolean; max?: number }[] = [];
  for (const f of spec) {
    const path = `${prefix}${keyOf(f)}${f.kind === "list" ? "[]" : ""}`;
    if (f.kind === "list" && !f.children?.length) {
      rows.push({ path, type: "array of strings", required: !!f.required });
      continue;
    }
    rows.push({ path, type: TYPE[f.kind] ?? f.kind, required: !!f.required, ...(f.max ? { max: f.max } : {}) });
    if (f.children?.length) rows.push(...fieldRows(f.children, `${path}${f.kind === "list" ? "" : ""}.`));
  }
  return rows;
}

/** Fields of a spec as an aligned text table. The id of an update goes in the URL, so it is left out. */
export function fieldTable(spec: Spec, skip: string[] = []): string {
  const rows = fieldRows(spec).filter((r) => !skip.includes(r.path));
  const w = Math.max(...rows.map((r) => r.path.length), 5);
  const t = Math.max(...rows.map((r) => r.type.length), 4);
  const line = (a: string, b: string, c: string, d: string) => `${a.padEnd(w)}  ${b.padEnd(t)}  ${c.padEnd(8)}  ${d}`.trimEnd();
  return [line("field", "type", "required", "max length"), ...rows.map((r) => line(r.path, r.type, r.required ? "yes" : "no", r.max ? String(r.max) : ""))].join("\n");
}

const sample = (f: Field): unknown => {
  const k = keyOf(f);
  switch (f.kind) {
    case "str": return k === "listId" ? "80000001-1" : k === "txnLineId" ? "-1" : k === "name" ? "Acme Builders" : k === "fullName" ? "Acme Builders" : k === "revisionNumber" ? "1700000000" : "Example";
    case "amount": case "price": return 100;
    case "quan": case "int": return 1;
    case "bool": return true;
    case "date": return "2026-11-05";
    default: return undefined;
  }
};

/** A minimal body: every required field, with a sample value. */
export function exampleBody(spec: Spec, skip: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of spec) {
    if (!f.required || skip.includes(keyOf(f))) continue;
    if (f.kind === "obj" || f.kind === "list") {
      const kids = f.children ?? [];
      const req = kids.filter((c) => c.required);
      const use = req.length ? req : kids.slice(0, 1);
      const inner = exampleBody(use.map((c) => ({ ...c, required: true })));
      out[keyOf(f)] = f.kind === "list" ? (kids.length ? [inner] : ["example"]) : inner;
    } else out[keyOf(f)] = sample(f);
  }
  return out;
}

/** Update example: the revision you read, one changed field, and for transactions a new line. */
export function updateExample(spec: Spec): Record<string, unknown> {
  const out = exampleBody(spec, ["listId", "txnId"]);
  const optionalStr = spec.find((f) => !f.required && f.kind === "str" && f.max);
  if (optionalStr) out[keyOf(optionalStr)] = "Updated";
  const lines = spec.find((f) => f.kind === "list" && f.children?.some((c) => c.key === "txnLineId"));
  if (lines) {
    const kids = lines.children ?? [];
    const lineSpec = kids.map((c) => (c.key === "txnLineId" || c.required ? c : { ...c, required: false }));
    const withQty = lineSpec.find((c) => c.kind === "quan" || c.kind === "amount");
    const body = exampleBody(withQty ? lineSpec.map((c) => (c === withQty ? { ...c, required: true } : c)) : lineSpec);
    out[keyOf(lines)] = [body];
  }
  return out;
}

const toPy = (v: unknown, ind = 0): string => {
  const pad = "    ".repeat(ind + 1);
  const end = "    ".repeat(ind);
  if (v === true) return "True";
  if (v === false) return "False";
  if (v === null) return "None";
  if (Array.isArray(v)) return v.length ? `[\n${v.map((x) => `${pad}${toPy(x, ind + 1)},`).join("\n")}\n${end}]` : "[]";
  if (v && typeof v === "object") return `{\n${Object.entries(v).map(([k, x]) => `${pad}${JSON.stringify(k)}: ${toPy(x, ind + 1)},`).join("\n")}\n${end}}`;
  return JSON.stringify(v);
};
const toTs = (v: unknown): string => JSON.stringify(v, null, 2);

const filterNames = (def: ObjectDef) => Object.keys(def.filters);

function resourcePage(segment: string, def: ObjectDef): DocPage {
  const m = META[segment]!;
  const base = `${p.url}/v1/qbd/${segment}`;
  const addSpec = OPS[def.add].spec;
  const modSpec = def.mod ? OPS[def.mod].spec : undefined;
  const idKey = def.idList === "txnIds" ? "txnId" : "listId";
  const txn = def.idList === "txnIds";
  const createBody = exampleBody(addSpec);
  const modBody = modSpec ? updateExample(modSpec) : undefined;
  const filters = filterNames(def);

  const sections: DocSection[] = [
    {
      heading: "What it is",
      body: [
        m.what,
        `${m.title} live in the connected QuickBooks Desktop company file. Every call names the file with the X-End-User-Id header, and every field name below is the JSON key you send and receive. Behaviour on this page is validated against the QuickBooks Web Connector simulator and not yet against a real QuickBooks Desktop install. The acceptance run on a Windows rig is a launch step.`,
      ],
    },
    {
      heading: "Endpoints",
      body: [
        `GET ${base} lists ${segment}. Filters: ${filters.join(", ")}, plus limit (1 to 100, default 25) and cursor. The response has data, hasMore, nextCursor and cursorExpiresAt.`,
        `GET ${base}/{id} returns one record by its ${idKey}.`,
        `POST ${base} creates a record and returns 201 with the created object. Send an Idempotency-Key header on every write.`,
        def.mod
          ? `POST ${base}/{id} updates a record. Send the revisionNumber you read, and a stale one returns 409.`
          : `Update is not available yet for ${segment}: POST ${base}/{id} returns 405 with the error code not_supported.`,
      ],
    },
    { heading: "Create fields", body: [`Fields for POST ${base}. Unknown fields are rejected with 400 invalid_request and the JSON path of the first problem. Lengths are the QuickBooks limits.`], code: { lang: "text", code: fieldTable(addSpec) } },
  ];
  if (modSpec) {
    sections.push({
      heading: "Update fields",
      body: [
        `Fields for POST ${base}/{id}. The ${idKey} goes in the URL, not in the body. revisionNumber is required: it is the value you read last, and it protects against overwriting a change made in QuickBooks. Every other field is optional and only the fields you send change.`,
        ...(txn ? ["Every line you send carries txnLineId. Send the txnLineId of an existing line to change it, or \"-1\" to add a new line."] : []),
      ],
      code: { lang: "text", code: fieldTable(modSpec, [idKey]) },
    });
  } else {
    sections.push({ heading: "Update fields", body: [`There are none yet. ${m.title} cannot be updated through the API, and POST ${base}/{id} returns 405 not_supported.`] });
  }
  sections.push(
    { heading: "Example with curl", body: ["Create a record with the required fields. Replace the key and the end user id with your own."], code: { lang: "bash", code: `curl -X POST ${base} \\\n  -H "Authorization: Bearer sk_test_..." \\\n  -H "X-End-User-Id: acme-42" \\\n  -H "Idempotency-Key: ${segment}-create-1" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(createBody)}'` } },
    {
      heading: "Example with TypeScript",
      body: ["Typed with the models generated from the same field specs. create returns the record, or a Queued marker if QuickBooks has not answered yet."],
      code: { lang: "ts", code: `import { Wirebook } from "@wirebook/sdk";\n\nconst qb = new Wirebook({ apiKey: process.env.WIREBOOK_API_KEY! }).forUser("acme-42");\n\nconst created = await qb.qbd.${m.ts}.create(${toTs(createBody)});\n\nfor await (const row of qb.qbd.${m.ts}.iterate({ limit: 100 })) {\n  console.log(row);\n}${modBody ? `\n\nawait qb.qbd.${m.ts}.update("<${idKey}>", ${toTs(modBody)});` : ""}` },
    },
    {
      heading: "Example with Python",
      body: ["The Python SDK takes the same JSON keys, as typed dictionaries."],
      code: { lang: "python", code: `import os\nfrom wirebook import Wirebook\n\nqb = Wirebook(os.environ["WIREBOOK_API_KEY"]).for_user("acme-42")\n\ncreated = qb.qbd.${m.py}.create(${toPy(createBody)})\n\nfor row in qb.qbd.${m.py}.iterate(limit=100):\n    print(row)${modBody ? `\n\nqb.qbd.${m.py}.update("<${idKey}>", ${toPy(modBody)})` : ""}` },
    },
    {
      heading: "Waiting for QuickBooks",
      body: [
        `A request waits for QuickBooks to answer for ${p.abuse.syncWaitMs / 1000} seconds. If QuickBooks has not answered by then, the API returns 202 with a request id and a Location header, and you poll GET /v1/requests/{id}. Send Prefer: respond-async to get the 202 straight away without waiting. The company file must be open and polling, see Troubleshooting.`,
        "If a write times out after it was sent, its state becomes outcome_unknown. Query by RefNumber before you retry, and do not retry blindly.",
      ],
    },
  );
  return {
    slug: resourceSlug(segment),
    title: `${m.title} resource`,
    description: `Endpoints, filters and the create${def.mod ? " and update" : ""} fields for ${segment} in the ${p.name} API, with curl, TypeScript and Python examples.`,
    sections,
  };
}

export const resourcePages: DocPage[] = Object.entries(OBJECTS).map(([segment, def]) => resourcePage(segment, def));

export const resources: DocPage = {
  slug: "resources",
  title: "Resources",
  description: `Every object the ${p.name} API reads and writes in QuickBooks Desktop, with a page of fields for each.`,
  sections: [
    {
      heading: "How resources work",
      body: [
        `Each resource lives under ${p.url}/v1/qbd/{resource}. They share one shape: list with filters and a cursor, get by id, create, and update where QuickBooks allows it. Field tables are generated from the same specs that build the qBXML, so they cannot drift from the API. All behaviour is validated against the QuickBooks Web Connector simulator and not yet against a real QuickBooks Desktop install. The acceptance run on a Windows rig is a launch step.`,
      ],
    },
    {
      heading: "All resources",
      body: Object.entries(OBJECTS).map(([segment, def]) => `${META[segment]!.title} (/v1/qbd/${segment}, docs page ${resourceSlug(segment)}): ${def.mod ? "list, get, create, update" : "list, get, create"}.`),
    },
    {
      heading: "Raw qBXML",
      body: ["For anything outside these objects, POST /v1/qbd/raw takes one qBXML request. See the API reference."],
    },
  ],
};
