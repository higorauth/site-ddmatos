#!/usr/bin/env python3
"""Monta o site. Uso: python3 build.py [--artifact CAMINHO] [--dados ARQUIVO] [--saida PASTA]
Lê dados-da-empresa.json e src/, escreve dist/ (para hospedar).
Com --artifact, escreve também uma versão de arquivo único para a pré-visualização."""
import base64, html, json, pathlib, re, shutil, subprocess, sys, urllib.parse, urllib.request

RAIZ = pathlib.Path(__file__).resolve().parent
def opcao(nome, padrao):
    return pathlib.Path(sys.argv[sys.argv.index(nome) + 1]) if nome in sys.argv else padrao

SRC, DIST = RAIZ / 'src', opcao('--saida', RAIZ / 'dist')
dados = json.loads(opcao('--dados', RAIZ / 'dados-da-empresa.json').read_text(encoding='utf-8'))

ROTULOS = {
    'cidade': 'cidade', 'regiao': 'região', 'bairros': 'bairros atendidos', 'telefone': '(DDD) número', 'email': 'e-mail',
    'endereco': 'endereço', 'horario': 'dias e horários', 'razao_social': 'razão social', 'cnpj': 'número',
    'licenca_sanitaria': 'número', 'licenca_sanitaria_orgao': 'órgão emissor', 'licenca_sanitaria_validade': 'data',
    'licenca_ambiental': 'número', 'licenca_ambiental_orgao': 'órgão emissor', 'licenca_ambiental_validade': 'data',
    'rt_nome': 'nome', 'rt_profissao': 'profissão', 'rt_conselho': 'conselho', 'rt_registro': 'número',
    'google_nota': 'nota', 'google_avaliacoes': 'N', 'garantia_cobre': 'itens cobertos', 'garantia_condicoes': 'condições',
    'garantia_exclusoes': 'exclusões', 'garantia_resposta': 'prazo', 'email_privacidade': 'e-mail',
}
for praga in ('baratas', 'formigas', 'ratos', 'cupins', 'mosquitos', 'desentupimento', 'caixa'):
    ROTULOS[f'{praga}_preco'] = 'valor'
    ROTULOS[f'{praga}_inclui'] = 'o que inclui'
    ROTULOS[f'{praga}_garantia'] = 'prazo'

ICONE_WA = ('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.6-6.1c-.3-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1-1.3-.6-2.3-1.4-3.1-2.8-.2-.3 0-.4.1-.6l.4-.5.2-.4v-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.8.8-1 1.9-.7 3 .4 1.3 1.2 2.6 2.4 3.7 1.5 1.4 2.8 2 4.4 2.4.8.2 1.5.1 2.1-.2.6-.3 1-.9 1.2-1.5.1-.3.1-.6 0-.7l-.4-.2Z"/></svg>')

faltando = 0
faltam = set()

def valor(chave):
    global faltando
    v = str(dados.get(chave, '') or '').strip()
    if v:
        return html.escape(v)
    faltando += 1
    faltam.add(chave)
    return f'<span class="lacuna">[{html.escape(ROTULOS.get(chave, chave))}]</span>'

def wa(m):
    texto = m.group(1)
    num = re.sub(r'\D', '', str(dados.get('whatsapp_digitos', '')))
    if num:
        return f'https://wa.me/{num}?text=' + urllib.parse.quote(texto, safe='') + '" target="_blank" rel="noopener'
    recado = f'Modelo: com o número preenchido, este botão abre o WhatsApp com a mensagem: “{texto}”'
    return f'#fale" data-modelo="{html.escape(recado, quote=True)}'

def tel():
    num = re.sub(r'\D', '', str(dados.get('telefone_digitos', '')))
    if num:
        return f'tel:+{num}'
    return '#fale" data-modelo="Modelo: com o telefone preenchido, este botão liga para a empresa.'

