// Gera src/gaviao-mapa.png a partir de pinta-gaviao.js, usando o Chrome instalado.
import { createRequire } from 'module';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const aqui = dirname(fileURLToPath(import.meta.url));
const require = createRequire(process.env.PW_BASE || import.meta.url);
const { chromium } = require('playwright-core');
const S = +(process.argv[2] || 512);
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const p = await b.newPage();
await p.setContent('<!doctype html><title>x</title>');
await p.addScriptTag({ content: readFileSync(join(aqui, 'pinta-gaviao.js'), 'utf8') });
const r = await p.evaluate((S) => window.pintaGaviao(S), S);
const grava = (url, arq) => writeFileSync(arq, Buffer.from(url.split(',')[1], 'base64'));
grava(r.mapa, join(aqui, '../src/gaviao-mapa.png'));
if (process.env.PREVIA) { grava(r.luz, process.env.PREVIA + '-luz.png'); grava(r.altura, process.env.PREVIA + '-altura.png'); }
await b.close();
console.log('ok', S, r.eye);
