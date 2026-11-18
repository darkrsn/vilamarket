'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

// Tempo que o login fica salvo no celular/navegador (7 dias em milissegundos)
const TEMPO_SESSAO_MS = 7 * 24 * 60 * 60 * 1000;
const CHAVE_STORAGE = 'vilamarket_sessao_v1';

interface StatusQualidadeFoto {
  aprovada: boolean;
  luzOk: boolean;
  detalhesOk: boolean;
  enquadramentoOk: boolean;
  mensagem: string;
}

export default function VilaMarketApp() {
  const [aba, setAba] = useState<'login' | 'cadastro' | 'confirmar_wa' | 'esqueci_pin' | 'painel'>('login');
  const [abaInferior, setAbaInferior] = useState<'inicio' | 'mural' | 'perfil' | 'admin'>('inicio');
  const [unidades, setUnidades] = useState<any[]>([]);
  const [condominioId, setCondominioId] = useState<string>('');
  const [mensagem, setMensagem] = useState<{ tipo: 'erro' | 'sucesso'; texto: string } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [verificandoSessao, setVerificandoSessao] = useState(true);

  // Dados Login & Usuário Logado
  const [cpf, setCpf] = useState('');
  const [pin, setPin] = useState('');
  const [usuarioLogado, setUsuarioLogado] = useState<any>(null);
  const [perfilDetalhes, setPerfilDetalhes] = useState<any>(null);
  const [selfieTemporariaUrl, setSelfieTemporariaUrl] = useState<string | null>(null);

  // Dados Cadastro
  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [dataNasc, setDataNasc] = useState('');
  const [ruaSelecionada, setRuaSelecionada] = useState('Rua Sargento Lafayette');
  const [tipoUnidade, setTipoUnidade] = useState<'bloco' | 'casa'>('bloco');
  const [unidadeId, setUnidadeId] = useState('');
  const [complementoApto, setComplementoApto] = useState('');
  const [aceiteLgpdTitular, setAceiteLgpdTitular] = useState(false);

  // Código WhatsApp (Ativação e Reset PIN)
  const [codigoWa, setCodigoWa] = useState('');
  const [novoPin, setNovoPin] = useState('');

  // Estados dos Modais da Dashboard (Selfie, Alterar PIN, Extrato, Dependentes e Pix)
  const [modalAtivo, setModalAtivo] = useState<
    null | 'selfie' | 'pin' | 'extrato' | 'novo_dependente' | 'pix_dependente'
  >(null);

  // 1. Estados Modal Selfie + Análise de Qualidade em Tempo Real (Luz, Enquadramento e Detalhes)
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const intervaloAnaliseRef = useRef<NodeJS.Timeout | null>(null);
  const [streamCamera, setStreamCamera] = useState<MediaStream | null>(null);
  const [fotoCapturada, setFotoCapturada] = useState<string | null>(null);
  const [modoTrocaSelfie, setModoTrocaSelfie] = useState(false);
  const [qualidadeCamera, setQualidadeCamera] = useState<StatusQualidadeFoto>({
    aprovada: false,
    luzOk: false,
    detalhesOk: false,
    enquadramentoOk: false,
    mensagem: 'Posicionando câmera...',
  });

  // 2. Estados Modal Alterar PIN
  const [pinAtualTroca, setPinAtualTroca] = useState('');
  const [novoPinTroca, setNovoPinTroca] = useState('');
  const [confirmarNovoPinTroca, setConfirmarNovoPinTroca] = useState('');

  // 3. Estados Extrato e Dependentes
  const [extratoLista, setExtratoLista] = useState<any[]>([]);
  const [dependentesLista, setDependentesLista] = useState<any[]>([]);

  // 4. Estados Cadastro de Dependente (Mínimo 12 anos)
  const [depNome, setDepNome] = useState('');
  const [depCpf, setDepCpf] = useState('');
  const [depNascimento, setDepNascimento] = useState('');
  const [depPin, setDepPin] = useState('');
  const [depSelfieBase64, setDepSelfieBase64] = useState<string | null>(null);
  const [aceiteLgpdDependente, setAceiteLgpdDependente] = useState(false);

  // 5. Estados Recarga Pix Dependente (Com trava de PIN para ações financeiras)
  const [dependenteSelecionado, setDependenteSelecionado] = useState<any>(null);
  const [valorPix, setValorPix] = useState('20.00');
  const [pixCopiaECola, setPixCopiaECola] = useState('');
  const [pinConfirmacaoPix, setPinConfirmacaoPix] = useState('');

  // 6. Estados Mural / Classificados
  const [subAbaMural, setSubAbaMural] = useState<'avisos' | 'classificados'>('avisos');

  // Restaura o login salvo no navegador ao abrir ou apertar F5
  useEffect(() => {
    restaurarSessaoSalva();
    return () => pararAnaliseCamera();
  }, []);

  useEffect(() => {
    if (aba === 'cadastro' && unidades.length === 0) {
      carregarUnidades();
    }
    if (aba === 'painel' && usuarioLogado?.perfil_id) {
      carregarDadosDashboard();
    }
  }, [aba, usuarioLogado?.perfil_id]);

  // =========================================================================
  // MOTOR DE ANÁLISE BIOMÉTRICA REAL (ENQUADRAMENTO OVAL + LUZ + DETALHES)
  // =========================================================================
 async function analisarFrameDeVideo(video: HTMLVideoElement): Promise<StatusQualidadeFoto> {
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

    // Recorte central 1:1 idêntico à captura final
    const menorLado = Math.min(video.videoWidth, video.videoHeight);
    const sx = (video.videoWidth - menorLado) / 2;
    const sy = (video.videoHeight - menorLado) / 2;
    ctx.drawImage(video, sx, sy, menorLado, menorLado, 0, 0, tamanho, tamanho);

    const imgData = ctx.getImageData(0, 0, tamanho, tamanho).data;
    const brilhoMatriz = new Float32Array(tamanho * tamanho);
    const peleMatriz = new Uint8Array(tamanho * tamanho);

    // Guia oval visual na tela (centro 50%, raios 26% x 35% -> topo em y=15%, base em y=85%)
    const cx = tamanho * 0.5;
    const cy = tamanho * 0.5;
    const rx = tamanho * 0.26;
    const ry = tamanho * 0.35;

    let somaBrilhoOval = 0;
    let pixelsDentroOval = 0;

    // Faixas verticais dentro do eixo central do rosto (x entre 36% e 64%)
    let peleFaixaTopoTesta = 0, totalFaixaTopoTesta = 0; // y: 20% a 34% (testa alta)
    let peleFaixaOlhos = 0, totalFaixaOlhos = 0;         // y: 36% a 50% (olhos/nariz)
    let peleFaixaBocaQueixo = 0, totalFaixaBocaQueixo = 0; // y: 54% a 74% (boca/queixo)
    let peleAbaixoQueixo = 0, totalAbaixoQueixo = 0;     // y: 80% a 90% (onde deve ser camisa/pescoço, não boca)
    let peleForaOval = 0, totalForaOval = 0;

    let somaX = 0;
    let somaY = 0;
    let totalPeleRosto = 0;

    for (let y = 0; y < tamanho; y++) {
      for (let x = 0; x < tamanho; x++) {
        const idx = (y * tamanho + x) * 4;
        const r = imgData[idx];
        const g = imgData[idx + 1];
        const b = imgData[idx + 2];

        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        brilhoMatriz[y * tamanho + x] = lum;

        // Detecção restrita de pele facial (evita camisa azul, parede bege e madeira)
        const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
        const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
        const ehPele =
          r > 70 &&
          g > 40 &&
          b > 25 &&
          r > g + 8 &&
          r > b + 15 &&
          cr >= 136 &&
          cr <= 174 &&
          cb >= 80 &&
          cb <= 124;

        peleMatriz[y * tamanho + x] = ehPele ? 1 : 0;

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

        // Análise em faixas horizontais no miolo do oval (x: 36% a 64%)
        if (x >= tamanho * 0.36 && x <= tamanho * 0.64) {
          if (y >= tamanho * 0.20 && y < tamanho * 0.34) {
            totalFaixaTopoTesta++;
            if (ehPele) peleFaixaTopoTesta++;
          } else if (y >= tamanho * 0.36 && y < tamanho * 0.50) {
            totalFaixaOlhos++;
            if (ehPele) peleFaixaOlhos++;
          } else if (y >= tamanho * 0.54 && y <= tamanho * 0.74) {
            totalFaixaBocaQueixo++;
            if (ehPele) peleFaixaBocaQueixo++;
          } else if (y >= tamanho * 0.80 && y <= tamanho * 0.90) {
            totalAbaixoQueixo++;
            if (ehPele) peleAbaixoQueixo++;
          }
        }

        // Centro de gravidade apenas na área do oval expandido (y entre 15% e 80%)
        if (ehPele && y >= tamanho * 0.15 && y <= tamanho * 0.80 && x >= tamanho * 0.22 && x <= tamanho * 0.78) {
          somaX += x;
          somaY += y;
          totalPeleRosto++;
        }
      }
    }

    const mediaBrilho = somaBrilhoOval / Math.max(1, pixelsDentroOval);

    // 1. Checagem de Iluminação
    if (mediaBrilho < 55) {
      return {
        aprovada: false,
        luzOk: false,
        detalhesOk: false,
        enquadramentoOk: false,
        mensagem: 'Pouca luz! Vá para um local mais iluminado.',
      };
    }
    if (mediaBrilho > 238) {
      return {
        aprovada: false,
        luzOk: false,
        detalhesOk: false,
        enquadramentoOk: false,
        mensagem: 'Excesso de luz atrás de você. Evite ficar contra janela/lâmpada.',
      };
    }

    // 2. Nitidez (Laplaciano) na região central dos olhos/nariz
    let contrasteOval = 0;
    let countContraste = 0;
    for (let y = 2; y < tamanho - 2; y++) {
      for (let x = 2; x < tamanho - 2; x++) {
        const normX = (x - cx) / rx;
        const normY = (y - cy) / ry;
        if (normX * normX + normY * normY <= 0.75) {
          const pos = y * tamanho + x;
          const lap = Math.abs(
            4 * brilhoMatriz[pos] -
              brilhoMatriz[pos - 1] -
              brilhoMatriz[pos + 1] -
              brilhoMatriz[pos - tamanho] -
              brilhoMatriz[pos + tamanho]
          );
          contrasteOval += lap;
          countContraste++;
        }
      }
    }
    const nitidezMedia = contrasteOval / Math.max(1, countContraste);

    // 3. Procura a linha exata dos olhos (faixa horizontal mais escura entre pele da testa e bochecha)
    let melhorLinhaOlhos = -1;
    let maiorContrasteOcular = 0;
    for (let y = Math.floor(tamanho * 0.32); y <= Math.floor(tamanho * 0.62); y++) {
      let lumAcima = 0, lumLinha = 0, lumAbaixo = 0, count = 0;
      for (let x = Math.floor(tamanho * 0.36); x <= Math.floor(tamanho * 0.64); x++) {
        lumAcima += brilhoMatriz[(y - 8) * tamanho + x];
        lumLinha += brilhoMatriz[y * tamanho + x];
        lumAbaixo += brilhoMatriz[(y + 8) * tamanho + x];
        count++;
      }
      const mediaAcima = lumAcima / count;
      const mediaLinha = lumLinha / count;
      const mediaAbaixo = lumAbaixo / count;
      const valeEscuro = Math.min(mediaAcima - mediaLinha, mediaAbaixo - mediaLinha);
      if (valeEscuro > maiorContrasteOcular) {
        maiorContrasteOcular = valeEscuro;
        melhorLinhaOlhos = y;
      }
    }

    const taxaTopoTesta = peleFaixaTopoTesta / Math.max(1, totalFaixaTopoTesta);
    const taxaOlhos = peleFaixaOlhos / Math.max(1, totalFaixaOlhos);
    const taxaBocaQueixo = peleFaixaBocaQueixo / Math.max(1, totalFaixaBocaQueixo);
    const taxaAbaixoQueixo = peleAbaixoQueixo / Math.max(1, totalAbaixoQueixo);
    const taxaFora = peleForaOval / Math.max(1, totalForaOval);

    const centroX = totalPeleRosto > 0 ? somaX / totalPeleRosto : 0;
    const linhaOlhosNorm = melhorLinhaOlhos / tamanho;

    let enquadramentoOk = false;
    let motivo = 'Posicione o rosto dentro da moldura oval.';

    if (totalPeleRosto < tamanho * tamanho * 0.06) {
      motivo = 'Nenhum rosto centralizado. Olhe de frente para a câmera.';
    } else if (taxaTopoTesta < 0.38) {
      // Na image_fef6c8.jpg o cabelo começa só em ~30%, deixando y=20..34% sem testa -> bloqueia!
      motivo = 'Rosto muito baixo! Suba o celular para preencher a parte superior do oval.';
    } else if (melhorLinhaOlhos !== -1 && maiorContrasteOcular > 6 && linhaOlhosNorm > 0.51) {
      // Olhos abaixo da metade do oval -> bloqueia!
      motivo = 'Alinhe os olhos mais para o meio da moldura oval (suba um pouco o celular).';
    } else if (melhorLinhaOlhos !== -1 && maiorContrasteOcular > 6 && linhaOlhosNorm < 0.36) {
      motivo = 'Rosto muito alto! Abaixe um pouco o celular.';
    } else if (taxaOlhos < 0.45 || taxaBocaQueixo < 0.45) {
      motivo = 'Centralize o rosto inteiro dentro da guia pontilhada.';
    } else if (taxaFora > 0.22 || taxaAbaixoQueixo > 0.48) {
      // Queixo vazando na borda inferior (como na image_fef6c8.jpg) -> bloqueia!
      motivo = 'Rosto muito perto ou queixo cortado embaixo. Afaste um pouco o celular.';
    } else if (Math.abs(centroX - cx) > tamanho * 0.09) {
      motivo = 'Centralize o rosto horizontalmente na guia oval.';
    } else {
      enquadramentoOk = true;
    }

    if (!enquadramentoOk) {
      return {
        aprovada: false,
        luzOk: true,
        detalhesOk: nitidezMedia >= 6.5,
        enquadramentoOk: false,
        mensagem: motivo,
      };
    }

    if (nitidezMedia < 6.5) {
      return {
        aprovada: false,
        luzOk: true,
        detalhesOk: false,
        enquadramentoOk: true,
        mensagem: 'Foto sem nitidez (borrada). Mantenha o celular firme.',
      };
    }

    return {
      aprovada: true,
      luzOk: true,
      detalhesOk: true,
      enquadramentoOk: true,
      mensagem: '✅ Rosto enquadrado e iluminação ótima! Pode capturar.',
    };
  }

  function iniciarMonitoramentoQualidade() {
    pararAnaliseCamera();
    intervaloAnaliseRef.current = setInterval(async () => {
      if (videoRef.current) {
        const status = await analisarFrameDeVideo(videoRef.current);
        setQualidadeCamera(status);
      }
    }, 350);
  }

  function pararAnaliseCamera() {
    if (intervaloAnaliseRef.current) {
      clearInterval(intervaloAnaliseRef.current);
      intervaloAnaliseRef.current = null;
    }
  }

  // =========================================================================
  // FUNÇÕES DE STORAGE PRIVADO E SESSÃO (CONFORMIDADE LGPD + CACHE RÁPIDO)
  // =========================================================================
  async function gerarUrlTemporariaSelfie(caminhoOuBase64: string | null): Promise<string | null> {
    if (!caminhoOuBase64) return null;

    if (caminhoOuBase64.startsWith('data:image')) {
      return caminhoOuBase64;
    }

    const chaveCache = `vm_selfie_cache_${caminhoOuBase64}`;
    try {
      const salvo = sessionStorage.getItem(chaveCache);
      if (salvo) {
        const { url, expiraEm } = JSON.parse(salvo);
        if (url && expiraEm && Date.now() < expiraEm) {
          return url;
        }
      }
    } catch {
      // Ignora erro de sessionStorage
    }

    const { data, error } = await supabase.storage
      .from('selfies')
      .createSignedUrl(caminhoOuBase64, 600);

    if (error || !data?.signedUrl) return null;

    try {
      sessionStorage.setItem(
        chaveCache,
        JSON.stringify({ url: data.signedUrl, expiraEm: Date.now() + 8 * 60 * 1000 })
      );
    } catch {
      // Ignora erro de sessionStorage
    }

    return data.signedUrl;
  }

  async function enviarSelfieParaStoragePrivado(fotoBase64: string, perfilIdAlvo: string): Promise<string> {
    const resposta = await fetch(fotoBase64);
    const blob = await resposta.blob();
    const caminhoArquivo = `${perfilIdAlvo}/facial_${Date.now()}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from('selfies')
      .upload(caminhoArquivo, blob, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    return caminhoArquivo;
  }

  function salvarSessaoNoNavegador(dadosUsuario: any) {
    try {
      const sessao = {
        usuario: dadosUsuario,
        expiraEm: Date.now() + TEMPO_SESSAO_MS,
      };
      localStorage.setItem(CHAVE_STORAGE, JSON.stringify(sessao));
    } catch {
      // Ignora erro de storage
    }
  }

  function limparSessaoDoNavegador() {
    try {
      localStorage.removeItem(CHAVE_STORAGE);
    } catch {
      // Ignora erro de storage
    }
  }

  function restaurarSessaoSalva() {
    try {
      const salvo = localStorage.getItem(CHAVE_STORAGE);
      if (salvo) {
        const sessao = JSON.parse(salvo);
        if (sessao?.usuario && sessao?.expiraEm && Date.now() < sessao.expiraEm) {
          setUsuarioLogado(sessao.usuario);
          setAba('painel');
          setAbaInferior('inicio');
        } else {
          localStorage.removeItem(CHAVE_STORAGE);
        }
      }
    } catch {
      // Ignora erro caso o JSON salvo esteja corrompido
    } finally {
      setVerificandoSessao(false);
    }
  }

  async function carregarUnidades() {
    const { data: conds } = await supabase.from('condominios').select('id').limit(1);
    if (conds && conds.length > 0) setCondominioId(conds[0].id);

    const { data } = await supabase
      .from('unidades')
      .select('*')
      .eq('ativo', true)
      .order('identificador', { ascending: true });
    if (data) {
      setUnidades(data);
      const primeira = data.find((u) => u.tipo === 'bloco');
      if (primeira) setUnidadeId(primeira.id);
    }
  }

  async function carregarDadosDashboard() {
    if (!usuarioLogado?.perfil_id) return;

    // Dispara carregamento imediato da selfie caso já exista caminho na sessão
    if (usuarioLogado?.selfie_url && !selfieTemporariaUrl) {
      gerarUrlTemporariaSelfie(usuarioLogado.selfie_url).then((url) => {
        if (url) setSelfieTemporariaUrl(url);
      });
    }

    // Busca perfil e dependentes em paralelo
    const [resPerfil, resDeps] = await Promise.all([
      supabase
        .from('perfis')
        .select('id, condominio_id, unidade_id, complemento_apto, unidade_formatada, nome_completo, cpf, role, selfie_url, status_facial, status_cadastro, saldo_cashback, saldo_pre_pago')
        .eq('id', usuarioLogado.perfil_id)
        .single(),
      supabase
        .from('perfis')
        .select('id, nome_completo, cpf, role, selfie_url, status_facial, saldo_pre_pago, criado_em')
        .eq('titular_id', usuarioLogado.perfil_id)
        .order('criado_em', { ascending: true }),
    ]);

    const perfil = resPerfil.data;
    if (perfil) {
      setPerfilDetalhes(perfil);

      if (perfil.selfie_url) {
        const urlSegura = await gerarUrlTemporariaSelfie(perfil.selfie_url);
        if (urlSegura) {
          setSelfieTemporariaUrl(urlSegura);
        }
      } else {
        setSelfieTemporariaUrl(null);
      }

      if (perfil.role === 'titular' || perfil.role === 'admin') {
        setDependentesLista(resDeps.data || []);
      }
    } else if (usuarioLogado?.selfie_url) {
      const urlSegura = await gerarUrlTemporariaSelfie(usuarioLogado.selfie_url);
      if (urlSegura) {
        setSelfieTemporariaUrl(urlSegura);
      }
    }
  }

  async function fazerLogin(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    setMensagem(null);

    const cpfLimpo = cpf.replace(/\D/g, '');
    const { data, error } = await supabase.rpc('validar_cpf_pin', {
      p_cpf: cpfLimpo,
      p_pin: pin,
    });

    setCarregando(false);
    if (error) {
      setMensagem({ tipo: 'erro', texto: error.message });
      return;
    }

    if (data?.sucesso) {
      setUsuarioLogado(data);
      salvarSessaoNoNavegador(data);
      setAba('painel');
      setAbaInferior('inicio');
    } else {
      setMensagem({ tipo: 'erro', texto: data?.mensagem || 'Erro ao validar acesso.' });
    }
  }

  async function realizarCadastro(e: React.FormEvent) {
    e.preventDefault();
    if (!aceiteLgpdTitular) {
      setMensagem({
        tipo: 'erro',
        texto: 'Você precisa concordar com o Termo de Privacidade e Uso de Dados (LGPD) para continuar.',
      });
      return;
    }

    setCarregando(true);
    setMensagem(null);

    const cpfLimpo = cpf.replace(/\D/g, '');
    const waLimpo = whatsapp.replace(/\D/g, '');
    const emailTecnico = `user_${cpfLimpo}@vilamarket.com.br`;
    const senhaAuth = `VM#${pin}#${cpfLimpo.slice(-4)}`;

    const unidadeObj = unidades.find((u) => u.id === unidadeId);
    const formatada =
      tipoUnidade === 'bloco'
        ? `${ruaSelecionada} - Bloco ${unidadeObj?.identificador || ''} - Apto ${complementoApto}`
        : `${ruaSelecionada} - Casa ${unidadeObj?.identificador || ''}`;

    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: emailTecnico,
      password: senhaAuth,
    });

    if (authErr || !authData.user) {
      setCarregando(false);
      setMensagem({ tipo: 'erro', texto: authErr?.message || 'Erro ao criar credencial.' });
      return;
    }

    const { error: perfilErr } = await supabase.from('perfis').insert({
      id: authData.user.id,
      condominio_id: condominioId,
      unidade_id: unidadeId,
      complemento_apto: tipoUnidade === 'bloco' ? complementoApto : null,
      unidade_formatada: formatada,
      nome_completo: nome,
      cpf: cpfLimpo,
      data_nascimento: dataNasc,
      whatsapp: waLimpo,
      role: 'titular',
      pin_hash: 'temp',
    });

    if (perfilErr) {
      setCarregando(false);
      setMensagem({ tipo: 'erro', texto: perfilErr.message });
      return;
    }

    const { error: pinErr } = await supabase.rpc('definir_pin_usuario', {
      p_perfil_id: authData.user.id,
      p_pin_aberto: pin,
    });

    setCarregando(false);
    if (pinErr) {
      setMensagem({ tipo: 'erro', texto: pinErr.message });
      return;
    }

    setMensagem({
      tipo: 'sucesso',
      texto: 'Cadastro criado! Digite o código de 6 dígitos enviado para o seu WhatsApp.',
    });
    setAba('confirmar_wa');
  }

  async function confirmarCodigoCadastro(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    setMensagem(null);

    const cpfLimpo = cpf.replace(/\D/g, '');

    const { data, error } = await supabase.rpc('confirmar_cadastro_whatsapp', {
      p_cpf: cpfLimpo,
      p_codigo: codigoWa,
    });

    if (error || !data?.sucesso) {
      setCarregando(false);
      setMensagem({ tipo: 'erro', texto: error?.message || data?.mensagem });
      return;
    }

    const { data: loginData, error: loginError } = await supabase.rpc('validar_cpf_pin', {
      p_cpf: cpfLimpo,
      p_pin: pin,
    });

    setCarregando(false);

    if (loginError || !loginData?.sucesso) {
      setMensagem({ tipo: 'sucesso', texto: data.mensagem });
      setAba('login');
      return;
    }

    setUsuarioLogado(loginData);
    salvarSessaoNoNavegador(loginData);
    setMensagem(null);
    setAba('painel');
    setAbaInferior('inicio');
  }

  async function pedirCodigoResetPin() {
    setCarregando(true);
    setMensagem(null);
    const { data, error } = await supabase.rpc('solicitar_reset_pin_whatsapp', {
      p_cpf: cpf.replace(/\D/g, ''),
    });
    setCarregando(false);
    if (error || !data?.sucesso) {
      setMensagem({ tipo: 'erro', texto: error?.message || data?.mensagem });
    } else {
      setMensagem({ tipo: 'sucesso', texto: data.mensagem });
    }
  }

  async function salvarNovoPinWhatsApp(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    setMensagem(null);
    const { data, error } = await supabase.rpc('confirmar_reset_pin_whatsapp', {
      p_cpf: cpf.replace(/\D/g, ''),
      p_codigo: codigoWa,
      p_novo_pin: novoPin,
    });
    setCarregando(false);
    if (error || !data?.sucesso) {
      setMensagem({ tipo: 'erro', texto: error?.message || data?.mensagem });
    } else {
      setMensagem({ tipo: 'sucesso', texto: data.mensagem });
      setAba('login');
    }
  }

  // =========================================================================
  // FUNÇÕES DA DASHBOARD (SELFIE COM SALVAMENTO GARANTIDO VIA RPC)
  // =========================================================================
  async function iniciarCameraSelfie() {
    setFotoCapturada(null);
    setModoTrocaSelfie(true);
    setQualidadeCamera({
      aprovada: false,
      luzOk: false,
      detalhesOk: false,
      enquadramentoOk: false,
      mensagem: 'Iniciando câmera e analisando luz...',
    });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 480, height: 480 },
      });
      setStreamCamera(stream);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          iniciarMonitoramentoQualidade();
        }
      }, 150);
    } catch {
      alert('Permita o acesso à câmera frontal do navegador para tirar a sua selfie.');
    }
  }

  async function abrirModalSelfie() {
    setFotoCapturada(null);
    setModalAtivo('selfie');

    if (perfilDetalhes?.selfie_url || usuarioLogado?.selfie_url) {
      setModoTrocaSelfie(false);
      const caminho = perfilDetalhes?.selfie_url || usuarioLogado?.selfie_url;
      if (!selfieTemporariaUrl && caminho) {
        const url = await gerarUrlTemporariaSelfie(caminho);
        setSelfieTemporariaUrl(url);
      }
    } else {
      iniciarCameraSelfie();
    }
  }

  function fecharCamera() {
    pararAnaliseCamera();
    if (streamCamera) {
      streamCamera.getTracks().forEach((track) => track.stop());
      setStreamCamera(null);
    }
  }

  async function capturarFrameSelfie(paraDependente = false) {
    if (!videoRef.current) return;

    const checagemFinal = await analisarFrameDeVideo(videoRef.current);
    setQualidadeCamera(checagemFinal);

    if (!checagemFinal.aprovada) {
      alert(`Foto não aceita: ${checagemFinal.mensagem}`);
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const menorLado = Math.min(videoRef.current.videoWidth, videoRef.current.videoHeight);
      const sx = (videoRef.current.videoWidth - menorLado) / 2;
      const sy = (videoRef.current.videoHeight - menorLado) / 2;
      ctx.drawImage(videoRef.current, sx, sy, menorLado, menorLado, 0, 0, 400, 400);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
      if (paraDependente) {
        setDepSelfieBase64(dataUrl);
      } else {
        setFotoCapturada(dataUrl);
      }
      fecharCamera();
    }
  }

  async function salvarSelfieMorador() {
    if (!fotoCapturada || !usuarioLogado?.perfil_id) return;
    setCarregando(true);

    try {
      const caminhoPrivado = await enviarSelfieParaStoragePrivado(
        fotoCapturada,
        usuarioLogado.perfil_id
      );

      const { data: rpcRes, error: rpcErr } = await supabase.rpc('atualizar_selfie_usuario', {
        p_perfil_id: usuarioLogado.perfil_id,
        p_caminho_selfie: caminhoPrivado,
      });

      if (rpcErr || !rpcRes?.sucesso) {
        throw new Error(rpcErr?.message || rpcRes?.mensagem || 'Falha ao vincular foto no perfil.');
      }

      setSelfieTemporariaUrl(fotoCapturada);
      setPerfilDetalhes((prev: any) => ({
        ...(prev || {}),
        selfie_url: caminhoPrivado,
        status_facial: 'ativo',
      }));

      const usuarioAtualizado = {
        ...usuarioLogado,
        selfie_url: caminhoPrivado,
        status_facial: 'ativo',
      };
      setUsuarioLogado(usuarioAtualizado);
      salvarSessaoNoNavegador(usuarioAtualizado);

      setFotoCapturada(null);
      setModoTrocaSelfie(false);
      setModalAtivo(null);
      setMensagem({
        tipo: 'sucesso',
        texto: '✅ Selfie salva e sincronizada! Seu acesso facial na porta já está ativo.',
      });

      carregarDadosDashboard();
    } catch (err: any) {
      alert('Erro ao salvar selfie: ' + (err.message || 'Tente novamente.'));
    } finally {
      setCarregando(false);
    }
  }

  async function salvarTrocaPinLogado(e: React.FormEvent) {
    e.preventDefault();
    if (novoPinTroca.length !== 4 || novoPinTroca !== confirmarNovoPinTroca) {
      alert('O novo PIN deve ter 4 dígitos e coincidir na confirmação.');
      return;
    }
    setCarregando(true);
    const { data, error } = await supabase.rpc('alterar_pin_usuario', {
      p_perfil_id: usuarioLogado.perfil_id,
      p_pin_atual: pinAtualTroca,
      p_novo_pin: novoPinTroca,
    });
    setCarregando(false);

    if (error || !data?.sucesso) {
      alert(error?.message || data?.mensagem || 'Erro ao alterar PIN.');
      return;
    }

    alert(data.mensagem);
    setPinAtualTroca('');
    setNovoPinTroca('');
    setConfirmarNovoPinTroca('');
    setModalAtivo(null);
  }

  async function abrirModalExtrato() {
    setModalAtivo('extrato');
    const idsFamilia = [usuarioLogado.perfil_id, ...dependentesLista.map((d) => d.id)];
    const { data } = await supabase
      .from('transacoes_carteira')
      .select('*')
      .in('perfil_id', idsFamilia)
      .order('criado_em', { ascending: false })
      .limit(30);
    setExtratoLista(data || []);
  }

  function calcularIdade(dataNascStr: string) {
    const hoje = new Date();
    const nasc = new Date(dataNascStr);
    let idade = hoje.getFullYear() - nasc.getFullYear();
    const m = hoje.getMonth() - nasc.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
    return idade;
  }

  async function cadastrarDependente(e: React.FormEvent) {
    e.preventDefault();
    const idade = calcularIdade(depNascimento);
    if (idade < 12) {
      alert('A idade mínima para cadastro de dependente é de 12 anos.');
      return;
    }
    if (!depSelfieBase64) {
      alert('Tire a selfie do dependente com boa iluminação para liberar o acesso facial na porta.');
      return;
    }
    if (!aceiteLgpdDependente) {
      alert(
        'Por exigência da LGPD (Art. 14), confirme o consentimento parental para o uso da imagem facial do dependente.'
      );
      return;
    }
    if (depPin.length !== 4) {
      alert('O PIN do dependente deve ter 4 dígitos.');
      return;
    }

    setCarregando(true);
    try {
      const cpfDepLimpo = depCpf.replace(/\D/g, '');
      const emailTecnicoDep = `user_${cpfDepLimpo}@vilamarket.com.br`;
      const senhaAuthDep = `VM#${depPin}#${cpfDepLimpo.slice(-4)}`;

      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: emailTecnicoDep,
        password: senhaAuthDep,
      });

      if (authErr || !authData.user) {
        throw new Error(authErr?.message || 'CPF já cadastrado');
      }

      const caminhoSelfieDep = await enviarSelfieParaStoragePrivado(
        depSelfieBase64,
        authData.user.id
      );

      const { error: insertErr } = await supabase.from('perfis').insert({
        id: authData.user.id,
        condominio_id: perfilDetalhes?.condominio_id || condominioId,
        unidade_id: perfilDetalhes?.unidade_id,
        complemento_apto: perfilDetalhes?.complemento_apto,
        unidade_formatada:
          perfilDetalhes?.unidade_formatada || usuarioLogado.unidade_formatada || usuarioLogado.unidade,
        titular_id: usuarioLogado.perfil_id,
        nome_completo: depNome,
        cpf: cpfDepLimpo,
        data_nascimento: depNascimento,
        role: 'dependente',
        selfie_url: caminhoSelfieDep,
        pin_hash: 'temp',
        status_cadastro: 'aprovado',
        status_facial: 'ativo',
      });

      if (insertErr) throw new Error(insertErr.message);

      await supabase.rpc('definir_pin_usuario', {
        p_perfil_id: authData.user.id,
        p_pin_aberto: depPin,
      });

      setDepNome('');
      setDepCpf('');
      setDepNascimento('');
      setDepPin('');
      setDepSelfieBase64(null);
      setAceiteLgpdDependente(false);
      fecharCamera();
      setModalAtivo(null);
      await carregarDadosDashboard();
      alert('Dependente cadastrado com sucesso e protegido pela LGPD!');
    } catch (err: any) {
      alert('Erro ao cadastrar dependente: ' + (err.message || 'Tente novamente.'));
    } finally {
      setCarregando(false);
    }
  }

  function abrirModalPixDependente(dep: any) {
    setDependenteSelecionado(dep);
    setValorPix('20.00');
    setPinConfirmacaoPix('');
    setPixCopiaECola(
      `00020126580014BR.GOV.BCB.PIX0136vilamarket-pix-${dep.cpf}520400005303986540520.005802BR5910VILAMARKET6008CURITIBA62070503***6304ABCD`
    );
    setModalAtivo('pix_dependente');
  }

  async function confirmarRecargaPixDependente() {
    if (!dependenteSelecionado) return;
    if (pinConfirmacaoPix.length !== 4) {
      alert('Por segurança, digite o SEU PIN de 4 dígitos para confirmar esta operação.');
      return;
    }

    setCarregando(true);

    const cpfTitularLimpo = (perfilDetalhes?.cpf || cpf || '').replace(/\D/g, '');
    const { data: checkPin, error: errPin } = await supabase.rpc('validar_cpf_pin', {
      p_cpf: cpfTitularLimpo,
      p_pin: pinConfirmacaoPix,
    });

    if (errPin || !checkPin?.sucesso) {
      setCarregando(false);
      alert(checkPin?.mensagem || 'PIN de segurança incorreto.');
      return;
    }

    const { data, error } = await supabase.rpc('adicionar_saldo_pix', {
      p_perfil_id: dependenteSelecionado.id,
      p_valor: parseFloat(valorPix),
    });
    setCarregando(false);

    if (error || !data?.sucesso) {
      alert(error?.message || data?.mensagem || 'Erro ao creditar saldo.');
      return;
    }

    await carregarDadosDashboard();
    setPinConfirmacaoPix('');
    setModalAtivo(null);
    alert(data.mensagem);
  }

  async function solicitarExclusaoDadosLgpd() {
    const confirmou = window.confirm(
      'Deseja solicitar a exclusão dos seus dados biométricos (selfie) e encerramento da conta conforme a LGPD? O leitor facial da porta será bloqueado imediatamente.'
    );
    if (!confirmou || !usuarioLogado?.perfil_id) return;

    setCarregando(true);
    try {
      const caminho = perfilDetalhes?.selfie_url || usuarioLogado?.selfie_url;
      if (caminho && !caminho.startsWith('data:image')) {
        await supabase.storage.from('selfies').remove([caminho]);
      }

      await supabase
        .from('perfis')
        .update({
          selfie_url: null,
          status_facial: 'bloqueado',
          status_cadastro: 'bloqueado',
        })
        .eq('id', usuarioLogado.perfil_id);

      alert('Seus dados biométricos foram removidos e seu acesso foi encerrado conforme a LGPD.');
      limparSessaoDoNavegador();
      setUsuarioLogado(null);
      setPin('');
      setAba('login');
    } catch {
      alert('Não foi possível processar automaticamente. Contate a administração da Vila.');
    } finally {
      setCarregando(false);
    }
  }

  const unidadesFiltradas = unidades.filter((u) => u.tipo === tipoUnidade);
  const temSelfie = Boolean(perfilDetalhes?.selfie_url || usuarioLogado?.selfie_url || selfieTemporariaUrl);
  const roleUsuario = perfilDetalhes?.role || usuarioLogado?.role || 'titular';

  if (verificandoSessao) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-sm font-semibold text-floresta animate-pulse">Carregando VilaMarket...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 pb-24 bg-gray-100">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-200">
        {/* Cabeçalho Verde-Floresta */}
        <div className="bg-floresta p-6 text-white text-center">
          <h1 className="text-2xl font-bold tracking-tight">VilaMarket</h1>
          <p className="text-xs text-emerald-200 mt-1">
            Minimercado Autônomo • Vila Militar do Bacacheri
          </p>
        </div>

        <div className="p-6">
          {mensagem && (
            <div
              className={`mb-4 p-3 rounded-lg text-sm font-medium ${
                mensagem.tipo === 'erro'
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}
            >
              {mensagem.texto}
            </div>
          )}

          {/* ABA 1: LOGIN UNIFICADO (CPF + PIN) */}
          {aba === 'login' && (
            <form onSubmit={fazerLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-gray-600 mb-1">
                  CPF do Morador ou Dependente
                </label>
                <input
                  type="text"
                  required
                  placeholder="Apenas números (11 dígitos)"
                  value={cpf}
                  onChange={(e) => setCpf(e.target.value)}
                  className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-floresta outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-gray-600 mb-1">
                  PIN Secreto (4 dígitos)
                </label>
                <input
                  type="password"
                  maxLength={4}
                  required
                  placeholder="••••"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="w-full p-3 border rounded-xl text-center text-2xl tracking-widest focus:ring-2 focus:ring-floresta outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={carregando}
                className="w-full bg-floresta hover:bg-floresta-claro text-white font-bold py-3 rounded-xl transition"
              >
                {carregando ? 'Verificando...' : 'Entrar no VilaMarket'}
              </button>

              <p className="text-[11px] text-center text-gray-400">
                Seu acesso permanece conectado neste dispositivo por 7 dias.
              </p>

              <div className="flex justify-between text-xs pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setAba('cadastro')}
                  className="text-floresta font-bold hover:underline"
                >
                  Criar Cadastro de Morador
                </button>
                <button
                  type="button"
                  onClick={() => setAba('esqueci_pin')}
                  className="text-ambar font-semibold hover:underline"
                >
                  Esqueci meu PIN
                </button>
              </div>
            </form>
          )}

          {/* ABA 2: CADASTRO COM AS 3 RUAS DA VILA MILITAR + TERMO LGPD */}
          {aba === 'cadastro' && (
            <form onSubmit={realizarCadastro} className="space-y-3">
              <h2 className="font-bold text-lg text-grafite">Novo Cadastro na Vila</h2>

              <input
                type="text"
                required
                placeholder="Nome Completo"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full p-2.5 border rounded-xl text-sm"
              />

              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="CPF (11 números)"
                  value={cpf}
                  onChange={(e) => setCpf(e.target.value)}
                  className="w-full p-2.5 border rounded-xl text-sm"
                />
                <input
                  type="text"
                  required
                  placeholder="WhatsApp (DDD+Número)"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  className="w-full p-2.5 border rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Data de Nascimento</label>
                <input
                  type="date"
                  required
                  value={dataNasc}
                  onChange={(e) => setDataNasc(e.target.value)}
                  className="w-full p-2.5 border rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">
                  Rua da Vila Militar
                </label>
                <select
                  value={ruaSelecionada}
                  onChange={(e) => setRuaSelecionada(e.target.value)}
                  className="w-full p-2.5 border rounded-xl text-sm bg-white"
                >
                  <option value="Rua Sargento Lafayette">Rua Sargento Lafayette</option>
                  <option value="Rua Sargento Erwin">Rua Sargento Erwin</option>
                  <option value="Rua Sargento Milano">Rua Sargento Milano</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setTipoUnidade('bloco')}
                  className={`py-2 rounded-lg text-xs font-bold border ${
                    tipoUnidade === 'bloco'
                      ? 'bg-floresta text-white border-floresta'
                      : 'bg-gray-50 text-gray-600'
                  }`}
                >
                  Bloco (01 a 40)
                </button>
                <button
                  type="button"
                  onClick={() => setTipoUnidade('casa')}
                  className={`py-2 rounded-lg text-xs font-bold border ${
                    tipoUnidade === 'casa'
                      ? 'bg-floresta text-white border-floresta'
                      : 'bg-gray-50 text-gray-600'
                  }`}
                >
                  Casa (2150 a 2200)
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={unidadeId}
                  onChange={(e) => setUnidadeId(e.target.value)}
                  className="w-full p-2.5 border rounded-xl text-sm bg-white"
                >
                  {unidadesFiltradas.map((u) => (
                    <option key={u.id} value={u.id}>
                      {tipoUnidade === 'bloco' ? `Bloco ${u.identificador}` : `Casa ${u.identificador}`}
                    </option>
                  ))}
                </select>

                {tipoUnidade === 'bloco' && (
                  <input
                    type="text"
                    required
                    placeholder="Nº Apto (ex: 102)"
                    value={complementoApto}
                    onChange={(e) => setComplementoApto(e.target.value)}
                    className="w-full p-2.5 border rounded-xl text-sm"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">
                  Crie seu PIN Secreto de 4 dígitos (Para App e Caixa)
                </label>
                <input
                  type="password"
                  maxLength={4}
                  required
                  placeholder="4 dígitos (não use 1234 ou data nasc.)"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="w-full p-2.5 border rounded-xl text-sm"
                />
              </div>

              {/* CONSENTIMENTO EXPLÍCITO LGPD */}
              <label className="flex items-start gap-2 bg-gray-50 p-2.5 rounded-xl border border-gray-200 text-[11px] text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={aceiteLgpdTitular}
                  onChange={(e) => setAceiteLgpdTitular(e.target.checked)}
                  className="mt-0.5 accent-floresta"
                />
                <span>
                  Li e concordo com o uso dos meus dados cadastrais e biométricos (selfie)
                  exclusivamente para controle de acesso à porta e gestão da carteira no{' '}
                  <strong>VilaMarket</strong>, sem compartilhamento com terceiros (LGPD).
                </span>
              </label>

              <button
                type="submit"
                disabled={carregando}
                className="w-full bg-floresta hover:bg-floresta-claro text-white font-bold py-3 rounded-xl transition"
              >
                {carregando ? 'Cadastrando...' : 'Receber Código no WhatsApp'}
              </button>

              <button
                type="button"
                onClick={() => setAba('login')}
                className="w-full text-xs text-gray-500 hover:underline pt-2"
              >
                Voltar para o Login
              </button>
            </form>
          )}

          {/* ABA 3: CONFIRMAR CÓDIGO DE 6 DÍGITOS DO WHATSAPP */}
          {aba === 'confirmar_wa' && (
            <form onSubmit={confirmarCodigoCadastro} className="space-y-4">
              <h2 className="font-bold text-lg">Confirme seu WhatsApp</h2>
              <p className="text-xs text-gray-600">
                Digite o código de 6 dígitos enviado para o seu WhatsApp para liberar a porta e a carteira automaticamente:
              </p>
              <input
                type="text"
                maxLength={6}
                required
                placeholder="000000"
                value={codigoWa}
                onChange={(e) => setCodigoWa(e.target.value)}
                className="w-full p-3 border rounded-xl text-center text-2xl tracking-widest"
              />
              <button
                type="submit"
                disabled={carregando}
                className="w-full bg-floresta text-white font-bold py-3 rounded-xl"
              >
                Ativar Meu Acesso Agora
              </button>
            </form>
          )}

          {/* ABA 4: ESQUECI MEU PIN (RESET VIA WHATSAPP) */}
          {aba === 'esqueci_pin' && (
            <form onSubmit={salvarNovoPinWhatsApp} className="space-y-3">
              <h2 className="font-bold text-lg">Recuperar PIN via WhatsApp</h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  placeholder="Digite seu CPF"
                  value={cpf}
                  onChange={(e) => setCpf(e.target.value)}
                  className="flex-1 p-2.5 border rounded-xl text-sm"
                />
                <button
                  type="button"
                  onClick={pedirCodigoResetPin}
                  className="bg-ambar text-white px-3 rounded-xl text-xs font-bold"
                >
                  Enviar Código
                </button>
              </div>
              <input
                type="text"
                maxLength={6}
                required
                placeholder="Código de 6 dígitos recebido no WhatsApp"
                value={codigoWa}
                onChange={(e) => setCodigoWa(e.target.value)}
                className="w-full p-2.5 border rounded-xl text-sm"
              />
              <input
                type="password"
                maxLength={4}
                required
                placeholder="Novo PIN de 4 dígitos"
                value={novoPin}
                onChange={(e) => setNovoPin(e.target.value)}
                className="w-full p-2.5 border rounded-xl text-sm"
              />
              <button
                type="submit"
                className="w-full bg-floresta text-white font-bold py-3 rounded-xl"
              >
                Salvar Novo PIN
              </button>
              <button
                type="button"
                onClick={() => setAba('login')}
                className="w-full text-xs text-gray-500 pt-1"
              >
                Voltar
              </button>
            </form>
          )}

          {/* ABA 5: PAINEL DO MORADOR LOGADO (LAYOUT CLEAN) */}
          {aba === 'painel' && usuarioLogado && (
            <div className="space-y-5">
              {/* SUB-ABA INÍCIO (CLEAN: MINIATURA CLICÁVEL + SALDOS + DEPENDENTES) */}
              {abaInferior === 'inicio' && (
                <>
                  {/* Card de Boas-Vindas Clean */}
                  {!temSelfie ? (
                    <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold uppercase text-amber-800">
                          ⚠️ Selfie Facial Pendente
                        </p>
                        <button
                          type="button"
                          onClick={abrirModalSelfie}
                          className="text-[11px] bg-floresta text-white px-2.5 py-1 rounded-lg font-bold shrink-0"
                        >
                          Enviar Selfie
                        </button>
                      </div>
                      <h2 className="text-lg font-bold text-grafite mt-1">
                        Olá, {usuarioLogado.nome_completo}
                      </h2>
                      <p className="text-xs text-gray-600">
                        {usuarioLogado.unidade_formatada || usuarioLogado.unidade}
                      </p>
                    </div>
                  ) : (
                    <div className="bg-emerald-50/70 border border-emerald-200 p-4 rounded-xl flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase text-emerald-800">
                          ✅ Acesso Facial Ativo
                        </p>
                        <h2 className="text-lg font-bold text-grafite truncate mt-0.5">
                          Olá, {usuarioLogado.nome_completo}
                        </h2>
                        <p className="text-xs text-gray-600 truncate">
                          {usuarioLogado.unidade_formatada || usuarioLogado.unidade}
                        </p>
                      </div>

                      {/* Miniatura clicável para ampliar e avaliar nitidez */}
                      <button
                        type="button"
                        onClick={abrirModalSelfie}
                        title="Toque para ampliar ou atualizar sua selfie"
                        className="flex flex-col items-center shrink-0 group"
                      >
                        {selfieTemporariaUrl ? (
                          <img
                            src={selfieTemporariaUrl}
                            alt="Sua selfie"
                            className="w-16 h-16 rounded-full object-cover border-2 border-emerald-600 shadow-md"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-full bg-emerald-100 border-2 border-emerald-600 flex items-center justify-center">
                            <span className="w-5 h-5 border-2 border-emerald-700 border-t-transparent rounded-full animate-spin" />
                          </div>
                        )}
                        <span className="text-[10px] text-emerald-800 font-semibold mt-1">
                          Ampliar
                        </span>
                      </button>
                    </div>
                  )}

                  {/* Cards de Saldo Cashback e Saldo Pré-Pago */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
                      <span className="text-xs font-bold text-ambar uppercase">
                        Saldo Cashback (2% Pix)
                      </span>
                      <p className="text-2xl font-extrabold text-grafite mt-1">
                        R${' '}
                        {Number(
                          perfilDetalhes?.saldo_cashback ?? usuarioLogado.saldo_cashback ?? 0
                        ).toFixed(2)}
                      </p>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl">
                      <span className="text-xs font-bold text-gray-600 uppercase">
                        Saldo Pré-Pago
                      </span>
                      <p className="text-2xl font-extrabold text-grafite mt-1">
                        R${' '}
                        {Number(
                          perfilDetalhes?.saldo_pre_pago ?? usuarioLogado.saldo_pre_pago ?? 0
                        ).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* Seção Meus Dependentes (Se titular ou admin) */}
                  {(roleUsuario === 'titular' || roleUsuario === 'admin') && (
                    <div className="pt-3 border-t border-gray-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold text-grafite">Meus Dependentes</h3>
                          <p className="text-[11px] text-gray-500">
                            Acesso facial e saldo individual (mín. 12 anos)
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setDepSelfieBase64(null);
                            setAceiteLgpdDependente(false);
                            setModalAtivo('novo_dependente');
                          }}
                          className="bg-floresta hover:bg-floresta-claro text-white text-xs font-bold px-3 py-2 rounded-xl transition"
                        >
                          + Adicionar
                        </button>
                      </div>

                      {dependentesLista.length === 0 ? (
                        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-3 text-center text-xs text-gray-500">
                          Nenhum dependente cadastrado na unidade.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {dependentesLista.map((dep) => (
                            <div
                              key={dep.id}
                              className="flex items-center justify-between bg-gray-50 border border-gray-200 p-3 rounded-xl"
                            >
                              <div>
                                <p className="text-sm font-bold text-grafite">
                                  {dep.nome_completo}
                                </p>
                                <p className="text-xs text-emerald-700 font-semibold">
                                  Saldo: R$ {Number(dep.saldo_pre_pago || 0).toFixed(2)}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => abrirModalPixDependente(dep)}
                                className="bg-ambar text-white text-xs font-bold px-3 py-2 rounded-xl transition"
                              >
                                Adicionar Saldo Pix
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* SUB-ABA MURAL / CLASSIFICADOS */}
              {abaInferior === 'mural' && (
                <div className="space-y-4">
                  <h2 className="text-lg font-bold text-grafite">Mural & Classificados da Vila</h2>
                  <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setSubAbaMural('avisos')}
                      className={`py-2 text-xs font-bold rounded-lg ${
                        subAbaMural === 'avisos' ? 'bg-floresta text-white' : 'text-gray-600'
                      }`}
                    >
                      Avisos Oficiais
                    </button>
                    <button
                      type="button"
                      onClick={() => setSubAbaMural('classificados')}
                      className={`py-2 text-xs font-bold rounded-lg ${
                        subAbaMural === 'classificados' ? 'bg-floresta text-white' : 'text-gray-600'
                      }`}
                    >
                      Classificados
                    </button>
                  </div>

                  {subAbaMural === 'avisos' ? (
                    <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl text-xs text-emerald-950 space-y-1">
                      <p className="font-bold text-sm">🎉 Bem-vindo ao VilaMarket!</p>
                      <p>
                        Compre no minimercado autônomo da Vila usando Pix e ganhe 2% de cashback
                        automático na sua carteira.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl text-xs text-gray-600 text-center">
                      Espaço aberto para moradores divulgarem produtos caseiros, encomendas e
                      serviços na Vila Militar.
                    </div>
                  )}
                </div>
              )}

              {/* SUB-ABA PERFIL / SAIR (COM SELFIE EM DESTAQUE, ALTERAR PIN E EXTRATO) */}
              {abaInferior === 'perfil' && (
                <div className="space-y-4">
                  <h2 className="text-lg font-bold text-grafite">Meu Perfil</h2>

                  {/* Cartão do Morador com Foto em Destaque */}
                  <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl flex items-center gap-3.5">
                    <button
                      type="button"
                      onClick={abrirModalSelfie}
                      className="relative shrink-0 group"
                      title="Toque para ampliar ou atualizar foto"
                    >
                      {temSelfie && selfieTemporariaUrl ? (
                        <img
                          src={selfieTemporariaUrl}
                          alt="Selfie do perfil"
                          className="w-16 h-16 rounded-full object-cover border-2 border-floresta shadow-sm group-hover:opacity-90 transition"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-amber-100 border-2 border-amber-400 flex items-center justify-center text-2xl">
                          📷
                        </div>
                      )}
                      <span className="absolute -bottom-1 -right-1 bg-white border border-gray-200 rounded-full px-1.5 py-0.5 text-[9px] font-bold text-grafite shadow-sm">
                        🔍
                      </span>
                    </button>

                    <div className="text-xs space-y-1 text-gray-700 min-w-0">
                      <p className="font-bold text-sm text-grafite truncate">
                        {usuarioLogado.nome_completo}
                      </p>
                      <p className="text-gray-600 truncate">
                        {usuarioLogado.unidade_formatada || usuarioLogado.unidade}
                      </p>
                      <p className="text-[11px] font-semibold text-emerald-700">
                        {temSelfie
                          ? '✅ Facial ativo (toque na foto para ampliar)'
                          : '⚠️ Selfie pendente para porta'}
                      </p>
                    </div>
                  </div>

                  {/* Ações da Conta (Minha Selfie, Alterar PIN, Extrato) */}
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={abrirModalSelfie}
                      className="w-full flex items-center justify-between p-3.5 bg-white hover:bg-emerald-50/60 border border-gray-200 rounded-xl transition text-left"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">📷</span>
                        <div>
                          <p className="text-xs font-bold text-grafite">
                            Minha Selfie (Acesso Facial)
                          </p>
                          <p className="text-[11px] text-gray-500">
                            {temSelfie
                              ? 'Ampliar foto atual para conferir qualidade ou tirar nova'
                              : 'Cadastrar foto do rosto para liberar a porta'}
                          </p>
                        </div>
                      </div>
                      <span className="text-gray-400 text-xs">›</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setModalAtivo('pin')}
                      className="w-full flex items-center justify-between p-3.5 bg-white hover:bg-emerald-50/60 border border-gray-200 rounded-xl transition text-left"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">🔐</span>
                        <div>
                          <p className="text-xs font-bold text-grafite">Alterar PIN (4 dígitos)</p>
                          <p className="text-[11px] text-gray-500">
                            Senha numérica do aplicativo e do caixa
                          </p>
                        </div>
                      </div>
                      <span className="text-gray-400 text-xs">›</span>
                    </button>

                    <button
                      type="button"
                      onClick={abrirModalExtrato}
                      className="w-full flex items-center justify-between p-3.5 bg-white hover:bg-emerald-50/60 border border-gray-200 rounded-xl transition text-left"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">📄</span>
                        <div>
                          <p className="text-xs font-bold text-grafite">
                            Extrato & Histórico Cashback
                          </p>
                          <p className="text-[11px] text-gray-500">
                            Acompanhe recargas, compras e bônus de 2%
                          </p>
                        </div>
                      </div>
                      <span className="text-gray-400 text-xs">›</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      limparSessaoDoNavegador();
                      setUsuarioLogado(null);
                      setPin('');
                      setAba('login');
                    }}
                    className="w-full py-3 text-xs font-bold text-gray-700 border border-gray-300 rounded-xl hover:bg-gray-50"
                  >
                    Sair da Conta
                  </button>

                  <div className="pt-2 border-t border-gray-200 text-center space-y-2">
                    <p className="text-[11px] text-gray-400">
                      Dados protegidos em banco privado do VilaMarket conforme a LGPD.
                    </p>
                    <button
                      type="button"
                      onClick={solicitarExclusaoDadosLgpd}
                      disabled={carregando}
                      className="text-[11px] text-red-600 font-semibold hover:underline"
                    >
                      Excluir minha selfie e encerrar cadastro (Direito LGPD)
                    </button>
                  </div>
                </div>
              )}

              {/* SUB-ABA ADMIN (CASO SEJA ADMINISTRADOR) */}
              {abaInferior === 'admin' && roleUsuario === 'admin' && (
                <div className="space-y-3">
                  <h2 className="text-lg font-bold text-grafite">Administração VilaMarket</h2>
                  <p className="text-xs text-gray-600">
                    Gerencie moradores da Vila, leitor facial Intelbras e avisos do mural.
                  </p>
                  <a
                    href="/admin"
                    className="block w-full text-center bg-floresta text-white font-bold py-3 rounded-xl text-xs"
                  >
                    Acessar Painel Admin Completo
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* MODAL 1: MINHA SELFIE (AMPLIADA PARA AVALIAR QUALIDADE OU TROCAR)     */}
      {/* ===================================================================== */}
      {modalAtivo === 'selfie' && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-grafite">Minha Selfie (Acesso Facial)</h3>
              {temSelfie && !modoTrocaSelfie && (
                <span className="text-[11px] font-bold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full">
                  ✅ Ativa
                </span>
              )}
            </div>

            {temSelfie && !modoTrocaSelfie && !fotoCapturada ? (
              <div className="space-y-3 text-center">
                <p className="text-xs text-gray-600">
                  Verifique se o seu rosto está bem iluminado e nítido para abertura rápida na
                  porta:
                </p>
                {selfieTemporariaUrl ? (
                  <img
                    src={selfieTemporariaUrl}
                    alt="Selfie ampliada"
                    className="w-64 h-64 mx-auto object-cover rounded-2xl border-2 border-emerald-600 shadow-md"
                  />
                ) : (
                  <div className="w-64 h-64 mx-auto flex items-center justify-center bg-gray-100 rounded-2xl text-xs text-gray-500">
                    Carregando imagem segura...
                  </div>
                )}
                <button
                  type="button"
                  onClick={iniciarCameraSelfie}
                  className="w-full bg-floresta hover:bg-floresta-claro text-white font-bold py-3 rounded-xl text-xs transition"
                >
                  📷 Tirar Nova Foto / Atualizar Selfie
                </button>
              </div>
            ) : !fotoCapturada ? (
              <div className="space-y-3">
                <div
                  className={`p-2.5 rounded-xl text-xs font-semibold text-center border transition-colors ${
                    qualidadeCamera.aprovada
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : 'bg-amber-50 text-amber-800 border-amber-300'
                  }`}
                >
                  {qualidadeCamera.mensagem}
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
                        qualidadeCamera.aprovada ? 'border-emerald-400' : 'border-amber-400/80'
                      }`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5 text-[10px] text-center font-bold">
                  <span
                    className={`py-1 rounded-lg ${
                      qualidadeCamera.enquadramentoOk
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {qualidadeCamera.enquadramentoOk ? '✓ Enquadrado' : '○ Enquadrar'}
                  </span>
                  <span
                    className={`py-1 rounded-lg ${
                      qualidadeCamera.luzOk
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {qualidadeCamera.luzOk ? '✓ Boa Luz' : '○ Iluminação'}
                  </span>
                  <span
                    className={`py-1 rounded-lg ${
                      qualidadeCamera.detalhesOk
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {qualidadeCamera.detalhesOk ? '✓ Nitidez OK' : '○ Nitidez'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => capturarFrameSelfie(false)}
                  disabled={!qualidadeCamera.aprovada}
                  className={`w-full font-bold py-3 rounded-xl text-xs transition ${
                    qualidadeCamera.aprovada
                      ? 'bg-floresta hover:bg-floresta-claro text-white'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {qualidadeCamera.aprovada ? '📸 Capturar Foto Agora' : 'Ajuste o rosto/luz para liberar'}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <img
                  src={fotoCapturada}
                  alt="Nova selfie"
                  className="w-full h-64 object-cover rounded-xl border scale-x-[-1]"
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={iniciarCameraSelfie}
                    className="bg-gray-200 text-gray-800 font-bold py-2.5 rounded-xl text-xs"
                  >
                    Tirar Outra
                  </button>
                  <button
                    type="button"
                    onClick={salvarSelfieMorador}
                    disabled={carregando}
                    className="bg-floresta text-white font-bold py-2.5 rounded-xl text-xs"
                  >
                    {carregando ? 'Salvando...' : 'Confirmar e Salvar'}
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                fecharCamera();
                setModoTrocaSelfie(false);
                setModalAtivo(null);
              }}
              className="w-full text-xs text-gray-500 py-1"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* MODAL 2: ALTERAR PIN (4 DÍGITOS) */}
      {modalAtivo === 'pin' && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <form
            onSubmit={salvarTrocaPinLogado}
            className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3"
          >
            <h3 className="font-bold text-base text-grafite">Alterar PIN de 4 dígitos</h3>
            <input
              type="password"
              maxLength={4}
              required
              placeholder="PIN Atual (4 dígitos)"
              value={pinAtualTroca}
              onChange={(e) => setPinAtualTroca(e.target.value.replace(/\D/g, ''))}
              className="w-full p-2.5 border rounded-xl text-center text-sm"
            />
            <input
              type="password"
              maxLength={4}
              required
              placeholder="Novo PIN (4 dígitos)"
              value={novoPinTroca}
              onChange={(e) => setNovoPinTroca(e.target.value.replace(/\D/g, ''))}
              className="w-full p-2.5 border rounded-xl text-center text-sm"
            />
            <input
              type="password"
              maxLength={4}
              required
              placeholder="Confirmar Novo PIN"
              value={confirmarNovoPinTroca}
              onChange={(e) => setConfirmarNovoPinTroca(e.target.value.replace(/\D/g, ''))}
              className="w-full p-2.5 border rounded-xl text-center text-sm"
            />
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalAtivo(null)}
                className="bg-gray-100 text-gray-700 font-bold py-2.5 rounded-xl text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={carregando}
                className="bg-floresta text-white font-bold py-2.5 rounded-xl text-xs"
              >
                Salvar PIN
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 3: EXTRATO (TRANSAÇÕES E CASHBACK) */}
      {modalAtivo === 'extrato' && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 max-h-[80vh] flex flex-col">
            <h3 className="font-bold text-base text-grafite">Extrato de Transações & Cashback</h3>
            <div className="overflow-y-auto space-y-2 flex-1">
              {extratoLista.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-6">
                  Nenhuma transação registrada ainda.
                </p>
              ) : (
                extratoLista.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between items-center border-b pb-2 text-xs"
                  >
                    <div>
                      <p className="font-bold text-grafite">{item.descricao || item.tipo}</p>
                      <p className="text-[10px] text-gray-400">
                        {new Date(item.criado_em).toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <span
                      className={`font-bold ${
                        Number(item.valor) >= 0 ? 'text-emerald-700' : 'text-red-600'
                      }`}
                    >
                      R$ {Number(item.valor).toFixed(2)}
                    </span>
                  </div>
                ))
              )}
            </div>
            <button
              type="button"
              onClick={() => setModalAtivo(null)}
              className="w-full bg-gray-100 text-gray-800 font-bold py-2.5 rounded-xl text-xs"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* MODAL 4: ADICIONAR DEPENDENTE */}
      {modalAtivo === 'novo_dependente' && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={cadastrarDependente}
            className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 my-auto"
          >
            <h3 className="font-bold text-base text-grafite">Adicionar Dependente</h3>
            <p className="text-[11px] text-gray-500">
              Idade mínima de 12 anos. O dependente terá acesso facial na porta e PIN próprio.
            </p>
            <input
              type="text"
              required
              placeholder="Nome Completo do Dependente"
              value={depNome}
              onChange={(e) => setDepNome(e.target.value)}
              className="w-full p-2.5 border rounded-xl text-xs"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                required
                placeholder="CPF (11 dígitos)"
                value={depCpf}
                onChange={(e) => setDepCpf(e.target.value)}
                className="w-full p-2.5 border rounded-xl text-xs"
              />
              <input
                type="date"
                required
                value={depNascimento}
                onChange={(e) => setDepNascimento(e.target.value)}
                className="w-full p-2.5 border rounded-xl text-xs"
              />
            </div>
            <input
              type="password"
              maxLength={4}
              required
              placeholder="PIN de 4 dígitos do Dependente"
              value={depPin}
              onChange={(e) => setDepPin(e.target.value.replace(/\D/g, ''))}
              className="w-full p-2.5 border rounded-xl text-xs"
            />

            <div className="border rounded-xl p-3 bg-gray-50 text-center space-y-2">
              {!depSelfieBase64 ? (
                streamCamera ? (
                  <div className="space-y-2">
                    <p
                      className={`text-[11px] font-semibold p-1.5 rounded-lg ${
                        qualidadeCamera.aprovada
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {qualidadeCamera.mensagem}
                    </p>
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
                          className={`w-40 h-52 rounded-full border-4 border-dashed ${
                            qualidadeCamera.aprovada ? 'border-emerald-400' : 'border-amber-400'
                          }`}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => capturarFrameSelfie(true)}
                      disabled={!qualidadeCamera.aprovada}
                      className={`text-xs font-bold px-4 py-2 rounded-lg w-full ${
                        qualidadeCamera.aprovada
                          ? 'bg-floresta text-white'
                          : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      {qualidadeCamera.aprovada ? '📸 Capturar Foto' : 'Ajuste rosto e luz'}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      const s = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: 'user', width: 480, height: 480 },
                      });
                      setStreamCamera(s);
                      setTimeout(() => {
                        if (videoRef.current) {
                          videoRef.current.srcObject = s;
                          iniciarMonitoramentoQualidade();
                        }
                      }, 150);
                    }}
                    className="text-xs font-bold text-floresta underline"
                  >
                    📷 Tirar Selfie do Dependente
                  </button>
                )
              ) : (
                <div className="space-y-1">
                  <img
                    src={depSelfieBase64}
                    alt="Selfie Dependente"
                    className="w-20 h-20 rounded-full mx-auto object-cover border scale-x-[-1]"
                  />
                  <button
                    type="button"
                    onClick={() => setDepSelfieBase64(null)}
                    className="text-[11px] text-red-600 underline block mx-auto"
                  >
                    Tirar outra foto
                  </button>
                </div>
              )}
            </div>

            <label className="flex items-start gap-2 bg-gray-50 p-2.5 rounded-xl border border-gray-200 text-[10px] text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={aceiteLgpdDependente}
                onChange={(e) => setAceiteLgpdDependente(e.target.checked)}
                className="mt-0.5 accent-floresta"
              />
              <span>
                Declaro ser responsável legal e autorizo o tratamento da imagem facial e dados do
                dependente exclusivamente para acesso ao VilaMarket (Art. 14 da LGPD).
              </span>
            </label>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  fecharCamera();
                  setModalAtivo(null);
                }}
                className="bg-gray-100 text-gray-700 font-bold py-2.5 rounded-xl text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={carregando}
                className="bg-floresta text-white font-bold py-2.5 rounded-xl text-xs"
              >
                {carregando ? 'Salvando...' : 'Salvar Dependente'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 5: ADICIONAR SALDO PIX AO DEPENDENTE */}
      {modalAtivo === 'pix_dependente' && dependenteSelecionado && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4">
            <h3 className="font-bold text-base text-grafite">
              Adicionar Saldo Pix • {dependenteSelecionado.nome_completo}
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {['20.00', '50.00', '100.00'].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setValorPix(v)}
                  className={`py-2 rounded-lg text-xs font-bold border ${
                    valorPix === v ? 'bg-floresta text-white' : 'bg-gray-50 text-gray-700'
                  }`}
                >
                  R$ {v}
                </button>
              ))}
            </div>
            <input
              type="number"
              step="0.01"
              value={valorPix}
              onChange={(e) => setValorPix(e.target.value)}
              className="w-full p-2.5 border rounded-xl text-sm font-bold"
            />
            <div className="bg-gray-50 p-3 rounded-xl border text-xs space-y-2">
              <span className="font-bold text-gray-700 block">Chave Pix Copia e Cola:</span>
              <input
                type="text"
                readOnly
                value={pixCopiaECola}
                className="w-full bg-white border rounded p-1.5 text-[10px] text-gray-500"
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(pixCopiaECola);
                  alert('Código Pix copiado!');
                }}
                className="w-full bg-amber-100 text-amber-900 font-bold py-1.5 rounded-lg text-xs"
              >
                Copiar Código Pix
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-600 mb-1">
                Confirme seu PIN de 4 dígitos (Segurança):
              </label>
              <input
                type="password"
                maxLength={4}
                placeholder="••••"
                value={pinConfirmacaoPix}
                onChange={(e) => setPinConfirmacaoPix(e.target.value.replace(/\D/g, ''))}
                className="w-full p-2.5 border rounded-xl text-center text-sm tracking-widest"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setModalAtivo(null)}
                className="bg-gray-100 text-gray-700 font-bold py-2.5 rounded-xl text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarRecargaPixDependente}
                disabled={carregando}
                className="bg-floresta text-white font-bold py-2.5 rounded-xl text-xs"
              >
                {carregando ? 'Creditando...' : 'Confirmar Pix'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. BARRA DE NAVEGAÇÃO INFERIOR FIXA */}
      {aba === 'painel' && usuarioLogado && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-40">
          <div
            className={`max-w-md mx-auto grid ${
              roleUsuario === 'admin' ? 'grid-cols-4' : 'grid-cols-3'
            } py-2`}
          >
            <button
              type="button"
              onClick={() => setAbaInferior('inicio')}
              className={`flex flex-col items-center justify-center py-1 ${
                abaInferior === 'inicio' ? 'text-floresta font-bold' : 'text-gray-400'
              }`}
            >
              <span className="text-lg">🏠</span>
              <span className="text-[11px]">Início</span>
            </button>

            <button
              type="button"
              onClick={() => setAbaInferior('mural')}
              className={`flex flex-col items-center justify-center py-1 ${
                abaInferior === 'mural' ? 'text-floresta font-bold' : 'text-gray-400'
              }`}
            >
              <span className="text-lg">📢</span>
              <span className="text-[11px]">Mural/Classificados</span>
            </button>

            <button
              type="button"
              onClick={() => setAbaInferior('perfil')}
              className={`flex flex-col items-center justify-center py-1 ${
                abaInferior === 'perfil' ? 'text-floresta font-bold' : 'text-gray-400'
              }`}
            >
              <span className="text-lg">👤</span>
              <span className="text-[11px]">Perfil/Sair</span>
            </button>

            {roleUsuario === 'admin' && (
              <button
                type="button"
                onClick={() => setAbaInferior('admin')}
                className={`flex flex-col items-center justify-center py-1 ${
                  abaInferior === 'admin' ? 'text-floresta font-bold' : 'text-gray-400'
                }`}
              >
                <span className="text-lg">⚙️</span>
                <span className="text-[11px]">Admin</span>
              </button>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}