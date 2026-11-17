'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

export default function VilaMarketApp() {
  const [aba, setAba] = useState<'login' | 'cadastro' | 'confirmar_wa' | 'esqueci_pin' | 'painel'>('login');
  const [abaInferior, setAbaInferior] = useState<'inicio' | 'mural' | 'perfil' | 'admin'>('inicio');
  const [unidades, setUnidades] = useState<any[]>([]);
  const [condominioId, setCondominioId] = useState<string>('');
  const [mensagem, setMensagem] = useState<{ tipo: 'erro' | 'sucesso'; texto: string } | null>(null);
  const [carregando, setCarregando] = useState(false);

  // Dados Login & Usuário Logado
  const [cpf, setCpf] = useState('');
  const [pin, setPin] = useState('');
  const [usuarioLogado, setUsuarioLogado] = useState<any>(null);
  const [perfilDetalhes, setPerfilDetalhes] = useState<any>(null);

  // Dados Cadastro
  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [dataNasc, setDataNasc] = useState('');
  const [ruaSelecionada, setRuaSelecionada] = useState('Rua Sargento Lafayette');
  const [tipoUnidade, setTipoUnidade] = useState<'bloco' | 'casa'>('bloco');
  const [unidadeId, setUnidadeId] = useState('');
  const [complementoApto, setComplementoApto] = useState('');

  // Código WhatsApp (Ativação e Reset PIN)
  const [codigoWa, setCodigoWa] = useState('');
  const [novoPin, setNovoPin] = useState('');

  // Estados dos Modais da Dashboard (Selfie, Alterar PIN, Extrato, Dependentes e Pix)
  const [modalAtivo, setModalAtivo] = useState<
    null | 'selfie' | 'pin' | 'extrato' | 'novo_dependente' | 'pix_dependente'
  >(null);

  // 1. Estados Modal Selfie (Câmera Frontal + Visualização da Foto Atual)
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [streamCamera, setStreamCamera] = useState<MediaStream | null>(null);
  const [fotoCapturada, setFotoCapturada] = useState<string | null>(null);
  const [modoTrocaSelfie, setModoTrocaSelfie] = useState(false);

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

  // 5. Estados Recarga Pix Dependente
  const [dependenteSelecionado, setDependenteSelecionado] = useState<any>(null);
  const [valorPix, setValorPix] = useState('20.00');
  const [pixCopiaECola, setPixCopiaECola] = useState('');

  // 6. Estados Mural / Classificados
  const [subAbaMural, setSubAbaMural] = useState<'avisos' | 'classificados'>('avisos');

  useEffect(() => {
    carregarUnidades();
  }, []);

  useEffect(() => {
    if (aba === 'painel' && usuarioLogado?.perfil_id) {
      carregarDadosDashboard();
    }
  }, [aba, usuarioLogado]);

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
    const { data: perfil } = await supabase
      .from('perfis')
      .select('*')
      .eq('id', usuarioLogado.perfil_id)
      .single();

    if (perfil) {
      setPerfilDetalhes(perfil);

      if (perfil.role === 'titular' || perfil.role === 'admin') {
        const { data: deps } = await supabase
          .from('perfis')
          .select('*')
          .eq('titular_id', perfil.id)
          .order('criado_em', { ascending: true });
        setDependentesLista(deps || []);
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
      setAba('painel');
      setAbaInferior('inicio');
    } else {
      setMensagem({ tipo: 'erro', texto: data?.mensagem || 'Erro ao validar acesso.' });
    }
  }

  async function realizarCadastro(e: React.FormEvent) {
    e.preventDefault();
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
  // FUNÇÕES DA DASHBOARD (SELFIE COM VISUALIZAÇÃO, ALTERAR PIN, EXTRATO, DEPENDENTES)
  // =========================================================================
  async function iniciarCameraSelfie() {
    setFotoCapturada(null);
    setModoTrocaSelfie(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 480, height: 480 },
      });
      setStreamCamera(stream);
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 150);
    } catch {
      alert('Permita o acesso à câmera frontal do navegador para tirar a sua selfie.');
    }
  }

  function abrirModalSelfie() {
    setFotoCapturada(null);
    setModalAtivo('selfie');

    // Se já tem selfie salva, abre primeiro mostrando a foto atual; se não tem, já liga a câmera
    if (perfilDetalhes?.selfie_url) {
      setModoTrocaSelfie(false);
    } else {
      iniciarCameraSelfie();
    }
  }

  function fecharCamera() {
    if (streamCamera) {
      streamCamera.getTracks().forEach((track) => track.stop());
      setStreamCamera(null);
    }
  }

  function capturarFrameSelfie(paraDependente = false) {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, 400, 400);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
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

    const { error } = await supabase
      .from('perfis')
      .update({
        selfie_url: fotoCapturada,
        status_facial: 'ativo',
      })
      .eq('id', usuarioLogado.perfil_id);

    setCarregando(false);
    if (error) {
      alert('Erro ao salvar selfie: ' + error.message);
      return;
    }

    await carregarDadosDashboard();
    setModoTrocaSelfie(false);
    setModalAtivo(null);
    alert('Selfie atualizada com sucesso para o leitor facial da porta!');
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
      alert('Tire a selfie do dependente para liberar o acesso facial na porta.');
      return;
    }
    if (depPin.length !== 4) {
      alert('O PIN do dependente deve ter 4 dígitos.');
      return;
    }

    setCarregando(true);
    const cpfDepLimpo = depCpf.replace(/\D/g, '');
    const emailTecnicoDep = `user_${cpfDepLimpo}@vilamarket.com.br`;
    const senhaAuthDep = `VM#${depPin}#${cpfDepLimpo.slice(-4)}`;

    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: emailTecnicoDep,
      password: senhaAuthDep,
    });

    if (authErr || !authData.user) {
      setCarregando(false);
      alert('Erro ao criar acesso do dependente: ' + (authErr?.message || 'CPF já cadastrado'));
      return;
    }

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
      selfie_url: depSelfieBase64,
      pin_hash: 'temp',
      status_cadastro: 'aprovado',
      status_facial: 'ativo',
    });