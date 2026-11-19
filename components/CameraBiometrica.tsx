'use client';

import React, { useRef, useState, useEffect } from 'react';

export interface StatusQualidadeFoto {
  aprovada: boolean;
  luzOk: boolean;
  detalhesOk: boolean;
  enquadramentoOk: boolean;
  mensagem: string;
}

interface CameraBiometricaProps {
  onCapturar: (base64: string) => void;
  autoIniciar?: boolean;
  textoBotaoAbrir?: string;
  subtextoBotaoAbrir?: string;
}

export async function analisarFrameDeVideo(video: HTMLVideoElement): Promise<StatusQualidadeFoto> {
  if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
    return {
      aprovada: false,
      luzOk: false,
      detalhesOk: false,
      enquadramentoOk: false,
      mensagem: 'Iniciando sensor da câmera...',
    };
  }

  const tamanho = 240;
  const canvas = document.createElement('canvas');
  canvas.width = tamanho;
  canvas.height = tamanho;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return {
      aprovada: false,
      luzOk: false,
      detalhesOk: false,
      enquadramentoOk: false,
      mensagem: 'Erro ao processar imagem.',
    };
  }

  const menorLado = Math.min(video.videoWidth, video.videoHeight);
  const sx = (video.videoWidth - menorLado) / 2;
  const sy = (video.videoHeight - menorLado) / 2;
  ctx.drawImage(video, sx, sy, menorLado, menorLado, 0, 0, tamanho, tamanho);

  const imgData = ctx.getImageData(0, 0, tamanho, tamanho).data;
  const brilhoMatriz = new Float32Array(tamanho * tamanho);

  const cx = tamanho * 0.5;
  const cy = tamanho * 0.5;
  const rx = tamanho * 0.26;
  const ry = tamanho * 0.35;

  let somaBrilhoOval = 0;
  let pixelsDentroOval = 0;
  let peleFaixaTesta = 0, totalFaixaTesta = 0;
  let peleFaixaMeio = 0, totalFaixaMeio = 0;
  let peleFaixaQueixo = 0, totalFaixaQueixo = 0;
  let peleForaOval = 0, totalForaOval = 0;
  let somaX = 0, somaY = 0, totalPeleRosto = 0;

  for (let y = 0; y < tamanho; y++) {
    for (let x = 0; x < tamanho; x++) {
      const idx = (y * tamanho + x) * 4;
      const r = imgData[idx];
      const g = imgData[idx + 1];
      const b = imgData[idx + 2];

      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      brilhoMatriz[y * tamanho + x] = lum;

      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
      const ehPele =
        r > 65 && g > 35 && b > 20 && r > g + 6 && r > b + 12 &&
        cr >= 134 && cr <= 176 && cb >= 78 && cb <= 126;

      const normX = (x - cx) / rx;
      const normY = (y - cy) / ry;
      const distOval = normX * normX + normY * normY;

      if (distOval <= 1.0) {
        somaBrilhoOval += lum;
        pixelsDentroOval++;
      } else {
        totalForaOval++;
        if (ehPele) peleForaOval++;
      }

      if (x >= tamanho * 0.35 && x <= tamanho * 0.65) {
        if (y >= tamanho * 0.22 && y < tamanho * 0.36) {
          totalFaixaTesta++;
          if (ehPele) peleFaixaTesta++;
        } else if (y >= tamanho * 0.36 && y < tamanho * 0.56) {
          totalFaixaMeio++;
          if (ehPele) peleFaixaMeio++;
        } else if (y >= tamanho * 0.56 && y <= tamanho * 0.76) {
          totalFaixaQueixo++;
          if (ehPele) peleFaixaQueixo++;
        }
      }

      if (ehPele && y >= tamanho * 0.16 && y <= tamanho * 0.78 && x >= tamanho * 0.22 && x <= tamanho * 0.78) {
        somaX += x;
        somaY += y;
        totalPeleRosto++;
      }
    }
  }

  const mediaBrilho = somaBrilhoOval / Math.max(1, pixelsDentroOval);

  if (mediaBrilho < 55) {
    return { aprovada: false, luzOk: false, detalhesOk: false, enquadramentoOk: false, mensagem: 'Pouca luz! Vá para um local mais iluminado.' };
  }
  if (mediaBrilho > 238) {
    return { aprovada: false, luzOk: false, detalhesOk: false, enquadramentoOk: false, mensagem: 'Excesso de luz atrás de você. Evite ficar contra janela/lâmpada.' };
  }

  let contrasteOval = 0;
  let countContraste = 0;
  for (let y = 2; y < tamanho - 2; y++) {
    for (let x = 2; x < tamanho - 2; x++) {
      const normX = (x - cx) / rx;
      const normY = (y - cy) / ry;
      if (normX * normX + normY * normY <= 0.75) {
        const pos = y * tamanho + x;
        const lap = Math.abs(
          4 * brilhoMatriz[pos] - brilhoMatriz[pos - 1] - brilhoMatriz[pos + 1] - brilhoMatriz[pos - tamanho] - brilhoMatriz[pos + tamanho]
        );
        contrasteOval += lap;
        countContraste++;
      }
    }
  }
  const nitidezMedia = contrasteOval / Math.max(1, countContraste);

  const taxaTesta = peleFaixaTesta / Math.max(1, totalFaixaTesta);
  const taxaMeio = peleFaixaMeio / Math.max(1, totalFaixaMeio);
  const taxaQueixo = peleFaixaQueixo / Math.max(1, totalFaixaQueixo);
  const taxaFora = peleForaOval / Math.max(1, totalForaOval);
  const centroX = totalPeleRosto > 0 ? somaX / totalPeleRosto : 0;
  const centroY = totalPeleRosto > 0 ? somaY / totalPeleRosto : 0;

  let enquadramentoOk = false;
  let motivo = 'Posicione o rosto dentro da moldura oval.';

  if (totalPeleRosto < tamanho * tamanho * 0.06) {
    motivo = 'Nenhum rosto centralizado. Olhe de frente para a câmera.';
  } else if (taxaTesta < 0.28) {
    motivo = 'Rosto muito baixo! Suba o celular para preencher a parte de cima do oval.';
  } else if (taxaQueixo < 0.28 || centroY < tamanho * 0.34) {
    motivo = 'Rosto muito alto! Abaixe um pouco o celular.';
  } else if (taxaMeio < 0.40) {
    motivo = 'Centralize o rosto inteiro dentro da guia pontilhada.';
  } else if (taxaFora > 0.45) {
    motivo = 'Rosto muito perto da câmera. Afaste um pouco o celular.';
  } else if (Math.abs(centroX - cx) > tamanho * 0.11) {
    motivo = 'Centralize o rosto horizontalmente na guia oval.';
  } else if (centroY > tamanho * 0.59) {
    motivo = 'Rosto deslocado para baixo. Suba um pouco o celular.';
  } else {
    enquadramentoOk = true;
  }

  if (!enquadramentoOk) {
    return { aprovada: false, luzOk: true, detalhesOk: nitidezMedia >= 6.5, enquadramentoOk: false, mensagem: motivo };
  }
  if (nitidezMedia < 6.5) {
    return { aprovada: false, luzOk: true, detalhesOk: false, enquadramentoOk: true, mensagem: 'Foto sem nitidez (borrada). Mantenha o celular firme.' };
  }

  return { aprovada: true, luzOk: true, detalhesOk: true, enquadramentoOk: true, mensagem: '✅ Rosto enquadrado e iluminação ótima! Pode capturar.' };
}

