import { z } from 'zod';
import { CATALOGUE } from '@/lib/errors/catalogue';
import { OPS } from '@/lib/qbxml/spec';
import { OBJECTS } from '@/lib/v1/objects';
import { specToZod } from './zod';

type Json = Record<string, unknown>;

const toSchema = (s: z.ZodType): Json => {
  const { $schema: _s, ...rest } = z.toJSONSchema(s, { target: 'draft-2020-12', io: 'input' }) as Json;
  return rest;
};

const pascal = (s: string) => s.split('-').map((p) => p[0]!.toUpperCase() + p.slice(1)).join('');
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const jsonContent = (schema: Json) => ({ 'application/json': { schema } });
const errorResponse = (description: string) => ({ description, content: jsonContent(ref('Error')) });
const headerRef = (name: string) => ({ $ref: `#/components/parameters/${name}` });

const ERROR_TYPES = [...new Set(CATALOGUE.map((c) => c.type))];

const commonErrors = (extra: Record<string, string> = {}) => ({
  '400': errorResponse('invalid_request: a field is invalid (see error.path), or X-End-User-Id is missing'),
  '401': errorResponse('missing_api_key or invalid_api_key'),
  '404': errorResponse('end_user_not_found or not_found'),
  '429': { ...errorResponse('rate_limited: wait for Retry-After seconds'), headers: { 'Retry-After': { description: 'Seconds to wait', schema: { type: 'integer' } } } },
  '500': errorResponse('server_error'),
  '502': errorResponse('QuickBooks or Web Connector error (type quickbooks or connection)'),
  ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, errorResponse(v)])),
});

const asyncResponse = {
  description: 'Accepted: QuickBooks did not answer within the wait window (or Prefer: respond-async was sent). Poll GET /v1/requests/{id}.',
  headers: { Location: { schema: { type: 'string' } }, 'X-Request-Id': { schema: { type: 'string' } } },
  content: jsonContent(ref('AsyncRequest')),
};

