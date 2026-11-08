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
- `src/cena.js`: animação em pontos. Desenha o gavião, o mergulho no olho e o comprovante, e faz o escaneamento que revela a casa. Usa WebGL; sem placa de vídeo, desenha o mesmo gavião em 2D.
- `src/vistoria.js`: a casa de verdade. Mostra a foto de cada cômodo, as marcas vermelhas de onde a vistoria começa e a lente com o vídeo da praga. É feita só com fotos e vídeos, então funciona igual sem placa de vídeo.
- `src/vistoria-cenas.js`: a configuração da casa. Para cada capítulo: a foto, o ponto da foto que a câmera mostra no computador e no celular, as marcas e a lente. As posições são frações da foto, de 0 a 1 (0,5 é o meio).
- `src/midia/`: fotos dos cômodos (Pexels) e vídeos curtos das pragas (Wikimedia Commons, Pexels, Pixabay e Mixkit), já recortados e comprimidos. São de banco de imagens. O site avisa que servem de ilustração, e os créditos ficam no rodapé. O vídeo dos cupins é CC BY 2.0, por isso o crédito com o link da licença não pode sair. Para usar fotos da própria empresa, troque o arquivo mantendo o nome e ajuste as marcas em `vistoria-cenas.js`.
- `src/casa3d.js`, `src/vendor/three.module.min.js`, `src/videos/` e `ferramentas/grava-casa.mjs`: a casa 3D da versão anterior. Não entram mais no site. Ficaram no repositório só como histórico e podem ser apagados.
- `src/fotos/`: fotos das pragas. Todas têm licença livre, e os créditos ficam no rodapé. A do pernilongo é CC BY-SA 4.0, por isso o crédito com o link da licença não pode sair.
- `src/app.js`: comportamento da página.
- `ferramentas/pinta-gaviao.js`: desenha o gavião provisório. É aqui que a logo real entra.
- `dist/`: resultado pronto para hospedar. Não edite aqui, porque o `build.py` sobrescreve.

Para refazer o mapa do gavião, rode `node ferramentas/gera-gaviao.mjs 512`. Esse passo precisa do pacote `playwright-core` e do Chrome instalado. Depois rode `python3 build.py`, que precisa do `cwebp` quando o mapa muda.
