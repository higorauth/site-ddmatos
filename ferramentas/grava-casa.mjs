// Grava a casa 3D quadro a quadro (num Chrome com placa de vídeo) para a versão sem placa:
// um vídeo de abertura, um por capítulo e uma imagem da casa aberta. Saída em src/videos.
// Uso: sirva dist/ (python3 -m http.server 8765 --directory dist) e rode
//   PW_BASE=<pasta com node_modules/playwright-core>/ node ferramentas/grava-casa.mjs [endereço]
// Precisa do Chrome instalado e do ffmpeg no PATH. Depois rode python3 build.py.
import { createRequire } from 'module';
import { mkdirSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const AQUI = dirname(fileURLToPath(import.meta.url));
const require = createRequire(process.env.PW_BASE || import.meta.url);
const { chromium } = require('playwright-core');
const ENDERECO = process.argv[2] || 'http://127.0.0.1:8765/';
const S = 960, OUT = join(tmpdir(), `gravacao-${Date.now()}`), VID = join(AQUI, '..', 'src', 'videos');
mkdirSync(VID, { recursive: true });
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: S, height: S }, deviceScaleFactor: 1 });
const erros = []; p.on('pageerror', (e) => erros.push(e.message));
await p.goto(ENDERECO);
await p.waitForFunction(() => window.Cena && window.Cena.pronta, null, { timeout: 30000 });
await p.evaluate(() => scrollTo({ top: innerHeight * .5, behavior: 'instant' }));
await p.waitForFunction(() => window.Casa3D && window.Casa3D.pronta, null, { timeout: 60000 });
await p.evaluate((S) => {
  const comp = document.createElement('canvas'); comp.width = S; comp.height = S;
  const x = comp.getContext('2d'); window.__comp = comp;
  window.Cena.aposQuadro = () => {
    x.globalAlpha = 1; x.fillStyle = '#ffffff'; x.fillRect(0, 0, S, S);
    const a = document.querySelector('#cena');
    if (a && getComputedStyle(a).visibility !== 'hidden') x.drawImage(a, 0, 0, S, S);
    const c = document.querySelector('#casa3d');
    if (c && c.style.visibility !== 'hidden') { x.globalAlpha = c.style.opacity === '' ? 1 : +c.style.opacity; x.drawImage(c, 0, 0, S, S); x.globalAlpha = 1; }
    const m = document.querySelector('#marcas');
    if (!m || !m.classList.contains('ligada')) return;
    for (const e of m.children) {
      const t = /translate3d\(([-\d.]+)px,\s*([-\d.]+)px/.exec(e.style.transform);
      if (!t) continue;
      const r = e.getBoundingClientRect(), esq = e.classList.contains('esq'), px = +t[1] + (esq ? -4 : 4), py = +t[2];
      x.fillStyle = 'rgba(215,38,46,.22)'; x.beginPath(); x.arc(px, py, 8, 0, 6.2832); x.fill();
      x.fillStyle = '#D7262E'; x.beginPath(); x.arc(px, py, 4, 0, 6.2832); x.fill();
      x.save(); x.shadowColor = 'rgba(215,38,46,.28)'; x.shadowBlur = 14; x.shadowOffsetY = 5;
      x.beginPath(); x.roundRect(r.left, r.top, r.width, r.height, r.height / 2); x.fill(); x.restore();
      x.fillStyle = '#ffffff'; x.font = '600 13px -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif'; x.textBaseline = 'middle';
      x.fillText(e.textContent, r.left + 11, r.top + r.height / 2 + .5);
    }
  };
  window.Cena.grava({ shift: [0, 0], distMul: .73 });
}, S);

const passo = (n) => p.evaluate((n) => { for (let i = 0; i < n; i++) window.Cena.passo(1000 / 30); }, n);
const salva = (arq, url) => writeFileSync(arq, Buffer.from(url.split(',')[1], 'base64'));
async function capta(dir, n, rolagem) {
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < n; i++) {
    const url = await p.evaluate(([i, rolagem]) => {
      if (rolagem) { const [y0, y1, nr] = rolagem, t = Math.min(1, i / nr), e = t * t * (3 - 2 * t); scrollTo({ top: y0 + (y1 - y0) * e, behavior: 'instant' }); }
      window.Cena.passo(1000 / 30);
      return window.__comp.toDataURL('image/jpeg', .92);
    }, [i, rolagem]);
    salva(`${dir}/f${String(i + 1).padStart(4, '0')}.jpg`, url);
  }
}
const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
const LACO = '[0]split[a][b];[a]trim=start_frame=30,setpts=PTS-STARTPTS[c];[b]trim=end_frame=30,setpts=PTS-STARTPTS[h];[c][h]xfade=transition=fade:duration=1:offset=5,format=yuv420p[v]';
function codifica(nome, dir, laco) {
  const ent = ['-framerate', '30', '-i', `${dir}/f%04d.jpg`];
  const filtro = laco ? ['-filter_complex', LACO, '-map', '[v]'] : ['-vf', 'format=yuv420p'];
  ff([...ent, ...filtro, '-c:v', 'libx264', '-crf', '25', '-preset', 'slow', '-movflags', '+faststart', '-an', `${VID}/${nome}.mp4`]);
  ff([...ent, ...filtro, '-c:v', 'libvpx-vp9', '-crf', '37', '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '3', '-an', `${VID}/${nome}.webm`]);
  ff(['-i', `${dir}/f${laco ? '0031' : '0001'}.jpg`, '-q:v', '5', `${VID}/${nome}.jpg`]);
}

const t0 = Date.now();
const A = await p.evaluate(() => document.querySelector('#pragas').getBoundingClientRect().top + scrollY);
// Abertura: a casa de pontos é escaneada e vira a casa de verdade; o telhado sobe.
await p.evaluate((y) => { scrollTo({ top: y, behavior: 'instant' }); window.Cena.praga(null, true); }, A - .1 * S);
await passo(120);
await capta(`${OUT}/abertura`, 180, [A - .1 * S, A + .75 * S, 150]);
codifica('abertura', `${OUT}/abertura`, false);
console.log('abertura', ((Date.now() - t0) / 1000).toFixed(0) + 's');
// Casa aberta, sem capítulo: imagem de fundo.
await p.evaluate((y) => { scrollTo({ top: y, behavior: 'instant' }); window.Cena.praga(null, true); }, A + .85 * S);
await passo(150);
salva(`${VID}/visao.jpg`, await p.evaluate(() => { window.Cena.passo(1000 / 30); return window.__comp.toDataURL('image/jpeg', .86); }));
// Um vídeo por capítulo, com a câmera de cada um e as pragas se mexendo.
for (const [nome, sel] of [['baratas', '#baratas'], ['formigas', '#formigas'], ['ratos', '#ratos'], ['cupins', '#cupins'], ['mosquitos', '#mosquitos'], ['desentupimento', '#desentupimento'], ['caixa', '#caixa-dagua']]) {
  await p.evaluate(([sel, nome]) => { const e = document.querySelector(sel); scrollTo({ top: e.getBoundingClientRect().top + scrollY - .12 * innerHeight, behavior: 'instant' }); window.Cena.praga(nome, true); }, [sel, nome]);
  await passo(130);
  await capta(`${OUT}/${nome}`, 210);
  codifica(nome, `${OUT}/${nome}`, true);
  console.log(nome, ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
await b.close();
console.log(erros.length ? 'erros: ' + erros.join(' | ') : 'sem erros');
console.log(execFileSync('/bin/ls', ['-la', VID]).toString());