/** Builds the OpenAPI 3.1 document. Objects and operations come from OBJECTS and OPS, so new objects appear automatically. */
export function buildOpenApi(baseUrl: string): Json {
  const schemas: Record<string, Json> = {
    Error: { type: 'object', required: ['error'], properties: { error: ref('ErrorObject') } },
    ErrorObject: {
          type: 'object',
          required: ['code', 'type', 'message', 'userFacingMessage', 'guideUrl', 'retryable'],
          properties: {
            code: { type: 'string', enum: CATALOGUE.map((c) => c.code) },
            type: { type: 'string', enum: ERROR_TYPES },
            message: { type: 'string' },
            userFacingMessage: { type: 'string' },
            guideUrl: { type: 'string', format: 'uri' },
            retryable: { type: 'boolean' },
            path: { type: 'string', description: 'JSON path of the first invalid field' },
            requestId: { type: 'string' },
            cursorExpiresAt: { type: 'string', format: 'date-time' },
          },
    },
    AsyncRequest: {
      type: 'object',
      required: ['id', 'object', 'state'],
      properties: {
        id: { type: 'string' },
        object: { const: 'request' },
        state: { type: 'string', enum: ['queued', 'in_flight'] },
        links: { type: 'object', properties: { self: { type: 'string', format: 'uri' } } },
      },
    },
    QuickBooksRecord: {
      type: 'object',
      description: 'A QuickBooks Ret row. Rows are open: fields depend on the object and the QuickBooks version, keys are camelCase.',
      properties: {
        listId: { type: 'string', description: 'Id of list objects (customers, vendors, items, accounts, ...)' },
        txnId: { type: 'string', description: 'Id of transactions (invoices, bills, payments, ...)' },
        revisionNumber: { type: 'string', description: 'QuickBooks EditSequence; send it back on update' },
      },
      additionalProperties: true,
    },
    RawResponse: {
      type: 'object',
      required: ['requestId', 'state', 'raw'],
      properties: { requestId: { type: 'string' }, state: { type: 'string' }, raw: { type: 'string' }, parsed: {} },
    },
    ConnectLinkRequest: toSchema(z.object({ externalId: z.string().min(1).max(100), companyName: z.string().max(100).optional() }).strict()),
    ConnectLink: {
      type: 'object',
      required: ['id', 'object', 'url', 'expiresAt', 'endUserId', 'externalId'],
      properties: {
        id: { type: 'string' }, object: { const: 'connect_link' }, url: { type: 'string', format: 'uri' },
        expiresAt: { type: 'string', format: 'date-time' }, endUserId: { type: 'string' }, externalId: { type: 'string' },
      },
    },
    RequestStatus: {
      type: 'object',
      required: ['id', 'object', 'state'],
      properties: {
        id: { type: 'string' }, object: { const: 'request' },
        state: { type: 'string', enum: ['queued', 'in_flight', 'succeeded', 'failed', 'outcome_unknown'] },
        objectType: { type: 'string' }, method: { type: 'string' }, path: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        completedAt: { type: ['string', 'null'], format: 'date-time' },
        durationMs: { type: ['integer', 'null'] },
        data: { type: 'array', items: ref('QuickBooksRecord'), description: 'Present when state is succeeded' },
        error: { description: 'Present when state is failed or outcome_unknown', ...ref('ErrorObject') },
      },
    },
    ListEnvelope: {
      type: 'object',
      required: ['data', 'hasMore', 'nextCursor', 'cursorExpiresAt'],
      properties: {
        data: { type: 'array', items: ref('QuickBooksRecord') },
        hasMore: { type: 'boolean' },
        nextCursor: { type: ['string', 'null'], description: 'Pass as ?cursor= for the next page. Valid for 10 minutes.' },
        cursorExpiresAt: { type: ['string', 'null'], format: 'date-time' },
      },
    },
  };

  const parameters: Record<string, Json> = {
    EndUserId: { name: 'X-End-User-Id', in: 'header', required: true, description: 'The end user id (end_...) or the externalId given to POST /v1/connect-links. Selects the QuickBooks company file.', schema: { type: 'string' } },
    IdempotencyKey: { name: 'Idempotency-Key', in: 'header', required: false, description: 'Printable string, 1 to 255 characters. Replays within 7 days return the original result; a different body with the same key is idempotency_conflict.', schema: { type: 'string', minLength: 1, maxLength: 255 } },
    Prefer: { name: 'Prefer', in: 'header', required: false, description: 'Send respond-async to get 202 immediately instead of waiting for QuickBooks.', schema: { type: 'string', enum: ['respond-async'] } },
  };

  const eu = headerRef('EndUserId');
  const paths: Record<string, Json> = {};

  for (const [key, def] of Object.entries(OBJECTS)) {
    const seg = def.name || key;
    const P = pascal(seg);
    const tag = seg;
    const ret = OPS[def.query].ret;
    schemas[`${P}Create`] = toSchema(specToZod(OPS[def.add].spec));
    schemas[`${P}List`] = {
      type: 'object',
      required: ['data', 'hasMore', 'nextCursor', 'cursorExpiresAt'],
      properties: { data: { type: 'array', items: ref('QuickBooksRecord') }, hasMore: { type: 'boolean' }, nextCursor: { type: ['string', 'null'] }, cursorExpiresAt: { type: ['string', 'null'], format: 'date-time' } },
    };
    if (def.mod) schemas[`${P}Update`] = toSchema(specToZod(OPS[def.mod].spec, { omit: [def.idList === 'txnIds' ? 'txnId' : 'listId'] }));

    const filterParams = Object.keys(def.filters).map((name) => ({ name, in: 'query', required: false, schema: { type: 'string' }, description: `Filter: ${name}` }));
    paths[`/v1/qbd/${seg}`] = {
      get: {
        operationId: `list_${seg.replace(/-/g, '_')}`,
        tags: [tag], summary: `List ${seg}`,
        description: `Cursor pagination over the QuickBooks ${ret} iterator.`,
        parameters: [
          eu,
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 } },
          { name: 'cursor', in: 'query', required: false, schema: { type: 'string' }, description: 'nextCursor of the previous page' },
          ...filterParams,
        ],
        responses: {
          '200': { description: 'A page', content: jsonContent(ref(`${P}List`)) },
          '202': asyncResponse,
          ...commonErrors({ '410': 'cursor_expired' }),
        },
      },
      post: {
        operationId: `create_${seg.replace(/-/g, '_')}`,
        tags: [tag], summary: `Create ${seg.replace(/s$/, '')}`,
        parameters: [eu, headerRef('IdempotencyKey'), headerRef('Prefer')],
        requestBody: { required: true, content: jsonContent(ref(`${P}Create`)) },
        responses: {
          '201': { description: 'Created', content: jsonContent(ref('QuickBooksRecord')) },
          '202': asyncResponse,
          ...commonErrors({ '409': 'idempotency_conflict or a QuickBooks conflict such as duplicate_name', '422': 'invalid_reference' }),
        },
      },
    };

    const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string' } };
    const item: Json = {
      get: {
        operationId: `get_${seg.replace(/-/g, '_')}`,
        tags: [tag], summary: `Retrieve ${seg.replace(/s$/, '')}`,
        parameters: [eu, idParam],
        responses: { '200': { description: 'The record', content: jsonContent(ref('QuickBooksRecord')) }, '202': asyncResponse, ...commonErrors() },
      },
    };
    if (def.mod) {
      item.post = {
        operationId: `update_${seg.replace(/-/g, '_')}`,
        tags: [tag], summary: `Update ${seg.replace(/s$/, '')}`,
        description: 'Send the revisionNumber you read. A stale one is revision_conflict (409).',
        parameters: [eu, idParam, headerRef('IdempotencyKey'), headerRef('Prefer')],
        requestBody: { required: true, content: jsonContent(ref(`${P}Update`)) },
        responses: {
          '200': { description: 'Updated', content: jsonContent(ref('QuickBooksRecord')) },
          '202': asyncResponse,
          ...commonErrors({ '409': 'revision_conflict or idempotency_conflict', '422': 'invalid_reference' }),
        },
      };
    }
    paths[`/v1/qbd/${seg}/{id}`] = item;
  }

  paths['/v1/qbd/raw'] = {
    post: {
      operationId: 'raw_qbxml', tags: ['raw'], summary: 'Send one raw qbXML request',
      parameters: [eu, headerRef('IdempotencyKey'), headerRef('Prefer')],
      requestBody: {
        required: true,
        content: {
          'application/json': { schema: { type: 'object', required: ['qbxml'], properties: { qbxml: { type: 'string' } }, additionalProperties: false } },
          'application/xml': { schema: { type: 'string' } },
        },
      },
      responses: { '200': { description: 'Raw and parsed QuickBooks response', content: jsonContent(ref('RawResponse')) }, '202': asyncResponse, ...commonErrors() },
    },
  };
  paths['/v1/connect-links'] = {
    post: {
      operationId: 'create_connect_link', tags: ['connect'], summary: 'Create a connect link (and the end user if new)',
      requestBody: { required: true, content: jsonContent(ref('ConnectLinkRequest')) },
      responses: {
        '201': { description: 'Single use link, valid 24 hours', content: jsonContent(ref('ConnectLink')) },
        ...Object.fromEntries(Object.entries(commonErrors({ '409': 'already_connected' })).filter(([k]) => k !== '404')),
      },
    },
  };
  paths['/v1/requests/{id}'] = {
    get: {
      operationId: 'get_request', tags: ['requests'], summary: 'Poll a queued request',
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
      responses: { '200': { description: 'Request status', content: jsonContent(ref('RequestStatus')) }, ...commonErrors() },
    },
  };

  return {
    openapi: '3.1.0',
    info: {
      title: 'Wirebook API',
      version: '1',
      summary: 'A REST and JSON API for QuickBooks Desktop.',
      description: 'Every QuickBooks call runs against one end user company file, chosen with X-End-User-Id. Writes accept Idempotency-Key. Errors use one unified object.',
      license: { name: 'Proprietary', identifier: 'LicenseRef-Proprietary' },
    },
    servers: [{ url: baseUrl }],
    security: [{ bearerAuth: [] }],
    tags: Object.keys(OBJECTS).map((k) => ({ name: OBJECTS[k]!.name || k })),
    paths,
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'API key (sk_test_... or sk_live_...)' } },
      parameters,
      schemas,
    },
  };
}
