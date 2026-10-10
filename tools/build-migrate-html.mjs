// Builds tools/migrate.html as ONE self-contained file (the migration code is inlined), so it
// runs by double-click / from a phone's file manager with no server.  node tools/build-migrate-html.mjs
import { readFile, writeFile } from 'node:fs/promises';
const dir = new URL('./', import.meta.url);
const src = await readFile(new URL('migrate-cloud.mjs', dir), 'utf8');
// the command-line part (Node only) is dropped; everything above it is the shared logic
const cut = src.indexOf('// ---------------------------------------------------------------- command line');
if (cut < 0) throw new Error('command-line marker not found');
const lib = src.slice(0, cut).replace(/^#!.*\n/, '').replace(/<\/script/gi, '<\\/script');
const tpl = await readFile(new URL('migrate.template.html', dir), 'utf8');
if (!tpl.includes('/*__MIGRATE_LIB__*/')) throw new Error('placeholder missing');
await writeFile(new URL('migrate.html', dir), tpl.replace('/*__MIGRATE_LIB__*/', () => lib));
console.log('tools/migrate.html written');
