import { z } from 'zod';
import { keyOf, type Field, type Spec } from '@/lib/qbxml/spec';

const num = z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/)]);

function fieldSchema(f: Field): z.ZodType {
  let s: z.ZodType;
  switch (f.kind) {
    case 'str': s = f.max ? z.string().max(f.max) : z.string(); break;
    case 'amount': case 'price': case 'quan': s = num; break;
    case 'int': s = z.number().int(); break;
    case 'bool': s = z.boolean(); break;
    case 'date': s = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'YYYY-MM-DD'); break;
    case 'obj': s = specToZod(f.children ?? []); break;
    case 'list': s = z.array(f.children && f.children.length > 0 ? specToZod(f.children) : z.string()); break;
  }
  return f.required ? s : s.optional();
}

/**
 * Converts a qbXML field spec into a strict Zod object (unknown keys rejected, as the API does).
 * `omit` lists API keys left out of the body, e.g. `listId` for updates, where the id comes from the path.
 */
export function specToZod(spec: Spec, opts: { omit?: readonly string[] } = {}): z.ZodObject {
  const shape: Record<string, z.ZodType> = {};
  for (const f of spec) {
    const key = keyOf(f);
    if (opts.omit?.includes(key)) continue;
    shape[key] = fieldSchema(f);
  }
  return z.object(shape).strict();
}
