'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { calcularIdade } from '@/lib/formatters';
import AuthTelas from '@/components/AuthTelas';
import ModaisDependentes from '@/components/ModaisDependentes';
import ModaisPerfil from '@/components/ModaisPerfil';
import AbaMuralClassificados from '@/components/AbaMuralClassificados';
import AbaAdmin from '@/components/AbaAdmin';

const TEMPO_SESSAO_MS = 7 * 24 * 60 * 60 * 1000;
const CHAVE_STORAGE = 'vilamarket_sessao_v1';

export default function VilaMarketApp() {
  const [aba, setAba] = useState<'login' | 'cadastro' | 'confirmar_wa' | 'esqueci_pin' | 'painel'>('login');
  const [abaInferior, setAbaInferior] = useState<
    'inicio' | 'mural' | 'classificados' | 'ajuda' | 'perfil' | 'admin'
  >('inicio');
  const [condominioId, setCondominioId] = useState<string>('');
  const [mensagem, setMensagem] = useState<{ tipo: 'erro' | 'sucesso'; texto: string } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [verificandoSessao, setVerificandoSessao] = useState(true);

  // Usuário Logado
  const [usuarioLogado, setUsuarioLogado] = useState<any>(null);
  const [perfilDetalhes, setPerfilDetalhes] = useState<any>(null);
  const [selfieTemporariaUrl, setSelfieTemporariaUrl] = useState<string | null>(null);

  // Modais
  const [modalAtivo, setModalAtivo] = useState<
    | null
    | 'selfie'
    | 'pin'
    | 'extrato'
    | 'novo_dependente'
    | 'gerenciar_dependente'
    | 'pix_dependente'
    | 'novo_anuncio'
  >(null);

  // Listas
  const [extratoLista, setExtratoLista] = useState<any[]>([]);
  const [dependentesLista, setDependentesLista] = useState<any[]>([]);
  const [dependentesSelfiesMap, setDependentesSelfiesMap] = useState<Record<string, string>>({});
  const [depGerenciando, setDepGerenciando] = useState<any | null>(null);
  const [dependenteSelecionado, setDependenteSelecionado] = useState<any | null>(null);
  const [avisosLista, setAvisosLista] = useState<any[]>([]);
  const [classificadosLista, setClassificadosLista] = useState<any[]>([]);

  // =========================================================================
  // NAVEGAÇÃO COM ENDEREÇO NA URL E BOTÃO VOLTAR DO CELULAR/NAVEGADOR
  // =========================================================================
  function navegarParaAba(
    novaAba: 'login' | 'cadastro' | 'confirmar_wa' | 'esqueci_pin' | 'painel',
    novaAbaInferior?: 'inicio' | 'mural' | 'classificados' | 'ajuda' | 'perfil' | 'admin'
  ) {
    setAba(novaAba);
    const abaAlvo = novaAbaInferior || abaInferior;
    if (novaAbaInferior) setAbaInferior(novaAbaInferior);

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams();
      params.set('tela', novaAba);
      if (novaAba === 'painel') params.set('aba', abaAlvo);
      window.history.pushState({ tela: novaAba, aba: abaAlvo }, '', `?${params.toString()}`);
    }
  }

  function abrirModalComHistorico(
    novoModal:
      | 'selfie'
      | 'pin'
      | 'extrato'
      | 'novo_dependente'
      | 'gerenciar_dependente'
      | 'pix_dependente'
      | 'novo_anuncio'
  ) {
    setModalAtivo(novoModal);
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      params.set('modal', novoModal);
      window.history.pushState(
        { tela: aba, aba: abaInferior, modal: novoModal },
        '',
        `?${params.toString()}`
      );
    }
  }

  useEffect(() => {
    function aoVoltarNoNavegador(event: PopStateEvent) {
      if (modalAtivo) {
        setModalAtivo(null);
        return;
      }
      if (event.state?.tela) {
        setAba(event.state.tela);
        if (event.state.aba) setAbaInferior(event.state.aba);
      } else if (usuarioLogado && abaInferior !== 'inicio') {
        setAba('painel');
        setAbaInferior('inicio');
      }
    }

    window.addEventListener('popstate', aoVoltarNoNavegador);
    return () => window.removeEventListener('popstate', aoVoltarNoNavegador);
  }, [modalAtivo, usuarioLogado, abaInferior]);

  // =========================================================================
  // SESSÃO E STORAGE
  // =========================================================================
  function salvarSessaoNoNavegador(dadosUsuario: any) {
    try {
      localStorage.setItem(
        CHAVE_STORAGE,
        JSON.stringify({ usuario: dadosUsuario, expiraEm: Date.now() + TEMPO_SESSAO_MS })
      );
    } catch {}
  }

  function limparSessaoDoNavegador() {
    try {
      localStorage.removeItem(CHAVE_STORAGE);
    } catch {}
  }

  useEffect(() => {
    try {
      const salvo = localStorage.getItem(CHAVE_STORAGE);
      if (salvo) {
        const sessao = JSON.parse(salvo);
        if (sessao?.usuario && sessao?.expiraEm && Date.now() < sessao.expiraEm) {
          setUsuarioLogado(sessao.usuario);
          const params = new URLSearchParams(window.location.search);
          const abaUrl = params.get('aba') as any;
          const abasValidas = ['inicio', 'mural', 'classificados', 'ajuda', 'perfil', 'admin'];
          const abaInicial = abasValidas.includes(abaUrl) ? abaUrl : 'inicio';

          setAba('painel');
          setAbaInferior(abaInicial);
          window.history.replaceState(
            { tela: 'painel', aba: abaInicial },
            '',
            `?tela=painel&aba=${abaInicial}`
          );
        } else {
          localStorage.removeItem(CHAVE_STORAGE);
        }
      }
    } catch {
    } finally {
      setVerificandoSessao(false);
    }
  }, []);

  async function gerarUrlTemporariaSelfie(caminhoOuBase64: string | null): Promise<string | null> {
    if (!caminhoOuBase64) return null;
    if (caminhoOuBase64.startsWith('data:image') || caminhoOuBase64.startsWith('http')) {
      return caminhoOuBase64;
    }

    const chaveCache = `vm_selfie_cache_${caminhoOuBase64}`;
    try {
      const salvo = sessionStorage.getItem(chaveCache);
      if (salvo) {
        const { url, expiraEm } = JSON.parse(salvo);
        if (url && expiraEm && Date.now() < expiraEm) return url;
      }
    } catch {}

    const { data, error } = await supabase.storage
      .from('selfies')
      .createSignedUrl(caminhoOuBase64, 600);
    if (error || !data?.signedUrl) return null;

    try {
      sessionStorage.setItem(
        chaveCache,
        JSON.stringify({ url: data.signedUrl, expiraEm: Date.now() + 8 * 60 * 1000 })
      );
    } catch {}
    return data.signedUrl;
  }

  async function enviarSelfieParaStoragePrivado(fotoBase64: string, perfilIdAlvo: string): Promise<string> {
    const resposta = await fetch(fotoBase64);
    const blob = await resposta.blob();
    const caminhoArquivo = `${perfilIdAlvo}/facial_${Date.now()}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from('selfies')
      .upload(caminhoArquivo, blob, { contentType: 'image/jpeg', upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    return caminhoArquivo;
  }

  async function carregarDadosDashboard() {
    const idAlvo = usuarioLogado?.perfil_id;
    if (!idAlvo) return;

    if (usuarioLogado?.selfie_url) {
      gerarUrlTemporariaSelfie(usuarioLogado.selfie_url).then((url) => {
        if (url && usuarioLogado?.perfil_id === idAlvo) setSelfieTemporariaUrl(url);
      });
    } else {
      setSelfieTemporariaUrl(null);
    }

    const [resPerfil, resDeps] = await Promise.all([
      supabase
        .from('perfis')
        .select(
          'id, condominio_id, unidade_id, complemento_apto, unidade_formatada, nome_completo, cpf, data_nascimento, whatsapp, role, selfie_url, status_facial, status_cadastro, saldo_cashback, saldo_pre_pago'
        )
        .eq('id', idAlvo)
        .single(),
      supabase
        .from('perfis')
        .select('id, nome_completo, cpf, role, selfie_url, status_facial, status_cadastro, saldo_pre_pago, criado_em')
        .eq('titular_id', idAlvo)
        .order('criado_em', { ascending: true }),
    ]);

    if (usuarioLogado?.perfil_id !== idAlvo) return;

    const perfil = resPerfil.data;
    if (perfil) {
      setPerfilDetalhes(perfil);
      if (perfil.condominio_id) setCondominioId(perfil.condominio_id);

      if (perfil.selfie_url) {
        const urlSegura = await gerarUrlTemporariaSelfie(perfil.selfie_url);
        if (urlSegura && usuarioLogado?.perfil_id === idAlvo) setSelfieTemporariaUrl(urlSegura);
      } else {
        setSelfieTemporariaUrl(null);
      }

      if (perfil.role === 'titular' || perfil.role === 'admin') {
        const deps = resDeps.data || [];
        setDependentesLista(deps);

        const mapaFotos: Record<string, string> = {};
        await Promise.all(
          deps.map(async (d: any) => {
            if (d.selfie_url) {
              const u = await gerarUrlTemporariaSelfie(d.selfie_url);
              if (u) mapaFotos[d.id] = u;
            }
          })
        );
        setDependentesSelfiesMap(mapaFotos);
      }
    }
  }

  async function carregarMuralEClassificados() {
    const [resAvisos, resClass] = await Promise.all([
      supabase
        .from('avisos_mural')
        .select('*')
        .order('fixado', { ascending: false })
        .order('criado_em', { ascending: false }),
      supabase
        .from('classificados')
        .select('*, perfis:anunciante_id (nome_completo, unidade_formatada)')
        .order('criado_em', { ascending: false }),
    ]);
    if (resAvisos.data) setAvisosLista(resAvisos.data);
    if (resClass.data) setClassificadosLista(resClass.data);
  }

  useEffect(() => {
    if (aba === 'painel' && usuarioLogado?.perfil_id) {
      setPerfilDetalhes(null);
      setSelfieTemporariaUrl(null);
      setDependentesLista([]);
      setDependentesSelfiesMap({});
      carregarDadosDashboard();
      carregarMuralEClassificados();
    }
  }, [aba, usuarioLogado?.perfil_id]);

  async function abrirModalExtrato() {
    abrirModalComHistorico('extrato');
    const idsFamilia = [usuarioLogado.perfil_id, ...dependentesLista.map((d) => d.id)];
    const { data } = await supabase
      .from('transacoes_carteira')
      .select('*')
      .in('perfil_id', idsFamilia)
      .order('criado_em', { ascending: false })
      .limit(30);
    setExtratoLista(data || []);
  }

  async function solicitarExclusaoDadosLgpd() {
    const confirmou = window.confirm(
      'Deseja solicitar a exclusão dos seus dados biométricos (selfie) e encerramento da conta conforme a LGPD?'
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
        .update({ selfie_url: null, status_facial: 'bloqueado', status_cadastro: 'bloqueado' })
        .eq('id', usuarioLogado.perfil_id);

      alert('Seus dados biométricos foram removidos e seu acesso foi encerrado conforme a LGPD.');
      limparSessaoDoNavegador();
      setUsuarioLogado(null);
      navegarParaAba('login');
    } catch {
      alert('Não foi possível processar automaticamente. Contate a administração da Vila.');
    } finally {
      setCarregando(false);
    }
  }

  const temSelfie = Boolean(perfilDetalhes?.selfie_url || usuarioLogado?.selfie_url || selfieTemporariaUrl);
  const roleUsuario = perfilDetalhes?.role || usuarioLogado?.role || 'titular';
  const ehMenorDeIdade =
    roleUsuario === 'dependente' && perfilDetalhes?.data_nascimento
      ? calcularIdade(perfilDetalhes.data_nascimento) < 18
      : false;

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

          {aba !== 'painel' && (
            <AuthTelas
              aba={aba}
              navegarParaAba={navegarParaAba}
              setMensagem={setMensagem}
              onLoginSucesso={(dadosUsuario) => {
                setUsuarioLogado(dadosUsuario);
                salvarSessaoNoNavegador(dadosUsuario);
                navegarParaAba('painel', 'inicio');
              }}
            />
          )}

          {aba === 'painel' && usuarioLogado && (
            <div className="space-y-5">
              {/* ABA INÍCIO */}
              {abaInferior === 'inicio' && (
                <>
                  {!temSelfie ? (
                    <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-bold uppercase text-amber-800">
                          ⚠️ Selfie Facial Pendente
                        </p>
                        <button
                          type="button"
                          onClick={() => abrirModalComHistorico('selfie')}
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

                      <button
                        type="button"
                        onClick={() => abrirModalComHistorico('selfie')}
                        title="Toque na foto para ampliar ou atualizar"
                        className="shrink-0 group focus:outline-none"
                      >
                        {selfieTemporariaUrl ? (
                          <img
                            key={usuarioLogado.perfil_id}
                            src={selfieTemporariaUrl}
                            alt="Sua selfie"
                            className="w-16 h-16 rounded-full object-cover border-2 border-emerald-600 shadow-md group-hover:scale-105 transition"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-full bg-emerald-100 border-2 border-emerald-600 flex items-center justify-center">
                            <span className="w-5 h-5 border-2 border-emerald-700 border-t-transparent rounded-full animate-spin" />
                          </div>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Cards de Saldo */}
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

                  {/* Meus Dependentes */}
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
                          onClick={() => abrirModalComHistorico('novo_dependente')}
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
                          {dependentesLista.map((dep) => {
                            const depBloqueado = dep.status_cadastro === 'bloqueado';
                            const depFotoUrl = dependentesSelfiesMap[dep.id];
                            return (
                              <div
                                key={dep.id}
                                className="flex items-center justify-between gap-2 bg-gray-50 border border-gray-200 p-3 rounded-xl"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  {depFotoUrl ? (
                                    <img
                                      src={depFotoUrl}
                                      alt={dep.nome_completo}
                                      className="w-10 h-10 rounded-full object-cover border border-emerald-600 shrink-0"
                                    />
                                  ) : (
                                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-xs font-bold text-amber-800 shrink-0">
                                      👤
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <p className="text-sm font-bold text-grafite truncate">
                                        {dep.nome_completo}
                                      </p>
                                      <span
                                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                          depBloqueado
                                            ? 'bg-red-100 text-red-700'
                                            : dep.selfie_url
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : 'bg-amber-100 text-amber-800'
                                        }`}
                                      >
                                        {depBloqueado
                                          ? 'Bloqueado'
                                          : dep.selfie_url
                                          ? 'Facial Ativo'
                                          : 'Sem Selfie'}
                                      </span>
                                    </div>
                                    <p className="text-xs text-emerald-700 font-semibold">
                                      Saldo: R$ {Number(dep.saldo_pre_pago || 0).toFixed(2)}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDependenteSelecionado(dep);
                                      abrirModalComHistorico('pix_dependente');
                                    }}
                                    className="bg-ambar text-white text-[11px] font-bold px-2.5 py-1.5 rounded-xl transition"
                                  >
                                    + Saldo
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDepGerenciando(dep);
                                      abrirModalComHistorico('gerenciar_dependente');
                                    }}
                                    className="bg-gray-200 hover:bg-gray-300 text-gray-800 text-[11px] font-bold px-2.5 py-1.5 rounded-xl transition"
                                  >
                                    ⚙️ Gerenciar
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* ABAS MURAL & CLASSIFICADOS */}
              {(abaInferior === 'mural' || (abaInferior === 'classificados' && !ehMenorDeIdade)) && (
                <AbaMuralClassificados
                  abaAtiva={abaInferior}
                  avisosLista={avisosLista}
                  classificadosLista={classificadosLista}
                  usuarioLogado={usuarioLogado}
                  perfilDetalhes={perfilDetalhes}
                  condominioId={condominioId}
                  modalNovoAnuncioAberto={modalAtivo === 'novo_anuncio'}
                  abrirModalNovoAnuncio={() => abrirModalComHistorico('novo_anuncio')}
                  fecharModalNovoAnuncio={() => setModalAtivo(null)}
                  onRecarregarDados={carregarMuralEClassificados}
                  setMensagem={setMensagem}
                />
              )}

              {/* ABA AJUDA */}
              {abaInferior === 'ajuda' && (
                <div className="space-y-4">
                  <h2 className="text-lg font-bold text-grafite">Como Usar o VilaMarket</h2>

                  <div className="space-y-2.5 text-xs">
                    <div className="bg-gray-50 border border-gray-200 p-3.5 rounded-xl space-y-1">
                      <p className="font-bold text-floresta">1. Abertura da Porta (Acesso Facial)</p>
                      <p className="text-gray-600">
                        Cadastre sua selfie na tela inicial com boa iluminação. Ao chegar na porta do
                        minimercado, olhe para o leitor facial e a trava será liberada em menos de 1
                        segundo.
                      </p>
                    </div>

                    <div className="bg-gray-50 border border-gray-200 p-3.5 rounded-xl space-y-1">
                      <p className="font-bold text-floresta">2. Pagamento no Caixa & Cashback 2%</p>
                      <p className="text-gray-600">
                        Escaneie seus produtos no totem. Pagando via Pix você recebe 2% de volta na
                        hora, ou pode usar seu Saldo Cashback e Saldo Pré-Pago digitando CPF + PIN.
                      </p>
                    </div>

                    <div className="bg-gray-50 border border-gray-200 p-3.5 rounded-xl space-y-1">
                      <p className="font-bold text-floresta">3. Dependentes & Classificados</p>
                      <p className="text-gray-600">
                        Titulares podem cadastrar dependentes (a partir de 12 anos) com saldo pré-pago
                        individual e anunciar produtos ou serviços nos Classificados da Vila.
                      </p>
                    </div>
                  </div>

                  <a
                    href="https://wa.me/5541991455623?text=Ol%C3%A1!%20Preciso%20de%20ajuda%20com%20o%20app%20VilaMarket."
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full text-center bg-floresta hover:bg-floresta-claro text-white font-bold py-3 rounded-xl text-xs transition"
                  >
                    💬 Falar com o Suporte VilaMarket
                  </a>
                </div>
              )}

              {/* ABA PERFIL */}
              {abaInferior === 'perfil' && (
                <div className="space-y-4">
                  <h2 className="text-lg font-bold text-grafite">Meu Perfil</h2>

                  <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl flex items-center gap-3.5">
                    <button
                      type="button"
                      onClick={() => abrirModalComHistorico('selfie')}
                      className="relative shrink-0 group focus:outline-none"
                      title="Toque na foto para ampliar ou atualizar"
                    >
                      {temSelfie && selfieTemporariaUrl ? (
                        <img
                          key={usuarioLogado.perfil_id}
                          src={selfieTemporariaUrl}
                          alt="Selfie do perfil"
                          className="w-16 h-16 rounded-full object-cover border-2 border-floresta shadow-sm group-hover:opacity-90 transition"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-amber-100 border-2 border-amber-400 flex items-center justify-center text-2xl">
                          📷
                        </div>
                      )}
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

                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => abrirModalComHistorico('selfie')}
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
                              ? 'Conferir foto atual ou capturar nova'
                              : 'Cadastrar foto do rosto para liberar a porta'}
                          </p>
                        </div>
                      </div>
                      <span className="text-gray-400 text-xs">›</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => abrirModalComHistorico('pin')}
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
                      try { sessionStorage.clear(); } catch {}
                      setUsuarioLogado(null);
                      setPerfilDetalhes(null);
                      setSelfieTemporariaUrl(null);
                      setDependentesLista([]);
                      setDependentesSelfiesMap({});
                      navegarParaAba('login');
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

              {/* ABA ADMIN */}
              {abaInferior === 'admin' && roleUsuario === 'admin' && (
                <AbaAdmin
                  usuarioLogado={usuarioLogado}
                  perfilDetalhes={perfilDetalhes}
                  condominioId={condominioId}
                  gerarUrlTemporariaSelfie={gerarUrlTemporariaSelfie}
                  onAtualizarMuralEClassificados={carregarMuralEClassificados}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* MODAIS DE DEPENDENTES */}
      <ModaisDependentes
        modalAtivo={modalAtivo}
        fecharModal={() => setModalAtivo(null)}
        usuarioLogado={usuarioLogado}
        perfilDetalhes={perfilDetalhes}
        condominioId={condominioId}
        depGerenciando={depGerenciando}
        dependenteSelecionado={dependenteSelecionado}
        dependentesSelfiesMap={dependentesSelfiesMap}
        enviarSelfieParaStoragePrivado={enviarSelfieParaStoragePrivado}
        onAtualizarListaDependentes={async (novoDep, fotoBase64) => {
          if (novoDep) {
            setDependentesLista((prev) => [...prev, novoDep]);
            if (fotoBase64) {
              setDependentesSelfiesMap((prev) => ({ ...prev, [novoDep.id]: fotoBase64 }));
            }
          }
          await carregarDadosDashboard();
        }}
      />

      {/* MODAIS DO PERFIL (SELFIE, PIN, EXTRATO) */}
      <ModaisPerfil
        modalAtivo={modalAtivo}
        fecharModal={() => setModalAtivo(null)}
        usuarioLogado={usuarioLogado}
        temSelfie={temSelfie}
        selfieTemporariaUrl={selfieTemporariaUrl}
        extratoLista={extratoLista}
        enviarSelfieParaStoragePrivado={enviarSelfieParaStoragePrivado}
        onSelfieAtualizada={(caminhoPrivado, fotoSalva) => {
          setSelfieTemporariaUrl(fotoSalva);
          setPerfilDetalhes((prev: any) => ({
            ...(prev || {}),
            selfie_url: caminhoPrivado,
            status_facial: 'ativo',
          }));
          const atualizado = {
            ...usuarioLogado,
            selfie_url: caminhoPrivado,
            status_facial: 'ativo',
          };
          setUsuarioLogado(atualizado);
          salvarSessaoNoNavegador(atualizado);
          setMensagem({
            tipo: 'sucesso',
            texto: '✅ Selfie salva e sincronizada! Seu acesso facial na porta já está ativo.',
          });
          carregarDadosDashboard();
        }}
      />

      {/* BARRA DE NAVEGAÇÃO INFERIOR */}
      {aba === 'painel' && usuarioLogado && (
        <nav className="fixed bottom-3 left-0 right-0 px-2 z-40 pointer-events-none">
          <div className="max-w-md mx-auto bg-white/95 backdrop-blur border border-gray-200 shadow-lg rounded-2xl px-1.5 py-1.5 flex items-center justify-between gap-0.5 pointer-events-auto">
            <button
              type="button"
              onClick={() => navegarParaAba('painel', 'inicio')}
              className={`flex-1 min-h-[48px] px-1 py-1.5 rounded-xl flex flex-col items-center justify-center transition ${
                abaInferior === 'inicio'
                  ? 'bg-emerald-50 text-floresta font-bold'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <span className="text-base leading-none">🏠</span>
              <span className="text-[10px] mt-1">Início</span>
            </button>

            <button
              type="button"
              onClick={() => navegarParaAba('painel', 'mural')}
              className={`flex-1 min-h-[48px] px-1 py-1.5 rounded-xl flex flex-col items-center justify-center transition ${
                abaInferior === 'mural'
                  ? 'bg-emerald-50 text-floresta font-bold'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <span className="text-base leading-none">📢</span>
              <span className="text-[10px] mt-1">Mural</span>
            </button>

            {!ehMenorDeIdade && (
              <button
                type="button"
                onClick={() => navegarParaAba('painel', 'classificados')}
                className={`flex-1 min-h-[48px] px-1 py-1.5 rounded-xl flex flex-col items-center justify-center transition ${
                  abaInferior === 'classificados'
                    ? 'bg-emerald-50 text-floresta font-bold'
                    : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                <span className="text-base leading-none">🏷️</span>
                <span className="text-[10px] mt-1">Anúncios</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => navegarParaAba('painel', 'ajuda')}
              className={`flex-1 min-h-[48px] px-1 py-1.5 rounded-xl flex flex-col items-center justify-center transition ${
                abaInferior === 'ajuda'
                  ? 'bg-emerald-50 text-floresta font-bold'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <span className="text-base leading-none">❓</span>
              <span className="text-[10px] mt-1">Ajuda</span>
            </button>

            <button
              type="button"
              onClick={() => navegarParaAba('painel', 'perfil')}
              className={`flex-1 min-h-[48px] px-1 py-1.5 rounded-xl flex flex-col items-center justify-center transition ${
                abaInferior === 'perfil'
                  ? 'bg-emerald-50 text-floresta font-bold'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <span className="text-base leading-none">👤</span>
              <span className="text-[10px] mt-1">Perfil</span>
            </button>

            {roleUsuario === 'admin' && (
              <button
                type="button"
                onClick={() => navegarParaAba('painel', 'admin')}
                className={`flex-1 min-h-[48px] px-1 py-1.5 rounded-xl flex flex-col items-center justify-center transition ${
                  abaInferior === 'admin'
                    ? 'bg-emerald-50 text-floresta font-bold'
                    : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                <span className="text-base leading-none">⚙️</span>
                <span className="text-[10px] mt-1">Admin</span>
              </button>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}