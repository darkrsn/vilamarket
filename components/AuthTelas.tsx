'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatarCPFVisual, formatarNomeTitleCase } from '@/lib/formatters';

interface AuthTelasProps {
  aba: 'login' | 'cadastro' | 'confirmar_wa' | 'esqueci_pin';
  navegarParaAba: (
    novaAba: 'login' | 'cadastro' | 'confirmar_wa' | 'esqueci_pin' | 'painel',
    novaAbaInferior?: 'inicio' | 'mural' | 'classificados' | 'ajuda' | 'perfil' | 'admin'
  ) => void;
  onLoginSucesso: (dadosUsuario: any, cpfLogin: string) => void;
  setMensagem: (msg: { tipo: 'erro' | 'sucesso'; texto: string } | null) => void;
}

export default function AuthTelas({
  aba,
  navegarParaAba,
  onLoginSucesso,
  setMensagem,
}: AuthTelasProps) {
  const [carregando, setCarregando] = useState(false);
  const [cpf, setCpf] = useState('');
  const [pin, setPin] = useState('');

  // Cadastro
  const [unidades, setUnidades] = useState<any[]>([]);
  const [condominioId, setCondominioId] = useState('');
  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [dataNasc, setDataNasc] = useState('');
  const [ruaSelecionada, setRuaSelecionada] = useState('Rua Sargento Lafayette');
  const [tipoUnidade, setTipoUnidade] = useState<'bloco' | 'casa'>('bloco');
  const [unidadeId, setUnidadeId] = useState('');
  const [complementoApto, setComplementoApto] = useState('');
  const [aceiteLgpdTitular, setAceiteLgpdTitular] = useState(false);

  // WhatsApp & Reset PIN
  const [codigoWa, setCodigoWa] = useState('');
  const [novoPin, setNovoPin] = useState('');

  useEffect(() => {
    if (aba === 'cadastro' && unidades.length === 0) {
      (async () => {
        const { data: conds } = await supabase.from('condominios').select('id').limit(1);
        if (conds?.[0]?.id) setCondominioId(conds[0].id);

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
      })();
    }
  }, [aba, unidades.length]);

  async function fazerLogin(e: React.FormEvent) {
    e.preventDefault();
    setMensagem(null);
    const cpfLimpo = cpf.replace(/\D/g, '');
    if (cpfLimpo.length !== 11) {
      setMensagem({ tipo: 'erro', texto: 'Digite os 11 dígitos completos do CPF.' });
      return;
    }

    setCarregando(true);
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
      onLoginSucesso(data, cpfLimpo);
    } else {
      setMensagem({ tipo: 'erro', texto: data?.mensagem || 'Erro ao validar acesso.' });
    }
  }

  async function realizarCadastro(e: React.FormEvent) {
    e.preventDefault();
    const cpfLimpo = cpf.replace(/\D/g, '');
    if (cpfLimpo.length !== 11) {
      setMensagem({ tipo: 'erro', texto: 'Digite os 11 dígitos completos do CPF.' });
      return;
    }
    if (!aceiteLgpdTitular) {
      setMensagem({
        tipo: 'erro',
        texto: 'Você precisa concordar com o Termo de Privacidade e Uso de Dados (LGPD) para continuar.',
      });
      return;
    }

    setCarregando(true);
    setMensagem(null);

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
      condominio_id: condominioId || null,
      unidade_id: unidadeId || null,
      complemento_apto: tipoUnidade === 'bloco' ? complementoApto : null,
      unidade_formatada: formatada,
      nome_completo: formatarNomeTitleCase(nome.trim()),
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
    navegarParaAba('confirmar_wa');
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
      navegarParaAba('login');
      return;
    }

    setMensagem(null);
    onLoginSucesso(loginData, cpfLimpo);
  }

  async function pedirCodigoResetPin() {
    const cpfLimpo = cpf.replace(/\D/g, '');
    if (cpfLimpo.length !== 11) {
      setMensagem({ tipo: 'erro', texto: 'Digite os 11 dígitos completos do CPF.' });
      return;
    }

    setCarregando(true);
    setMensagem(null);
    const { data, error } = await supabase.rpc('solicitar_reset_pin_whatsapp', {
      p_cpf: cpfLimpo,
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
    const cpfLimpo = cpf.replace(/\D/g, '');
    if (cpfLimpo.length !== 11) {
      setMensagem({ tipo: 'erro', texto: 'Digite os 11 dígitos completos do CPF.' });
      return;
    }

    setCarregando(true);
    setMensagem(null);
    const { data, error } = await supabase.rpc('confirmar_reset_pin_whatsapp', {
      p_cpf: cpfLimpo,
      p_codigo: codigoWa,
      p_novo_pin: novoPin,
    });
    setCarregando(false);
    if (error || !data?.sucesso) {
      setMensagem({ tipo: 'erro', texto: error?.message || data?.mensagem });
    } else {
      setMensagem({ tipo: 'sucesso', texto: data.mensagem });
      navegarParaAba('login');
    }
  }

  const unidadesFiltradas = unidades.filter((u) => u.tipo === tipoUnidade);

  if (aba === 'login') {
    return (
      <form onSubmit={fazerLogin} className="space-y-4">
        <div>
          <label className="block text-xs font-bold uppercase text-gray-600 mb-1">
            CPF do Morador ou Dependente
          </label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={14}
            required
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(e) => setCpf(formatarCPFVisual(e.target.value))}
            className="w-full p-3 border rounded-xl focus:ring-2 focus:ring-floresta outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase text-gray-600 mb-1">
            PIN Secreto (4 dígitos)
          </label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            required
            placeholder="••••"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
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
            onClick={() => navegarParaAba('cadastro')}
            className="text-floresta font-bold hover:underline"
          >
            Criar Cadastro de Morador
          </button>
          <button
            type="button"
            onClick={() => navegarParaAba('esqueci_pin')}
            className="text-ambar font-semibold hover:underline"
          >
            Esqueci meu PIN
          </button>
        </div>
      </form>
    );
  }

  if (aba === 'cadastro') {
    return (
      <form onSubmit={realizarCadastro} className="space-y-3">
        <h2 className="font-bold text-lg text-grafite">Novo Cadastro na Vila</h2>

        <input
          type="text"
          required
          placeholder="Nome Completo"
          value={nome}
          onChange={(e) => setNome(formatarNomeTitleCase(e.target.value))}
          className="w-full p-2.5 border rounded-xl text-sm"
        />

        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            inputMode="numeric"
            maxLength={14}
            required
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(e) => setCpf(formatarCPFVisual(e.target.value))}
            className="w-full p-2.5 border rounded-xl text-sm"
          />
          <input
            type="text"
            inputMode="numeric"
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
          <label className="block text-xs font-bold text-gray-600 mb-1">Rua da Vila Militar</label>
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
            className={`py-2.5 rounded-xl text-xs font-bold border transition ${
              tipoUnidade === 'bloco'
                ? 'bg-floresta text-white border-floresta shadow-sm'
                : 'bg-gray-50 text-gray-600 border-gray-200'
            }`}
          >
            Bloco
          </button>
          <button
            type="button"
            onClick={() => setTipoUnidade('casa')}
            className={`py-2.5 rounded-xl text-xs font-bold border transition ${
              tipoUnidade === 'casa'
                ? 'bg-floresta text-white border-floresta shadow-sm'
                : 'bg-gray-50 text-gray-600 border-gray-200'
            }`}
          >
            Casa
          </button>
        </div>

        <div className={tipoUnidade === 'bloco' ? 'grid grid-cols-2 gap-2' : 'w-full'}>
          <div className="flex items-center border border-gray-200 rounded-xl bg-white overflow-hidden focus-within:border-floresta">
            <span className="pl-3 pr-2.5 py-2.5 text-xs font-bold text-gray-500 bg-gray-50 border-r border-gray-200 select-none">
              {tipoUnidade === 'bloco' ? 'Bloco' : 'Casa'}
            </span>
            <select
              value={unidadeId}
              onChange={(e) => setUnidadeId(e.target.value)}
              className="w-full px-2.5 py-2.5 text-sm font-medium text-grafite bg-white outline-none"
            >
              {unidadesFiltradas.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.identificador}
                </option>
              ))}
            </select>
          </div>

          {tipoUnidade === 'bloco' && (
            <input
              type="text"
              required
              placeholder="Nº Apto (ex: 102)"
              value={complementoApto}
              onChange={(e) => setComplementoApto(e.target.value)}
              className="w-full p-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-floresta"
            />
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">
            Crie seu PIN Secreto de 4 dígitos (Para App e Caixa)
          </label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            required
            placeholder="4 dígitos (não use 1234 ou data nasc.)"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            className="w-full p-2.5 border rounded-xl text-sm"
          />
        </div>

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
          onClick={() => navegarParaAba('login')}
          className="w-full text-xs text-gray-500 hover:underline pt-2"
        >
          Voltar para o Login
        </button>
      </form>
    );
  }

  if (aba === 'confirmar_wa') {
    return (
      <form onSubmit={confirmarCodigoCadastro} className="space-y-4">
        <h2 className="font-bold text-lg">Confirme seu WhatsApp</h2>
        <p className="text-xs text-gray-600">
          Digite o código de 6 dígitos enviado para o seu WhatsApp para liberar a porta e a carteira automaticamente:
        </p>
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          required
          placeholder="000000"
          value={codigoWa}
          onChange={(e) => setCodigoWa(e.target.value.replace(/\D/g, '').slice(0, 6))}
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
    );
  }

  return (
    <form onSubmit={salvarNovoPinWhatsApp} className="space-y-3">
      <h2 className="font-bold text-lg">Recuperar PIN via WhatsApp</h2>
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          maxLength={14}
          required
          placeholder="000.000.000-00"
          value={cpf}
          onChange={(e) => setCpf(formatarCPFVisual(e.target.value))}
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
        inputMode="numeric"
        maxLength={6}
        required
        placeholder="Código de 6 dígitos recebido no WhatsApp"
        value={codigoWa}
        onChange={(e) => setCodigoWa(e.target.value.replace(/\D/g, '').slice(0, 6))}
        className="w-full p-2.5 border rounded-xl text-sm"
      />
      <input
        type="password"
        inputMode="numeric"
        maxLength={4}
        required
        placeholder="Novo PIN de 4 dígitos"
        value={novoPin}
        onChange={(e) => setNovoPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
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
        onClick={() => navegarParaAba('login')}
        className="w-full text-xs text-gray-500 pt-1"
      >
        Voltar
      </button>
    </form>
  );
}