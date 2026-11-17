import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeCompiledScreens } from './screen-compile.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const names = writeCompiledScreens(root);
console.log(`compiled ${names.length} screen(s) into screens/compiled/`);
