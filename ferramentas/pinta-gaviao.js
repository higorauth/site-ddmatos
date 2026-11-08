// Pinta o mapa do gavião provisório em um <canvas>. Roda dentro do Chrome.
// Saída: PNG com R = altura, G = luz, B = máscara (255 corpo, 200 cera amarela, 0 fora).
// Quando a logo real chegar, é este arquivo que muda.
window.pintaGaviao = function (S) {
  const k = S / 1000;
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.scale(k, k);
    return [c, x];
  };
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

  // Silhueta: busto de perfil, olhando para a esquerda, cabeça erguida, sem ataque.
  const SIL = new Path2D(
    'M520 176 C458 160 404 164 352 196 ' +
    'C322 200 292 216 276 246 ' +
    'C262 272 258 306 270 344 ' +
    'C276 322 288 306 312 302 ' +
    'C330 299 350 304 368 314 ' +
    'C366 332 374 348 388 360 ' +
    'C420 426 404 512 374 604 ' +
    'C346 706 346 850 402 1000 ' +
    'L918 1000 C900 820 852 640 780 490 ' +
    'C748 420 716 330 664 268 ' +
    'C626 222 574 190 520 176 Z');
  const BICO = new Path2D(
    'M352 196 C322 200 292 216 276 246 C262 272 258 306 270 344 C276 322 288 306 312 302 C330 299 350 304 368 314 C378 272 372 226 352 196 Z');
  const CERA = new Path2D('M352 196 C334 200 316 208 304 218 C322 238 342 268 346 304 C354 306 362 310 368 314 C378 272 372 226 352 196 Z');
  const ASA = new Path2D('M640 440 C720 470 800 560 846 700 C880 800 900 900 918 1000 L560 1000 C560 860 570 620 640 440 Z');
  const EYE = { x: 444, y: 240, r: 29 };

  // Direção de cada pena, da raiz para a ponta.
  const dirPena = (x, y) => {
    const face = Math.atan2(y - 262, x - 372);
    const corpo = Math.PI / 2 - 0.2 - 0.35 * sm(380, 900, x);
    const t = sm(300, 520, y + (x - 420) * 0.35);
    return face + (corpo - face) * t;
  };
  const tamPena = (x, y, asa) => (asa ? 44 + 44 * sm(460, 1000, y) : 11 + 32 * sm(250, 780, y));

  const [cL, L] = mk();  // luz
  const [cH, H] = mk();  // altura
  const [cM, M] = mk();  // máscara

  // Altura de base: volume macio do busto.
  H.fillStyle = '#000'; H.fillRect(0, 0, 1000, 1000);
  H.save(); H.filter = 'blur(70px)'; H.fillStyle = '#b8b8b8'; H.fill(SIL); H.restore();
  H.save(); H.filter = 'blur(26px)'; H.globalCompositeOperation = 'lighter'; H.fillStyle = '#383838'; H.fill(SIL); H.restore();
  const cab = H.createRadialGradient(486, 262, 10, 486, 262, 210);
  cab.addColorStop(0, 'rgba(255,255,255,.34)'); cab.addColorStop(1, 'rgba(255,255,255,0)');
  H.save(); H.globalCompositeOperation = 'lighter'; H.fillStyle = cab; H.fillRect(0, 0, 1000, 1000); H.restore();

  // Luz de base.
  L.fillStyle = '#000'; L.fillRect(0, 0, 1000, 1000);
  L.save(); L.clip(SIL);
  const base = L.createLinearGradient(330, 200, 820, 900);
  base.addColorStop(0, '#8c8c8c'); base.addColorStop(1, '#565656');
  L.fillStyle = base; L.fillRect(0, 0, 1000, 1000);
  L.restore();

  // Penas: desenhadas de baixo para cima, para que as de cima cubram a raiz das de baixo.
  const penas = [];
  for (let y = 1040; y > 170; y -= 7) {
    for (let x = 300; x < 960; x += 7) {
      const asa = L.isPointInPath(ASA, x * k, y * k);
      const s = tamPena(x, y, asa);
      const passo = s * 0.62;
      if (Math.floor(x / passo) * passo !== x - (x % passo)) continue;
      if (rnd() > 7 * 7 / (passo * passo * 0.9)) continue;
      penas.push({ x: x + (rnd() - .5) * 5, y: y + (rnd() - .5) * 5, s, asa });
    }
  }
  penas.sort((a, b) => b.y - a.y);
  const pena = (ctx, p, cor0, cor1, cor2) => {
    const a = dirPena(p.x, p.y) + (rnd() - .5) * .16;
    const len = p.s * (p.asa ? 1.7 : 1.5), w = p.s * (p.asa ? .5 : .62);
    const c = Math.cos(a), s = Math.sin(a);
    const X = (u, v) => p.x + u * c - v * s, Y = (u, v) => p.y + u * s + v * c;
    ctx.beginPath();
    ctx.moveTo(X(0, -w * .35), Y(0, -w * .35));
    ctx.quadraticCurveTo(X(len * .55, -w), Y(len * .55, -w), X(len, 0), Y(len, 0));
    ctx.quadraticCurveTo(X(len * .55, w), Y(len * .55, w), X(0, w * .35), Y(0, w * .35));
    ctx.closePath();
    const g = ctx.createLinearGradient(p.x, p.y, X(len, 0), Y(len, 0));
    g.addColorStop(0, cor0); g.addColorStop(.72, cor1); g.addColorStop(1, cor2);
    ctx.fillStyle = g; ctx.fill();
  };
  L.save(); L.clip(SIL); H.save(); H.clip(SIL);
  H.globalCompositeOperation = 'source-over';
  for (const p of penas) {
    const st = seed;
    const v = p.asa ? 0.72 : 0.95;
    const c = (n) => `rgb(${n * v * 255 | 0},${n * v * 255 | 0},${n * v * 255 | 0})`;
    pena(L, p, c(.2), c(.62), c(1));
    seed = st;
    const h0 = 0.5 + 0.34 * (1 - sm(250, 1000, p.y));
    const g = (n) => { const q = (n * h0 * 255) | 0; return `rgba(${q},${q},${q},.62)`; };
    pena(H, p, g(.74), g(.96), g(1.12));
  }
  L.restore(); H.restore();

  // Barras do peito: faixas curvas, a marca visual dos gaviões.
  L.save(); L.clip(SIL); L.globalCompositeOperation = 'multiply'; L.filter = 'blur(1.2px)';
  for (let y = 452; y < 1040; y += 25 + (y - 452) * .014) {
    L.beginPath();
    for (let x = 320; x <= 700; x += 10) {
      const yy = y + 20 * Math.sin((x - 320) / 380 * Math.PI) + 2.4 * Math.sin(x * .13 + y);
      x === 320 ? L.moveTo(x, yy) : L.lineTo(x, yy);
    }
    L.lineWidth = 7 + (y - 452) * .008; L.strokeStyle = '#4a4a4a'; L.stroke();
  }
  L.restore();
  // A asa cobre o fim das barras.
  L.save(); L.clip(ASA); L.fillStyle = '#4a4a4a'; L.fillRect(0, 0, 1000, 1000); L.restore();
  L.save(); L.clip(SIL); L.clip(ASA);
  for (const p of penas.filter((q) => q.asa)) {
    const c = (n) => `rgb(${Math.min(255, n * 190) | 0},${Math.min(255, n * 190) | 0},${Math.min(255, n * 190) | 0})`;
    pena(L, p, c(.22), c(.6), c(1.3));
  }
  L.restore();

  // Rosto: claro e calmo, com faixa escura atrás do olho.
  L.save(); L.clip(SIL);
  L.filter = 'blur(14px)'; L.globalCompositeOperation = 'lighter';
  L.fillStyle = 'rgba(120,120,120,.62)';
  L.beginPath(); L.ellipse(446, 316, 58, 30, .25, 0, 7); L.fill();
  L.filter = 'blur(16px)'; L.globalCompositeOperation = 'multiply';
  L.fillStyle = '#505050';
  L.beginPath(); L.moveTo(476, 232); L.quadraticCurveTo(572, 258, 648, 340); L.lineTo(628, 372); L.quadraticCurveTo(552, 296, 474, 266); L.closePath(); L.fill();
  L.restore();

  // Sobrancelha: quase reta, para o olhar ficar sereno.
  const brow = (ctx, cor, w, blur) => {
    ctx.save(); ctx.filter = `blur(${blur}px)`; ctx.lineCap = 'round'; ctx.strokeStyle = cor; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(376, 206); ctx.quadraticCurveTo(440, 192, 510, 214); ctx.stroke(); ctx.restore();
  };
  H.save(); H.globalCompositeOperation = 'lighter'; brow(H, 'rgba(255,255,255,.36)', 30, 7); H.restore();
  L.save(); L.globalCompositeOperation = 'lighter'; brow(L, 'rgba(255,255,255,.95)', 12, 2); L.restore();

  // Bico: liso, com brilho na crista e linha da boca.
  L.save(); L.clip(BICO);
  const gb = L.createLinearGradient(270, 214, 350, 320);
  gb.addColorStop(0, '#d0d0d0'); gb.addColorStop(.55, '#808080'); gb.addColorStop(1, '#3a3a3a');
  L.fillStyle = gb; L.fillRect(200, 200, 200, 200);
  L.restore();
  L.save(); L.lineCap = 'round'; L.strokeStyle = '#000'; L.lineWidth = 5;
  L.beginPath(); L.moveTo(318, 303); L.quadraticCurveTo(350, 302, 412, 326); L.stroke(); L.restore();
  H.save(); H.clip(BICO); H.filter = 'blur(9px)'; H.globalCompositeOperation = 'lighter';
  H.strokeStyle = 'rgba(255,255,255,.34)'; H.lineWidth = 34; H.beginPath(); H.moveTo(360, 226); H.quadraticCurveTo(292, 238, 272, 322); H.stroke(); H.restore();

  // Contorno: luz de recorte que mantém a silhueta nítida em pontos.
  L.save(); L.clip(SIL); L.globalCompositeOperation = 'lighter';
  L.filter = 'blur(1.4px)'; L.strokeStyle = 'rgba(255,255,255,.95)'; L.lineWidth = 8; L.stroke(SIL);
  L.restore();

  // Máscara.
  M.fillStyle = '#000'; M.fillRect(0, 0, 1000, 1000);
  M.fillStyle = 'rgb(255,255,255)'; M.fill(SIL);
  M.fillStyle = 'rgb(200,200,200)'; M.fill(CERA);
  M.fillStyle = '#000'; M.beginPath(); M.arc(EYE.x, EYE.y, EYE.r + 8, 0, 7); M.fill();

  // Anel escuro em volta do olho: deixa a íris respirar.
  L.save(); L.fillStyle = '#000'; L.beginPath(); L.arc(EYE.x, EYE.y, EYE.r + 16, 0, 7); L.fill(); L.restore();
  L.save(); L.strokeStyle = 'rgba(255,255,255,.9)'; L.lineWidth = 3.4; L.beginPath(); L.arc(EYE.x, EYE.y, EYE.r + 17, 0, 7); L.stroke(); L.restore();
  H.save(); H.globalCompositeOperation = 'lighter'; H.filter = 'blur(5px)'; H.strokeStyle = 'rgba(255,255,255,.2)'; H.lineWidth = 12; H.beginPath(); H.arc(EYE.x, EYE.y, EYE.r + 15, 0, 7); H.stroke(); H.restore();

  // Junta os três canais.
  const out = document.createElement('canvas'); out.width = out.height = S;
  const o = out.getContext('2d');
  const dl = L.getImageData(0, 0, S, S).data, dh = H.getImageData(0, 0, S, S).data, dm = M.getImageData(0, 0, S, S).data;
  const img = o.createImageData(S, S);
  for (let i = 0; i < dl.length; i += 4) {
    img.data[i] = dh[i]; img.data[i + 1] = dl[i]; img.data[i + 2] = dm[i]; img.data[i + 3] = 255;
  }
  o.putImageData(img, 0, 0);
  return { mapa: out.toDataURL('image/png'), luz: cL.toDataURL('image/png'), altura: cH.toDataURL('image/png'), eye: EYE };
};