def monta_corpo():
    c = (SRC / 'corpo.html').read_text(encoding='utf-8')
    c = re.sub(r'\{\{wa:(.*?)\}\}', wa, c)
    c = re.sub(r'\{\{foto:([a-z]+)\}\}', lambda m: f'fotos/{m.group(1)}.webp', c)
    c = c.replace('{{tel}}', tel()).replace('{{icone_wa}}', ICONE_WA)
    # Cada botão ganha a camada do brilho que passa (só enfeite, escondida dos leitores de tela).
    c = re.sub(r'(<(?:a|button)\b[^>]*\bclass="botao\b[^"]*"[^>]*>)', r'\1<span class="brilho" aria-hidden="true"></span>', c)
    c = c.replace('{{nome}}', html.escape(dados.get('nome', '') or 'Nome da empresa'))
    aviso = c.count('{{aviso_modelo}}')
    c = c.replace('{{aviso_modelo}}', '@@AVISO@@')
    c = re.sub(r'\{\{([a-z_]+)\}\}', lambda m: valor(m.group(1)), c)
    num = re.sub(r'\D', '', str(dados.get('whatsapp_digitos', '')))
    c = c.replace('id="form-proposta"', f'id="form-proposta" data-wa="{num}"')
    bloco = ''
    if faltando:
        bloco = (f'<div class="modelo" id="modelo"><span>Modelo do site: faltam {len(faltam)} dados da empresa, marcados com tracejado.</span>'
                 '<button id="modelo-fecha" type="button" aria-label="Fechar aviso">×</button></div>')
    return c.replace('@@AVISO@@', bloco)

