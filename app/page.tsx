'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function VilaMarketApp() {
  const [aba, setAba] = useState<'login' | 'cadastro' | 'confirmar_wa' | 'esqueci_pin' | 'painel'>('login');
  const [unidades, setUnidades] = useState<any[]>([]);
  const [condominioId, setCondominioId] = useState<string>('');
  const [mensagem, setMensagem] = useState<{ tipo: 'erro' | 'sucesso'; texto: string } | null>(null);
  const [carregando, setCarregando] = useState(false);

  // Dados Login & Usuário Logado
  const [cpf, setCpf] = useState('');
  const [pin, setPin] = useState('');
  const [usuarioLogado, setUsuarioLogado] = useState<any>(null);

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

  useEffect(() => {
    carregarUnidades();
  }, []);

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
    const emailTecnico = `user_${cpfLimpo}@vilamarket.local`;
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

    const { data, error } = await supabase.rpc('confirmar_cadastro_whatsapp', {
      p_cpf: cpf.replace(/\D/g, ''),
      p_codigo: codigoWa,
    });

    setCarregando(false);
    if (error || !data?.sucesso) {
      setMensagem({ tipo: 'erro', texto: error?.message || data?.mensagem });
      return;
    }

    setMensagem({ tipo: 'sucesso', texto: data.mensagem });
    setAba('login');
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

  const unidadesFiltradas = unidades.filter((u) => u.tipo === tipoUnidade);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-100">
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

          {/* ABA 5: PAINEL DO MORADOR LOGADO */}
          {aba === 'painel' && usuarioLogado && (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl">
                <p className="text-xs text-emerald-800 font-semibold uppercase">
                  Acesso Facial Porta • Ativo
                </p>
                <h2 className="text-lg font-bold text-grafite mt-1">
                  Olá, {usuarioLogado.nome_completo}
                </h2>
                <p className="text-xs text-gray-600">{usuarioLogado.unidade_formatada}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
                  <span className="text-xs font-bold text-ambar uppercase">
                    Saldo Cashback (2% Pix)
                  </span>
                  <p className="text-2xl font-extrabold text-grafite mt-1">
                    R$ {Number(usuarioLogado.saldo_cashback || 0).toFixed(2)}
                  </p>
                </div>
                <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl">
                  <span className="text-xs font-bold text-gray-600 uppercase">
                    Saldo Pré-Pago
                  </span>
                  <p className="text-2xl font-extrabold text-grafite mt-1">
                    R$ {Number(usuarioLogado.saldo_pre_pago || 0).toFixed(2)}
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setUsuarioLogado(null);
                  setAba('login');
                }}
                className="w-full py-2.5 text-xs font-bold text-red-600 border border-red-200 rounded-xl hover:bg-red-50"
              >
                Sair da Conta
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}