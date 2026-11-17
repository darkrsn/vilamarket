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

  // 1. Estados Modal Selfie (Câmera Frontal)
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [streamCamera, setStreamCamera] = useState<MediaStream | null>(null);
  const [fotoCapturada, setFotoCapturada] = useState<string | null>(null);

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

    // 1. Cria utilizador no Supabase Auth
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: emailTecnico,
      password: senhaAuth,
    });

    if (authErr || !authData.user) {
      setCarregando(false);
      setMensagem({ tipo: 'erro', texto: authErr?.message || 'Erro ao criar credencial.' });
      return;
    }

    // 2. Cria perfil na tabela perfis (dispara trigger do código WhatsApp)
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

    // 3. Grava o hash seguro do PIN de 4 dígitos
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

    // 1. Confirma o código de 6 dígitos do WhatsApp no banco
    const { data, error } = await supabase.rpc('confirmar_cadastro_whatsapp', {
      p_cpf: cpfLimpo,
      p_codigo: codigoWa,
    });

    if (error || !data?.sucesso) {
      setCarregando(false);
      setMensagem({ tipo: 'erro', texto: error?.message || data?.mensagem });
      return;
    }

    // 2. Carrega os dados do perfil recém-ativado para entrar direto na Home
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

    // 3. Entra logado direto na tela Home (painel)
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
  // FUNÇÕES DA DASHBOARD (SELFIE, ALTERAR PIN, EXTRATO, DEPENDENTES E PIX)
  // =========================================================================
  async function abrirModalSelfie() {
    setFotoCapturada(null);
    setModalAtivo('selfie');
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
      unidade_formatada: perfilDetalhes?.unidade_formatada || usuarioLogado.unidade_formatada || usuarioLogado.unidade,
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

    if (insertErr) {
      setCarregando(false);
      alert('Erro ao salvar dependente: ' + insertErr.message);
      return;
    }

    await supabase.rpc('definir_pin_usuario', {
      p_perfil_id: authData.user.id,
      p_pin_aberto: depPin,
    });

    setCarregando(false);
    setDepNome('');
    setDepCpf('');
    setDepNascimento('');
    setDepPin('');
    setDepSelfieBase64(null);
    fecharCamera();
    setModalAtivo(null);
    await carregarDadosDashboard();
    alert('Dependente cadastrado com sucesso!');
  }

  function abrirModalPixDependente(dep: any) {
    setDependenteSelecionado(dep);
    setValorPix('20.00');
    setPixCopiaECola(
      `00020126580014BR.GOV.BCB.PIX0136vilamarket-pix-${dep.cpf}520400005303986540520.005802BR5910VILAMARKET6008CURITIBA62070503***6304ABCD`
    );
    setModalAtivo('pix_dependente');
  }

  async function confirmarRecargaPixDependente() {
    if (!dependenteSelecionado) return;
    setCarregando(true);
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
    setModalAtivo(null);
    alert(data.mensagem);
  }

  const unidadesFiltradas = unidades.filter((u) => u.tipo === tipoUnidade);
  const temSelfie = Boolean(perfilDetalhes?.selfie_url);
  const roleUsuario = perfilDetalhes?.role || usuarioLogado?.role || 'titular';

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

          {/* ABA 2: CADASTRO COM AS 3 RUAS DA VILA MILITAR */}
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

          {/* ABA 5: PAINEL DO MORADOR LOGADO (DASHBOARD COMPLETA) */}
          {aba === 'painel' && usuarioLogado && (
            <div className="space-y-5">
              {/* SUB-ABA INÍCIO */}
              {abaInferior === 'inicio' && (
                <>
                  {/* Card de Status Facial Mantido */}
                  <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-emerald-800 font-semibold uppercase">
                        {temSelfie
                          ? 'Acesso Facial Porta • Ativo'
                          : 'Acesso Facial Porta • Ativo (Cadastre sua Selfie)'}
                      </p>
                      {!temSelfie && (
                        <button
                          onClick={abrirModalSelfie}
                          className="text-[11px] bg-floresta text-white px-2.5 py-1 rounded-lg font-bold"
                        >
                          Tirar Selfie
                        </button>
                      )}
                    </div>
                    <h2 className="text-lg font-bold text-grafite mt-1">
                      Olá, {usuarioLogado.nome_completo}
                    </h2>
                    <p className="text-xs text-gray-600">
                      {usuarioLogado.unidade_formatada || usuarioLogado.unidade}
                    </p>
                  </div>

                  {/* Cards de Saldo Cashback e Saldo Pré-Pago Mantidos */}
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

                  {/* 1. Grade de Botões de Ação Rápida */}
                  <div>
                    <h3 className="text-xs font-bold uppercase text-gray-500 mb-2">
                      Ações Rápidas
                    </h3>
                    <div className="grid grid-cols-3 gap-2.5">
                      <button
                        type="button"
                        onClick={abrirModalSelfie}
                        className="flex flex-col items-center justify-center p-3 bg-gray-50 hover:bg-emerald-50 border border-gray-200 rounded-xl text-center transition"
                      >
                        <span className="text-xl mb-1">📷</span>
                        <span className="text-xs font-bold text-grafite leading-tight">
                          Minha Selfie
                        </span>
                        <span className="text-[10px] text-gray-500">Acesso Facial</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setModalAtivo('pin')}
                        className="flex flex-col items-center justify-center p-3 bg-gray-50 hover:bg-emerald-50 border border-gray-200 rounded-xl text-center transition"
                      >
                        <span className="text-xl mb-1">🔐</span>
                        <span className="text-xs font-bold text-grafite leading-tight">
                          Alterar PIN
                        </span>
                        <span className="text-[10px] text-gray-500">4 dígitos</span>
                      </button>

                      <button
                        type="button"
                        onClick={abrirModalExtrato}
                        className="flex flex-col items-center justify-center p-3 bg-gray-50 hover:bg-emerald-50 border border-gray-200 rounded-xl text-center transition"
                      >
                        <span className="text-xl mb-1">📄</span>
                        <span className="text-xs font-bold text-grafite leading-tight">
                          Extrato
                        </span>
                        <span className="text-[10px] text-gray-500">Histórico</span>
                      </button>
                    </div>
                  </div>

                  {/* 2. Seção Meus Dependentes (Se titular ou admin) */}
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
                            setModalAtivo('novo_dependente');
                          }}
                          className="bg-floresta hover:bg-floresta-claro text-white text-xs font-bold px-3 py-2 rounded-xl transition"
                        >
                          + Adicionar Dependente
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

              {/* SUB-ABA PERFIL / SAIR */}
              {abaInferior === 'perfil' && (
                <div className="space-y-4">
                  <h2 className="text-lg font-bold text-grafite">Meu Perfil</h2>
                  <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl text-xs space-y-2 text-gray-700">
                    <p>
                      <strong>Morador:</strong> {usuarioLogado.nome_completo}
                    </p>
                    <p>
                      <strong>Unidade:</strong>{' '}
                      {usuarioLogado.unidade_formatada || usuarioLogado.unidade}
                    </p>
                    <p>
                      <strong>Perfil:</strong> {roleUsuario.toUpperCase()}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setUsuarioLogado(null);
                      setPin('');
                      setAba('login');
                    }}
                    className="w-full py-3 text-xs font-bold text-red-600 border border-red-200 rounded-xl hover:bg-red-50"
                  >
                    Sair da Conta
                  </button>
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
      {/* MODAIS DA DASHBOARD (SELFIE, ALTERAR PIN, EXTRATO, DEPENDENTE, PIX)   */}
      {/* ===================================================================== */}

      {/* MODAL 1: MINHA SELFIE (ACESSO FACIAL) */}
      {modalAtivo === 'selfie' && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4">
            <h3 className="font-bold text-base text-grafite">Minha Selfie (Acesso Facial)</h3>
            <p className="text-xs text-gray-500">
              Centralize seu rosto na câmera frontal para liberar a entrada na porta do VilaMarket.
            </p>

            {!fotoCapturada ? (
              <div className="space-y-3">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-64 object-cover rounded-xl bg-black"
                />
                <button
                  type="button"
                  onClick={() => capturarFrameSelfie(false)}
                  className="w-full bg-floresta text-white font-bold py-3 rounded-xl text-xs"
                >
                  Capturar Foto
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <img
                  src={fotoCapturada}
                  alt="Selfie"
                  className="w-full h-64 object-cover rounded-xl border"
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={abrirModalSelfie}
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
                    {carregando ? 'Salvando...' : 'Salvar Selfie'}
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                fecharCamera();
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

      {/* MODAL 4: ADICIONAR DEPENDENTE (MÍNIMO 12 ANOS, CPF, PIN E SELFIE) */}
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
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-40 object-cover rounded-lg bg-black"
                    />
                    <button
                      type="button"
                      onClick={() => capturarFrameSelfie(true)}
                      className="bg-floresta text-white text-xs font-bold px-4 py-2 rounded-lg"
                    >
                      Capturar Foto
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      const s = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: 'user' },
                      });
                      setStreamCamera(s);
                      setTimeout(() => {
                        if (videoRef.current) videoRef.current.srcObject = s;
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
                    className="w-20 h-20 rounded-full mx-auto object-cover border"
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

      {/* 3. BARRA DE NAVEGAÇÃO INFERIOR FIXA (APENAS QUANDO LOGADO NO PAINEL) */}
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