export default function CameraBiometrica({
  onCapturar,
  autoIniciar = false,
  textoBotaoAbrir = '📷 Abrir Câmera Frontal',
  subtextoBotaoAbrir,
}: CameraBiometricaProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const intervaloRef = useRef<NodeJS.Timeout | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [qualidade, setQualidade] = useState<StatusQualidadeFoto>({
    aprovada: false,
    luzOk: false,
    detalhesOk: false,
    enquadramentoOk: false,
    mensagem: 'Iniciando câmera...',
  });

  function pararCamera() {
    if (intervaloRef.current) {
      clearInterval(intervaloRef.current);
      intervaloRef.current = null;
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      setStream(null);
    }
  }

  async function iniciarCamera() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 480, height: 480 },
      });
      setStream(s);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          intervaloRef.current = setInterval(async () => {
            if (videoRef.current) {
              const st = await analisarFrameDeVideo(videoRef.current);
              setQualidade(st);
            }
          }, 350);
        }
      }, 150);
    } catch {
      alert('Permita o acesso à câmera frontal do navegador para tirar a selfie.');
    }
  }

  useEffect(() => {
    if (autoIniciar) {
      iniciarCamera();
    }
    return () => {
      if (intervaloRef.current) clearInterval(intervaloRef.current);
      setStream((atual) => {
        atual?.getTracks().forEach((t) => t.stop());
        return null;
      });
    };
  }, [autoIniciar]);

  async function capturar() {
    if (!videoRef.current) return;
    const checagem = await analisarFrameDeVideo(videoRef.current);
    setQualidade(checagem);
    if (!checagem.aprovada) {
      alert(`Foto não aceita: ${checagem.mensagem}`);
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const menor = Math.min(videoRef.current.videoWidth, videoRef.current.videoHeight);
      const sx = (videoRef.current.videoWidth - menor) / 2;
      const sy = (videoRef.current.videoHeight - menor) / 2;
      ctx.drawImage(videoRef.current, sx, sy, menor, menor, 0, 0, 400, 400);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      pararCamera();
      onCapturar(dataUrl);
    }
  }

  if (!stream) {
    return (
      <div className="space-y-1 text-center">
        <button
          type="button"
          onClick={iniciarCamera}
          className="text-xs font-bold text-floresta underline"
        >
          {textoBotaoAbrir}
        </button>
        {subtextoBotaoAbrir && (
          <p className="text-[10px] text-gray-400">{subtextoBotaoAbrir}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div
        className={`p-2 rounded-xl text-xs font-semibold text-center border transition-colors ${
          qualidade.aprovada
            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
            : 'bg-amber-50 text-amber-800 border-amber-300'
        }`}
      >
        {qualidade.mensagem}
      </div>

      <div className="relative aspect-square max-w-[230px] mx-auto w-full rounded-xl overflow-hidden bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover scale-x-[-1]"
        />
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div
            className={`w-40 h-52 rounded-full border-4 border-dashed transition-colors ${
              qualidade.aprovada ? 'border-emerald-400' : 'border-amber-400/80'
            }`}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 text-[10px] text-center font-bold">
        <span className={`py-1 rounded-lg ${qualidade.enquadramentoOk ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'}`}>
          {qualidade.enquadramentoOk ? '✓ Enquadrado' : '○ Enquadrar'}
        </span>
        <span className={`py-1 rounded-lg ${qualidade.luzOk ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'}`}>
          {qualidade.luzOk ? '✓ Boa Luz' : '○ Iluminação'}
        </span>
        <span className={`py-1 rounded-lg ${qualidade.detalhesOk ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'}`}>
          {qualidade.detalhesOk ? '✓ Nitidez OK' : '○ Nitidez'}
        </span>
      </div>

      <button
        type="button"
        onClick={capturar}
        disabled={!qualidade.aprovada}
        className={`w-full font-bold py-2.5 rounded-xl text-xs transition ${
          qualidade.aprovada
            ? 'bg-floresta hover:bg-floresta-claro text-white'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
        }`}
      >
        {qualidade.aprovada ? '📸 Capturar Foto Agora' : 'Ajuste o rosto/luz para liberar'}
      </button>
    </div>
  );
}