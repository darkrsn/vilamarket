export function formatarNomeTitleCase(valor: string): string {
  const excecoes = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
  return valor
    .toLowerCase()
    .split(' ')
    .map((palavra, indice) => {
      if (!palavra) return '';
      if (indice > 0 && excecoes.has(palavra)) return palavra;
      return palavra.charAt(0).toUpperCase() + palavra.slice(1);
    })
    .join(' ');
}

export function formatarMoedaInput(valorDigitado: string): string {
  const apenasDigitos = valorDigitado.replace(/\D/g, '');
  if (!apenasDigitos) return '';
  const numero = parseInt(apenasDigitos, 10) / 100;
  return numero.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function converterMoedaParaNumero(valorFormatado: string): number {
  if (!valorFormatado) return 0;
  const limpo = valorFormatado.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(limpo);
  return isNaN(num) ? 0 : num;
}

export function formatarCPFVisual(valor: string): string {
  const apenasNumeros = valor.replace(/\D/g, '').slice(0, 11);
  return apenasNumeros
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

export function calcularIdade(dataNascStr: string): number {
  if (!dataNascStr) return 0;
  const partes = dataNascStr.split('-').map(Number);
  if (partes.length !== 3) return 0;
  const [ano, mes, dia] = partes;
  const hoje = new Date();
  let idade = hoje.getFullYear() - ano;
  const m = hoje.getMonth() + 1 - mes;
  if (m < 0 || (m === 0 && hoje.getDate() < dia)) idade--;
  return idade;
}

export async function otimizarImagemParaUpload(file: File, larguraMax = 1200): Promise<File> {
  if (!file.type.startsWith('image/')) return file;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let largura = img.width;
        let altura = img.height;

        if (largura > larguraMax) {
          altura = Math.round((altura * larguraMax) / largura);
          largura = larguraMax;
        }

        canvas.width = largura;
        canvas.height = altura;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Erro ao processar imagem no navegador.'));
          return;
        }

        ctx.drawImage(img, 0, 0, largura, altura);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Falha na compactação da imagem.'));
              return;
            }
            const nomeLimpo = file.name.replace(/\.[^/.]+$/, '') + '.jpg';
            resolve(
              new File([blob], nomeLimpo, {
                type: 'image/jpeg',
                lastModified: Date.now(),
              })
            );
          },
          'image/jpeg',
          0.88
        );
      };
      img.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada.'));
    };
    reader.onerror = () => reject(new Error('Erro ao carregar o arquivo.'));
  });
}