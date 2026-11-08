/* Vistoria: a casa de verdade, cômodo por cômodo, em fotos e vídeos reais.
   Cada capítulo da página troca o cômodo, move a câmera até o ponto que importa e marca os lugares onde a vistoria começa.
   A lente vermelha é a íris do gavião: mostra a praga de perto. As fotos são de banco de imagens (ilustração). */
(function () {
  'use strict';
  const raiz = document.documentElement;
  const cfg = window.VISTORIA;
  if (!cfg) return;
  const V = { pronta: false };
  window.Vistoria = V;
  const pasta = window.MIDIA_URL || 'midia/';
  const larga = () => window.matchMedia('(min-width: 1000px) and (min-aspect-ratio: 1/1)').matches;
  const calmo = () => raiz.classList.contains('calmo');
  const NS = 'http://www.w3.org/2000/svg';

  /* ---------- palco ---------- */
  const palco = document.createElement('div');
  palco.id = 'vistoria'; palco.setAttribute('aria-hidden', 'true');
  const camadas = {};
  for (const [nome, c] of Object.entries(cfg.cenas)) {
    const d = document.createElement('div'); d.className = 'v-cena'; d.dataset.cena = nome;
    if (c.porta) d.style.setProperty('--porta', c.porta[0] * 100 + '% ' + c.porta[1] * 100 + '%');
    const img = new Image(); img.alt = ''; img.decoding = 'async'; img.draggable = false;
    img.width = c.w; img.height = c.h;
    const marcas = document.createElement('div'); marcas.className = 'v-marcas';
    d.append(img, marcas);
    palco.appendChild(d);
    camadas[nome] = { d, img, marcas, c, cam: null };
  }
  const scan = document.createElement('div'); scan.className = 'v-scan';
  const guia = document.createElementNS(NS, 'svg'); guia.setAttribute('class', 'v-guia');
  const traco = document.createElementNS(NS, 'line'); guia.appendChild(traco);

  /* A lente: o anel da íris do gavião (três arcos com marcas, como a escala de uma lente), com a praga dentro. */
  const lente = document.createElement('figure'); lente.className = 'v-lente';
  const iris = document.createElementNS(NS, 'svg'); iris.setAttribute('viewBox', '0 0 200 200'); iris.setAttribute('class', 'v-iris');
  let d = '';
  for (let i = 0; i < 360; i += 3) {
    if (i % 120 > 84) continue;
    const a = (i - 90) * Math.PI / 180, r0 = 97, r1 = i % 12 === 0 ? 89 : 93.5;
    d += `M${(100 + Math.cos(a) * r0).toFixed(2)} ${(100 + Math.sin(a) * r0).toFixed(2)}L${(100 + Math.cos(a) * r1).toFixed(2)} ${(100 + Math.sin(a) * r1).toFixed(2)}`;
  }
  const traços = document.createElementNS(NS, 'path'); traços.setAttribute('d', d); iris.appendChild(traços);
  const olho = document.createElement('div'); olho.className = 'v-olho';
  const poster = new Image(); poster.alt = ''; poster.className = 'v-poster';
  const video = document.createElement('video');
  video.muted = true; video.defaultMuted = true; video.loop = true; video.playsInline = true; video.preload = 'none'; video.disablePictureInPicture = true;
  video.setAttribute('muted', ''); video.setAttribute('playsinline', '');
  olho.append(poster, video);
  const legenda = document.createElement('figcaption'); legenda.className = 'v-especie';
  lente.append(iris, olho, legenda);
  palco.append(scan, guia, lente);

  const ref = document.getElementById('cena');
  if (ref) ref.after(palco); else document.body.prepend(palco);
  raiz.classList.add('com-vistoria');

  /* ---------- câmera: um ponto da foto vai para a área livre da tela ---------- */
  // Área livre: à direita do cartão no computador, em cima da folha de baixo no celular.
  const ALVO = () => (larga() ? [.68, .5] : [.5, .44]);
  function camera(k, c) {
    const W = palco.clientWidth || window.innerWidth, H = palco.clientHeight || window.innerHeight;
    const s = Math.max(W / k.c.w, H / k.c.h) * (c.zoom || 1), w = k.c.w * s, h = k.c.h * s;
    const [ax, ay] = ALVO();
    const x = Math.min(0, Math.max(W - w, ax * W - c.foco[0] * w)), y = Math.min(0, Math.max(H - h, ay * H - c.foco[1] * h));
    return { x, y, w, h, s, W, H };
  }
  function cameraDe(k, cap) {
    const fonte = cap || k.c;
    return (larga() ? fonte.camera : fonte.cameraCel || fonte.camera) || { foco: [.5, .5], zoom: 1 };
  }
  function aplica(k, cap, semAnimar) {
    k.cam = camera(k, cameraDe(k, cap));
    if (semAnimar) k.img.style.transition = 'none';
    k.img.style.transform = `translate3d(${k.cam.x.toFixed(1)}px, ${k.cam.y.toFixed(1)}px, 0) scale(${k.cam.s.toFixed(4)})`;
    if (semAnimar) { void k.img.offsetWidth; k.img.style.transition = ''; }
  }
  const naTela = (k, nx, ny) => [k.cam.x + nx * k.cam.w, k.cam.y + ny * k.cam.h];

  /* ---------- carregamento: a primeira foto antes, as outras aos poucos ---------- */
  function carrega(nome) {
    const k = camadas[nome];
    if (k && !k.img.getAttribute('src')) k.img.src = pasta + k.c.foto;
  }
  function aquece() {
    const fila = Object.keys(camadas).filter((n) => !camadas[n].img.getAttribute('src'));
    const proxima = () => { const n = fila.shift(); if (!n) return; carrega(n); camadas[n].img.addEventListener('load', () => setTimeout(proxima, 150), { once: true }); camadas[n].img.addEventListener('error', proxima, { once: true }); };
    proxima();
  }

  /* ---------- capítulos ---------- */
  let cenaAtual = null, capAtual;
  function marcasDe(cap) {
    for (const k of Object.values(camadas)) k.marcas.textContent = '';
    if (!cap) return;
    const k = camadas[cap.cena];
    cap.marcas.forEach(([nome, nx, ny], i) => {
      const m = document.createElement('span'); m.className = 'v-marca';
      m.dataset.nx = nx; m.dataset.ny = ny; m.style.setProperty('--i', i);
      const t = document.createElement('span'); t.textContent = nome; m.appendChild(t);
      k.marcas.appendChild(m);
    });
  }
  function lenteDe(cap) {
    const l = cap && cap.lente;
    lente.classList.toggle('on', !!l);
    if (!l) { video.pause(); return; }
    legenda.textContent = l.especie;
    poster.src = pasta + l.poster;
    if (l.video && !calmo()) {
      if (video.dataset.atual !== l.video) { video.dataset.atual = l.video; video.src = pasta + l.video; video.load(); }
      const pr = video.play(); if (pr) pr.catch(() => {});
      video.classList.add('on');
    } else { video.pause(); video.classList.remove('on'); }
  }
  /* Marcas e lente seguem a câmera. Cada etiqueta procura um lado livre junto da sua marca
     (sem cobrir outra etiqueta nem sair da tela); depois a lente vai para um lugar que não cubra nenhuma delas. */
  const cruza = (a, b, folga) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]) + folga) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]) + folga);
  const choque = (c, lista, folga) => lista.reduce((t, o) => t + cruza(c, o, folga), 0);
  function posiciona() {
    const k = camadas[cenaAtual], cap = capAtual ? cfg.capitulos[capAtual] : null;
    if (!k || !k.cam) return;
    const W = k.cam.W, H = k.cam.H, largo = larga();
    // Na tela estreita a foto não cabe inteira: a marca que cai fora da tela, ou embaixo do topo, some em vez de aparecer cortada.
    const fora = (x, y) => x < 12 || x > W - 12 || y < (largo ? 70 : 118) || y > H;
    const pontos = Array.from(k.marcas.children, (m) => {
      const [x, y] = naTela(k, +m.dataset.nx, +m.dataset.ny);
      m.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      const f = fora(x, y);
      m.classList.toggle('fora', f);
      return { m, x, y, f };
    });
    const vistos = pontos.filter((p) => !p.f);
    const ocupado = vistos.map((p) => [p.x - 9, p.y - 9, p.x + 9, p.y + 9]);
    for (const p of vistos) {
      const t = p.m.firstElementChild, lw = t.offsetWidth, lh = t.offsetHeight, passo = lh + 8;
      const lado = p.x > W * .6 ? 1 : 0;
      let melhor = null;
      for (const [esq, dy] of [[lado, 0], [1 - lado, 0], [lado, -passo], [1 - lado, -passo], [lado, passo], [1 - lado, passo]]) {
        const a = esq ? p.x - 16 - lw : p.x + 16, c = [a, p.y - 15 + dy, a + lw, p.y - 15 + dy + lh];
        const custo = (c[0] < 8 || c[2] > W - 8 ? 1e7 : 0) + choque(c, ocupado, 5);
        if (!melhor || custo < melhor.custo) melhor = { esq, dy, c, custo };
        if (!custo) break;
      }
      p.m.classList.toggle('esq', !!melhor.esq);
      p.m.style.setProperty('--dy', melhor.dy + 'px');
      ocupado.push(melhor.c);
    }
    const L = cap && cap.lente && cap.cena === cenaAtual ? cap.lente : null;
    if (!L) { guia.classList.remove('on'); return; }
    const r = lente.offsetWidth / 2;
    const x0 = largo ? Math.min(W * .37, 600) + r : r + 14, x1 = W - r - 18;
    const y0 = (largo ? 110 : 124) + r, y1 = (largo ? H - 40 : H * .62) - r;
    const prende = ([x, y]) => [Math.min(x1, Math.max(x0, x)), Math.min(y1, Math.max(y0, y))];
    const [px, py] = naTela(k, ...(largo ? L.pos : (L.posCel || L.pos)));
    const d = 2.3 * r;
    const lugares = [[px, py], [W - px, py], [px, py - d], [W - px, py - d], [px, py + d], [W - px, py + d], [W / 2, py - d], [W / 2, py + d]].map(prende);
    // A caixa da lente inclui a legenda embaixo dela.
    let melhor = null;
    for (const [x, y] of lugares) {
      const custo = choque([x - r, y - r, x + r, y + r + 34], ocupado, 8);
      if (!melhor || custo < melhor.custo) melhor = { x, y, custo };
      if (!custo) break;
    }
    const lx = melhor.x, ly = melhor.y;
    lente.style.transform = `translate3d(${(lx - r).toFixed(1)}px, ${(ly - r).toFixed(1)}px, 0)`;
    const alvo = pontos[(largo || L.alvoCel == null ? L.alvo : L.alvoCel) || 0];
    const dx = alvo.x - lx, dy = alvo.y - ly, dd = Math.hypot(dx, dy) || 1;
    traco.setAttribute('x1', (lx + dx / dd * (r + 4)).toFixed(1)); traco.setAttribute('y1', (ly + dy / dd * (r + 4)).toFixed(1));
    traco.setAttribute('x2', (alvo.x - dx / dd * 11).toFixed(1)); traco.setAttribute('y2', (alvo.y - dy / dd * 11).toFixed(1));
    guia.classList.toggle('on', dd > r + 30 && !alvo.f);
  }
  function capitulo(id) {
    const cap = id && cfg.capitulos[id] ? cfg.capitulos[id] : null;
    const novo = cap ? id : null;
    if (novo === capAtual && cenaAtual) return;
    capAtual = novo;
    const nome = cap ? cap.cena : cfg.inicio, k = camadas[nome], antes = cenaAtual ? camadas[cenaAtual] : null;
    carrega(nome);
    marcasDe(cap); lenteDe(cap);
    if (nome !== cenaAtual) {
      cenaAtual = nome;
      aplica(k, cap, true);
      const entra = () => {
        if (cenaAtual !== nome) return;
        k.d.classList.add('on');
        if (antes && antes !== k) {
          antes.d.classList.remove('on');
          antes.d.classList.add(antes.c.porta && cap ? 'sai-porta' : 'sai');
          setTimeout(() => antes.d.classList.remove('sai', 'sai-porta'), 1500);
        }
        posiciona();
      };
      if (k.img.complete && k.img.naturalWidth) entra(); else k.img.addEventListener('load', entra, { once: true });
    } else { aplica(k, cap, false); posiciona(); }
  }
  // A largura das etiquetas muda quando a fonte termina de carregar.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => posiciona());
  window.addEventListener('resize', () => { const k = camadas[cenaAtual]; if (!k) return; aplica(k, capAtual ? cfg.capitulos[capAtual] : null, true); posiciona(); }, { passive: true });

  /* ---------- a cada quadro, o estado chega do cena.js ---------- */
  let ligado = false, aquecido = false;
  V.quadro = (s) => {
    const vis = s.vis > .01;
    if (vis !== ligado) {
      ligado = vis; palco.classList.toggle('ligado', vis);
      if (!vis) video.pause(); else if (capAtual && video.classList.contains('on') && !calmo()) { const pr = video.play(); if (pr) pr.catch(() => {}); }
    }
    if (!vis) return;
    if (!aquecido) { aquecido = true; carrega(cfg.inicio); camadas[cfg.inicio].img.addEventListener('load', aquece, { once: true }); }
    // O escaneamento revela a casa de baixo para cima, por cima da casa de pontos.
    const r = Math.max(0, Math.min(1, s.solido));
    palco.style.setProperty('--revela', (r * 100).toFixed(2) + '%');
    scan.classList.toggle('on', r > .003 && r < .997);
    capitulo(s.praga);
  };
  V.pronta = true;
})();
