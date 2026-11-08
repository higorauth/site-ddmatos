# Site da dedetizadora

## Repositório

O código está em https://github.com/higorauth/site-ddmatos. O arquivo `.github/workflows/publicar.yml` publica a pasta `dist/` no GitHub Pages a cada envio para a `main`, depois que o Pages for ligado no repositório.

## Para colocar no ar

1. Abra `dados-da-empresa.json` e preencha os campos.
2. Rode `python3 build.py` nesta pasta.
3. Envie para a hospedagem tudo o que está em `dist/`.

Campo vazio vira uma lacuna tracejada no site. Enquanto houver lacuna, o site sai com `noindex`, para o Google não indexar o modelo, e os botões de WhatsApp e telefone mostram um recado em vez de abrir um link. Quando tudo estiver preenchido, essas proteções saem sozinhas.

Em `dist/fontes/` sobraram `saira.woff2` e `atkinson.woff2`, da versão anterior. O site não usa mais esses arquivos, então eles podem ser apagados.

## Antes de publicar

- Confirme que cada promessa do texto é verdade na rotina da empresa. O que o site promete vira obrigação (CDC, art. 30). Isso inclui: foto e nome do técnico antes da visita, valor total aprovado antes de começar o desentupimento, registro com a data da limpeza da caixa d'água e as etapas da limpeza descritas no site.
- Desentupimento: o art. 13 da RDC 622/2022 pede veículo de uso exclusivo para o controle de pragas. O desentupimento precisa de equipe, equipamento e veículo próprios, e a licença de pragas não serve como prova para ele.
- Passe o texto e o termo de garantia por advogado ou consultor sanitário.
- Confira as regras do seu estado e município. Veja a seção 6 do relatório em `../reports/`.
- Faça a busca da marca no INPI antes de investir na identidade.

## Arquivos

- `dados-da-empresa.json`: o único arquivo que precisa ser editado.
- `src/corpo.html`: textos da página.
- `src/estilo.css`: aparência. Cores branco, vermelho e azul; fonte do sistema da Apple (SF Pro), com Inter nos outros aparelhos; botões no estilo do site da Meppy.
- `src/cena.js`: animação em pontos (WebGL). Desenha o gavião, a casa de pontos e o comprovante, e controla a câmera da casa.
- `src/casa3d.js`: a casa em 3D, com as pragas animadas, o encanamento e a caixa d'água. Usa o Three.js, que só é baixado quando a pessoa começa a rolar. Em aparelho sem placa de vídeo, entra a casa em vídeo (veja `src/videos/`).
- `src/vendor/three.module.min.js`: Three.js r170 (licença MIT).
- `src/videos/`: a mesma casa 3D gravada em vídeo. Quando o navegador não tem placa de vídeo (ou ela travou), o site mostra esses vídeos no lugar da casa 3D, e o gavião continua animado em 2D. Se a casa 3D mudar, grave de novo com `ferramentas/grava-casa.mjs`.
- `src/fotos/`: fotos das pragas. Todas têm licença livre, e os créditos ficam no rodapé. A do pernilongo é CC BY-SA 4.0, por isso o crédito com o link da licença não pode sair.
- `src/app.js`: comportamento da página.
- `ferramentas/pinta-gaviao.js`: desenha o gavião provisório. É aqui que a logo real entra.
- `dist/`: resultado pronto para hospedar. Não edite aqui, porque o `build.py` sobrescreve.

Para refazer o mapa do gavião, rode `node ferramentas/gera-gaviao.mjs 512`. Esse passo precisa do pacote `playwright-core` e do Chrome instalado. Depois rode `python3 build.py`, que precisa do `cwebp` quando o mapa muda.