def fontes_locais():
    pasta = SRC / 'fontes'
    pasta.mkdir(exist_ok=True)
    # Em Apple, a página usa a fonte do sistema (SF Pro). Nos outros aparelhos, a Inter.
    pedidos = {
        'inter.woff2': 'Inter:wght@100..900',
    }
    ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
    for arq, fam in pedidos.items():
        if (pasta / arq).exists():
            continue
        r = urllib.request.Request(f'https://fonts.googleapis.com/css2?family={fam}&display=swap', headers={'User-Agent': ua})
        css = urllib.request.urlopen(r).read().decode()
        blocos = re.findall(r'/\* (.*?) \*/\s*@font-face \{(.*?)\}', css, re.S)
        latino = next(b for n, b in blocos if n.strip() == 'latin')
        url = re.search(r'url\((https:[^)]+)\)', latino).group(1)
        (pasta / arq).write_bytes(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': ua})).read())

FACES = """@font-face{font-family:'Inter';src:url('fontes/inter.woff2') format('woff2');font-weight:100 900;font-display:swap}
"""
GOOGLE = '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap">'
FOTOS = ('baratas', 'formigas', 'ratos', 'cupins', 'mosquitos')

PRAGAS_JS = """window.CENA_PRAGAS={
 baratas:[['ralo2','Ralo da cozinha'],['ralo','Ralo do banheiro'],['gordura','Caixa de gordura'],['geladeira','Atrás da geladeira'],['armarios','Armários da cozinha']],
 formigas:[['frestas','Frestas da parede'],['rodape','Rodapés'],['armarios','Armários de alimentos']],
 ratos:[['forro','Forro'],['garagem','Lixeira'],['muro','Vãos junto ao muro'],['gordura','Caixa de gordura']],
 cupins:[['batente','Batentes'],['rodape','Rodapés'],['moveis','Móveis de madeira'],['telhado','Madeira do telhado']],
 mosquitos:[['calha','Calhas'],['vaso','Pratos de vasos'],['ralo2','Ralos sem uso']],
 desentupimento:[['sifao','Sifão da pia'],['ralo2','Ralo da cozinha'],['ralo','Ralo do banheiro'],['gordura','Caixa de gordura'],['inspecao','Caixa de inspeção']],
 caixa:[['tampa','Tampa'],['boia','Boia'],['fundo','Fundo da caixa'],['saidacx','Saída para a casa']]
};"""

def mapa_webp():
    png, webp = SRC / 'gaviao-mapa.png', SRC / 'gaviao-mapa.webp'
    if not webp.exists() or webp.stat().st_mtime < png.stat().st_mtime:
        subprocess.run(['cwebp', '-quiet', '-lossless', '-z', '9', str(png), '-o', str(webp)], check=True)
    return webp

def main():
    corpo = monta_corpo()
    css = (SRC / 'estilo.css').read_text(encoding='utf-8')
    app = (SRC / 'app.js').read_text(encoding='utf-8')
    cena = (SRC / 'cena.js').read_text(encoding='utf-8')
    casa3d = (SRC / 'casa3d.js').read_text(encoding='utf-8')
    webp = mapa_webp()
    nome = html.escape(dados.get('nome', '') or 'Dedetizadora')
    cidade = str(dados.get('cidade', '') or '').strip()
    titulo = f'Dedetização, desentupimento e caixa d\'água em {html.escape(cidade)} | {nome}' if cidade else f'Dedetização com garantia por escrito | {nome}'
    descricao = 'Dedetização com garantia por escrito para cada praga, desentupimento e limpeza de caixa d\'água, com licença e responsável técnico à vista e orçamento pelo WhatsApp.'

    # dist: arquivos para hospedar.
    fontes_locais()
    (DIST / 'fontes').mkdir(parents=True, exist_ok=True)
    (DIST / 'assets').mkdir(exist_ok=True)
    (DIST / 'assets' / 'icone.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#1747C8"/><circle cx="16" cy="16" r="10" fill="#fff"/><circle cx="16" cy="16" r="6" fill="#D7262E"/><circle cx="16" cy="16" r="3" fill="#0A1A3A"/></svg>', encoding='utf-8')
    shutil.copy(SRC / 'fontes' / 'inter.woff2', DIST / 'fontes' / 'inter.woff2')
    (DIST / 'fotos').mkdir(exist_ok=True)
    for f in FOTOS:
        shutil.copy(SRC / 'fotos' / f'{f}.webp', DIST / 'fotos' / f'{f}.webp')
    # Vídeos da casa, para navegador sem placa de vídeo.
    (DIST / 'videos').mkdir(exist_ok=True)
    for v in sorted((SRC / 'videos').glob('*')) if (SRC / 'videos').exists() else []:
        shutil.copy(v, DIST / 'videos' / v.name)
    shutil.copy(webp, DIST / 'assets' / 'gaviao-mapa.webp')
    shutil.copy(SRC / 'vendor' / 'three.module.min.js', DIST / 'assets' / 'three.module.min.js')
    (DIST / 'assets' / 'site.js').write_text(f"window.GAVIAO_MAPA='assets/gaviao-mapa.webp';\nwindow.TRES_URL=new URL('assets/three.module.min.js',document.baseURI).href;\n{PRAGAS_JS}\n{cena}\n{casa3d}\n{app}\n", encoding='utf-8')
    robos = '<meta name="robots" content="noindex">\n' if faltando else ''
    negocio = ''
    if not faltando:
        ld = {'@context': 'https://schema.org', '@type': 'LocalBusiness', 'name': dados['nome'], 'legalName': dados['razao_social'],
              'telephone': dados['telefone'], 'email': dados['email'], 'address': dados['endereco'], 'areaServed': dados['cidade'], 'description': descricao}
        negocio = '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + '</script>\n'
    pagina = f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{titulo}</title>
<meta name="description" content="{descricao}">
<meta name="theme-color" content="#FFFFFF">
<link rel="icon" href="assets/icone.svg" type="image/svg+xml">
{robos}<meta property="og:title" content="{titulo}">
<meta property="og:description" content="{descricao}">
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_BR">
<style>
{FACES}{css}
</style>
{negocio}<script defer src="assets/site.js"></script>
</head>
<body>
{corpo}
</body>
</html>
"""
    (DIST / 'index.html').write_text(pagina, encoding='utf-8')

    # Pré-visualização em arquivo único.
    if '--artifact' in sys.argv:
        alvo = pathlib.Path(sys.argv[sys.argv.index('--artifact') + 1])
        alvo.parent.mkdir(parents=True, exist_ok=True)
        (alvo.parent / 'fotos').mkdir(exist_ok=True)
        for f in FOTOS:
            shutil.copy(SRC / 'fotos' / f'{f}.webp', alvo.parent / 'fotos' / f'{f}.webp')
        (alvo.parent / 'videos').mkdir(exist_ok=True)
        for v in sorted((SRC / 'videos').glob('*')) if (SRC / 'videos').exists() else []:
            shutil.copy(v, alvo.parent / 'videos' / v.name)
        b64 = base64.b64encode(webp.read_bytes()).decode()
        art = f"""<title>{nome} Site Modelo</title>
<meta name="claude:viewport-fit-sides" content="cover">
{GOOGLE}
<style>
{css}
</style>
{corpo}
<script>
window.GAVIAO_MAPA='data:image/webp;base64,{b64}';
window.TRES_URL='https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';
{PRAGAS_JS}
{cena}
{casa3d}
{app}
</script>
"""
        alvo.write_text(art, encoding='utf-8')
    print(f'pronto: {len(faltam)} dados faltando ({faltando} lacunas); index {len(pagina)//1024} KB; site.js {(DIST/"assets"/"site.js").stat().st_size//1024} KB; mapa {webp.stat().st_size//1024} KB')

main()
