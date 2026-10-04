import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');
const parse = raw => Object.fromEntries(String(raw || '').split(',').map(x => x.trim()).filter(Boolean).map(x => x.split('=').map(y => y.trim())).filter(x => x.length === 2));
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const name of ['index.html', 'style.css', 'favicon.svg']) await cp(path.join(root, 'public', name), path.join(out, name));
for (const name of ['js', 'models', 'sounds']) await cp(path.join(root, 'public', name), path.join(out, name), { recursive: true });
await cp(path.join(root, 'shared'), path.join(out, 'shared'), { recursive: true });
await cp(path.join(root, 'node_modules', 'three'), path.join(out, 'vendor', 'three'), { recursive: true });
await cp(path.join(root, 'public', 'vendor', 'qrcode'), path.join(out, 'vendor', 'qrcode'), { recursive: true });
await writeFile(path.join(out, 'config.js'), `window.GAME_SERVERS=${JSON.stringify(parse(process.env.GAME_SERVERS))};\n`);
console.log(`Static Clash Point site written to ${out}`);
