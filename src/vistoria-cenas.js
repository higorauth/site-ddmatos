/* Cenas da vistoria: fotos reais (banco de imagens Pexels) com a câmera e as marcas de cada capítulo.
   camera.foco: ponto da foto (0 a 1) que vai para a área livre da tela; camera.zoom: aproximação além do necessário para cobrir a tela.
   marcas: [nome, x, y] em frações da foto, medidas na própria imagem.
   lente: vídeo ou foto da praga, onde a lente fica (fração da foto) e qual marca ela aponta (alvoCel: outra marca no celular). */
window.VISTORIA = {
  inicio: 'fachada',
  cenas: {
    fachada: { foto: 'fachada.webp', w: 1800, h: 1200, camera: { foco: [.42, .52], zoom: 1 }, cameraCel: { foco: [.42, .46], zoom: 1 }, porta: [.52, .62] },
    cozinha: { foto: 'cozinha.webp', w: 1800, h: 1200 },
    sala: { foto: 'sala.webp', w: 1800, h: 1201 },
    garagem: { foto: 'garagem.webp', w: 1800, h: 1200 },
    telhado: { foto: 'telhado.webp', w: 1800, h: 1200 },
    jardim: { foto: 'jardim.webp', w: 1800, h: 1200 },
    banheiro: { foto: 'banheiro.webp', w: 1800, h: 1201 },
    caixa: { foto: 'caixa.webp', w: 1800, h: 1200 },
  },
  capitulos: {
    baratas: {
      cena: 'cozinha', camera: { foco: [.55, .6], zoom: 1.15 }, cameraCel: { foco: [.63, .58], zoom: 1 },
      marcas: [['Ralo da pia', .74, .59], ['Armários da cozinha', .565, .57], ['Atrás do fogão', .45, .5]],
      lente: { video: 'barata.mp4', poster: 'barata.jpg', especie: 'Barata-americana', pos: [.54, .86], posCel: [.5, .42], alvo: 0 },
    },
    formigas: {
      cena: 'sala', camera: { foco: [.6, .6], zoom: 1.15 }, cameraCel: { foco: [.53, .6], zoom: 1 },
      marcas: [['Rodapés', .415, .595], ['Frestas da parede', .645, .42]],
      lente: { video: 'formigas.mp4', poster: 'formigas.jpg', especie: 'Trilha de formigas', pos: [.52, .86], posCel: [.42, .42], alvo: 0 },
    },
    ratos: {
      cena: 'garagem', camera: { foco: [.5, .42], zoom: 1.05 }, cameraCel: { foco: [.5, .38], zoom: 1 },
      marcas: [['Forro', .7, .13], ['Vãos junto à parede', .45, .515], ['Lixeira', .815, .43]],
      lente: { video: 'rato.mp4', poster: 'rato.jpg', especie: 'Ratazanas', pos: [.6, .8], posCel: [.56, .3], alvo: 1 },
    },
    cupins: {
      cena: 'telhado', camera: { foco: [.42, .45], zoom: 1.05 }, cameraCel: { foco: [.5, .42], zoom: 1 },
      marcas: [['Madeira do telhado', .62, .3], ['Encaixes das vigas', .41, .2], ['Pilares de madeira', .395, .68]],
      lente: { video: 'cupins.mp4', poster: 'cupins.jpg', especie: 'Cupins na madeira', pos: [.68, .78], posCel: [.6, .62], alvo: 0 },
    },
    mosquitos: {
      cena: 'jardim', camera: { foco: [.6, .72], zoom: 1.1 }, cameraCel: { foco: [.7, .72], zoom: 1 },
      marcas: [['Pratos de vasos', .73, .955]],
      lente: { poster: 'mosquito.webp', especie: 'Pernilongo', pos: [.86, .32], posCel: [.5, .3], alvo: 0 },
    },
    desentupimento: {
      cena: 'banheiro', camera: { foco: [.6, .66], zoom: 1.1 }, cameraCel: { foco: [.78, .6], zoom: 1 },
      marcas: [['Ralo do box', .465, .875], ['Pia', .8, .64]],
      lente: { video: 'ralo.mp4', poster: 'ralo.jpg', especie: 'Ralo escoando', pos: [.26, .55], posCel: [.62, .3], alvo: 0, alvoCel: 1 },
    },
    caixa: {
      cena: 'caixa', camera: { foco: [.72, .42], zoom: 1.15 }, cameraCel: { foco: [.72, .38], zoom: 1 },
      marcas: [['Tampa', .69, .2], ['Saída para a casa', .6, .48]],
      lente: { video: 'agua.mp4', poster: 'agua.jpg', especie: 'Água saindo pelo ladrão', pos: [.32, .58], posCel: [.3, .55], alvo: 0 },
    },
  },
};
