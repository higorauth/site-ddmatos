/* Comportamento da página. Tudo aqui é melhoria: sem este arquivo, o conteúdo continua inteiro. */
(function () {
  'use strict';
  const raiz = document.documentElement;
  raiz.lang = 'pt-BR';
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const cena = (fn, ...a) => { if (window.Cena) window.Cena[fn](...a); };

  /* Animações: respeita o sistema e guarda a escolha da pessoa. */
  const pausa = $('#pausa'), pausaTxt = $('#pausa-txt');
  const lembra = (v) => { try { if (v === undefined) return localStorage.getItem('animacoes'); localStorage.setItem('animacoes', v); } catch (e) { return null; } return null; };
  const define = (calmo) => {
    raiz.classList.toggle('calmo', calmo);
    pausa.setAttribute('aria-pressed', String(calmo));
    pausaTxt.textContent = calmo ? 'Ligar animações' : 'Pausar animações';
    cena('acorda');
    cena('mede');
  };
  const pedeCalma = window.matchMedia('(prefers-reduced-motion: reduce)');
  const economia = navigator.connection && navigator.connection.saveData;
  const guardado = lembra();
  define(guardado ? guardado === 'pausadas' : pedeCalma.matches || !!economia);
  pausa.addEventListener('click', () => { const c = !raiz.classList.contains('calmo'); define(c); lembra(c ? 'pausadas' : 'ligadas'); });

  /* Topo, barra de progresso e texto que surge dentro da pupila. */
  const topo = $('#topo'), prog = $('#progresso'), olhar = $('#olhar'), olharTexto = $('#olhar-texto');
  let pedido = false;
  function aoRolar() {
    pedido = false;
    const y = window.scrollY, H = window.innerHeight, total = document.documentElement.scrollHeight - H;
    topo.classList.toggle('solido', y > 40);
    prog.style.transform = `scaleX(${total > 0 ? Math.min(1, y / total) : 0})`;
    if (olhar && !raiz.classList.contains('calmo') && !raiz.classList.contains('sem-webgl')) {
      const r = olhar.getBoundingClientRect();
      const entra = Math.min(1, Math.max(0, (H * .34 - r.top) / (H * .3)));
      const sai = Math.min(1, Math.max(0, (r.bottom - H * 1.02) / (H * .3)));
      olharTexto.style.opacity = String(Math.min(entra, sai));
    } else if (olharTexto) olharTexto.style.opacity = '';
  }
  window.addEventListener('scroll', () => { if (!pedido) { pedido = true; requestAnimationFrame(aoRolar); } }, { passive: true });
  window.addEventListener('resize', aoRolar, { passive: true });
  aoRolar();

  /* Praga ativa: acende os lugares na casa e desliza o marcador da barra até ela. */
  const chips = $$('[data-chip]');
  const trilho = $('.chips-in'), barra = $('.chips');
  const moveMarcador = () => {
    const alvo = chips.find((c) => c.classList.contains('ativo'));
    if (!trilho) return;
    if (!alvo) { trilho.style.setProperty('--o', '0'); barra.classList.remove('desliza'); return; }
    trilho.style.setProperty('--x', alvo.offsetLeft + 'px');
    trilho.style.setProperty('--w', alvo.offsetWidth + 'px');
    trilho.style.setProperty('--o', '1');
    barra.classList.add('desliza');
    const fim = alvo.offsetLeft + alvo.offsetWidth, visivel = trilho.scrollLeft + trilho.clientWidth;
    if (alvo.offsetLeft < trilho.scrollLeft || fim > visivel) trilho.scrollTo({ left: alvo.offsetLeft - 24, behavior: raiz.classList.contains('calmo') ? 'auto' : 'smooth' });
  };
  const ativaPraga = (id) => {
    $$('.praga').forEach((a) => a.classList.toggle('ativa', a.dataset.praga === id));
    chips.forEach((c) => { const on = c.dataset.chip === id; c.classList.toggle('ativo', on); if (on) c.setAttribute('aria-current', 'true'); else c.removeAttribute('aria-current'); });
    moveMarcador();
    cena('praga', id || null);
  };
  window.addEventListener('resize', moveMarcador, { passive: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(moveMarcador);
  let atual = null;
  const retrato = () => !window.matchMedia('(min-width: 1000px) and (min-aspect-ratio: 1/1)').matches;
  if ('IntersectionObserver' in window) {
    const mostra = new Set();
    const primeira = $('.praga');
    // Entre um cartão e outro nenhum fica na faixa: a casa continua no último cômodo em vez de voltar para a fachada.
    // Volta para a fachada só acima do primeiro capítulo.
    const acima = () => !primeira || primeira.getBoundingClientRect().top > window.innerHeight * .5;
    const decide = () => {
      let id = mostra.size ? Array.from(mostra).pop() : null;
      if (!id && atual && !acima()) id = atual;
      if (id !== atual) { atual = id; ativaPraga(id); }
    };
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) mostra.add(e.target.dataset.praga); else mostra.delete(e.target.dataset.praga); });
      decide();
    }, { rootMargin: retrato() ? '-58% 0px -22% 0px' : '-38% 0px -38% 0px' });
    $$('.praga').forEach((a) => io.observe(a));
    // Um salto pelo menu pode levar para cima do primeiro capítulo sem que nenhum cartão cruze a faixa.
    let conferindo = false;
    window.addEventListener('scroll', () => {
      if (conferindo || !atual || mostra.size) return;
      conferindo = true;
      requestAnimationFrame(() => { conferindo = false; if (!mostra.size && atual && acima()) decide(); });
    }, { passive: true });

    /* Linha ativa do comprovante: acende a linha na folha. */
    const itens = $$('[data-linha]');
    const io2 = new IntersectionObserver((es) => {
      es.forEach((e) => {
        if (!e.isIntersecting) return;
        itens.forEach((i) => i.classList.toggle('ativa', i === e.target));
        cena('linha', +e.target.dataset.linha);
      });
    }, { rootMargin: '-46% 0px -46% 0px' });
    itens.forEach((i) => io2.observe(i));

    /* Item atual do menu. */
    const links = $$('.menu a');
    const io3 = new IntersectionObserver((es) => {
      es.forEach((e) => {
        if (!e.isIntersecting) return;
        links.forEach((l) => { const on = l.getAttribute('href') === '#' + e.target.id; if (on) l.setAttribute('aria-current', 'true'); else l.removeAttribute('aria-current'); });
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    $$('main section[id]').forEach((s) => io3.observe(s));
  }

  /* Botões vivos: o brilho e o pulinho só rodam nos botões que estão na tela,
     e só depois que a página carrega e o gavião termina de se desenhar. */
  const botoes = $$('.botao');
  let vivos = null;
  const ligaBotoes = () => {
    if (vivos || !('IntersectionObserver' in window)) return;
    vivos = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle('vivo', e.isIntersecting && !raiz.classList.contains('calmo'))));
    botoes.forEach((b) => vivos.observe(b));
  };
  const depois = () => setTimeout(ligaBotoes, 2600);
  if (document.readyState === 'complete') depois(); else window.addEventListener('load', depois, { once: true });
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((t) => window.addEventListener(t, ligaBotoes, { once: true, passive: true }));

  /* Recados curtos. */
  const recado = $('#recado');
  let tempo = 0;
  const avisa = (t) => { recado.textContent = t; recado.hidden = false; clearTimeout(tempo); tempo = setTimeout(() => { recado.hidden = true; }, 6500); };

  /* Enquanto o número não existir, o botão explica o que fará, em vez de levar a lugar nenhum. */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-modelo]');
    if (!a) return;
    e.preventDefault();
    avisa(a.dataset.modelo);
  });
  const fechaAviso = $('#modelo-fecha');
  if (fechaAviso) fechaAviso.addEventListener('click', () => { $('#modelo').hidden = true; });

  /* Formulário de proposta: monta a mensagem e abre o WhatsApp. Nada fica guardado no site. */
  const form = $('#form-proposta'), erro = $('#form-erro');
  if (form) form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = new FormData(form), vazio = ['nome', 'telefone', 'tipo', 'servico', 'cidade'].find((k) => !String(d.get(k) || '').trim());
    $$('[aria-invalid]', form).forEach((c) => c.removeAttribute('aria-invalid'));
    if (vazio) {
      const c = form.elements[vazio], rotulo = $(`label[for="${c.id}"]`).textContent.toLowerCase();
      c.setAttribute('aria-invalid', 'true');
      erro.textContent = `Preencha o campo ${rotulo} para pedir a proposta.`;
      erro.hidden = false; c.focus();
      return;
    }
    erro.hidden = true;
    const msg = `Olá, vim pelo site e quero uma proposta. Nome: ${d.get('nome')}. Telefone: ${d.get('telefone')}. Tipo de local: ${d.get('tipo')}. Serviço: ${d.get('servico')}. Cidade: ${d.get('cidade')}.`;
    const num = form.dataset.wa;
    if (!num) return avisa(`Modelo: com o número preenchido, este botão abre o WhatsApp com a mensagem: “${msg}”`);
    const a = document.createElement('a');
    a.href = `https://wa.me/${num}?text=${encodeURIComponent(msg)}`; a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  });
})();
