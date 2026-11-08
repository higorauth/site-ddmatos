/* Cena: um bando de pontos que vira gavião, casa e comprovante, em tinta azul sobre o branco.
   WebGL puro, sem biblioteca. Tudo aqui é ilustração: o texto da página não depende da cena. */
(function () {
  'use strict';
  let tela = document.getElementById('cena');
  const raiz = document.documentElement;
  const falha = () => { raiz.classList.add('sem-webgl'); if (tela) tela.remove(); };
  if (!tela) return;
  let gl = tela.getContext('webgl', { alpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance', premultipliedAlpha: true });
  // Sem placa de vídeo (WebGL desligado), a cena continua em 2D: os mesmos pontos, desenhados pelo canvas comum.
  let c2 = gl ? null : tela.getContext('2d');
  if (!gl && !c2) return falha();
  if (c2) raiz.classList.add('cena-2d');

  /* ---------- utilidades ---------- */
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const suave = (t) => t * t * (3 - 2 * t);
  const fatia = (v, a, b) => clamp((v - a) / (b - a));
  const pw = (v, xs, ys) => {
    if (v <= xs[0]) return ys[0];
    for (let i = 1; i < xs.length; i++) if (v <= xs[i]) return mix(ys[i - 1], ys[i], fatia(v, xs[i - 1], xs[i]));
    return ys[ys.length - 1];
  };

  const M4 = {
    id: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
    mul(a, b) {
      const o = new Float32Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
      }
      return o;
    },
    persp(fov, asp, n, f) {
      const t = 1 / Math.tan(fov / 2), o = new Float32Array(16);
      o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f);
      return o;
    },
    olha(e, a, u) {
      let zx = e[0] - a[0], zy = e[1] - a[1], zz = e[2] - a[2];
      let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
      let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx;
      l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
      const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
        -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]);
    },
    rotX(a) { const c = Math.cos(a), s = Math.sin(a), o = M4.id(); o[5] = c; o[6] = s; o[9] = -s; o[10] = c; return o; },
    rotY(a) { const c = Math.cos(a), s = Math.sin(a), o = M4.id(); o[0] = c; o[2] = -s; o[8] = s; o[10] = c; return o; },
    trans(x, y, z) { const o = M4.id(); o[12] = x; o[13] = y; o[14] = z; return o; },
  };

  /* ---------- shaders ---------- */
  /* Tinta: do azul claro ao azul-noite. Vermelho só para o que pede atenção. */
  const RAMPA = `
    const vec3 NOITE=vec3(.039,.102,.227);
    const vec3 AZUL=vec3(.090,.278,.784);
    const vec3 CLARO=vec3(.50,.62,.93);
    const vec3 VERMELHO=vec3(.843,.149,.180);
    vec3 tinta(float t){ return t<.5?mix(CLARO,AZUL,t*2.):mix(AZUL,NOITE,t*2.-1.); }`;
  const VS_AVE = `
    precision highp float;
    attribute vec4 aP; attribute vec4 aI;
    uniform mat4 uVP,uM; uniform vec2 uShift,uPtr; uniform vec3 uEye;
    uniform float uT,uIntro,uPx,uAsp,uRot,uScan,uFade,uZoom,uBase,uPtrOn,uAcende,uAbre;
    varying vec4 vC;
    ${RAMPA}
    void main(){
      vec3 p=aP.xyz; float luz=aI.x, sd=aI.y, tipo=aI.z;
      if(tipo>.5&&tipo<2.5){
        vec2 q=p.xy-uEye.xy; float a=uRot*(tipo>1.5?1.:-.35); float c=cos(a),s=sin(a);
        p.xy=uEye.xy+vec2(c*q.x-s*q.y,s*q.x+c*q.y);
      }
      p.z+=.012*sin(p.y*8.+uT*1.2+sd*.8);
      float rev=smoothstep(aP.w*.74,aP.w*.74+.26,uIntro);
      vec3 ini=p+vec3((fract(sd*3.17)-.5)*2.8,0.,(fract(sd*7.31)-.5)*3.4);
      p=mix(ini,p,rev);
      vec4 cp=uVP*uM*vec4(p,1.);
      cp.xy+=uShift*cp.w;
      vec2 dd=(cp.xy/cp.w-uPtr)*vec2(uAsp,1.);
      float lente=exp(-dot(dd,dd)*24.)*uPtrOn;
      cp.xy+=normalize(dd+1e-5)*lente*.016*cp.w;
      float sc=exp(-pow((aP.y-uScan)*7.,2.));
      float frente=exp(-pow((aP.w-uIntro*1.05)*16.,2.))*step(uIntro,.995);
      float esc=1.-luz;
      float atn=clamp(lente*.95+sc*.28+frente*.9,0.,1.);
      vec3 cor=mix(tinta(.12+.88*esc),VERMELHO,atn);
      float al=min(1.,.30+.60*esc+atn*.3);
      if(tipo>.5&&tipo<1.5){ float r=aI.w; cor=mix(vec3(.94,.42,.44),vec3(.62,.06,.10),r); cor=mix(cor,vec3(1.,.80,.80),step(.93,fract(sd*9.13))*.7); al=(.74+.26*r)*uAcende; }
      if(tipo>1.5&&tipo<2.5){ cor=AZUL; al=.55*uAcende; }
      if(tipo>2.5&&tipo<3.5){ cor=tinta(.45+.45*esc); al=.72; }
      if(tipo>3.5){ cor=NOITE; al=.94*(1.-uAbre)*uAcende; }
      al*=rev*uFade*smoothstep(uBase,uBase+1.25,aP.y)*smoothstep(.015,.1,cp.w);
      vC=vec4(cor,al);
      gl_Position=cp;
      gl_PointSize=uPx*(.8+.5*esc)*uZoom*(tipo>.5&&tipo<1.5?1.1:1.);
    }`;
  const VS_CASA = `
    precision highp float;
    attribute vec4 aB; attribute vec4 aC; attribute vec2 aS;
    uniform mat4 uVP; uniform vec2 uShift,uPtr; uniform vec4 uHot[5];
    uniform float uT,uForm,uMorph,uPx,uAsp,uScan,uFade,uRow,uPtrOn,uCorte;
    varying vec4 vC;
    ${RAMPA}
    void main(){
      float sd=aS.x;
      float f=smoothstep(sd*.5,sd*.5+.5,uForm);
      float m=smoothstep(sd*.42,sd*.42+.58,uMorph);
      vec3 b=mix(vec3(0.,1.9,0.)+(aB.xyz-vec3(0.,1.9,0.))*.04,aB.xyz,f);
      float arco=sin(m*3.14159);
      vec3 ondas=vec3(sin(sd*41.+uT*.6),cos(sd*23.+uT*.5),sin(sd*17.-uT*.4))*arco*1.25;
      vec3 p=mix(b,aC.xyz,m)+ondas;
      vec4 cp=uVP*vec4(p,1.);
      cp.xy+=uShift*cp.w;
      vec2 dd=(cp.xy/cp.w-uPtr)*vec2(uAsp,1.);
      float lente=exp(-dot(dd,dd)*22.)*uPtrOn;
      cp.xy+=normalize(dd+1e-5)*lente*.012*cp.w;
      float quente=0.;
      for(int i=0;i<5;i++){
        vec3 q=uHot[i].xyz; float d=distance(aB.xyz,q);
        float onda=exp(-pow((d-fract(uT*.42+float(i)*.2)*1.5)*7.,2.))*(1.-fract(uT*.42+float(i)*.2));
        quente+=uHot[i].w*(exp(-d*d*3.6)+onda*.9);
      }
      float sc=exp(-pow((aB.y-uScan)*5.,2.));
      float q=clamp(quente,0.,1.);
      vec3 cor=mix(tinta(.08+.84*aB.w),VERMELHO,max(q,clamp(lente*.8+sc*.12,0.,1.)*.6));
      float al=mix(.16+.72*aB.w,1.,q)*.92;
      /* folha */
      float linha=aC.w;
      float ativa=linha>=0.?(1.-step(.5,abs(linha-uRow))):0.;
      vec3 corF=mix(tinta(.18+.78*aS.y),VERMELHO,ativa);
      float alF=mix(.22+.66*aS.y,1.,ativa);
      cor=mix(cor,corF,m);
      al=mix(al,alF,m);
      al*=f*uFade*smoothstep(.02,.2,cp.w)*mix(step(uCorte,aB.y),1.,m);
      vC=vec4(cor,al);
      gl_Position=cp;
      gl_PointSize=uPx*mix(.8+.5*aB.w+clamp(quente,0.,1.)*.9,.9+.5*aS.y+ativa*.7,m);
    }`;
  const FS = `
    precision mediump float;
    varying vec4 vC;
    void main(){
      vec2 c=gl_PointCoord-.5; float d=dot(c,c);
      if(d>.25) discard;
      float a=vC.a*smoothstep(.25,.06,d);
      gl_FragColor=vec4(vC.rgb*a,a);
    }`;
  const compila = (t, s) => {
    const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o);
    if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o));
    return o;
  };
  const programa = (vs, nomes) => {
    const p = gl.createProgram();
    gl.attachShader(p, compila(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compila(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    nomes.forEach((n) => { u[n] = gl.getUniformLocation(p, n); });
    return { p, u };
  };

  /* ---------- formas ---------- */
  const AVE = { W: 4, Z: .72, olho: { x: 444, y: 240, r: 29 } };
  const OLHO = { x: (AVE.olho.x - 500) / 1000 * AVE.W, y: (500 - AVE.olho.y) / 1000 * AVE.W, z: .5, r: AVE.olho.r / 1000 * AVE.W };
  const PUPILA = .47; // pupila em relação à íris
  const FOLHA = { w: 4.3, h: 6.08, cy: 1.9 };

  /* A casa em corte: lugares que a vistoria olha. */
  const LUGARES = {
    ralo: [1.9, 1.78, .7], pia: [-1.55, .92, -1.6], gordura: [-2.6, -.3, 3.15], geladeira: [-2.75, .8, -1.0], armarios: [-.9, 1.3, -1.8],
    rodape: [-2.0, .05, -1.5], frestas: [-3.06, .1, .4], forro: [-.6, 3.5, 1.0], garagem: [5.45, .55, 2.4], muro: [5.85, .6, 1.6],
    batente: [3.05, 1.0, -1.33], moveis: [-2.2, 2.45, -1.5], telhado: [-2.66, 4.3, -.65], calha: [2.9, 3.22, 2.72], vaso: [3.0, .22, 3.4], ralo2: [-1.0, .03, .9],
    sifao: [-1.55, .45, -1.55], inspecao: [1.0, -.35, 4.4], esgoto: [1.0, -.62, 5.0],
    tampa: [-1.72, 4.15, -.4], boia: [-1.5, 3.95, -.45], fundo: [-1.72, 3.45, -.2], saidacx: [-2.47, 3.45, -.3],
  };
  /* Câmera de cada capítulo: para onde olhar, quão perto e de que ângulo. */
  const PRESET = {
    baratas: { foco: [-1.5, .38, -.45], zoom: .25, th: -.46, ph: -.15 },
    formigas: { foco: [-1.55, .45, -1.0], zoom: .2, th: -.4, ph: -.08 },
    ratos: { foco: [4.95, .3, 2.5], zoom: .27, th: -.55, ph: .08 },
    cupins: { foco: [-2.62, 4.12, -.45], zoom: .19, th: -.32, ph: .26 },
    mosquitos: { foco: [3.0, .42, 3.4], zoom: .17, th: .2, ph: .06 },
    desentupimento: { foco: [-.6, -.25, 2.1], zoom: .74, th: -.04, ph: .26 },
    caixa: { foco: [-1.72, 3.72, -.4], zoom: .3, th: -.32, ph: .3 },
  };


  /* Gera os pontos. Roda em um Worker, para a página responder enquanto a cena nasce.
     Não usa nada de fora: o texto desta função é enviado inteiro para o Worker. */
  function fabrica(C) {
    const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
    const mix = (a, b, t) => a + (b - a) * t;
    let semente = 20241106;
    const R = () => ((semente = (semente * 16807) % 2147483647) - 1) / 2147483646;
    const { AVE, OLHO, PUPILA } = C;
    const mapaParaMundo = (x, y) => [(x - 500) / 1000 * AVE.W, (500 - y) / 1000 * AVE.W];

    function pontosAve(m, linhas) {
      const { w, h, d } = m, passo = 1 / linhas, o = [];
      const px = (x, y) => (Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4;
      for (let r = 0; r < linhas; r++) {
        const v = (r + .5) / linhas, iy = Math.floor(v * h);
        for (let u = (r % 2) * passo * .4; u < 1; u += passo * .8) {
          const uu = u + (R() - .5) * passo * .3, ix = Math.floor(uu * w), i = px(ix, iy);
          const masc = d[i + 2];
          if (masc < 100) continue;
          const gx = (d[px(ix + 2, iy)] - d[px(ix - 2, iy)]) / 255, gy = (d[px(ix, iy + 2)] - d[px(ix, iy - 2)]) / 255;
          const luz = clamp(d[i + 1] / 255 * 1.05 + (-gx * 1.6 - gy * 1.2));
          if (R() > .3 + .7 * luz) continue;
          const [X, Y] = mapaParaMundo(uu * 1000, v * 1000);
          o.push(X, Y, d[i] / 255 * AVE.Z, v, luz, R(), masc < 230 ? 3 : 0, 0);
        }
      }
      return o;
    }
    function pontosOlho(raios, porRaio) {
      const o = [];
      const v = (.5 - OLHO.y / AVE.W);
      for (let a = 0; a < raios; a++) {
        const ang = a / raios * 6.28318 + (R() - .5) * .012;
        for (let k = 0; k < porRaio; k++) {
          const t = Math.pow((k + R() * .6) / porRaio, 1.2);
          const r = OLHO.r * mix(PUPILA, 1, t);
          o.push(OLHO.x + Math.cos(ang) * r, OLHO.y + Math.sin(ang) * r, OLHO.z, v, 1, R(), 1, 1 - t);
        }
      }
      // Pupila cheia, com um brilho no alto à esquerda. Some quando o olho abre no mergulho.
      const rp = OLHO.r * PUPILA, nP = Math.round(raios * porRaio * .12);
      for (let i = 0; i < nP; i++) {
        const a = R() * 6.28318, rr = Math.sqrt(R()) * rp * .98, x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        if (Math.hypot(x + .36 * rp, y - .36 * rp) < .24 * rp) continue;
        o.push(OLHO.x + x, OLHO.y + y, OLHO.z, v, 0, R(), 4, 0);
      }
      // Três arcos com marcas, como a escala de uma lente.
      const anel = OLHO.r * 2.05;
      for (let i = 0; i < 360; i += 2) {
        if (i % 120 > 84) continue;
        const ang = i / 360 * 6.28318, marca = i % 12 === 0 ? 4 : 1;
        for (let k = 0; k < marca; k++) {
          const r = anel * (1 + k * .016);
          o.push(OLHO.x + Math.cos(ang) * r, OLHO.y + Math.sin(ang) * r, OLHO.z, v, .8, R(), 2, 0);
        }
      }
      return o;
    }
    const embaralha = (a, passo) => {
      const n = a.length / passo;
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(R() * (i + 1));
        for (let k = 0; k < passo; k++) { const t = a[i * passo + k]; a[i * passo + k] = a[j * passo + k]; a[j * passo + k] = t; }
      }
      return a;
    };

    function pontosCasa(N) {
      const P = [];
      const seg = (a, b, peso, luz) => { const m = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); P.push({ m: m * peso, luz, s: () => { const t = R(); return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)]; } }); };
      const plano = (o, u, v, peso, luz, faixas, fora) => {
        const m = Math.hypot(...u) * Math.hypot(...v);
        P.push({ m: m * peso, luz, s: () => {
          for (let i = 0; i < 6; i++) {
            const a = R(), b = Math.floor(R() * faixas) / faixas;
            const p = [o[0] + u[0] * a + v[0] * b, o[1] + u[1] * a + v[1] * b, o[2] + u[2] * a + v[2] * b];
            if (!fora || !fora(p)) return p;
          }
          return [o[0], o[1], o[2]];
        } });
      };
      const caixa = (a, b, peso, luz) => {
        const [x0, y0, z0] = a, [x1, y1, z1] = b;
        [[x0, y0, z0, x1, y0, z0], [x0, y1, z0, x1, y1, z0], [x0, y0, z1, x1, y0, z1], [x0, y1, z1, x1, y1, z1],
          [x0, y0, z0, x0, y1, z0], [x1, y0, z0, x1, y1, z0], [x0, y0, z1, x0, y1, z1], [x1, y0, z1, x1, y1, z1],
          [x0, y0, z0, x0, y0, z1], [x1, y0, z0, x1, y0, z1], [x0, y1, z0, x0, y1, z1], [x1, y1, z0, x1, y1, z1]]
          .forEach((e) => seg([e[0], e[1], e[2]], [e[3], e[4], e[5]], peso, luz));
      };
      const anel = (c, r, peso, luz) => P.push({ m: 6.28 * r * peso, luz, s: () => { const a = R() * 6.2832; return [c[0] + Math.cos(a) * r, c[1], c[2] + Math.sin(a) * r]; } });
      const cano = (pts, peso, luz) => { for (let i = 1; i < pts.length; i++) seg(pts[i - 1], pts[i], peso, luz); };

      const X = 3.2, Z = 2.2, H1 = 1.75, H2 = 3.4, C = 4.75;
      const janela = (p) => (Math.abs(p[2]) < .7 && p[1] > .7 && p[1] < 1.45) || (Math.abs(p[2] + .2) < .7 && p[1] > 2.4 && p[1] < 3.1);
      // Estrutura.
      plano([-X, 0, -Z], [2 * X, 0, 0], [0, 0, 2 * Z], 12, .34, 22);
      plano([-X, H1, -Z], [2 * X, 0, 0], [0, 0, 2 * Z], 9, .3, 18);
      plano([-X, H2, -Z], [2 * X, 0, 0], [0, 0, 2 * Z], 4, .22, 12);
      plano([-X, 0, -Z], [2 * X, 0, 0], [0, H2, 0], 10, .28, 40);
      plano([-X, 0, -Z], [0, 0, 2 * Z], [0, H2, 0], 9, .3, 40, janela);
      plano([X, 0, -Z], [0, 0, 2 * Z], [0, H2, 0], 7, .24, 40, (p) => Math.abs(p[2] + .8) < .5 && p[1] < 1.9);
      plano([.4, 0, -Z], [0, 0, 2 * Z], [0, H1, 0], 6, .22, 24, (p) => Math.abs(p[2] - .6) < .42 && p[1] < 1.3);
      plano([.2, H1, -Z], [0, 0, 2 * Z], [0, H2 - H1, 0], 6, .22, 24);
      for (const [a, b] of [[[-X, 0, Z], [X, 0, Z]], [[-X, H1, Z], [X, H1, Z]], [[-X, H2, Z], [X, H2, Z]], [[-X, 0, -Z], [X, 0, -Z]], [[-X, H1, -Z], [X, H1, -Z]], [[-X, H2, -Z], [X, H2, -Z]],
        [[-X, 0, -Z], [-X, H2, -Z]], [[X, 0, -Z], [X, H2, -Z]], [[-X, 0, Z], [-X, H2, Z]], [[X, 0, Z], [X, H2, Z]],
        [[-X, 0, -Z], [-X, 0, Z]], [[X, 0, -Z], [X, 0, Z]], [[-X, H1, -Z], [-X, H1, Z]], [[X, H1, -Z], [X, H1, Z]], [[-X, H2, -Z], [-X, H2, Z]], [[X, H2, -Z], [X, H2, Z]]]) seg(a, b, 90, .92);
      // Telhado aberto: cumeeira, tesouras e terças.
      seg([-X - .3, C, 0], [X + .3, C, 0], 90, .98);
      seg([-X - .3, H2 - .1, Z + .45], [X + .3, H2 - .1, Z + .45], 70, .86);
      seg([-X - .3, H2 - .1, -Z - .45], [X + .3, H2 - .1, -Z - .45], 70, .86);
      for (let i = 0; i <= 8; i++) {
        const x = mix(-X - .3, X + .3, i / 8);
        seg([x, C, 0], [x, H2 - .1, Z + .45], i % 4 ? 26 : 56, .62);
        seg([x, C, 0], [x, H2 - .1, -Z - .45], i % 4 ? 26 : 56, .62);
        if (i % 2 === 0) seg([x, H2, -Z], [x, H2, Z], 24, .5);
      }
      plano([-X - .3, H2 - .1, -Z - .45], [2 * X + .6, 0, 0], [0, C - H2 + .1, Z + .45], 5, .32, 16);
      seg([-.9, H2, 0], [-.9, C, 0], 40, .55); seg([1.4, H2, 0], [1.4, C, 0], 40, .55);
      // Calha.
      seg([-X - .3, H2 - .17, Z + .5], [X + .3, H2 - .17, Z + .5], 80, .78);
      seg([X + .25, H2 - .17, Z + .5], [X + .25, 0, Z + .5], 60, .7);
      // Escada.
      for (let i = 0; i < 10; i++) {
        const y = H1 * i / 10, z = mix(1.7, -.2, i / 10);
        seg([.48, y, z], [1.25, y, z], 44, .6); seg([.48, y, z], [.48, y + H1 / 10, z], 22, .4); seg([1.25, y, z], [1.25, y + H1 / 10, z], 22, .4);
      }
      // Cozinha.
      caixa([-3.15, 0, -1.65], [-2.4, 1.72, -.95], 42, .62);          // geladeira
      caixa([-2.3, 0, -2.15], [.3, .86, -1.5], 40, .6);                // bancada
      caixa([-2.3, 1.15, -2.15], [.3, 1.65, -1.82], 36, .52);          // armários
      anel([-1.55, .87, -1.82], .2, 90, .72);                          // pia
      anel([-1.0, .012, .9], .13, 120, .8);                            // ralo da cozinha
      // Sala.
      caixa([1.5, 0, -2.1], [2.95, .62, -1.25], 36, .55);              // sofá
      caixa([1.5, 0, -2.15], [2.95, .95, -1.95], 26, .46);
      seg([-X, .1, -Z + .01], [X, .1, -Z + .01], 40, .66);             // rodapé
      seg([X - .01, .1, -Z], [X - .01, .1, Z], 40, .66);
      // Batente da porta de fora.
      seg([X, 0, -1.3], [X, 1.9, -1.3], 70, .8); seg([X, 0, -.3], [X, 1.9, -.3], 70, .8); seg([X, 1.9, -1.3], [X, 1.9, -.3], 70, .8);
      // Quarto.
      caixa([-2.95, H1, -1.2], [-1.2, H1 + .5, .6], 34, .56);          // cama
      caixa([-3.15, H1, -2.15], [-1.1, H1 + 1.5, -1.5], 32, .58);      // guarda-roupa
      // Banheiro.
      anel([1.9, H1 + .012, .7], .14, 120, .8);                        // ralo do banheiro
      caixa([2.3, H1, -2.1], [3.1, H1 + .5, -1.4], 30, .5);            // pia e vaso
      caixa([.5, H1, .9], [1.5, H1 + 1.6, 2.1], 20, .4);               // box
      // Janelas.
      caixa([-X - .02, .7, -.7], [-X + .02, 1.45, .7], 34, .7);
      caixa([-X - .02, 2.4, -.9], [-X + .02, 3.1, .5], 34, .7);
      // Canos abaixo do chão, até as caixas.
      cano([[1.9, H1, .7], [1.9, .1, .7], [1.9, -.55, .7], [-2.6, -.55, 3.15]], 60, .82);
      cano([[-1.55, .87, -1.82], [-1.55, -.42, -1.82], [-1.55, -.42, 2.5], [-2.6, -.42, 3.15]], 60, .82);
      cano([[-1.0, 0, .9], [-1.0, -.48, .9], [-1.0, -.48, 2.6]], 60, .78);
      caixa([-3.0, -.72, 2.8], [-2.2, 0, 3.5], 60, .86);               // caixa de gordura
      cano([[-2.6, -.6, 3.5], [-2.6, -.6, 5.2]], 40, .55);
      // Garagem e muro.
      caixa([3.3, 0, -2.2], [6.1, 2.1, .2], 30, .46);
      caixa([3.7, 0, -1.6], [5.5, .85, -.2], 26, .4);
      plano([5.95, 0, -2.2], [0, 0, 6.4], [0, 1.15, 0], 12, .36, 12);
      seg([5.95, 1.15, -2.2], [5.95, 1.15, 4.2], 60, .78);
      // Vaso e plantas.
      anel([3.0, .32, 3.4], .24, 110, .72); anel([3.0, .03, 3.4], .34, 90, .66);
      for (let i = 0; i < 7; i++) { const a = i * .9; seg([3.0, .32, 3.4], [3.0 + Math.cos(a) * .36, .92 + (i % 3) * .1, 3.4 + Math.sin(a) * .36], 36, .5); }
      // Terreno.
      for (let r = 1; r <= 5; r++) anel([0, -.01, .4], 3.3 + r * 1.15, 5, .2);
      plano([-7, -.9, -5], [14, 0, 0], [0, 0, 10], 1.6, .14, 26);

      const total = P.reduce((s, p) => s + p.m, 0);
      const o = [];
      for (const p of P) {
        const n = Math.max(1, Math.round(N * p.m / total));
        for (let i = 0; i < n && o.length < N; i++) { const q = p.s(); o.push([q[0], q[1], q[2], p.luz + (R() - .5) * .1]); }
      }
      while (o.length < N) { const p = P[Math.floor(R() * P.length)], q = p.s(); o.push([q[0], q[1], q[2], p.luz]); }
      return o;
    }

    function pontosFolha(N) {
      const { w, h, cy } = C.FOLHA, o = [];
      const cb = Math.cos(-.34), sb = Math.sin(-.34), ca = Math.cos(-.1), sa = Math.sin(-.1);
      const lim = (x, y, l, row) => { o.push([cb * x + sb * y * sa, y * ca + cy, -sb * x + cb * y * sa, row, l]); };
      const nBorda = N * .16 | 0, nFundo = N * .2 | 0, nCab = N * .07 | 0, nAss = N * .05 | 0;
      const nLinhas = N - nBorda - nFundo - nCab - nAss;
      for (let i = 0; i < nBorda; i++) {
        const per = 2 * (w + h), t = R() * per;
        let x, y;
        if (t < w) { x = -w / 2 + t; y = h / 2; }
        else if (t < w + h) { x = w / 2; y = h / 2 - (t - w); }
        else if (t < 2 * w + h) { x = w / 2 - (t - w - h); y = -h / 2; }
        else { x = -w / 2; y = -h / 2 + (t - 2 * w - h); }
        lim(x, y, .95, -1);
      }
      for (let i = 0; i < nFundo; i++) lim(-w / 2 + R() * w, -h / 2 + Math.floor(R() * 66) / 66 * h, .1 + R() * .12, -1);
      // Cabeçalho: bloco da marca e título.
      for (let i = 0; i < nCab; i++) {
        const a = R();
        if (a < .3) { const ang = R() * 6.2832, r = .3 * Math.sqrt(R()); lim(-w / 2 + .62 + Math.cos(ang) * r, h / 2 - .62 + Math.sin(ang) * r, .9, -1); }
        else lim(-w / 2 + 1.1 + R() * 2.6, h / 2 - .46 - Math.floor(R() * 3) * .15, .86, -1);
      }
      const y0 = h / 2 - 1.25, passo = (h - 2.5) / 10.6;
      for (let i = 0; i < nLinhas; i++) {
        const row = i % 11, y = y0 - row * passo + (R() - .5) * .022;
        const lado = R();
        if (lado < .38) lim(-w / 2 + .42 + R() * 1.0, y, .78, row);
        else {
          const palavra = Math.floor(R() * 6), base = -w / 2 + 1.72 + palavra * .36;
          lim(base + R() * .3, y, .62, row);
        }
      }
      // Assinatura do responsável técnico.
      for (let i = 0; i < nAss; i++) {
        const t = R(), x = -w / 2 + .5 + t * 1.9;
        lim(x, -h / 2 + .56 + .15 * Math.sin(t * 16) * Math.exp(-t * 1.3) + .05 * Math.sin(t * 41), .92, -1);
      }
      return o;
    }

    return {
      ave({ w, h, d, linhas, raios, porRaio }) {
        const pts = pontosAve({ w, h, d }, linhas).concat(pontosOlho(raios, porRaio));
        return new Float32Array(embaralha(pts, 8));
      },
      casa({ N }) {
        const casa = pontosCasa(N), folha = pontosFolha(N);
        casa.sort((a, b) => b[1] - a[1]);
        folha.sort((a, b) => b[1] - a[1]);
        const d = new Float32Array(N * 10);
        const ordem = Array.from({ length: N }, (_, i) => i);
        for (let i = N - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const t = ordem[i]; ordem[i] = ordem[j]; ordem[j] = t; }
        ordem.forEach((i, k) => {
          const c = casa[i], f = folha[Math.min(N - 1, Math.max(0, i + Math.round((R() - .5) * N * .12)))], q = k * 10;
          d[q] = c[0]; d[q + 1] = c[1]; d[q + 2] = c[2]; d[q + 3] = clamp(c[3]);
          d[q + 4] = f[0]; d[q + 5] = f[1]; d[q + 6] = f[2]; d[q + 7] = f[3];
          d[q + 8] = R(); d[q + 9] = f[4];
        });
        return d;
      },
    };
  }

  /* Pede pontos à fábrica. Se o navegador não aceitar o Worker, a mesma fábrica roda na página. */
  function montaFabrica() {
    const C = { AVE, OLHO, PUPILA, FOLHA };
    const local = () => { const F = fabrica(C); return (m) => new Promise((ok) => setTimeout(() => ok(F[m.tipo](m)), 0)); };
    try {
      const fonte = `const F=(${fabrica.toString()})(${JSON.stringify(C)});onmessage=(e)=>{const d=F[e.data.tipo](e.data);postMessage({id:e.data.id,d},[d.buffer]);};`;
      const url = URL.createObjectURL(new Blob([fonte], { type: 'text/javascript' }));
      const w = new Worker(url);
      const espera = new Map();
      let id = 0, reserva = null;
      w.onmessage = (e) => { const f = espera.get(e.data.id); espera.delete(e.data.id); f(e.data.d); };
      w.onerror = () => { reserva = local(); espera.forEach((f, k) => { espera.delete(k); f(null); }); };
      return (m, troca) => {
        if (reserva) return reserva(m);
        const copia = { ...m, id: ++id };
        return new Promise((ok) => { espera.set(id, ok); w.postMessage(copia, troca || []); })
          .then((d) => d || (reserva || (reserva = local()))(m));
      };
    } catch (e) { return local(); }
  }

  /* ---------- estado ---------- */
  const calmo = () => raiz.classList.contains('calmo');
  const tem3d = () => !!(window.Casa3D && window.Casa3D.pronta);
  /* Gravação dos vídeos da casa (ferramenta de build): quadro a quadro, câmera centrada, sem balanço. */
  let gravando = null, manual = false, relogio = 0;
  const est = {
    W: 0, H: 0, dpr: 1, celular: false, pronta: false,
    y: 0, mergulho: 0, forma: 0, morf: 0, fim: 0,
    ptr: [0, 0], ptrAlvo: [0, 0], ptrOn: 0, ptrOnAlvo: 0,
    t: 0, intro: 0, acende: 0, oculto: false,
    hot: new Float32Array(20), hotAlvo: new Float32Array(20), foco: [.5, 1.5, .4], focoAlvo: [.5, 1.5, .4], zoomPraga: 1, zoomPragaAlvo: 1, linha: -1, ultimo: 0,
    cortes: { ave: 1, casa: 1 },
    solido: 0, abre: 0, dth: 0, dthAlvo: 0, dph: 0, dphAlvo: 0, pragaId: null,
    alvoPts: { foco: [.5, 1.5, .4], zoom: 1, th: 0, ph: 0 }, alvo3d: { foco: [.5, 1.5, .4], zoom: 1, th: 0, ph: 0 },
  };
  const ancora = { olhar: 1, olharFim: 2, pragas: 3, como: 4, comp: 5, papel: 6, papelFim: 7, fim: 8 };

  function mede() {
    const y = window.scrollY, pos = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect().top + y : 0; };
    const olhar = document.querySelector('#olhar');
    ancora.olhar = pos('#olhar');
    ancora.olharFim = ancora.olhar + (olhar ? olhar.offsetHeight : 0) - est.H;
    ancora.pragas = pos('#pragas'); ancora.como = pos('#como-funciona'); ancora.comp = pos('#comprovante');
    const p = document.querySelector('.papel');
    ancora.papel = pos('.papel'); ancora.papelFim = ancora.papel + (p ? p.offsetHeight : 0);
    ancora.fim = pos('.final');
  }
  function ajusta() {
    const W = window.innerWidth, H = window.innerHeight;
    if (W === est.W && Math.abs(H - est.H) < 120) { mede(); return; }
    est.W = W; est.H = H; est.celular = W < 760; est.larga = window.matchMedia('(min-width: 1000px) and (min-aspect-ratio: 1/1)').matches;
    // Teto de pixels: tela grande de Mac não precisa de quatro vezes mais trabalho para a placa de vídeo.
    const teto = c2 ? 1.25 : Math.sqrt((est.celular ? 2.4e6 : 3.2e6) / (W * H));
    est.dpr = Math.min(window.devicePixelRatio || 1, est.celular ? 1.75 : 2, Math.max(1, teto)) * est.qualidade;
    tela.width = Math.round(W * est.dpr); tela.height = Math.round(H * est.dpr);
    if (gl) gl.viewport(0, 0, tela.width, tela.height);
    mede();
  }
  est.qualidade = 1;

  /* Como o gavião se apresenta em cada tela. */
  const FOV = 30 * Math.PI / 180, TAN = Math.tan(FOV / 2);
  function poseAve(d) {
    const asp = est.W / est.H;
    const e1 = suave(fatia(d, 0, .6)), e2 = fatia(d, .66, 1);
    const larga = est.larga;
    const D0 = larga ? AVE.W / (2 * TAN * 1.32) : 3.05 / (.96 * 2 * TAN * Math.min(asp, .62));
    const raioPx = larga ? .5 * est.H : Math.min(.72 * est.W, .38 * est.H);
    const Dp = (OLHO.r * PUPILA) * (est.H / 2) / (TAN * raioPx);
    let dist = D0 * Math.pow(Dp / D0, e1);
    dist *= mix(1, .9, fatia(d, .6, .66));
    if (e2 > 0) dist *= Math.pow(.012, e2 * e2);
    const repouso = larga ? [.27, .43] : [-.2, .71];
    const shift = [repouso[0] * (1 - e1), repouso[1] * (1 - e1)];
    return { dist, shift, e1, e2, zoom: 1 + 1.6 * e1 + 2.2 * e2, rx: mix(-.12, 0, e1), ry: mix(.3, 0, e1) };
  }

  let av = null, ca = null;

  const sobe = (dados, passo) => {
    if (!gl) return { dados, n: dados.length / passo };
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, dados, gl.STATIC_DRAW);
    return { b, n: dados.length / passo, dados };
  };

  /* ---------- desenho em 2D (navegador sem placa de vídeo) ---------- */
  const LIM2D = { ave: 15000, casa: 16000 };
  const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const PALETA = (() => {
    const C = [.50, .62, .93], A = [.090, .278, .784], N = [.039, .102, .227];
    const L = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t), out = [];
    for (let k = 0; k < 6; k++) { const t = (k + .5) / 6; out.push(t < .5 ? L(C, A, t * 2) : L(A, N, t * 2 - 1)); }
    out.push([.94, .42, .44], [.843, .149, .18], [.62, .06, .10]);
    return out.map((c) => c.map((v) => Math.round(v * 255)));
  })();
  const ALFAS = [.06, .14, .25, .38, .52, .68, .84, 1];
  const nivel = (a) => (a < .1 ? 0 : a < .2 ? 1 : a < .31 ? 2 : a < .45 ? 3 : a < .6 ? 4 : a < .76 ? 5 : a < .92 ? 6 : 7);
  const tintaIdx = (t) => Math.min(5, Math.max(0, Math.floor(t * 6)));
  const baldes = Array.from({ length: 9 * 8 }, () => []);
  const poe = (cor, al, x, y, s) => { baldes[cor * 8 + nivel(al)].push(x, y, s); };
  function pinta() {
    for (let i = 0; i < baldes.length; i++) {
      const b = baldes[i];
      if (!b.length) continue;
      const c = PALETA[(i / 8) | 0];
      c2.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${ALFAS[i % 8]})`;
      // Dois caminhos por balde, para pontos sobrepostos escurecerem como na versão com placa de vídeo.
      for (let par = 0; par < 2; par++) {
        c2.beginPath();
        for (let j = par * 3; j < b.length; j += 6) {
          const x = b[j], y = b[j + 1], z = b[j + 2];
          if (z <= 3.2) c2.rect(x - z / 2, y - z / 2, z, z); else { const r = z / 2; c2.moveTo(x + r, y); c2.arc(x, y, r, 0, 6.2832); }
        }
        c2.fill();
      }
      b.length = 0;
    }
  }
  function ave2D(M, pose, intro, fade, tempo) {
    const d = av.dados, n = Math.floor(av.n * est.cortes.ave), passo = Math.max(1, Math.ceil(n / LIM2D.ave));
    const W = tela.width, H = tela.height, sx = pose.shift[0], sy = pose.shift[1], ex = OLHO.x, ey = OLHO.y, rot = tempo * .05;
    const base = est.larga ? -2.3 : -.7, px = (est.celular ? 1.7 : 1.8) * est.dpr * pose.zoom * (passo > 1 ? 1.15 : 1);
    const scan = 2.6 - ((tempo * .34) % 3.4) * 2.6, acende = est.acende, abre = suave(fatia(pose.e1, .02, .3));
    for (let i = 0; i < n; i += passo) {
      const o = i * 8, v = d[o + 3], luz = d[o + 4], sd = d[o + 5], tipo = d[o + 6];
      let x = d[o], y = d[o + 1], z = d[o + 2];
      if (tipo > .5 && tipo < 2.5) { const a = rot * (tipo > 1.5 ? 1 : -.35), c = Math.cos(a), sn = Math.sin(a), qx = x - ex, qy = y - ey; x = ex + c * qx - sn * qy; y = ey + sn * qx + c * qy; }
      z += .012 * Math.sin(y * 8 + tempo * 1.2 + sd * .8);
      const rev = sstep(v * .74, v * .74 + .26, intro);
      if (rev <= .001) continue;
      if (rev < 1) { x += ((sd * 3.17) % 1 - .5) * 2.8 * (1 - rev); z += ((sd * 7.31) % 1 - .5) * 3.4 * (1 - rev); }
      const w = M[3] * x + M[7] * y + M[11] * z + M[15];
      if (w < .015) continue;
      const X = (M[0] * x + M[4] * y + M[8] * z + M[12]) / w + sx, Y = (M[1] * x + M[5] * y + M[9] * z + M[13]) / w + sy;
      if (X < -1.1 || X > 1.1 || Y < -1.1 || Y > 1.1) continue;
      const esc = 1 - luz, atn = Math.min(1, Math.exp(-Math.pow((d[o + 1] - scan) * 7, 2)) * .28 + (intro < .995 ? Math.exp(-Math.pow((v - intro * 1.05) * 16, 2)) * .9 : 0));
      let cor, al;
      if (tipo > .5 && tipo < 1.5) { cor = d[o + 7] > .5 ? 8 : 6; al = (.74 + .26 * d[o + 7]) * acende; }
      else if (tipo > 1.5 && tipo < 2.5) { cor = 3; al = .55 * acende; }
      else if (tipo > 2.5 && tipo < 3.5) { cor = tintaIdx(.45 + .45 * esc); al = .72; }
      else if (tipo > 3.5) { cor = 5; al = .94 * (1 - abre) * acende; }
      else { cor = atn > .5 ? 7 : tintaIdx(.12 + .88 * esc); al = Math.min(1, .3 + .6 * esc + atn * .3); }
      al *= rev * fade * sstep(base, base + 1.25, d[o + 1]) * sstep(.015, .1, w);
      if (al < .03) continue;
      poe(cor, al, (X * .5 + .5) * W, (.5 - Y * .5) * H, px * (.8 + .5 * esc) * (tipo > .5 && tipo < 1.5 ? 1.1 : 1));
    }
    pinta();
  }
  function casa2D(cam, tempo, fade) {
    const d = ca.dados, n = Math.floor(ca.n * est.cortes.casa), passo = Math.max(1, Math.ceil(n / LIM2D.casa));
    const M = cam.VP, sx = cam.shift[0], sy = cam.shift[1], W = tela.width, H = tela.height, hot = est.hot, row = est.linha;
    const px = (est.celular ? 1.45 : 1.7) * est.dpr * (passo > 1 ? 1.2 : 1);
    for (let i = 0; i < n; i += passo) {
      const o = i * 10, bx = d[o], by = d[o + 1], bz = d[o + 2], bw = d[o + 3], sd = d[o + 8], sl = d[o + 9];
      const f = sstep(sd * .5, sd * .5 + .5, est.forma);
      if (f <= .001) continue;
      const m = sstep(sd * .42, sd * .42 + .58, est.morf);
      let x = mix(bx * .04, bx, f), y = mix(1.9 + (by - 1.9) * .04, by, f), z = mix(bz * .04, bz, f);
      if (m > 0) {
        const arco = Math.sin(m * Math.PI) * 1.25;
        x = mix(x, d[o + 4], m) + Math.sin(sd * 41 + tempo * .6) * arco; y = mix(y, d[o + 5], m) + Math.cos(sd * 23 + tempo * .5) * arco; z = mix(z, d[o + 6], m) + Math.sin(sd * 17 - tempo * .4) * arco;
      }
      const w = M[3] * x + M[7] * y + M[11] * z + M[15];
      if (w < .02) continue;
      const X = (M[0] * x + M[4] * y + M[8] * z + M[12]) / w + sx, Y = (M[1] * x + M[5] * y + M[9] * z + M[13]) / w + sy;
      if (X < -1.1 || X > 1.1 || Y < -1.1 || Y > 1.1) continue;
      let q = 0;
      for (let k = 0; k < 5; k++) {
        const hw = hot[k * 4 + 3];
        if (hw < .01) continue;
        const dx = bx - hot[k * 4], dy = by - hot[k * 4 + 1], dz = bz - hot[k * 4 + 2], dd = Math.sqrt(dx * dx + dy * dy + dz * dz), fr = (tempo * .42 + k * .2) % 1;
        q += hw * (Math.exp(-dd * dd * 3.6) + Math.exp(-Math.pow((dd - fr * 1.5) * 7, 2)) * (1 - fr) * .9);
      }
      q = Math.min(1, q);
      let cor = q > .5 ? 7 : tintaIdx(.08 + .84 * bw), al = mix(.16 + .72 * bw, 1, q) * .92, tam = .8 + .5 * bw + q * .9;
      if (m > 0) {
        const linha = d[o + 7], ativa = linha >= 0 && Math.abs(linha - row) < .5 ? 1 : 0;
        if (m > .5) cor = ativa ? 7 : tintaIdx(.18 + .78 * sl);
        al = mix(al, mix(.22 + .66 * sl, 1, ativa), m); tam = mix(tam, .9 + .5 * sl + ativa * .7, m);
      }
      al *= f * fade * sstep(.02, .2, w);
      if (al < .03) continue;
      poe(cor, al, (X * .5 + .5) * W, (.5 - Y * .5) * H, px * tam);
    }
    pinta();
  }
  /* Se a placa de vídeo cair no meio do caminho, a cena troca para o 2D em vez de sumir. */
  function vira2D() {
    const nova = tela.cloneNode(false);
    tela.replaceWith(nova); tela = nova; gl = null;
    c2 = tela.getContext('2d');
    if (!c2) { est.pronta = false; falha(); return; }
    raiz.classList.add('cena-2d');
    if (av) av = { dados: av.dados, n: av.n };
    if (ca) ca = { dados: ca.dados, n: ca.n };
    est.W = 0; ajusta();
    if (est.pronta) tela.classList.add('pronta');
    acorda();
  }

  let PA, PC;
  function desenhaAve(pose, intro, fade, tempo) {
    const asp = est.W / est.H;
    const eye = [OLHO.x, OLHO.y, OLHO.z];
    const P = M4.persp(FOV, asp, .01, 80);
    const V = M4.olha([eye[0], eye[1], eye[2] + pose.dist], eye, [0, 1, 0]);
    const ptr = est.ptr, gira = 1 - pose.e1;
    const rx = pose.rx + ptr[1] * .05 * gira + Math.sin(tempo * .23) * .012 * gira, ry = pose.ry + ptr[0] * .09 * gira + Math.sin(tempo * .31) * .03 * gira;
    const Mo = M4.mul(M4.trans(eye[0], eye[1], eye[2]), M4.mul(M4.rotX(rx), M4.mul(M4.rotY(ry), M4.trans(-eye[0], -eye[1], -eye[2]))));
    if (!gl) return ave2D(M4.mul(M4.mul(P, V), Mo), pose, intro, fade, tempo);
    const { p, u } = PA;
    gl.useProgram(p);
    gl.bindBuffer(gl.ARRAY_BUFFER, av.b);
    const aP = gl.getAttribLocation(p, 'aP'), aI = gl.getAttribLocation(p, 'aI');
    gl.enableVertexAttribArray(aP); gl.enableVertexAttribArray(aI);
    gl.vertexAttribPointer(aP, 4, gl.FLOAT, false, 32, 0);
    gl.vertexAttribPointer(aI, 4, gl.FLOAT, false, 32, 16);
    gl.uniformMatrix4fv(u.uVP, false, M4.mul(P, V));
    gl.uniformMatrix4fv(u.uM, false, Mo);
    gl.uniform2f(u.uShift, pose.shift[0], pose.shift[1]);
    gl.uniform2f(u.uPtr, ptr[0], ptr[1]);
    gl.uniform3f(u.uEye, eye[0], eye[1], eye[2]);
    gl.uniform1f(u.uT, tempo); gl.uniform1f(u.uIntro, intro);
    gl.uniform1f(u.uPx, (est.celular ? 1.7 : 1.8) * est.dpr);
    gl.uniform1f(u.uAsp, asp); gl.uniform1f(u.uRot, tempo * .05);
    gl.uniform1f(u.uScan, 2.6 - ((tempo * .34) % 3.4) * 2.6);
    gl.uniform1f(u.uFade, fade); gl.uniform1f(u.uZoom, pose.zoom);
    gl.uniform1f(u.uBase, est.larga ? -2.3 : -.7);
    gl.uniform1f(u.uPtrOn, est.ptrOn * gira); gl.uniform1f(u.uAcende, est.acende);
    gl.uniform1f(u.uAbre, suave(fatia(pose.e1, .02, .3)));
    gl.drawArrays(gl.POINTS, 0, Math.floor(av.n * est.cortes.ave));
  }

  function camCasa(tempo) {
    const asp = est.W / est.H, m = suave(est.morf), larga = est.larga;
    const alvoY = mix(est.foco[1], FOLHA.cy, m), alvoX = mix(est.foco[0], 0, m), alvoZ = mix(est.foco[2], 0, m);
        const dCasa = (larga ? (11.8 / (2 * TAN * Math.min(asp * .6, 1))) : 13.4 / (2 * TAN * Math.min(asp, .8))) * est.zoomPraga;
    const dFolha = larga ? 8.3 / (2 * TAN) : Math.max(6.1 / (2 * TAN * Math.min(asp, .8)), 13.2 / (2 * TAN));
    const dist = mix(dCasa, dFolha, m) * (gravando ? gravando.distMul : 1);
    const balanco = gravando ? 0 : est.pragaId ? .35 : 1;
    const gira = 1 - m, th = mix(.62 + est.dth + Math.sin(tempo * .11) * .1 * balanco + est.ptr[0] * .1 * balanco, est.ptr[0] * .05, m), ph = mix(.34 + est.dph + est.ptr[1] * .05 * balanco, est.ptr[1] * .03, m);
    const c = [alvoX + Math.sin(th) * Math.cos(ph) * dist, alvoY + Math.sin(ph) * dist, alvoZ + Math.cos(th) * Math.cos(ph) * dist];
    const VP = M4.mul(M4.persp(FOV, asp, .05, 120), M4.olha(c, [alvoX, alvoY, alvoZ], [0, 1, 0]));
    const shift = gravando ? gravando.shift : larga ? [mix(.34, .38, m), mix(-.02, 0, m)] : [0, mix(.42, .36, m)];
    return { VP, shift, gira, olho: c, alvo: [alvoX, alvoY, alvoZ], fov: FOV * 180 / Math.PI, asp };
  }
  function desenhaCasa(cam, tempo, fade) {
    if (!gl) return casa2D(cam, tempo, fade);
    const { p, u } = PC;
    gl.useProgram(p);
    gl.bindBuffer(gl.ARRAY_BUFFER, ca.b);
    const aB = gl.getAttribLocation(p, 'aB'), aC = gl.getAttribLocation(p, 'aC'), aS = gl.getAttribLocation(p, 'aS');
    gl.enableVertexAttribArray(aB); gl.enableVertexAttribArray(aC); gl.enableVertexAttribArray(aS);
    gl.vertexAttribPointer(aB, 4, gl.FLOAT, false, 40, 0);
    gl.vertexAttribPointer(aC, 4, gl.FLOAT, false, 40, 16);
    gl.vertexAttribPointer(aS, 2, gl.FLOAT, false, 40, 32);
    gl.uniformMatrix4fv(u.uVP, false, cam.VP);
    gl.uniform2f(u.uShift, cam.shift[0], cam.shift[1]);
    gl.uniform2f(u.uPtr, est.ptr[0], est.ptr[1]);
    gl.uniform4fv(u.uHot, est.hot);
    gl.uniform1f(u.uT, tempo); gl.uniform1f(u.uForm, est.forma); gl.uniform1f(u.uMorph, est.morf);
    gl.uniform1f(u.uPx, (est.celular ? 1.45 : 1.7) * est.dpr);
    gl.uniform1f(u.uAsp, est.W / est.H);
    gl.uniform1f(u.uScan, -1 + ((tempo * .5) % 7));
    gl.uniform1f(u.uFade, fade); gl.uniform1f(u.uRow, est.linha); gl.uniform1f(u.uPtrOn, est.ptrOn);
    gl.uniform1f(u.uCorte, tem3d() ? -1.15 + 6.35 * est.solido : -100);
    gl.drawArrays(gl.POINTS, 0, Math.floor(ca.n * est.cortes.casa));
  }

  /* Etiquetas dos lugares. */
  const marcas = document.getElementById('marcas');
  let etiquetas = [];
  function projeta(cam, q) {
    const m = cam.VP, x = q[0], y = q[1], z = q[2];
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    const cx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w + cam.shift[0];
    const cy = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w + cam.shift[1];
    return [(cx * .5 + .5) * est.W, (.5 - cy * .5) * est.H];
  }
  function atualizaEtiquetas(cam) {
    if (!marcas) return;
    const vis = est.forma > .92 && est.morf < .08 && etiquetas.length;
    marcas.classList.toggle('ligada', !!vis);
    if (!vis) return;
    const usados = [];
    for (const e of etiquetas) {
      const [x, y] = projeta(cam, e.q);
      const lado = x > est.W * (est.larga ? .74 : .55) ? -1 : 1;
      const livre = (v) => !usados.some((u) => Math.abs(u - v) < 30);
      let ty = y;
      for (let k = 1; !livre(ty) && k < 12; k++) ty = y + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 30;
      usados.push(ty);
      e.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
      e.el.classList.toggle('esq', lado < 0);
      e.el.style.setProperty('--dy', (ty - y).toFixed(1) + 'px');
    }
  }

  /* Entrega o quadro à casa 3D, com a mesma câmera. */
  const s3 = { vis: 0, solido: 0, abre: 0, praga: null, t: 0, calmo: false, hot: null };
  function manda3d(cam, vis) {
    const usa3d = tem3d(), cv = window.CasaVideo, usaVideo = !usa3d && cv && cv.ativo;
    if (!usa3d && !usaVideo) return;
    s3.vis = vis; s3.solido = est.solido; s3.abre = est.abre; s3.praga = est.pragaId; s3.t = est.t; s3.calmo = calmo(); s3.hot = est.hot;
    if (usa3d) window.Casa3D.quadro(cam || camCasa(est.t), s3); else cv.quadro(s3);
  }

  /* ---------- laço ---------- */
  let ultimo = 0, medidas = 0, somaMs = 0, parado = true;
  function quadro(agora) {
    parado = false;
    const dt = Math.min(.05, (agora - (ultimo || agora)) / 1000); ultimo = agora;
    const cal = calmo();
    if (!cal) est.t += dt;
    const y = window.scrollY, H = est.H, A = ancora;
    let aM = pw(y, [0, A.olhar, A.olharFim, A.pragas - .2 * H], [0, .6, .66, 1]);
    let aF = pw(y, [A.olharFim + .25 * H, A.pragas + .1 * H], [0, 1]);
    let aMo = pw(y, [A.como + .55 * H, A.comp - .05 * H], [0, 1]);
    let aS = Math.min(pw(y, [A.pragas - .05 * H, A.pragas + .35 * H], [0, 1]), pw(y, [A.como + .15 * H, A.como + .6 * H], [1, 0]));
    let aA = pw(y, [A.pragas + .3 * H, A.pragas + .65 * H], [0, 1]);
    let aFim = pw(y, [A.papelFim - 1.1 * H, A.papelFim - .3 * H], [0, 1]);
    if (cal) { aM = aM > .4 ? 1 : 0; aF = aF > 0 ? 1 : 0; aMo = aMo > .5 ? 1 : 0; aFim = aFim > 0 ? 1 : 0; aS = aS > .5 ? 1 : 0; aA = aA > .5 ? 1 : 0; }
    const k = cal ? 1 : 1 - Math.exp(-dt * 8);
    est.mergulho += (aM - est.mergulho) * k; est.forma += (aF - est.forma) * k; est.morf += (aMo - est.morf) * k; est.fim += (aFim - est.fim) * (cal ? 1 : 1 - Math.exp(-dt * 5));
    est.ptr[0] += (est.ptrAlvo[0] - est.ptr[0]) * Math.min(1, dt * 7); est.ptr[1] += (est.ptrAlvo[1] - est.ptr[1]) * Math.min(1, dt * 7);
    est.ptrOn += (est.ptrOnAlvo - est.ptrOn) * Math.min(1, dt * 4);
    for (let i = 0; i < 20; i++) est.hot[i] += (est.hotAlvo[i] - est.hot[i]) * (cal ? 1 : Math.min(1, dt * 6));
    const alvo = tem3d() ? est.alvo3d : est.alvoPts;
    est.focoAlvo = alvo.foco; est.zoomPragaAlvo = alvo.zoom; est.dthAlvo = alvo.th; est.dphAlvo = alvo.ph;
    for (let i = 0; i < 3; i++) est.foco[i] += (est.focoAlvo[i] - est.foco[i]) * (cal ? 1 : Math.min(1, dt * 2.6));
    est.zoomPraga += (est.zoomPragaAlvo - est.zoomPraga) * (cal ? 1 : Math.min(1, dt * 2.6));
    est.solido += (aS - est.solido) * (cal ? 1 : 1 - Math.exp(-dt * 6)); est.abre += (aA - est.abre) * (cal ? 1 : 1 - Math.exp(-dt * 5));
    est.dth += (est.dthAlvo - est.dth) * (cal ? 1 : Math.min(1, dt * 2.6)); est.dph += (est.dphAlvo - est.dph) * (cal ? 1 : Math.min(1, dt * 2.6));
    if (est.intro < 1) { est.intro = cal ? 1 : Math.min(1, est.intro + dt / 2.1); }
    est.acende = cal ? 1 : suave(fatia(est.intro, .55, .95));

    const coberto = y >= A.papel && y + H <= A.papelFim;
    tela.classList.toggle('coberta', coberto);
    if (coberto || est.fim > .001) manda3d(null, 0);
    if (!coberto) {
      if (gl) gl.clear(gl.COLOR_BUFFER_BIT); else c2.clearRect(0, 0, tela.width, tela.height);
      if (est.fim > .001) {
        const p = poseAve(0);
        desenhaAve(p, est.fim, 1, est.t);
        if (marcas) marcas.classList.remove('ligada');
      } else {
        const d = est.mergulho;
        if (d < .97) {
          const p = poseAve(d);
          desenhaAve(p, est.intro, 1 - fatia(d, .86, .96), est.t);
        }
        if (est.forma > .001 && ca) {
          const cam = camCasa(est.t);
          if (!(tem3d() && est.solido > .995 && est.morf < .005)) desenhaCasa(cam, est.t, fatia(est.forma, 0, .2));
          atualizaEtiquetas(cam);
          manda3d(cam, est.solido > .001 ? fatia(est.forma, 0, .2) * (1 - fatia(est.morf, .55, .95)) : 0);
        } else { if (marcas) marcas.classList.remove('ligada'); manda3d(null, 0); }
      }
    }
    // Se o aparelho sofrer, a cena reduz os pontos sozinha.
    if (!cal && est.intro >= 1 && medidas < 90) {
      medidas++; somaMs += dt * 1000;
      if (medidas === 90 && somaMs / 90 > 30) {
        est.cortes.ave = .6; est.cortes.casa = .6;
        if (est.qualidade === 1) { est.qualidade = .75; est.W = 0; ajusta(); }
      }
    }
    if (document.hidden || (cal && est.quieto)) { parado = true; return; }
    if (cal) est.quieto = true;
    if (!manual) requestAnimationFrame(quadro);
  }
  const acorda = () => { est.quieto = false; if (parado && est.pronta && !manual) { ultimo = 0; requestAnimationFrame(quadro); } };

  /* API para a página. */
  const PRAGAS = window.CENA_PRAGAS || {};
  window.Cena = {
    praga(id, forcar) {
      if (gravando && !forcar) return;
      est.hotAlvo.fill(0);
      etiquetas = [];
      if (marcas) marcas.textContent = '';
      const lista = id ? PRAGAS[id] : null;
      est.pragaId = lista ? id : null;
      if (!lista) { est.alvoPts = est.alvo3d = { foco: [.5, 1.5, .4], zoom: 1, th: 0, ph: 0 }; acorda(); return; }
      const c = [0, 0, 0];
      lista.forEach(([chave, nome], i) => {
        const q = LUGARES[chave];
        est.hotAlvo.set([q[0], q[1], q[2], 1], i * 4);
        c[0] += q[0]; c[1] += q[1]; c[2] += q[2];
        if (marcas) {
          const el = document.createElement('span');
          el.className = 'marca-lugar';
          el.textContent = nome;
          marcas.appendChild(el);
          etiquetas.push({ q, el });
        }
      });
      const n = lista.length;
      const pr = PRESET[id];
      est.alvoPts = { foco: [mix(0, c[0] / n, .35), mix(1.9, c[1] / n, .35), mix(0, c[2] / n, .35)], zoom: .9, th: 0, ph: 0 };
      est.alvo3d = pr ? { foco: pr.foco.slice(), zoom: pr.zoom, th: pr.th, ph: pr.ph } : est.alvoPts;
      acorda();
    },
    linha(i) { est.linha = i; acorda(); },
    grava(op) { gravando = op || null; manual = !!op; if (manual) relogio = performance.now(); else { ultimo = 0; parado = true; acorda(); } },
    passo(ms) { relogio += ms; parado = false; quadro(relogio); if (window.Cena.aposQuadro) window.Cena.aposQuadro(); },
    acorda,
    mede,
    get pronta() { return est.pronta; },
    get modo() { return gl ? 'webgl' : '2d'; },
    get estado() { return { forma: est.forma, solido: est.solido, abre: est.abre, morf: est.morf, praga: est.pragaId, zoom: est.zoomPraga }; },
  };

  tela.addEventListener('webglcontextlost', (e) => { e.preventDefault(); vira2D(); });

  /* ---------- início ---------- */
  async function inicia() {
    try {
      const img = new Image(); img.src = window.GAVIAO_MAPA; await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      ajusta();
      const cel = est.celular, fraco = (navigator.hardwareConcurrency || 8) <= 4;
      const pede = montaFabrica();
      const aveChega = pede({ tipo: 'ave', w: c.width, h: c.height, d, linhas: cel ? (fraco ? 190 : 250) : 340, raios: cel ? 170 : 240, porRaio: cel ? 24 : 34 }, [d.buffer]);
      const casaChega = pede({ tipo: 'casa', N: cel ? (fraco ? 15000 : 20000) : 46000 });
      if (gl) {
        try {
          PA = programa(VS_AVE, ['uVP', 'uM', 'uShift', 'uPtr', 'uEye', 'uT', 'uIntro', 'uPx', 'uAsp', 'uRot', 'uScan', 'uFade', 'uZoom', 'uBase', 'uPtrOn', 'uAcende', 'uAbre']);
          gl.clearColor(0, 0, 0, 0);
          gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        } catch (e) { console.warn('Cena em 2D:', e && e.message); vira2D(); }
      }
      av = sobe(await aveChega, 8);
      est.pronta = true;
      tela.classList.add('pronta');
      window.addEventListener('resize', ajusta, { passive: true });
      if (window.ResizeObserver) new ResizeObserver(mede).observe(document.body);
      window.addEventListener('scroll', acorda, { passive: true });
      window.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'touch') return;
        est.ptrAlvo[0] = e.clientX / est.W * 2 - 1; est.ptrAlvo[1] = 1 - e.clientY / est.H * 2; est.ptrOnAlvo = 1; acorda();
      }, { passive: true });
      document.addEventListener('pointerleave', () => { est.ptrOnAlvo = 0; });
      document.addEventListener('visibilitychange', acorda);
      requestAnimationFrame(quadro);
      // A casa e a folha chegam depois, fora do caminho da primeira tela.
      const dadosCasa = await casaChega;
      await new Promise((ok) => (window.requestIdleCallback || ((f) => setTimeout(f, 200)))(ok, { timeout: 1500 }));
      if (gl) { try { PC = programa(VS_CASA, ['uVP', 'uShift', 'uPtr', 'uHot', 'uT', 'uForm', 'uMorph', 'uPx', 'uAsp', 'uScan', 'uFade', 'uRow', 'uPtrOn', 'uCorte']); } catch (e) { console.warn('Cena em 2D:', e && e.message); vira2D(); } }
      ca = sobe(dadosCasa, 10);
    } catch (e) { console.error(e); falha(); }
  }
  const comeca = () => (window.requestIdleCallback || ((f) => setTimeout(f, 200)))(inicia, { timeout: 900 });
  if (document.readyState === 'complete') comeca(); else window.addEventListener('load', comeca, { once: true });
})();
