import { writeFileSync } from 'node:fs';
import { generatePy, generateTs } from './generate';

writeFileSync(new URL('../../packages/sdk-ts/src/models.ts', import.meta.url), generateTs());
writeFileSync(new URL('../../packages/sdk-py/src/wirebook/models.py', import.meta.url), generatePy());
console.log('wrote packages/sdk-ts/src/models.ts and packages/sdk-py/src/wirebook/models.py');
