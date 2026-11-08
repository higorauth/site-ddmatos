/* Casa em 3D: a casa de verdade que se abre conforme a página rola, com as pragas dentro.
   O Three.js só é baixado quando a pessoa começa a rolar. Sem WebGL 2, ou em aparelho fraco,
   a casa de pontos continua no lugar. Tudo aqui é ilustração: a vistoria é feita pelo técnico, no local.
   As medidas são as mesmas da casa de pontos (cena.js), para as duas se encaixarem na mesma câmera. */
(function () {
  'use strict';
  const raiz = document.documentElement;
  const C3 = { pronta: false, falhou: false };
  window.Casa3D = C3;
  // Se a cena de pontos já caiu para o 2D, o navegador está sem placa de vídeo: nem tenta a casa 3D.
  const capaz = 'WebGL2RenderingContext' in window && !raiz.classList.contains('cena-2d') && (navigator.hardwareConcurrency || 8) > 2 && !(navigator.deviceMemory && navigator.deviceMemory < 2);
  if (!capaz) return;
  raiz.classList.add('com-3d');

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const suave = (t) => t * t * (3 - 2 * t);
  let semente = 11;
  const R = () => ((semente = (semente * 16807) % 2147483647) - 1) / 2147483646;
  const pausa = () => new Promise((ok) => setTimeout(ok, 0));

  const X = 3.2, Z = 2.2, H1 = 1.75, H2 = 3.4, CUME = 4.75, E = .12, LJ = .1;
  const BL = { x0: -4.6, x1: 6.8, z0: -3.0, z1: 5.0, y0: -1.05 };
  const TANQUE = { x: -1.72, z: -.4, r: .5, h: .66 };

  let T, renderer, cena, camera, tela, celular = false, fraco = false;
  let planoScan, planoFrente;
  const pragas = {};
  let telhado, scan, xray, tanque, aneis, pecasTelhado = [];
  let sombraSuja = true, ultimoT = 0, W3 = 0, H3 = 0;
  const estado = { solido: -1, abre: -1, xray: 0, caixa: 0 };

  /* ---------- carregamento ---------- */
  let pedindo = false;
  function pede() {
    if (pedindo) return;
    pedindo = true;
    window.removeEventListener('scroll', confere);
    import(window.TRES_URL).then(monta).catch((e) => { console.warn('Casa 3D indisponível:', e && e.message); falha(); });
  }
  function confere() { if (window.scrollY > window.innerHeight * .3) pede(); }
  window.addEventListener('scroll', confere, { passive: true });
  if (document.readyState === 'complete') confere(); else window.addEventListener('load', confere, { once: true });
  C3.pede = pede;
  function falha() {
    C3.falhou = true; C3.pronta = false;
    raiz.classList.remove('com-3d');
    if (tela) tela.remove();
    if (window.Cena) window.Cena.acorda();
  }

  /* ---------- utilidades de geometria ---------- */
  const caixa = (x0, y0, z0, x1, y1, z1) => new T.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  function uvMundo(g, s = 1) {
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (ay >= ax && ay >= az) uv.setXY(i, x * s, -z * s); else if (ax >= az) uv.setXY(i, z * s, y * s); else uv.setXY(i, x * s, y * s);
    }
    uv.needsUpdate = true;
    return g;
  }
  function junta(gs) {
    let nv = 0, ni = 0;
    for (const g of gs) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
    let ov = 0, oi = 0;
    for (const g of gs) {
      const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
      pos.set(p.array, ov * 3); if (n) nor.set(n.array, ov * 3); if (u) uv.set(u.array, ov * 2);
      if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[oi + i] = a[i] + ov; oi += a.length; }
      else { for (let i = 0; i < p.count; i++) idx[oi + i] = ov + i; oi += p.count; }
      ov += p.count; g.dispose();
    }
    const r = new T.BufferGeometry();
    r.setAttribute('position', new T.BufferAttribute(pos, 3)); r.setAttribute('normal', new T.BufferAttribute(nor, 3)); r.setAttribute('uv', new T.BufferAttribute(uv, 2));
    r.setIndex(new T.BufferAttribute(idx, 1)); r.computeBoundingSphere();
    return r;
  }
  class Lote {
    constructor() { this.m = new Map(); }
    add(mat, g) { if (!this.m.has(mat)) this.m.set(mat, []); this.m.get(mat).push(g); return g; }
    grupo(sombra = true, recebe = true) {
      const gr = new T.Group();
      for (const [mat, gs] of this.m) { const me = new T.Mesh(junta(gs), mat); me.castShadow = sombra && !mat.transparent; me.receiveShadow = recebe; gr.add(me); }
      return gr;
    }
  }
  /* Caixa de cantos arredondados: a luz pega na quina e o móvel deixa de parecer bloco. */
  function caixaRedonda(w, h, d, r, s = 3) {
    r = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
    const N = 2 * s + 2, g = new T.BoxGeometry(w, h, d, N, N, N), p = g.attributes.position, n = g.attributes.normal;
    const mapa = (c, L) => { const i = Math.round((c + L / 2) / (L / N)); if (i <= s) return -L / 2 + r * i / s; if (i >= s + 2) return L / 2 - r + r * (i - s - 2) / s; return mix(-L / 2 + r, L / 2 - r, (i - s) / 2); };
    const v = new T.Vector3(), q = new T.Vector3(), hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
    for (let i = 0; i < p.count; i++) {
      v.set(mapa(p.getX(i), w), mapa(p.getY(i), h), mapa(p.getZ(i), d));
      q.set(clamp(v.x, -hw, hw), clamp(v.y, -hh, hh), clamp(v.z, -hd, hd));
      const o = v.clone().sub(q);
      if (o.lengthSq() > 1e-10) { o.normalize(); v.copy(q).addScaledVector(o, r); n.setXYZ(i, o.x, o.y, o.z); }
      p.setXYZ(i, v.x, v.y, v.z);
    }
    return g;
  }
  const bolha = (rx, ry, rz, x, y, z, seg = 16) => new T.SphereGeometry(1, seg, Math.max(8, seg * .7 | 0)).scale(rx, ry, rz).translate(x, y, z);
  function haste(a, b, r, seg = 6) {
    const A = new T.Vector3(...a), B = new T.Vector3(...b), L = A.distanceTo(B);
    const g = new T.CylinderGeometry(r, r, L, seg, 1, false);
    const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    g.applyQuaternion(q); g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
    return g;
  }
  /* Cano: cilindros em cada trecho e esferas nas curvas. */
  function cano(lote, mat, pts, r) {
    for (let i = 1; i < pts.length; i++) lote.add(mat, haste(pts[i - 1], pts[i], r, 12));
    for (let i = 1; i < pts.length - 1; i++) lote.add(mat, new T.SphereGeometry(r * 1.02, 12, 8).translate(...pts[i]));
  }
  /* Trilha em polilinha com a normal da superfície em cada ponto (chão, parede, bancada). */
  function trilha(pts, fechada) {
    const P = pts.map((p) => new T.Vector3(p[0], p[1], p[2]));
    const N = pts.map((p) => new T.Vector3(...(p[3] || [0, 1, 0])).normalize());
    if (fechada) { P.push(P[0].clone()); N.push(N[0].clone()); }
    const L = [0];
    for (let i = 1; i < P.length; i++) L.push(L[i - 1] + P[i].distanceTo(P[i - 1]));
    const total = L[L.length - 1];
    return {
      total,
      em(d, pos, tan, nor) {
        d = fechada ? ((d % total) + total) % total : clamp(d, 0, total);
        let i = 1;
        while (i < L.length - 1 && L[i] < d) i++;
        const t = (d - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1]);
        pos.lerpVectors(P[i - 1], P[i], t);
        tan.subVectors(P[i], P[i - 1]).normalize();
        nor.lerpVectors(N[i - 1], N[i], t).normalize();
      },
    };
  }
  let _m4, _z, _y;
  function orienta(obj, pos, tan, nor) {
    _z.crossVectors(tan, nor).normalize(); _y.crossVectors(_z, tan).normalize();
    _m4.makeBasis(tan, _y, _z); obj.quaternion.setFromRotationMatrix(_m4); obj.position.copy(pos);
  }

  /* ---------- texturas desenhadas na hora ---------- */
  function tex(w, h, desenha, rep, cor = true) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); desenha(x, w, h);
    const t = new T.CanvasTexture(c);
    if (cor) t.colorSpace = T.SRGBColorSpace;
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    if (rep) t.repeat.set(rep[0], rep[1]);
    return t;
  }
  function pontilha(x, w, h, n, cores, a, b) {
    for (const cor of cores) {
      x.fillStyle = cor; x.beginPath();
      for (let i = 0; i < n / cores.length; i++) { const s = a + R() * (b - a); x.rect(R() * w, R() * h, s, s); }
      x.fill();
    }
  }
  function veios(x, x0, y0, L, A, n, cor) {
    x.strokeStyle = cor; x.beginPath();
    for (let k = 0; k < n; k++) { const y = y0 + R() * A; x.moveTo(x0, y); x.bezierCurveTo(x0 + L * .3, y + (R() - .5) * 5, x0 + L * .7, y + (R() - .5) * 5, x0 + L, y + (R() - .5) * 3); }
    x.stroke();
  }
  const TX = {};
  function texturas() {
    TX.reboco = tex(256, 256, (x, w, h) => { x.fillStyle = '#EFEBE4'; x.fillRect(0, 0, w, h); pontilha(x, w, h, 5000, ['rgba(0,0,0,.035)', 'rgba(255,255,255,.08)', 'rgba(120,100,80,.04)'], 1, 2.4); });
    TX.madeira = tex(512, 512, (x, w, h) => {
      const n = 8, a = h / n;
      for (let r = 0; r < n; r++) {
        let px = -R() * 220;
        while (px < w) {
          const L = 170 + R() * 240;
          x.fillStyle = `hsl(${26 + R() * 6} ${38 + R() * 14}% ${41 + R() * 13}%)`; x.fillRect(px, r * a, L, a);
          x.lineWidth = .8; veios(x, px, r * a, L, a, 12, `rgba(70,40,18,${.07 + R() * .06})`);
          x.fillStyle = 'rgba(40,22,8,.5)'; x.fillRect(px, r * a, 1.5, a);
          px += L;
        }
        x.fillStyle = 'rgba(40,22,8,.45)'; x.fillRect(0, r * a, w, 1.5);
      }
    });
    TX.porcelanato = tex(512, 512, (x, w, h) => {
      const n = 4, s = w / n; x.fillStyle = '#C9C4BC'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        x.fillStyle = `hsl(36 9% ${88 + R() * 3}%)`; x.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
        x.lineWidth = 1 + R() * 1.5; x.strokeStyle = `rgba(150,140,130,${.06 + R() * .06})`; x.beginPath(); x.moveTo(i * s + R() * s, j * s + 2); x.quadraticCurveTo(i * s + R() * s, j * s + R() * s, i * s + R() * s, j * s + s - 2); x.stroke();
      }
    });
    TX.azulejo = tex(256, 256, (x, w, h) => { const n = 8, s = w / n; x.fillStyle = '#C3C9D2'; x.fillRect(0, 0, w, h); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { x.fillStyle = `hsl(212 22% ${94 + R() * 4}%)`; x.fillRect(i * s + 1.5, j * s + 1.5, s - 3, s - 3); } });
    TX.telha = tex(512, 512, (x, w, h) => {
      const linhas = 8, cols = 7, a = h / linhas, l = w / cols;
      x.fillStyle = '#5C2612'; x.fillRect(0, 0, w, h);
      for (let r = 0; r < linhas; r++) for (let c = 0; c <= cols; c++) {
        const px = c * l + (r % 2) * l * .5 - l * .5, py = r * a, tom = 38 + R() * 9;
        const g = x.createLinearGradient(px, 0, px + l, 0);
        g.addColorStop(0, `hsl(16 50% ${tom - 13}%)`); g.addColorStop(.45, `hsl(18 58% ${tom + 7}%)`); g.addColorStop(1, `hsl(15 48% ${tom - 15}%)`);
        x.fillStyle = g; x.beginPath();
        if (x.roundRect) x.roundRect(px + 2, py + 1, l - 4, a + 3, [0, 0, l * .45, l * .45]); else x.rect(px + 2, py + 1, l - 4, a + 3);
        x.fill();
        const v = x.createLinearGradient(0, py, 0, py + a); v.addColorStop(0, 'rgba(255,230,210,.12)'); v.addColorStop(.75, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(40,10,0,.38)');
        x.fillStyle = v; x.fillRect(px + 2, py, l - 4, a + 2);
      }
      pontilha(x, w, h, 3000, ['rgba(0,0,0,.07)', 'rgba(255,255,255,.05)'], 1, 2);
    });
    TX.grama = tex(512, 512, (x, w, h) => {
      x.fillStyle = '#6A9944'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 24; i++) { const cx = R() * w, cy = R() * h, r = 60 + R() * 90, g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, R() > .5 ? 'rgba(40,70,20,.2)' : 'rgba(160,200,100,.16)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }
      const cores = ['#57853A', '#7BAB4C', '#4A742B', '#8DBB5C', '#638F3D'];
      x.lineWidth = 1.1;
      for (const c of cores) { x.strokeStyle = c; x.beginPath(); for (let i = 0; i < 2600; i++) { const px = R() * w, py = R() * h, L = 2 + R() * 5, an = -Math.PI / 2 + (R() - .5) * 1.5; x.moveTo(px, py); x.lineTo(px + Math.cos(an) * L, py + Math.sin(an) * L); } x.stroke(); }
    });
    TX.concreto = tex(256, 256, (x, w, h) => { x.fillStyle = '#D4D1CA'; x.fillRect(0, 0, w, h); pontilha(x, w, h, 2600, ['rgba(0,0,0,.05)', 'rgba(255,255,255,.09)', 'rgba(90,80,70,.06)'], 1, 2); x.fillStyle = 'rgba(0,0,0,.09)'; x.fillRect(0, 0, w, 1.5); x.fillRect(0, 0, 1.5, h); });
    TX.terra = tex(512, 256, (x, w, h) => {
      const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#5B3E28'); g.addColorStop(.1, '#7A5536'); g.addColorStop(.55, '#6C4A30'); g.addColorStop(1, '#563A25');
      x.fillStyle = g; x.fillRect(0, 0, w, h); pontilha(x, w, h, 4000, ['rgba(0,0,0,.09)', 'rgba(255,220,180,.07)'], 1, 3);
      for (let i = 0; i < 110; i++) { x.fillStyle = ['#8C7A68', '#A39282', '#6F5F50', '#9A8670'][(R() * 4) | 0]; x.beginPath(); x.ellipse(R() * w, h * .14 + R() * h * .86, 3 + R() * 8, 2 + R() * 5, R() * 3, 0, 6.3); x.fill(); }
      x.fillStyle = '#4C7A2D'; x.fillRect(0, 0, w, 6);
    });
    TX.madeiraMovel = tex(256, 256, (x, w, h) => { x.fillStyle = '#9F6C44'; x.fillRect(0, 0, w, h); x.lineWidth = .9; for (let k = 0; k < 8; k++) veios(x, 0, k * 32, w, 32, 9, `rgba(60,32,14,${.08 + R() * .08})`); });
    TX.madeiraBruta = tex(256, 256, (x, w, h) => { x.fillStyle = '#B98A5B'; x.fillRect(0, 0, w, h); x.lineWidth = 1; for (let k = 0; k < 8; k++) veios(x, 0, k * 32, w, 32, 10, `rgba(80,45,20,${.1 + R() * .1})`); pontilha(x, w, h, 900, ['rgba(60,30,10,.12)'], 1, 2); });
    TX.tecido = tex(128, 128, (x, w, h) => { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); for (let i = 0; i < w; i += 2) { x.fillStyle = `rgba(0,0,0,${.03 + R() * .05})`; x.fillRect(i, 0, 1, h); x.fillRect(0, i, w, 1); } pontilha(x, w, h, 700, ['rgba(0,0,0,.05)'], 1, 1.5); });
    TX.lama = tex(128, 128, (x, w, h) => { x.fillStyle = '#5E4128'; x.fillRect(0, 0, w, h); pontilha(x, w, h, 1500, ['rgba(0,0,0,.18)', 'rgba(255,230,190,.12)'], 1, 3); });
    TX.anel = tex(128, 128, (x, w) => { x.strokeStyle = '#D7262E'; x.lineWidth = 7; x.beginPath(); x.arc(w / 2, w / 2, w / 2 - 8, 0, 6.3); x.stroke(); x.fillStyle = 'rgba(215,38,46,.18)'; x.beginPath(); x.arc(w / 2, w / 2, w / 2 - 12, 0, 6.3); x.fill(); });
    TX.sombra = tex(256, 256, (x, w, h) => { x.fillStyle = 'rgba(0,0,0,0)'; x.fillRect(0, 0, w, h); x.shadowColor = 'rgba(10,26,58,.55)'; x.shadowBlur = 34; x.shadowOffsetX = 1000; x.fillStyle = '#000'; x.fillRect(-1000 + 34, 34, w - 68, h - 68); }, null, false);
  }
  /* Sombra de contato do piso: paredes e móveis escurecem a luz ambiente perto deles. */
  function aoPiso(larg, prof, bloq) {
    const k = 110 / Math.max(larg, prof), w = Math.max(8, Math.round(larg * k)), h = Math.max(8, Math.round(prof * k));
    return tex(w, h, (x) => {
      x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
      x.shadowOffsetX = 3000; x.fillStyle = '#000';
      x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 12;
      x.fillRect(-3000 - 6, -6, w + 12, 6); x.fillRect(-3000 - 6, h, w + 12, 6); x.fillRect(-3000 - 6, -6, 6, h + 12); x.fillRect(-3000 + w, -6, 6, h + 12);
      for (const [a, b, c, d, f] of bloq) { x.shadowColor = `rgba(0,0,0,${f || .65})`; x.shadowBlur = 9; x.fillRect(-3000 + a * k, b * k, (c - a) * k, (d - b) * k); }
    }, null, false);
  }

  /* ---------- materiais ---------- */
  const M = {};
  function materiais() {
    const corte = (m, frente) => { m.clippingPlanes = frente ? [planoScan, planoFrente] : [planoScan]; m.clipShadows = true; return m; };
    const std = (o, frente) => corte(new T.MeshStandardMaterial(o), frente);
    const fis = (o, frente) => corte(new T.MeshPhysicalMaterial(o), frente);
    TX.reboco.repeat.set(1, 1);
    M.paredeExt = std({ map: TX.reboco, color: '#FFFFFF', roughness: .93 });
    M.paredeExtF = std({ map: TX.reboco, color: '#FFFFFF', roughness: .93 }, true);
    M.paredeInt = std({ map: TX.reboco, color: '#FBFAF7', roughness: .95 });
    M.barra = std({ color: '#7E8794', roughness: .8 });
    M.barraF = std({ color: '#7E8794', roughness: .8 }, true);
    M.azulejo = std({ map: TX.azulejo, roughness: .25 });
    M.concreto = std({ map: TX.concreto, roughness: .95 });
    M.grama = std({ map: TX.grama, roughness: 1 });
    M.terra = std({ map: TX.terra, roughness: 1 });
    M.telha = std({ map: TX.telha, roughness: .7 });
    M.cumeeira = std({ color: '#93401F', roughness: .7 });
    M.madeiraBruta = std({ map: TX.madeiraBruta, roughness: .85 });
    M.madeira = std({ map: TX.madeiraMovel, roughness: .5 });
    M.madeiraF = std({ map: TX.madeiraMovel, roughness: .5 }, true);
    M.branco = std({ color: '#FAFAF8', roughness: .38 });
    M.brancoF = std({ color: '#F6F6F4', roughness: .38 }, true);
    M.louca = fis({ color: '#FFFFFF', roughness: .12, clearcoat: .8, clearcoatRoughness: .1 });
    M.inox = std({ color: '#CDD2D8', metalness: .85, roughness: .28 });
    M.granito = std({ color: '#2E2F33', roughness: .22 });
    M.vidroPreto = std({ color: '#121418', roughness: .08, metalness: .2 });
    M.tecido = std({ map: TX.tecido, color: '#6D7D99', roughness: 1 });
    M.colchao = std({ color: '#F4F2ED', roughness: .9 });
    M.coberta = std({ map: TX.tecido, color: '#2C56B8', roughness: .95 });
    M.tapete = std({ map: TX.tecido, color: '#E2D8C6', roughness: 1 });
    M.vidro = fis({ color: '#D9E6F2', transparent: true, opacity: .28, roughness: .04, metalness: 0, depthWrite: false });
    M.vidroF = fis({ color: '#D9E6F2', transparent: true, opacity: .28, roughness: .04, metalness: 0, depthWrite: false }, true);
    M.espelho = std({ color: '#E9EEF3', metalness: 1, roughness: .04 });
    M.pvc = std({ color: '#E7EAF0', roughness: .5 });
    M.calha = std({ color: '#B9C0CA', roughness: .55, metalness: .1 });
    M.caixaAzul = std({ color: '#1E58D6', roughness: .5, side: T.DoubleSide });
    M.agua = fis({ color: '#7FB2EE', transparent: true, opacity: .72, roughness: .05, depthWrite: false });
    M.carro = fis({ color: '#2A2F38', metalness: .55, roughness: .32, clearcoat: 1, clearcoatRoughness: .08 });
    M.pneu = std({ color: '#191A1C', roughness: .9 });
    M.aro = std({ color: '#C9CED6', metalness: .9, roughness: .25 });
    M.vaso = std({ color: '#B4582F', roughness: .85 });
    M.planta = std({ color: '#3E7A3A', roughness: .75 });
    M.planta2 = std({ color: '#5A9446', roughness: .75 });
    M.terraVaso = std({ color: '#3B2A1E', roughness: 1 });
    M.lixeira = std({ color: '#2F7D4F', roughness: .55 });
    M.caixaPapel = std({ color: '#C9A777', roughness: .9 });
    M.lama = std({ map: TX.lama, roughness: 1 });
    M.preto = std({ color: '#26282C', roughness: .6 });
    // Pragas: sem recorte (só aparecem com a casa pronta).
    M.barata = new T.MeshPhysicalMaterial({ color: '#6A3519', roughness: .3, clearcoat: 1, clearcoatRoughness: .18 });
    M.barataClara = new T.MeshPhysicalMaterial({ color: '#94592F', roughness: .32, clearcoat: 1, clearcoatRoughness: .2 });
    M.patas = new T.MeshStandardMaterial({ color: '#4E2814', roughness: .5 });
    M.formiga = new T.MeshPhysicalMaterial({ color: '#2B1A10', roughness: .35, clearcoat: .6 });
    M.rato = new T.MeshStandardMaterial({ map: TX.tecido, color: '#6B6157', roughness: 1 });
    M.ratoRosa = new T.MeshStandardMaterial({ color: '#C99A94', roughness: .7 });
    M.olho = new T.MeshPhysicalMaterial({ color: '#0B0B0C', roughness: .05, clearcoat: 1 });
    M.cupim = new T.MeshPhysicalMaterial({ color: '#EBDDBA', roughness: .4, clearcoat: .5 });
    M.cupimCab = new T.MeshPhysicalMaterial({ color: '#C47F3A', roughness: .35, clearcoat: .6 });
    M.mosquito = new T.MeshStandardMaterial({ color: '#26262A', roughness: .6 });
    M.asa = new T.MeshBasicMaterial({ color: '#DDE6F4', transparent: true, opacity: .4, side: T.DoubleSide, depthWrite: false });
    M.sombraBicho = new T.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: .22, depthWrite: false });
  }

  /* ---------- luz e ambiente ---------- */
  function ambiente() {
    // Um quarto de luz suave serve de reflexo e de luz ambiente (o mesmo truque dos estúdios de foto).
    const sala = new T.Scene();
    const ceu = new T.Mesh(new T.SphereGeometry(30, 32, 16), new T.ShaderMaterial({
      side: T.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 v; void main(){ v = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: 'varying vec3 v; void main(){ float h = v.y; vec3 c = mix(vec3(.62,.58,.52), vec3(.92,.95,1.), smoothstep(-.2,.35,h)); c = mix(c, vec3(1.), smoothstep(.55,1.,h)); gl_FragColor = vec4(c,1.); }',
    }));
    sala.add(ceu);
    const painel = (w, h, x, y, z, i) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(i, i, i) })); m.position.set(x, y, z); m.lookAt(0, 0, 0); sala.add(m); };
    painel(14, 6, 10, 14, 12, 4); painel(10, 10, -16, 10, 4, 1.6); painel(8, 4, 4, 6, -16, 1.4);
    const pm = new T.PMREMGenerator(renderer);
    cena.environment = pm.fromScene(sala, .04).texture;
    pm.dispose();
    cena.environmentIntensity = .9;
    const hemi = new T.HemisphereLight('#EEF4FF', '#9A8B74', .55);
    cena.add(hemi);
    const sol = new T.DirectionalLight('#FFF3E2', 2.6);
    sol.position.set(9.5, 15, 11); sol.target.position.set(.8, .6, .6);
    sol.castShadow = true;
    const t = celular ? 1024 : 2048;
    sol.shadow.mapSize.set(t, t);
    Object.assign(sol.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 2, far: 42 });
    sol.shadow.bias = -.0004; sol.shadow.normalBias = .025;
    cena.add(sol, sol.target);
  }

  /* ---------- a casa ---------- */
  function parede(lote, mat, eixo, a0, a1, c0, c1, y0, y1, vaos = [], esc = 1) {
    const cortes = [a0, a1];
    for (const v of vaos) cortes.push(v[0], v[1]);
    const xs = [...new Set(cortes)].filter((v) => v >= a0 && v <= a1).sort((p, q) => p - q);
    for (let i = 0; i < xs.length - 1; i++) {
      const s0 = xs[i], s1 = xs[i + 1], meio = (s0 + s1) / 2;
      const v = vaos.find((q) => meio > q[0] && meio < q[1]);
      const faixas = v ? [[y0, v[2]], [v[3], y1]] : [[y0, y1]];
      for (const [b, t] of faixas) if (t - b > .001) lote.add(mat, uvMundo(eixo === 'x' ? caixa(s0, b, c0, s1, t, c1) : caixa(c0, b, s0, c1, t, s1), esc));
    }
  }
  function janela(lote, eixo, a0, a1, y0, y1, c0, c1, mats) {
    const [mc, mv] = mats, f = .045, cm = (c0 + c1) / 2;
    const b = (p0, q0, p1, q1, y, yy, mat) => lote.add(mat, eixo === 'x' ? caixa(p0, y, q0, p1, yy, q1) : caixa(q0, y, p0, q1, yy, p1));
    b(a0, cm - .05, a0 + f, cm + .05, y0, y1, mc); b(a1 - f, cm - .05, a1, cm + .05, y0, y1, mc);
    b(a0, cm - .05, a1, cm + .05, y0, y0 + f, mc); b(a0, cm - .05, a1, cm + .05, y1 - f, y1, mc);
    b((a0 + a1) / 2 - .015, cm - .03, (a0 + a1) / 2 + .015, cm + .03, y0, y1, mc);
    b(a0 + f, cm - .006, a1 - f, cm + .006, y0 + f, y1 - f, mv);
    const fora = c1 > 0 ? c1 + .045 : c0 - .045;
    b(a0 - .04, Math.min(c0, c1, fora), a1 + .04, Math.max(c0, c1, fora), y0 - .04, y0, mc);
  }

  function casa() {
    const L = new Lote(), F = new Lote();
    const xi0 = -X + E, xi1 = X - E, zi0 = -Z + E, zi1 = Z - E;
    // Fundação, lajes e paredes de fora.
    L.add(M.concreto, uvMundo(caixa(-X - .04, -.16, -Z - .04, X + .04, .01, Z + .04), 1));
    parede(L, M.paredeExt, 'x', -X, X, -Z, -Z + E, 0, H2 + .15, [], 1);
    parede(L, M.paredeExt, 'z', -Z, Z, -X, -X + E, 0, H2 + .15, [[-.7, .7, .7, 1.45], [-.9, .5, 2.4, 3.1]], 1);
    parede(L, M.paredeExt, 'z', -Z, Z, X - E, X, 0, H2 + .15, [[-1.3, -.3, 0, 1.35], [-.9, -.4, 2.55, 2.95]], 1);
    janela(L, 'z', -.7, .7, .7, 1.45, -X, -X + E, [M.branco, M.vidro]);
    janela(L, 'z', -.9, .5, 2.4, 3.1, -X, -X + E, [M.branco, M.vidro]);
    janela(L, 'z', -.9, -.4, 2.55, 2.95, X - E, X, [M.branco, M.vidro]);
    // Faixa cinza na base da casa.
    L.add(M.barra, caixa(-X - .02, 0, -Z - .02, -X + .02, .22, Z));
    L.add(M.barra, caixa(X - .02, 0, .2, X + .02, .22, Z));
    // Frente: a parede que desce quando a casa se abre.
    const vaosFrente = [[-2.4, -1.3, .62, 1.32], [.6, 1.35, .62, 1.32], [1.65, 2.35, 0, 1.35], [-2.3, -1.0, 2.25, 2.95], [.4, 1.1, 2.25, 2.95], [2.3, 2.9, 2.6, 2.95]];
    parede(F, M.paredeExtF, 'x', -X, X, Z - E, Z, 0, H2 + .15, vaosFrente, 1);
    for (const v of vaosFrente) if (v[2] > 0) janela(F, 'x', v[0], v[1], v[2], v[3], Z - E, Z, [M.brancoF, M.vidroF]);
    F.add(M.barraF, caixa(-X, 0, Z - .02, X, .22, Z + .02));
    F.add(M.madeiraF, caixa(1.67, 0, Z - .07, 2.33, 1.33, Z - .03));
    F.add(M.brancoF, caixa(1.6, 0, Z - .12, 1.66, 1.4, Z + .01)); F.add(M.brancoF, caixa(2.34, 0, Z - .12, 2.4, 1.4, Z + .01)); F.add(M.brancoF, caixa(1.6, 1.35, Z - .12, 2.4, 1.41, Z + .01));
    F.add(M.inox, caixa(2.2, .62, Z - .02, 2.24, .7, Z + .01));
    // Paredes de dentro.
    parede(L, M.paredeInt, 'z', zi0, zi1, .36, .44, 0, H1 - LJ, [[.18, 1.02, 0, 1.3]], 1);
    parede(L, M.paredeInt, 'z', zi0, zi1, 1.41, 1.49, H1, H2 - LJ, [[-.1, .65, H1, H1 + 1.3]], 1);
    // Lajes: entre os andares (com o vão da escada) e o forro.
    L.add(M.paredeInt, caixa(xi0, H1 - LJ, zi0, .45, H1, zi1));
    L.add(M.paredeInt, caixa(1.28, H1 - LJ, zi0, xi1, H1, zi1));
    L.add(M.paredeInt, caixa(.45, H1 - LJ, zi0, 1.28, H1, -.25));
    L.add(M.paredeInt, caixa(.45, H1 - LJ, 1.75, 1.28, H1, zi1));
    L.add(M.concreto, uvMundo(caixa(-X, H2 - LJ, -Z, X, H2, Z), 1));
    // Azulejos do banheiro e da cozinha.
    L.add(M.azulejo, uvMundo(caixa(1.49, H1, zi0, xi1, H1 + 1.25, zi0 + .012), 1.3));
    L.add(M.azulejo, uvMundo(caixa(xi1 - .012, H1, zi0, xi1, H1 + 1.25, zi1), 1.3));
    L.add(M.azulejo, uvMundo(caixa(1.49, H1, zi0, 1.502, H1 + 1.25, -.1), 1.3));
    L.add(M.azulejo, uvMundo(caixa(1.49, H1, .65, 1.502, H1 + 1.25, zi1), 1.3));
    L.add(M.azulejo, uvMundo(caixa(-2.3, .86, zi0, .3, 1.15, zi0 + .012), 1.3));
    // Escada: degraus maciços com piso de madeira.
    for (let i = 0; i < 10; i++) {
      const h = H1 / 10, d = 1.9 / 10, z1 = 1.7 - i * d, z0 = z1 - d;
      L.add(M.paredeInt, caixa(.5, 0, z0, 1.24, (i + 1) * h - .02, z1));
      L.add(M.madeira, uvMundo(caixa(.49, (i + 1) * h - .02, z0 - .01, 1.25, (i + 1) * h, z1), 2));
    }
    L.add(M.preto, haste([.5, .9, 1.75], [.5, H1 + .9, -.2], .012));
    for (const [a, b] of [[[.45, H1, 1.75], [.45, H1 + .9, 1.75]], [[1.28, H1, 1.75], [1.28, H1 + .9, 1.75]], [[1.28, H1, -.25], [1.28, H1 + .9, -.25]]]) L.add(M.preto, haste(a, b, .012));
    L.add(M.preto, haste([.45, H1 + .9, 1.75], [1.28, H1 + .9, 1.75], .012));
    L.add(M.preto, haste([1.28, H1 + .9, 1.75], [1.28, H1 + .9, -.25], .012));
    L.add(M.vidro, caixa(1.275, H1, -.25, 1.285, H1 + .88, 1.75));
    // Batente da porta da garagem e rodapés (onde andam formigas e cupins).
    L.add(M.madeira, caixa(X - E - .03, 0, -1.36, X - E + .01, 1.42, -1.3));
    L.add(M.madeira, caixa(X - E - .03, 0, -.3, X - E + .01, 1.42, -.24));
    L.add(M.madeira, caixa(X - E - .03, 1.35, -1.36, X - E + .01, 1.42, -.24));
    L.add(M.madeira, caixa(.44, 0, zi0, xi1, .07, zi0 + .016));
    L.add(M.madeira, caixa(xi1 - .016, 0, zi0, xi1, .07, -1.36));
    L.add(M.madeira, caixa(xi1 - .016, 0, -.24, xi1, .07, zi1));
    // Empena: o triângulo de parede sob o telhado.
    const tri = new T.Shape([new T.Vector2(-Z, H2), new T.Vector2(Z, H2), new T.Vector2(Z, H2 + .15), new T.Vector2(0, CUME - .06), new T.Vector2(-Z, H2 + .15)]);
    for (const sx of [-X, X - E]) { const g = new T.ExtrudeGeometry(tri, { depth: E, bevelEnabled: false }); g.rotateY(Math.PI / 2); g.translate(sx, 0, 0); L.add(M.paredeExt, uvMundo(g, 1)); }
    const casaG = L.grupo(); const frenteG = F.grupo();
    cena.add(casaG, frenteG);
  }

  function pisos() {
    const piso = (x0, z0, x1, z1, y, map, rep, ao) => {
      const g = new T.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
      const m = map.clone(); m.needsUpdate = true; m.repeat.set((x1 - x0) / rep, (z1 - z0) / rep);
      const mat = new T.MeshStandardMaterial({ map: m, roughness: map === TX.porcelanato ? .28 : map === TX.azulejo ? .3 : .55, aoMap: ao, aoMapIntensity: 1, clippingPlanes: [planoScan], clipShadows: true });
      const me = new T.Mesh(g, mat); me.receiveShadow = true; cena.add(me);
    };
    const zi0 = -Z + E, zi1 = Z - E;
    // Cozinha: geladeira, armários, mesa.
    piso(-X + E, zi0, .36, zi1, .014, TX.porcelanato, .7, aoPiso(.36 + X - E, zi1 - zi0, [[.02, .43, .7, 1.1, .7], [.84, 0, 3.44, .65], [.85, 2.2, 1.85, 3.1, .45]]));
    // Sala: sofá, tapete, escada.
    piso(.44, zi0, X - E, zi1, .014, TX.madeira, 1.1, aoPiso(X - E - .44, zi1 - zi0, [[1.0, 0, 2.52, .76], [.04, 1.85, .82, 3.9, .7]]));
    // Quarto: cama e guarda-roupa.
    {
      const x0 = -X + E, x1 = 1.41, sh = new T.Shape([new T.Vector2(x0, -zi1), new T.Vector2(x1, -zi1), new T.Vector2(x1, -zi0), new T.Vector2(x0, -zi0)]);
      sh.holes.push(new T.Path([new T.Vector2(.45, -1.75), new T.Vector2(.45, .25), new T.Vector2(1.28, .25), new T.Vector2(1.28, -1.75)]));
      const g = new T.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); g.translate(0, H1 + .003, 0);
      const ps = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < ps.count; i++) uv.setXY(i, (ps.getX(i) - x0) / (x1 - x0), (zi1 - ps.getZ(i)) / (zi1 - zi0));
      const m = TX.madeira.clone(); m.needsUpdate = true; m.repeat.set((x1 - x0) / 1.1, (zi1 - zi0) / 1.1);
      const ao = aoPiso(x1 - x0, zi1 - zi0, [[.15, .86, 2.05, 2.75, .6], [0, 0, 2.1, .62], [3.46, 1.83, 4.36, 3.9, .3]]);
      const me = new T.Mesh(g, new T.MeshStandardMaterial({ map: m, roughness: .55, aoMap: ao, clippingPlanes: [planoScan], clipShadows: true }));
      me.receiveShadow = true; cena.add(me);
    }
    piso(1.49, zi0, X - E, zi1, H1 + .003, TX.azulejo, .55, aoPiso(X - E - 1.49, zi1 - zi0, [[.1, 0, .82, .45], [1.05, 0, 1.47, .62]]));
  }

  function moveis() {
    const L = new Lote(), zi0 = -Z + E;
    const r = (w, h, d, rr, x, y, z, mat) => L.add(mat, caixaRedonda(w, h, d, rr).translate(x, y, z));
    // Cozinha.
    r(2.6, .74, .55, .02, -1.0, .43, -1.81, M.branco);
    L.add(M.preto, caixa(-2.28, 0, -1.56, .28, .06, -1.52));
    for (let i = 0; i < 6; i++) L.add(M.preto, caixa(-2.3 + .433 * (i + 1) - .003, .1, -1.535, -2.3 + .433 * (i + 1) + .003, .78, -1.53));
    L.add(M.granito, caixa(-2.33, .8, -2.08, .33, .86, -1.48));
    L.add(M.inox, caixa(-1.86, .835, -1.96, -1.24, .862, -1.6));
    L.add(M.inox, haste([-1.55, .86, -2.0], [-1.55, 1.08, -2.0], .014));
    L.add(M.inox, new T.TorusGeometry(.07, .012, 8, 18, Math.PI).rotateY(Math.PI / 2).translate(-1.55, 1.08, -1.93));
    L.add(M.vidroPreto, caixa(-.55, .861, -1.96, 0, .866, -1.6));
    for (const [x, z] of [[-.41, -1.86], [-.14, -1.86], [-.41, -1.7], [-.14, -1.7]]) L.add(M.inox, new T.TorusGeometry(.05, .006, 6, 20).rotateX(Math.PI / 2).translate(x, .868, z));
    r(2.6, .45, .3, .015, -1.0, 1.375, -1.93, M.branco);
    L.add(M.inox, caixa(-.6, 1.1, -2.08, .05, 1.15, -1.75));
    r(.64, 1.62, .64, .035, -2.74, .81, -1.33, M.inox);
    L.add(M.preto, caixa(-3.05, 1.06, -1.0, -2.43, 1.075, -.995));
    L.add(M.preto, haste([-2.5, 1.15, -.98], [-2.5, 1.45, -.98], .01)); L.add(M.preto, haste([-2.5, .55, -.98], [-2.5, .95, -.98], .01));
    L.add(M.madeira, new T.CylinderGeometry(.42, .42, .04, 40).translate(-1.75, .5, .7));
    L.add(M.madeira, new T.CylinderGeometry(.04, .07, .48, 12).translate(-1.75, .24, .7));
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + .4, cx = -1.75 + Math.cos(a) * .55, cz = .7 + Math.sin(a) * .55;
      r(.26, .03, .26, .01, cx, .3, cz, M.madeira);
      for (const [dx, dz] of [[-.1, -.1], [.1, -.1], [-.1, .1], [.1, .1]]) L.add(M.madeira, caixa(cx + dx - .012, 0, cz + dz - .012, cx + dx + .012, .29, cz + dz + .012));
      const bx = -1.75 + Math.cos(a) * .68, bz = .7 + Math.sin(a) * .68;
      L.add(M.madeira, caixa(bx - .02, .3, bz - .02, bx + .02, .62, bz + .02));
    }
    L.add(M.inox, caixa(-1.04, .004, .84, -.96, .008, .96));
    // Sala.
    L.add(M.tapete, caixa(1.3, .004, -1.25, 3.0, .014, .55));
    r(1.5, .26, .72, .05, 2.2, .2, -1.7, M.tecido);
    r(.7, .12, .58, .05, 1.84, .38, -1.66, M.tecido); r(.7, .12, .58, .05, 2.56, .38, -1.66, M.tecido);
    r(1.46, .36, .2, .06, 2.2, .52, -1.97, M.tecido);
    r(.14, .36, .72, .05, 1.48, .3, -1.7, M.tecido); r(.14, .36, .72, .05, 2.92, .3, -1.7, M.tecido);
    r(.62, .04, .42, .015, 2.22, .26, -.75, M.madeira);
    for (const [dx, dz] of [[-.27, -.17], [.27, -.17], [-.27, .17], [.27, .17]]) L.add(M.madeira, caixa(2.22 + dx - .015, 0, -.75 + dz - .015, 2.22 + dx + .015, .24, -.75 + dz + .015));
    L.add(M.preto, haste([.75, 0, -1.95], [.75, 1.25, -1.95], .012));
    L.add(M.colchao, new T.CylinderGeometry(.11, .16, .2, 24, 1, true).translate(.75, 1.3, -1.95));
    // Quarto.
    L.add(M.madeira, caixa(-2.97, H1 + .05, -1.2, -1.2, H1 + .28, .6));
    r(1.74, .17, 1.76, .06, -2.08, H1 + .36, -.3, M.colchao);
    r(1.22, .06, 1.84, .03, -1.8, H1 + .46, -.3, M.coberta);
    r(.32, .1, .6, .05, -2.75, H1 + .5, -.66, M.colchao); r(.32, .1, .6, .05, -2.75, H1 + .5, .06, M.colchao);
    L.add(M.madeira, caixa(-3.08, H1, -1.25, -2.97, H1 + .9, .65));
    r(1.96, 1.5, .58, .02, -2.1, H1 + .75, -1.79, M.madeira);
    L.add(M.preto, caixa(-2.1 - .003, H1 + .05, -1.497, -2.1 + .003, H1 + 1.45, -1.495));
    L.add(M.inox, caixa(-2.16, H1 + .7, -1.5, -2.14, H1 + .9, -1.48)); L.add(M.inox, caixa(-2.06, H1 + .7, -1.5, -2.04, H1 + .9, -1.48));
    r(.36, .4, .34, .02, -2.86, H1 + .2, .95, M.madeira);
    L.add(M.colchao, new T.CylinderGeometry(.07, .1, .14, 18).translate(-2.86, H1 + .5, .95));
    // Banheiro.
    r(.7, .8, .42, .02, 1.95, H1 + .4, -1.87, M.branco);
    L.add(M.louca, new T.CylinderGeometry(.15, .12, .08, 24).translate(1.95, H1 + .83, -1.86));
    L.add(M.espelho, caixa(1.65, H1 + .95, zi0, 2.25, H1 + 1.45, zi0 + .015));
    r(.36, .38, .5, .08, 2.75, H1 + .19, -1.78, M.louca);
    r(.38, .32, .14, .03, 2.75, H1 + .55, -2.0, M.louca);
    L.add(M.vidro, caixa(1.55, H1, .345, 2.6, H1 + 1.32, .355));
    L.add(M.inox, haste([3.05, H1 + 1.25, .95], [2.9, H1 + 1.28, .95], .012));
    L.add(M.inox, new T.CylinderGeometry(.06, .06, .015, 20).translate(2.88, H1 + 1.26, .95));
    L.add(M.inox, caixa(1.86, H1 + .004, .66, 1.94, H1 + .008, .74));
    // Garagem.
    r(1.18, .5, 2.1, .14, 4.6, .42, -.95, M.carro);
    r(1.02, .36, 1.05, .14, 4.6, .78, -1.05, M.vidroPreto);
    for (const [x, z] of [[4.0, -.3], [5.2, -.3], [4.0, -1.62], [5.2, -1.62]]) { L.add(M.pneu, new T.CylinderGeometry(.19, .19, .14, 22).rotateZ(Math.PI / 2).translate(x, .19, z)); L.add(M.aro, new T.CylinderGeometry(.1, .1, .145, 14).rotateZ(Math.PI / 2).translate(x, .19, z)); }
    L.add(M.branco, caixa(4.15, .45, .1, 4.35, .52, .12)); L.add(M.branco, caixa(4.85, .45, .1, 5.05, .52, .12));
    L.add(M.madeira, caixa(3.4, .55, -2.06, 4.4, .58, -1.8)); L.add(M.madeira, caixa(3.4, 1.05, -2.06, 4.4, 1.08, -1.8));
    L.add(M.caixaPapel, caixa(3.5, .58, -2.02, 3.8, .8, -1.82)); L.add(M.caixaPapel, caixa(3.9, .58, -2.0, 4.3, .74, -1.84)); L.add(M.caixaPapel, caixa(3.6, 1.08, -2.0, 4.0, 1.3, -1.84));
    L.add(M.lixeira, new T.CylinderGeometry(.17, .15, .5, 22).translate(5.5, .27, 2.4));
    L.add(M.lixeira, new T.CylinderGeometry(.18, .18, .04, 22).translate(5.5, .54, 2.4));
    const g = L.grupo(); cena.add(g);
  }

  function exterior() {
    const L = new Lote(), G = new Lote();
    // Bloco do terreno: grama em cima e terra nos lados, como uma maquete cortada.
    L.add(M.terra, uvMundo(caixa(BL.x0, BL.y0, BL.z0, BL.x1, -.02, BL.z1), .8));
    const gr = new T.PlaneGeometry(BL.x1 - BL.x0, BL.z1 - BL.z0); gr.rotateX(-Math.PI / 2); gr.translate((BL.x0 + BL.x1) / 2, 0, (BL.z0 + BL.z1) / 2);
    uvMundo(gr, .45); L.add(M.grama, gr);
    // Calçadas e garagem.
    L.add(M.concreto, uvMundo(caixa(1.6, 0, Z, 2.4, .02, BL.z1), 1));
    L.add(M.concreto, uvMundo(caixa(-X - .2, 0, Z, X + .1, .02, Z + .55), 1));
    L.add(M.concreto, uvMundo(caixa(X, 0, -2.25, 5.83, .022, BL.z1), 1));
    // Muro.
    L.add(M.paredeExt, uvMundo(caixa(5.83, 0, .2, 5.95, 1.15, BL.z1), 1));
    L.add(M.branco, caixa(5.8, 1.15, .2, 5.98, 1.2, BL.z1));
    // Garagem: paredes.
    L.add(M.paredeExt, uvMundo(caixa(X, 0, -2.2, 5.95, 2.1, -2.08), 1));
    L.add(M.paredeExt, uvMundo(caixa(5.83, 0, -2.2, 5.95, 2.1, .2), 1));
    // Calha e descida da água.
    L.add(M.calha, caixa(-3.55, H2 - .23, Z + .48, 3.55, H2 - .15, Z + .58));
    L.add(M.calha, haste([3.45, H2 - .2, Z + .53], [3.45, .05, Z + .53], .035, 10));
    // Vaso com prato (água parada) e arbustos.
    L.add(M.vaso, new T.LatheGeometry([[.0, 0], [.17, 0], [.21, .32], [.23, .34], [.22, .36], [0, .36]].map((p) => new T.Vector2(p[0], p[1])), 28).translate(3.0, .015, 3.4));
    L.add(M.vaso, new T.CylinderGeometry(.3, .27, .05, 28).translate(3.0, .025, 3.4));
    L.add(M.terraVaso, new T.CylinderGeometry(.2, .2, .02, 24).translate(3.0, .35, 3.4));
    for (let i = 0; i < 9; i++) { const a = i * .7, rr = .05 + (i % 3) * .05; G.add(i % 2 ? M.planta : M.planta2, new T.IcosahedronGeometry(.11 + R() * .06, 1).translate(3.0 + Math.cos(a) * rr, .5 + (i % 4) * .07, 3.4 + Math.sin(a) * rr)); }
    for (const [cx, cz, n] of [[-3.75, 2.75, 7], [-3.9, -1.9, 9], [-3.85, .8, 6]]) for (let i = 0; i < n; i++) G.add(i % 2 ? M.planta : M.planta2, new T.IcosahedronGeometry(.2 + R() * .14, 1).translate(cx + (R() - .5) * .5, .18 + R() * .35, cz + (R() - .5) * .5));
    cena.add(L.grupo(true, true), G.grupo(true, true));
    // Água parada no prato do vaso.
    const agua = new T.Mesh(new T.CircleGeometry(.27, 28).rotateX(-Math.PI / 2).translate(3.0, .053, 3.4), M.agua); cena.add(agua);
    // Sombra macia da maquete sobre a página.
    const s = new T.Mesh(new T.PlaneGeometry(BL.x1 - BL.x0 + 2.4, BL.z1 - BL.z0 + 2.4).rotateX(-Math.PI / 2).translate((BL.x0 + BL.x1) / 2 - .5, BL.y0 - .01, (BL.z0 + BL.z1) / 2 - .4), new T.MeshBasicMaterial({ map: TX.sombra, transparent: true, depthWrite: false, opacity: .55, clippingPlanes: [planoScan] }));
    cena.add(s);
  }

  function cobertura() {
    telhado = new T.Group();
    const L = new Lote(), S = new Lote();
    const ang = Math.atan2(CUME - (H2 - .1), Z + .45), larg = Math.hypot(CUME - (H2 - .1), Z + .45);
    for (const lado of [1, -1]) {
      const g = new T.BoxGeometry(7.1, .06, larg + .05); g.rotateX(lado * ang); g.translate(0, (CUME + H2 - .1) / 2 + .04, lado * (Z + .45) / 2);
      uvMundo(g, 1); const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, g.attributes.position.getX(i) / .5, (lado * g.attributes.position.getZ(i)) / .36);
      L.add(M.telha, g);
    }
    L.add(M.cumeeira, new T.CylinderGeometry(.09, .09, 7.14, 14, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, CUME + .06, 0));
    for (const lado of [1, -1]) L.add(M.branco, caixa(-3.56, H2 - .2, lado * (Z + .46) - .03, 3.56, H2 - .08, lado * (Z + .46) + .03));
    // Laje da garagem.
    L.add(M.concreto, uvMundo(caixa(X, 2.1, -2.3, 6.05, 2.22, .35), 1));
    L.add(M.branco, caixa(X, 2.1, .33, 6.05, 2.24, .37));
    telhado.add(L.grupo());
    cena.add(telhado);
    // Estrutura de madeira: fica no lugar quando as telhas sobem.
    for (let i = 0; i <= 8; i++) {
      if (i === 2) continue; // vão maior para a caixa d'água
      const x = mix(-3.45, 3.45, i / 8);
      for (const lado of [1, -1]) S.add(M.madeiraBruta, uvMundo(haste([x, CUME - .1, 0], [x, H2 - .02, lado * (Z + .4)], .035, 6), 2));
      S.add(M.madeiraBruta, uvMundo(caixa(x - .03, H2, -Z, x + .03, H2 + .06, Z), 2));
      S.add(M.madeiraBruta, uvMundo(caixa(x - .03, H2, -.03, x + .03, CUME - .1, .03), 2));
    }
    S.add(M.madeiraBruta, uvMundo(caixa(-3.5, CUME - .16, -.05, 3.5, CUME - .06, .05), 2));
    for (const lado of [1, -1]) for (const f of [.33, .66]) S.add(M.madeiraBruta, uvMundo(caixa(-3.5, mix(CUME - .1, H2, f) - .03, lado * (Z + .4) * f - .03, 3.5, mix(CUME - .1, H2, f) + .03, lado * (Z + .4) * f + .03), 2));
    cena.add(S.grupo());
  }

  /* ---------- encanamento (desentupimento) ---------- */
  const CANOS = [
    [[-1.55, .8, -1.82], [-1.55, -.45, -1.82], [-1.55, -.45, 3.15], [-2.2, -.45, 3.15]],
    [[-1.0, 0, .9], [-1.0, -.42, .9], [-1.55, -.42, .9]],
    [[-2.6, -.5, 3.5], [-2.6, -.55, 4.4], [.6, -.55, 4.4]],
    [[1.9, H1, .7], [1.9, H1 - .14, .7], [2.95, H1 - .14, .7], [2.95, H1 - .14, 1.9], [2.95, -.55, 1.9], [2.95, -.55, 4.4], [1.4, -.55, 4.4]],
    [[1.0, -.62, 4.8], [1.0, -.62, BL.z1 + .02]],
  ];
  function encanamento() {
    const L = new Lote(), C = new Lote();
    for (const c of CANOS) cano(L, M.pvc, c, .045);
    // Caixa de gordura e caixa de inspeção, enterradas.
    const caixaEnt = (x0, z0, x1, z1, y0) => {
      C.add(M.concreto, caixa(x0, y0, z0, x1, y0 + .05, z1));
      C.add(M.concreto, caixa(x0, y0, z0, x0 + .05, 0, z1)); C.add(M.concreto, caixa(x1 - .05, y0, z0, x1, 0, z1));
      C.add(M.concreto, caixa(x0, y0, z0, x1, 0, z0 + .05)); C.add(M.concreto, caixa(x0, y0, z1 - .05, x1, 0, z1));
      C.add(M.concreto, uvMundo(caixa(x0 - .02, 0, z0 - .02, x1 + .02, .035, z1 + .02), 1));
    };
    caixaEnt(-3.0, 2.8, -2.2, 3.5, -.72); caixaEnt(.6, 4.0, 1.4, 4.8, -.78);
    cena.add(L.grupo(false, true), C.grupo(false, true));
    // Raio X: os canos aparecem através do chão, em azul, com a água correndo.
    xray = new T.Group();
    const mx = new T.MeshBasicMaterial({ color: '#2E6BF2', transparent: true, opacity: 0, depthTest: false, depthWrite: false });
    const X2 = new Lote();
    for (const c of CANOS) cano(X2, mx, c, .06);
    const gx = X2.grupo(false, false); gx.renderOrder = 10; gx.traverse((o) => { o.renderOrder = 10; });
    xray.add(gx);
    const caixasX = new T.Group();
    const mBorda = new T.LineBasicMaterial({ color: '#2E6BF2', transparent: true, opacity: 0, depthTest: false });
    for (const [x0, z0, x1, z1, y0] of [[-3.0, 2.8, -2.2, 3.5, -.72], [.6, 4.0, 1.4, 4.8, -.78]]) { const l = new T.LineSegments(new T.EdgesGeometry(caixa(x0, y0, z0, x1, 0, z1)), mBorda); l.renderOrder = 11; caixasX.add(l); }
    xray.add(caixasX);
    // Gotas que correm pelos canos até a rede de esgoto.
    const trilhas = CANOS.map((c) => trilha(c.map((p) => [...p, [0, 1, 0]]), false));
    const n = 70, gotas = new T.InstancedMesh(new T.SphereGeometry(.035, 10, 8), new T.MeshBasicMaterial({ color: '#BFD3FF', transparent: true, opacity: 0, depthTest: false, depthWrite: false }), n);
    gotas.renderOrder = 12; gotas.frustumCulled = false; xray.add(gotas);
    // Entupimento: gordura acumulada antes da caixa.
    const tampao = new T.Mesh(new T.SphereGeometry(.07, 16, 12).scale(1.6, 1, 1), new T.MeshBasicMaterial({ color: '#D7262E', transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    tampao.position.set(-1.9, -.45, 3.15); tampao.renderOrder = 13; xray.add(tampao);
    cena.add(xray);
    const pos = new T.Vector3(), tan = new T.Vector3(), nor = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3(1, 1, 1), m = new T.Matrix4();
    xray.userData.anima = (t, k) => {
      gx.children.forEach((c) => { c.material.opacity = .62 * k; });
      mBorda.opacity = .9 * k; gotas.material.opacity = .95 * k; tampao.material.opacity = .9 * k * (.75 + .25 * Math.sin(t * 5));
      for (let i = 0; i < n; i++) {
        const tr = trilhas[i % trilhas.length], d = ((t * .55 + i * .37) % 1) * tr.total;
        tr.em(d, pos, tan, nor);
        m.compose(pos, q, s); gotas.setMatrixAt(i, m);
      }
      gotas.instanceMatrix.needsUpdate = true;
    };
  }

  /* ---------- caixa d'água ---------- */
  function caixaDagua() {
    tanque = new T.Group();
    const { x, z, r, h } = TANQUE, y = H2;
    const corpo = new T.Mesh(new T.CylinderGeometry(r, r * .9, h, 48, 1, true).translate(x, y + h / 2, z), M.caixaAzul);
    corpo.castShadow = true; corpo.receiveShadow = true;
    const fundo = new T.Mesh(new T.CircleGeometry(r * .9, 40).rotateX(-Math.PI / 2).translate(x, y + .005, z), M.caixaAzul);
    const aro = new T.Mesh(new T.TorusGeometry(r, .025, 8, 48).rotateX(Math.PI / 2).translate(x, y + h, z), M.caixaAzul);
    tanque.add(corpo, fundo, aro);
    // Tampa com dobradiça atrás: abre no capítulo da caixa d'água.
    const dob = new T.Group(); dob.position.set(x, y + h + .02, z - r - .02);
    const tampa = new T.Mesh(new T.CylinderGeometry(r + .04, r + .04, .05, 48).translate(0, 0, r + .02), M.caixaAzul);
    const pino = new T.Mesh(new T.CylinderGeometry(.1, .14, .06, 20).translate(0, .05, r + .02), M.caixaAzul);
    tampa.castShadow = pino.castShadow = true; dob.add(tampa, pino); tanque.add(dob);
    // Água com ondinhas, boia e sujeira no fundo.
    const geoAgua = new T.RingGeometry(.001, r * .92, 48, 10); geoAgua.rotateX(-Math.PI / 2);
    const agua = new T.Mesh(geoAgua, M.agua); agua.position.set(x, y + h * .78, z); tanque.add(agua);
    const base = geoAgua.attributes.position.array.slice();
    const boia = new T.Mesh(new T.SphereGeometry(.07, 16, 12), M.branco); tanque.add(boia);
    const braco = new T.Mesh(new T.CylinderGeometry(.008, .008, .32, 6), M.inox); tanque.add(braco);
    const sujeira = new T.Group();
    for (let i = 0; i < 18; i++) { const a = R() * 6.3, rr = Math.sqrt(R()) * r * .8; const s = new T.Mesh(new T.CircleGeometry(.02 + R() * .03, 10).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: '#4A3A2A', transparent: true, opacity: .7 })); s.position.set(x + Math.cos(a) * rr, y + .01, z + Math.sin(a) * rr); sujeira.add(s); }
    tanque.add(sujeira);
    // Entrada (da rua) e saída (para a casa).
    const L = new Lote();
    cano(L, M.pvc, [[x + r * .7, y + h - .08, z], [X - .3, y + h - .08, z], [X - .3, y + .05, z]], .025);
    cano(L, M.pvc, [[x - r * .6, y + .08, z + .1], [x - r - .3, y + .08, z + .1], [x - r - .3, y - .02, z + .1]], .03);
    tanque.add(L.grupo(true, true));
    cena.add(tanque);
    tanque.userData.anima = (t, k, dt) => {
      dob.rotation.x = -1.25 * k;
      const nivel = k > .02 ? mix(.18, .86, .5 + .5 * Math.cos(t * .5)) : .78;
      agua.position.y = y + h * nivel;
      const p = geoAgua.attributes.position;
      for (let i = 0; i < p.count; i++) { const bx = base[i * 3], bz = base[i * 3 + 2], d = Math.hypot(bx, bz); p.setY(i, Math.sin(d * 34 - t * 3.2) * .004 * k); }
      p.needsUpdate = true; geoAgua.computeVertexNormals();
      boia.position.set(x + r * .45, agua.position.y + .03, z - .05);
      braco.position.set(x + r * .62, agua.position.y + .1, z - .05); braco.rotation.z = .9;
      sujeira.children.forEach((s) => { s.material.opacity = .75 * clamp((.55 - nivel) * 3); });
    };
  }

  /* ---------- as pragas ---------- */
  function fazBarata() {
    const g = new T.Group(), corpo = new T.Group(); g.add(corpo);
    corpo.add(new T.Mesh(bolha(.5, .11, .24, -.05, .13, 0, 20), M.barata));
    corpo.add(new T.Mesh(bolha(.18, .07, .22, .37, .14, 0, 16), M.barataClara));
    corpo.add(new T.Mesh(bolha(.09, .08, .1, .53, .1, 0, 12), M.barata));
    const antenas = [];
    for (const s of [1, -1]) {
      const curva = new T.CatmullRomCurve3([new T.Vector3(.58, .12, s * .04), new T.Vector3(1.0, .16, s * .22), new T.Vector3(1.45, .14, s * .5), new T.Vector3(1.75, .1, s * .72)]);
      const a = new T.Mesh(new T.TubeGeometry(curva, 16, .012, 4, false), M.patas); a.position.set(0, 0, 0); antenas.push(a); corpo.add(a);
      corpo.add(new T.Mesh(haste([-.5, .12, s * .06], [-.66, .1, s * .14], .02, 4), M.patas));
    }
    const pernas = [];
    [[.32, .55, .3], [.08, .62, 0], [-.18, .75, -.42]].forEach(([px, comp, inc], i) => {
      for (const s of [1, -1]) {
        const p = new T.Group(); p.position.set(px, .1, s * .16);
        p.add(new T.Mesh(haste([0, 0, 0], [inc * .3 * comp + .05, .1, s * comp * .45], .018, 4), M.patas));
        p.add(new T.Mesh(haste([inc * .3 * comp + .05, .1, s * comp * .45], [inc * comp, -.1, s * comp], .012, 4), M.patas));
        p.userData.fase = (i % 2 === 0 ? 0 : Math.PI) + (s > 0 ? 0 : Math.PI);
        pernas.push(p); corpo.add(p);
      }
    });
    const sombra = new T.Mesh(new T.CircleGeometry(.5, 20).scale(1.3, .7, 1).rotateX(-Math.PI / 2).translate(0, .01, 0), M.sombraBicho); g.add(sombra);
    g.userData = { pernas, antenas, corpo };
    return g;
  }
  function geoFormiga() {
    const gs = [bolha(.22, .16, .16, -.33, .16, 0, 10), bolha(.06, .05, .05, -.1, .14, 0, 6), bolha(.16, .07, .07, .03, .15, 0, 8), bolha(.12, .11, .11, .25, .16, 0, 10)];
    for (const [x, c] of [[.12, .5], [.03, .55], [-.06, .58]]) for (const s of [1, -1]) gs.push(haste([x, .14, 0], [x + (x - .03) * 1.2, 0, s * c], .015, 3));
    for (const s of [1, -1]) { gs.push(haste([.33, .2, s * .03], [.48, .3, s * .12], .012, 3)); gs.push(haste([.48, .3, s * .12], [.62, .22, s * .2], .01, 3)); }
    return junta(gs);
  }
  function fazRato() {
    const g = new T.Group(), corpo = new T.Group(); g.add(corpo);
    corpo.add(new T.Mesh(bolha(.3, .2, .21, -.1, .23, 0, 22), M.rato));
    corpo.add(new T.Mesh(bolha(.2, .16, .16, .17, .21, 0, 18), M.rato));
    const cabeca = new T.Group(); cabeca.position.set(.36, .22, 0); corpo.add(cabeca);
    cabeca.add(new T.Mesh(bolha(.15, .1, .1, .05, 0, 0, 16), M.rato));
    cabeca.add(new T.Mesh(new T.ConeGeometry(.07, .16, 14).rotateZ(-Math.PI / 2).translate(.22, -.02, 0), M.rato));
    cabeca.add(new T.Mesh(bolha(.022, .02, .022, .3, -.025, 0, 8), M.ratoRosa));
    for (const s of [1, -1]) {
      cabeca.add(new T.Mesh(bolha(.022, .022, .022, .12, .045, s * .065, 8), M.olho));
      cabeca.add(new T.Mesh(bolha(.05, .06, .015, -.02, .1, s * .08, 10).rotateX(s * .3), M.ratoRosa));
    }
    const bigode = new T.BufferGeometry().setFromPoints([...[1, -1].flatMap((s) => [0, .03, -.03].flatMap((dy) => [new T.Vector3(.27, -.02, s * .03), new T.Vector3(.36, -.02 + dy, s * .14)]))]);
    cabeca.add(new T.LineSegments(bigode, new T.LineBasicMaterial({ color: '#D9D2CA' })));
    const pernas = [];
    for (const [x, s, f] of [[.2, 1, 0], [.2, -1, Math.PI], [-.22, 1, Math.PI], [-.22, -1, 0]]) {
      const p = new T.Group(); p.position.set(x, .12, s * .12);
      p.add(new T.Mesh(bolha(.05, .08, .04, 0, -.04, 0, 8), M.rato));
      p.add(new T.Mesh(bolha(.05, .015, .03, .03, -.11, 0, 8), M.ratoRosa));
      p.userData.fase = f; pernas.push(p); corpo.add(p);
    }
    const rabo = []; let pai = corpo;
    for (let i = 0; i < 12; i++) {
      const seg = new T.Group(); seg.position.set(i === 0 ? -.38 : -.075, i === 0 ? .2 : 0, 0);
      const rr = .03 * (1 - i / 13) + .006;
      seg.add(new T.Mesh(new T.CylinderGeometry(rr * .9, rr, .08, 6).rotateZ(Math.PI / 2).translate(-.04, 0, 0), M.ratoRosa));
      pai.add(seg); rabo.push(seg); pai = seg;
    }
    g.add(new T.Mesh(new T.CircleGeometry(.4, 20).scale(1.3, .6, 1).rotateX(-Math.PI / 2).translate(0, .01, 0), M.sombraBicho));
    g.userData = { pernas, rabo, cabeca, corpo };
    return g;
  }
  function geoCupim() {
    const gs = [bolha(.28, .12, .13, -.16, .12, 0, 10), bolha(.12, .08, .09, .08, .12, 0, 8), bolha(.1, .09, .09, .26, .13, 0, 10)];
    for (const x of [.12, .06, 0]) for (const s of [1, -1]) gs.push(haste([x, .1, 0], [x + .05, 0, s * .26], .013, 3));
    return junta(gs);
  }
  function fazMosquito() {
    const g = new T.Group();
    g.add(new T.Mesh(bolha(.32, .045, .045, -.22, 0, 0, 10), M.mosquito));
    g.add(new T.Mesh(bolha(.09, .08, .08, .06, .02, 0, 10), M.mosquito));
    g.add(new T.Mesh(bolha(.05, .05, .05, .17, 0, 0, 8), M.mosquito));
    g.add(new T.Mesh(haste([.2, -.01, 0], [.42, -.05, 0], .008, 3), M.mosquito));
    for (const [x, c] of [[.1, .5], [.05, .55], [0, .6]]) for (const s of [1, -1]) {
      g.add(new T.Mesh(haste([x, 0, s * .03], [x + (x - .05) * 2, -.18, s * c * .55], .006, 3), M.mosquito));
      g.add(new T.Mesh(haste([x + (x - .05) * 2, -.18, s * c * .55], [x + (x - .05) * 3, -.5, s * c], .005, 3), M.mosquito));
    }
    const asas = [];
    for (const s of [1, -1]) { const a = new T.Group(); a.position.set(.05, .05, s * .03); a.add(new T.Mesh(new T.CircleGeometry(.5, 16).scale(.36, 1, 1).translate(-.14, 0, s * .45).rotateX(Math.PI / 2), M.asa)); asas.push(a); g.add(a); }
    g.userData = { asas };
    return g;
  }

  function fazPragas() {
    const pos = new T.Vector3(), tan = new T.Vector3(), nor = new T.Vector3();
    const chao = (y) => [0, 1, 0];
    // Baratas: na cozinha, perto da pia, da geladeira e do ralo.
    {
      const G = new T.Group(), itens = [];
      const rotas = [
        [[-1.9, .016, -1.42], [-1.2, .016, -1.4], [-.8, .016, -1.1], [-1.05, .016, .55], [-1.5, .016, .1], [-2.3, .016, -.85], [-2.35, .016, -1.3]],
        [[-1.3, .866, -1.62], [-.75, .866, -1.62], [-.65, .866, -1.95], [-1.1, .866, -2.0], [-1.85, .866, -1.55]],
        [[-1.0, .016, .9], [-.7, .016, 1.3], [-.25, .016, 1.1], [-.5, .016, .55]],
        [[-2.35, .016, -.9], [-2.3, .016, -.3], [-2.75, .016, -.1], [-2.95, .016, -.8]],
        [[-.4, .866, -1.62], [.15, .866, -1.62], [.2, .866, -1.95], [-.3, .866, -2.0]],
      ];
      rotas.forEach((r, i) => {
        const b = fazBarata(); b.scale.setScalar(.12); G.add(b);
        itens.push({ b, tr: trilha(r.map((p) => [...p, chao()]), true), d: i * 1.3, fase: i * 1.7, passo: 0 });
      });
      G.userData.anima = (t, k, dt) => {
        for (const it of itens) {
          const ciclo = (t + it.fase) % 3.4, anda = ciclo < 1.9 ? 1 : 0;
          const v = anda * (ciclo < .25 ? ciclo / .25 : 1) * .55;
          it.d += v * dt; it.passo += v * dt * 70;
          it.tr.em(it.d, pos, tan, nor); orienta(it.b, pos, tan, nor);
          it.b.scale.setScalar(.12 * k);
          const u = it.b.userData;
          u.pernas.forEach((p) => { p.rotation.y = Math.sin(it.passo + p.userData.fase) * .45 * anda; p.rotation.x = Math.max(0, Math.sin(it.passo + p.userData.fase)) * .3 * anda; });
          u.antenas.forEach((a, j) => { a.rotation.y = Math.sin(t * (anda ? 9 : 4) + j * 2) * .12; a.rotation.z = Math.sin(t * 5 + j) * .06; });
          u.corpo.position.y = Math.abs(Math.sin(it.passo * 2)) * .008 * anda;
        }
      };
      pragas.baratas = G;
    }
    // Formigas: trilha da fresta na parede da sala até o açucareiro na bancada.
    {
      const G = new T.Group(), n = fraco ? 30 : 52;
      const im = new T.InstancedMesh(geoFormiga(), M.formiga, n); im.frustumCulled = false; G.add(im);
      const pote = new T.Mesh(new T.CylinderGeometry(.06, .055, .1, 20).translate(-.32, .91, -1.82), M.louca); pote.castShadow = true; G.add(pote);
      const pts = [[-3.04, .018, .4], [-2.6, .018, .15], [-2.2, .018, -.3], [-1.9, .018, -.85], [-1.62, .018, -1.3], [-1.6, .018, -1.505, [0, 0, 1]], [-1.58, .8, -1.505, [0, 0, 1]], [-1.55, .866, -1.56], [-1.15, .866, -1.62], [-.7, .866, -1.7], [-.4, .866, -1.78]];
      const tr = trilha(pts.map((p) => [p[0], p[1], p[2], p[3] || [0, 1, 0]]), false);
      const m = new T.Matrix4(), q = new T.Quaternion(), s = new T.Vector3(), o = new T.Object3D();
      G.userData.anima = (t, k) => {
        for (let i = 0; i < n; i++) {
          const volta = i % 3 === 2, vel = .11 + (i % 5) * .006;
          let d = ((t * vel + i * (tr.total / n) * 1.0) % tr.total);
          if (volta) d = tr.total - d;
          tr.em(d, pos, tan, nor);
          if (volta) tan.negate();
          const lado = new T.Vector3().crossVectors(tan, nor).normalize();
          pos.addScaledVector(lado, Math.sin(t * 6 + i) * .006 + (volta ? .012 : -.004));
          orienta(o, pos, tan, nor); o.scale.setScalar(.046 * k); o.updateMatrix();
          im.setMatrixAt(i, o.matrix);
        }
        im.instanceMatrix.needsUpdate = true;
      };
      pragas.formigas = G;
    }
    // Ratos: um na garagem, perto da lixeira; outro no forro, perto da caixa d'água.
    {
      const G = new T.Group(), itens = [];
      const rotas = [
        [[5.05, .025, 1.5], [4.45, .025, 2.05], [4.5, .025, 2.9], [5.05, .025, 3.25], [5.55, .025, 3.0], [5.15, .025, 2.0]],
        [[.4, H2 + .005, .5], [-.6, H2 + .005, 1.2], [-2.4, H2 + .005, .6], [-2.6, H2 + .005, -.9], [-1.0, H2 + .005, -1.3], [.6, H2 + .005, -.4]],
      ];
      rotas.forEach((r, i) => { const b = fazRato(); b.scale.setScalar(.46); G.add(b); itens.push({ b, tr: trilha(r.map((p) => [...p, [0, 1, 0]]), true), d: i * 2, fase: i * 1.1, passo: 0 }); });
      G.userData.anima = (t, k, dt) => {
        for (const it of itens) {
          const ciclo = (t + it.fase) % 4.2, anda = ciclo < 2.6 ? 1 : 0, v = anda * .75;
          it.d += v * dt; it.passo += v * dt * 30;
          it.tr.em(it.d, pos, tan, nor); orienta(it.b, pos, tan, nor); it.b.scale.setScalar(.46 * k);
          const u = it.b.userData;
          u.pernas.forEach((p) => { p.rotation.z = Math.sin(it.passo + p.userData.fase) * .6 * anda; });
          u.rabo.forEach((s, j) => { s.rotation.y = Math.sin(t * (anda ? 9 : 3) - j * .55) * (anda ? .16 : .09); s.rotation.z = -.04; });
          u.cabeca.rotation.z = anda ? 0 : Math.sin(t * 7) * .12; u.cabeca.rotation.y = anda ? 0 : Math.sin(t * 2.3) * .3;
          u.corpo.position.y = Math.abs(Math.sin(it.passo)) * .03 * anda;
        }
      };
      pragas.ratos = G;
    }
    // Cupins: galerias de terra no batente e numa caibro do telhado, com operários andando.
    {
      const G = new T.Group();
      const galerias = [
        [[X - E - .035, .0, -1.32], [X - E - .04, .35, -1.33], [X - E - .035, .7, -1.31], [X - E - .04, 1.05, -1.33], [X - E - .035, 1.36, -1.3]],
        [[-2.633, H2 + .06, .02], [-2.633, 4.1, .02], [-2.633, 4.6, -.08], [-2.633, 4.357, -.6], [-2.633, 4.113, -1.1], [-2.633, 3.917, -1.5]],
        [[-3.45 + .045, 4.6, .1], [-3.45 + .045, 4.4, .55], [-3.45 + .045, 4.16, 1.05], [-3.45 + .045, 3.9, 1.6]],
        [[-2.63, H2 + .08, .4], [-2.63, H2 + .08, 1.1], [-2.63, H2 + .08, 1.8]],
      ];
      const L = new Lote();
      for (const gpts of galerias) { const c = new T.CatmullRomCurve3(gpts.map((p) => new T.Vector3(...p))); L.add(M.lama, new T.TubeGeometry(c, 40, .045, 8, false)); }
      for (let i = 0; i < 7; i++) L.add(M.lama, new T.ConeGeometry(.02 + R() * .02, .02 + R() * .02, 8).translate(X - E - .06 - R() * .12, .01, -1.36 + R() * .12));
      for (let i = 0; i < 6; i++) L.add(M.lama, new T.ConeGeometry(.02 + R() * .02, .02 + R() * .02, 8).translate(-2.1 + R() * .5, H1 + .01, -1.45 + R() * .06));
      for (let i = 0; i < 9; i++) L.add(M.lama, new T.ConeGeometry(.02 + R() * .025, .02 + R() * .03, 8).translate(-2.75 + R() * .3, H2 + .01, -.2 + R() * 1.6));
      G.add(L.grupo(false, true));
      const n = 44, im = new T.InstancedMesh(geoCupim(), M.cupim, n); im.frustumCulled = false; G.add(im);
      const cab = new T.InstancedMesh(new T.SphereGeometry(.1, 10, 8).translate(.27, .13, 0), M.cupimCab, n); cab.frustumCulled = false; G.add(cab);
      const trs = [
        trilha([[X - E - .07, .02, -1.36, [-1, 0, 0]], [X - E - .074, .7, -1.38, [-1, 0, 0]], [X - E - .07, 1.36, -1.36, [-1, 0, 0]]], false),
        trilha([[-2.68, H2 + .08, .02, [-1, 0, 0]], [-2.68, 4.1, .02, [-1, 0, 0]], [-2.68, 4.6, -.08, [-1, 0, 0]], [-2.68, 4.357, -.6, [-1, 0, 0]], [-2.68, 4.113, -1.1, [-1, 0, 0]], [-2.68, 3.917, -1.5, [-1, 0, 0]]], false),
        trilha([[-3.37, 4.62, .1, [0, 1, 0]], [-3.37, 4.42, .55, [0, 1, 0]], [-3.37, 4.18, 1.05, [0, 1, 0]], [-3.37, 3.92, 1.6, [0, 1, 0]]], false),
        trilha([[-2.6, H2 + .11, .4, [0, 1, 0]], [-2.6, H2 + .11, 1.1, [0, 1, 0]], [-2.6, H2 + .11, 1.8, [0, 1, 0]]], false),
      ];
      const o = new T.Object3D();
      G.userData.anima = (t, k) => {
        for (let i = 0; i < n; i++) {
          const tr = trs[i % trs.length], volta = i % 6 >= 3;
          let d = (t * .05 + i * .13) % tr.total; if (volta) d = tr.total - d;
          tr.em(d, pos, tan, nor); if (volta) tan.negate();
          orienta(o, pos, tan, nor); o.scale.setScalar(.065 * k); o.updateMatrix();
          im.setMatrixAt(i, o.matrix); cab.setMatrixAt(i, o.matrix);
        }
        im.instanceMatrix.needsUpdate = true; cab.instanceMatrix.needsUpdate = true;
      };
      pragas.cupins = G;
    }
    // Mosquitos: em volta do prato do vaso e da calha.
    {
      const G = new T.Group(), itens = [];
      const centros = [[3.0, .45, 3.4], [3.0, .62, 3.4], [3.1, .4, 3.3], [2.85, .55, 3.55], [2.6, H2 - .1, Z + .7], [1.4, H2 - .05, Z + .75], [2.9, .75, 3.5], [3.2, .5, 3.2], [-1.0, .25, .9]];
      centros.forEach((c, i) => { const m = fazMosquito(); m.scale.setScalar(.15); G.add(m); itens.push({ m, c, f: [1.1 + R(), 1.7 + R(), 1.3 + R()], p: [R() * 6, R() * 6, R() * 6], r: .22 + R() * .18 }); });
      // Larvas mexendo na água do prato.
      const larvas = [];
      for (let i = 0; i < 6; i++) { const l = new T.Mesh(new T.CylinderGeometry(.006, .004, .05, 5).rotateZ(Math.PI / 2), M.mosquito); l.position.set(3.0 + (R() - .5) * .3, .056, 3.4 + (R() - .5) * .3); larvas.push(l); G.add(l); }
      const ant = new T.Vector3();
      G.userData.anima = (t, k) => {
        for (const it of itens) {
          const { c, f, p, r } = it;
          pos.set(c[0] + Math.sin(t * f[0] + p[0]) * r, c[1] + Math.sin(t * f[1] + p[1]) * r * .5, c[2] + Math.cos(t * f[2] + p[2]) * r);
          ant.copy(it.m.position);
          it.m.position.copy(pos);
          tan.subVectors(pos, ant); if (tan.lengthSq() > 1e-8) { tan.y *= .3; tan.normalize(); orienta(it.m, pos, tan, nor.set(0, 1, 0)); }
          it.m.scale.setScalar(.15 * k);
          const bat = Math.sin(t * 95 + p[0]) * .9;
          it.m.userData.asas[0].rotation.x = bat; it.m.userData.asas[1].rotation.x = -bat;
        }
        larvas.forEach((l, i) => { l.rotation.y = Math.sin(t * 8 + i) * .9; l.position.y = .056 + Math.sin(t * 3 + i) * .003; l.scale.setScalar(k); });
      };
      pragas.mosquitos = G;
    }
    for (const id in pragas) { const g = pragas[id]; g.visible = false; g.userData.k = 0; cena.add(g); }
    // O desentupimento e a caixa d'água usam o raio X e o tanque.
    pragas.desentupimento = xray; xray.userData.k = 0;
    pragas.caixa = tanque; tanque.userData.k = 0;
  }

  /* ---------- linha do escaneamento e anéis dos lugares ---------- */
  function efeitos() {
    scan = new T.Group();
    const mat = new T.MeshBasicMaterial({ color: '#D7262E' });
    const r = (x0, z0, x1, z1) => {
      const e = .009;
      for (const g of [caixa(x0, -e, z0 - e, x1, e, z0 + e), caixa(x0, -e, z1 - e, x1, e, z1 + e), caixa(x0 - e, -e, z0, x0 + e, e, z1), caixa(x1 - e, -e, z0, x1 + e, e, z1)]) scan.add(new T.Mesh(g, mat));
    };
    r(BL.x0 - .05, BL.z0 - .05, BL.x1 + .05, BL.z1 + .05); r(-X - .05, -Z - .05, X + .05, Z + .05);
    const folha = new T.Mesh(new T.PlaneGeometry(BL.x1 - BL.x0, BL.z1 - BL.z0).rotateX(-Math.PI / 2).translate((BL.x0 + BL.x1) / 2, 0, (BL.z0 + BL.z1) / 2), new T.MeshBasicMaterial({ color: '#D7262E', transparent: true, opacity: .05, depthWrite: false, side: T.DoubleSide }));
    scan.add(folha);
    scan.visible = false; cena.add(scan);
    aneis = [];
    for (let i = 0; i < 5; i++) { const s = new T.Sprite(new T.SpriteMaterial({ map: TX.anel, depthTest: false, transparent: true })); s.renderOrder = 20; s.visible = false; aneis.push(s); cena.add(s); }
  }

  /* ---------- montagem ---------- */
  async function monta(TT) {
    T = TT;
    try {
      celular = window.innerWidth < 760; fraco = (navigator.hardwareConcurrency || 8) <= 4;
      _m4 = new T.Matrix4(); _z = new T.Vector3(); _y = new T.Vector3();
      tela = document.createElement('canvas'); tela.id = 'casa3d'; tela.setAttribute('aria-hidden', 'true');
      const base = document.getElementById('cena');
      if (base) base.after(tela); else document.body.prepend(tela);
      // Só liga em placa de vídeo de verdade: com o desenho por software, a casa ficaria travando.
      const px = window.innerWidth * window.innerHeight * Math.pow(Math.min(window.devicePixelRatio || 1, 1.75), 2);
      renderer = new T.WebGLRenderer({ canvas: tela, antialias: px < 2.6e6, alpha: true, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: true });
      tela.addEventListener('webglcontextlost', (e) => { e.preventDefault(); falha(); });
      renderer.setClearColor(0xffffff, 0);
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
      renderer.localClippingEnabled = true;
      cena = new T.Scene();
      camera = new T.PerspectiveCamera(30, 1, .05, 120);
      planoScan = new T.Plane(new T.Vector3(0, -1, 0), -2);
      planoFrente = new T.Plane(new T.Vector3(0, -1, 0), 10);
      ajusta3d();
      texturas(); await pausa();
      materiais(); ambiente(); await pausa();
      casa(); pisos(); await pausa();
      moveis(); await pausa();
      cobertura(); exterior(); await pausa();
      encanamento(); caixaDagua(); await pausa();
      fazPragas(); efeitos(); await pausa();
      camera.position.set(12, 7, 12); camera.lookAt(0, 1.5, 0);
      if (renderer.compileAsync) await renderer.compileAsync(cena, camera); else renderer.compile(cena, camera);
      C3.pronta = true;
      tela.classList.add('pronta');
      if (window.Cena) window.Cena.acorda();
    } catch (e) { console.warn('Casa 3D indisponível:', e); falha(); }
  }
  function ajusta3d() {
    const W = window.innerWidth, H = window.innerHeight;
    if (W === W3 && Math.abs(H - H3) < 120) return;
    W3 = W; H3 = H; celular = W < 760;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, celular ? 1.5 : 1.75, Math.max(1, Math.sqrt((celular ? 1.8e6 : 2.4e6) / (W * H)))));
    renderer.setSize(W, H, false);
  }

  /* Cada quadro chega do cena.js, com a mesma câmera da casa de pontos. */
  C3.quadro = (cam, s) => {
    if (!C3.pronta) return;
    if (s.vis < .002) { if (tela.style.visibility !== 'hidden') tela.style.visibility = 'hidden'; return; }
    tela.style.visibility = '';
    tela.style.opacity = s.vis >= .999 ? '' : s.vis.toFixed(3);
    ajusta3d();
    const dt = Math.min(.05, Math.max(0, s.t - ultimoT)); ultimoT = s.t;
    camera.fov = cam.fov; camera.aspect = cam.asp; camera.near = .05; camera.far = 120;
    camera.position.set(cam.olho[0], cam.olho[1], cam.olho[2]); camera.up.set(0, 1, 0);
    camera.lookAt(cam.alvo[0], cam.alvo[1], cam.alvo[2]);
    camera.updateProjectionMatrix();
    const pm = camera.projectionMatrix.elements; pm[8] -= cam.shift[0]; pm[9] -= cam.shift[1];
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    // Escaneamento: a casa nasce de baixo para cima.
    const hScan = mix(BL.y0 - .1, CUME + .45, s.solido);
    if (Math.abs(s.solido - estado.solido) > 1e-4) { planoScan.constant = hScan; estado.solido = s.solido; sombraSuja = true; }
    scan.visible = s.solido > .003 && s.solido < .997; scan.position.y = hScan;
    // Abrir: o telhado sobe e a parede da frente desce.
    const a = suave(clamp(s.abre));
    if (Math.abs(a - estado.abre) > 1e-4) {
      estado.abre = a; sombraSuja = true;
      planoFrente.constant = mix(H2 + .5, .14, a);
      telhado.position.y = a * 7; telhado.visible = a < .985;
    }
    // Capítulos: cada grupo aparece e some com suavidade.
    for (const id in pragas) {
      const g = pragas[id], alvo = s.praga === id ? 1 : 0;
      g.userData.k += (alvo - g.userData.k) * Math.min(1, dt * 3.5 + (s.calmo ? 1 : 0));
      const k = g.userData.k;
      if (g === tanque) { tanque.userData.anima(s.t, k, dt); continue; }
      g.visible = k > .01;
      if (g.visible && g.userData.anima) g.userData.anima(s.t, k, dt);
    }
    // Anéis vermelhos nos lugares da vistoria.
    for (let i = 0; i < aneis.length; i++) {
      const h = s.hot, on = h[i * 4 + 3];
      const an = aneis[i]; an.visible = on > .05 && s.abre > .5;
      if (an.visible) { an.position.set(h[i * 4], h[i * 4 + 1], h[i * 4 + 2]); const p = (s.t * .9 + i * .23) % 1; an.scale.setScalar((.14 + p * .22) * on); an.material.opacity = (1 - p) * on; }
    }
    if (sombraSuja) { renderer.shadowMap.needsUpdate = true; sombraSuja = false; }
    renderer.render(cena, camera);
  };
})();
