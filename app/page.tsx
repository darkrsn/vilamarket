'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import AuthTelas from '@/components/AuthTelas';
import AbaInicio from '@/components/AbaInicio';
import AbaEstoqueScanGo from '@/components/AbaEstoqueScanGo';
import AbaMuralClassificados from '@/components/AbaMuralClassificados';
import AbaAdmin from '@/components/AbaAdmin';
import ModaisDependentes from '@/components/ModaisDependentes';
import ModaisPerfil from '@/components/ModaisPerfil';

const TEMPO_SESSAO_MS = 7 * 24 * 60 * 60 * 1000;
const CHAVE_STORAGE = 'vilamarket_sessao_v1';

type AbaPrincipal = 'login' | 'cadastro' | 'confirmar_wa' | 'esqueci_pin' | 'painel';
type AbaInferior = 'inicio' | 'estoque' | 'mural' | 'ajuda' | 'perfil' | 'admin';

const PASSOS_AJUDA = [
  {
    titulo: '1. Abertura da Porta (Acesso Facial)',
    texto: 'Cadastre sua selfie na tela inicial com boa iluminação. Ao chegar na porta do minimercado, olhe para o leitor facial e a trava será liberada em menos de 1 segundo.',
  },
  {
    titulo: '2. Totem ou Scan & Go no Celular',
    texto: 'Você pode pagar no totem da loja ou escanear os produtos direto pelo celular na aba Estoque. Pagando via Pix você recebe 2% de cashback na hora.',
  },
  {
    titulo: '3. Dependentes & Controle Familiar',
    texto: 'Titulares podem cadastrar dependentes (a partir de 12 anos) com saldo pré-pago individual e acompanhar cada compra no extrato detalhado.',
  },
];

async function gerarUrlTemporariaSelfie(caminhoOuBase64: string | null): Promise<string | null> {
  if (!caminhoOuBase64) return null;
  if (caminhoOuBase64.startsWith('data:image') || caminhoOuBase64.startsWith('http')) return caminhoOuBase64;

  const chaveCache = `vm_selfie_cache_${caminhoOuBase64}`;
  try {
    const salvo = sessionStorage.getItem(chaveCache);
    if (salvo) {
      const { url, expiraEm } = JSON.parse(salvo);
      if (url && expiraEm && Date.now() < expiraEm) return url;
    }
  } catch {}

  const { data, error } = await supabase.storage.from('selfies').createSignedUrl(caminhoOuBase64, 600);
  if (error || !data?.signedUrl) return null;

  try {
    sessionStorage.setItem(chaveCache, JSON.stringify({ url: data.signedUrl, expiraEm: Date.now() + 8 * 60 * 1000 }));
  } catch {}
  return data.signedUrl;
}

async function enviarSelfieParaStoragePrivado(fotoBase64: string, perfilIdAlvo: string): Promise<string> {
  const blob = await (await fetch(fotoBase64)).blob();
  const caminhoArquivo = `${perfilIdAlvo}/facial_${Date.now()}.jpg`;
  const { error } = await supabase.storage.from('selfies').upload(caminhoArquivo, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return caminhoArquivo;
}

function salvarSessaoNoNavegador(dadosUsuario: any, cpfLimpo: string) {
  try {
    localStorage.setItem(
      CHAVE_STORAGE,
      JSON.stringify({ usuario: dadosUsuario, cpf: cpfLimpo, expiraEm: Date.now() + TEMPO_SESSAO_MS })
    );
  } catch {}
}

function limparSessaoDoNavegador() {
  try {
    localStorage.removeItem(CHAVE_STORAGE);
  } catch {}
}

export default function VilaMarketApp() {
  const [aba, setAba] = useState<AbaPrincipal>('login');
  const [abaInferior, setAbaInferior] = useState<AbaInferior>('inicio');
  const [condominioId, setCondominioId] = useState('');
  const [mensagem, setMensagem] = useState<{ tipo: 'erro' | 'sucesso'; texto: string } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [verificandoSessao, setVerificandoSessao] = useState(true);

  const [cpfLogin, setCpfLogin] = useState('');
  const [usuarioLogado, setUsuarioLogado] = useState<any>(null);
  const [perfilDetalhes, setPerfilDetalhes] = useState<any>(null);
  const [selfieTemporariaUrl, setSelfieTemporariaUrl] = useState<string | null>(null);

  const [modalAtivo, setModalAtivo] = useState<string | null>(null);
  const [carrinhoScanGo, setCarrinhoScanGo] = useState<any[]>([]);
  const [abrirScanGoDireto, setAbrirScanGoDireto] = useState(false);

  const [extratoLista, setExtratoLista] = useState<any[]>([]);
  const [dependentesLista, setDependentesLista] = useState<any[]>([]);
  const [dependentesSelfiesMap, setDependentesSelfiesMap] = useState<Record<string, string>>({});
  const [depGerenciando, setDepGerenciando] = useState<any | null>(null);
  const [dependenteSelecionado, setDependenteSelecionado] = useState<any | null>(null);
  const [avisosLista, setAvisosLista] = useState<any[]>([]);

  function navegarParaAba(novaAba: AbaPrincipal, novaAbaInferior?: any) {
    setAba(novaAba);
    const abaAlvo = novaAbaInferior || abaInferior;
    if (novaAbaInferior) setAbaInferior(novaAbaInferior);

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams({ tela: novaAba });
      if (novaAba === 'painel') params.set('aba', abaAlvo);
      window.history.pushState({ tela: novaAba, aba: abaAlvo }, '', `?${params.toString()}`);
    }
  }

  useEffect(() => {
    const aoVoltarNoNavegador = (event: PopStateEvent) => {
      if (modalAtivo) return setModalAtivo(null);
      if (event.state?.tela) {
        setAba(event.state.tela);
        if (event.state.aba) setAbaInferior(event.state.aba);
      } else if (usuarioLogado && abaInferior !== 'inicio') {
        setAba('painel');
        setAbaInferior('inicio');
      }
    };
    window.addEventListener('popstate', aoVoltarNoNavegador);
    return () => window.removeEventListener('popstate', aoVoltarNoNavegador);
  }, [modalAtivo, usuarioLogado, abaInferior]);

  useEffect(() => {
    try {
      const salvo = localStorage.getItem(CHAVE_STORAGE);
      if (salvo) {
        const sessao = JSON.parse(salvo);
        if (sessao?.usuario && sessao?.expiraEm && Date.now() < sessao.expiraEm) {
          setUsuarioLogado(sessao.usuario);
          if (sessao.cpf) setCpfLogin(sessao.cpf);
          setAba('painel');
        } else {
          limparSessaoDoNavegador();
        }
      }
    } catch {
    } finally {
      setVerificandoSessao(false);
    }
  }, []);

  useEffect(() => {
    if (aba === 'painel' && usuarioLogado?.perfil_id) {
      carregarDadosDashboard();
      carregarMural();
    }
  }, [aba, usuarioLogado?.perfil_id]);

  async function carregarMural() {
    const { data } = await supabase
      .from('avisos_mural')
      .select('*')
      .order('fixado', { ascending: false })
      .order('criado_em', { ascending: false });
    if (data) setAvisosLista(data);
  }

  async function carregarDadosDashboard(novoDep?: any, fotoBase64?: string | null) {
    if (!usuarioLogado?.perfil_id) return;

    if (novoDep) {
      setDependentesLista((prev) => [...prev, novoDep]);
      if (fotoBase64) setDependentesSelfiesMap((prev) => ({ ...prev, [novoDep.id]: fotoBase64 }));
    }

    if (usuarioLogado?.selfie_url && !selfieTemporariaUrl) {
      gerarUrlTemporariaSelfie(usuarioLogado.selfie_url).then((url) => url && setSelfieTemporariaUrl(url));
    }

    const [resPerfil, resDeps] = await Promise.all([
      supabase
        .from('perfis')
        .select('id, condominio_id, unidade_id, complemento_apto, unidade_formatada, nome_completo, cpf, data_nascimento, whatsapp, role, selfie_url, status_facial, status_cadastro, saldo_cashback, saldo_pre_pago')
        .eq('id', usuarioLogado.perfil_id)
        .single(),
      supabase
        .from('perfis')
        .select('id, nome_completo, cpf, role, selfie_url, status_facial, status_cadastro, saldo_pre_pago, criado_em')
        .eq('titular_id', usuarioLogado.perfil_id)
        .order('criado_em', { ascending: true }),
    ]);

    const perfil = resPerfil.data;
    if (!perfil) return;

    setPerfilDetalhes(perfil);
    if (perfil.condominio_id) setCondominioId(perfil.condominio_id);
    setSelfieTemporariaUrl(perfil.selfie_url ? await gerarUrlTemporariaSelfie(perfil.selfie_url) : null);

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
      setDependentesSelfiesMap((prev) => ({ ...prev, ...mapaFotos }));
    }
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

  async function solicitarExclusaoDadosLgpd() {
    if (!window.confirm('Deseja solicitar a exclusão dos seus dados biométricos (selfie) e encerramento da conta conforme a LGPD?')) return;
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

      alert('Seus dados biométricos foram removidos conforme a LGPD.');
      limparSessaoDoNavegador();
      setUsuarioLogado(null);
      navegarParaAba('login');
    } catch {
      alert('Não foi possível processar automaticamente. Contate a administração.');
    } finally {
      setCarregando(false);
    }
  }

  const temSelfie = Boolean(perfilDetalhes?.selfie_url || usuarioLogado?.selfie_url || selfieTemporariaUrl);
  const roleUsuario = perfilDetalhes?.role || usuarioLogado?.role || 'titular';
  const qtdItensCarrinho = carrinhoScanGo.reduce((acc, item) => acc + item.quantidade, 0);

  const abasMenu: { id: AbaInferior; icone: string; label: string; badge?: number }[] = [
    { id: 'inicio', icone: '🏠', label: 'Início' },
    { id: 'estoque', icone: '🛒', label: 'Estoque', badge: qtdItensCarrinho },
    { id: 'mural', icone: '📢', label: 'Mural' },
    { id: 'ajuda', icone: '❓', label: 'Ajuda' },
    { id: 'perfil', icone: '👤', label: 'Perfil' },
    ...(roleUsuario === 'admin' ? [{ id: 'admin' as AbaInferior, icone: '⚙️', label: 'Admin' }] : []),
  ];

  const acoesPerfil = [
    { icone: '📷', titulo: 'Minha Selfie (Acesso Facial)', sub: 'Conferir foto atual ou capturar nova', onClick: () => setModalAtivo('selfie') },
    { icone: '🔐', titulo: 'Alterar PIN (4 dígitos)', sub: 'Senha numérica do app, Scan & Go e caixa', onClick: () => setModalAtivo('pin') },
    { icone: '📄', titulo: 'Extrato & Recibos Detalhados', sub: 'Itens comprados, cashback e recibos NFC-e', onClick: abrirModalExtrato },
  ];

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
          <p className="text-xs text-emerald-200 mt-1">Minimercado Autônomo • Vila Militar do Bacacheri</p>
        </div>

        <div className="p-6">
          {mensagem && (
            <div
              className={`mb-4 p-3 rounded-lg text-sm font-medium border ${
                mensagem.tipo === 'erro'
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
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
              onLoginSucesso={(dadosUsuario, cpfLimpo) => {
                setUsuarioLogado(dadosUsuario);
                setCpfLogin(cpfLimpo);
                salvarSessaoNoNavegador(dadosUsuario, cpfLimpo);
                navegarParaAba('painel', 'inicio');
              }}
            />
          )}

          {aba === 'painel' && usuarioLogado && (
            <div className="space-y-5">
              {abaInferior === 'inicio' && (
                <AbaInicio
                  usuarioLogado={usuarioLogado}
                  perfilDetalhes={perfilDetalhes}
                  temSelfie={temSelfie}
                  selfieTemporariaUrl={selfieTemporariaUrl}
                  roleUsuario={roleUsuario}
                  dependentesLista={dependentesLista}
                  dependentesSelfiesMap={dependentesSelfiesMap}
                  avisosLista={avisosLista}
                  onAbrirSelfie={() => setModalAtivo('selfie')}
                  onAbrirScanGo={() => {
                    setAbrirScanGoDireto(true);
                    navegarParaAba('painel', 'estoque');
                  }}
                  onAbrirNovoDependente={() => setModalAtivo('novo_dependente')}
                  onGerenciarDependente={(dep) => {
                    setDepGerenciando(dep);
                    setModalAtivo('gerenciar_dependente');
                  }}
                  onAbrirPixDependente={(dep) => {
                    setDependenteSelecionado(dep);
                    setModalAtivo('pix_dependente');
                  }}
                  onVerMural={() => navegarParaAba('painel', 'mural')}
                />
              )}

              {abaInferior === 'estoque' && (
                <AbaEstoqueScanGo
                  usuarioLogado={usuarioLogado}
                  perfilDetalhes={perfilDetalhes}
                  condominioId={condominioId}
                  roleUsuario={roleUsuario}
                  cpfLogin={cpfLogin}
                  onAtualizarDashboard={carregarDadosDashboard}
                  onMensagem={setMensagem}
                  carrinho={carrinhoScanGo}
                  setCarrinho={setCarrinhoScanGo}
                  abrirScanGoDireto={abrirScanGoDireto}
                  onFecharScanGoDireto={() => setAbrirScanGoDireto(false)}
                />
              )}

              {abaInferior === 'mural' && (
                <AbaMuralClassificados
                  abaAtiva="mural"
                  avisosLista={avisosLista}
                  classificadosLista={[]}
                  usuarioLogado={usuarioLogado}
                  perfilDetalhes={perfilDetalhes}
                  condominioId={condominioId}
                  modalNovoAnuncioAberto={false}
                  abrirModalNovoAnuncio={() => {}}
                  fecharModalNovoAnuncio={() => {}}
                  onRecarregarDados={carregarMural}
                  setMensagem={setMensagem}
                />
              )}

              {abaInferior === 'ajuda' && (
                <div className="space-y-4">
                  <h2 className="text-lg font-bold text-grafite">Como Usar o VilaMarket</h2>
                  <div className="space-y-2.5 text-xs">
                    {PASSOS_AJUDA.map((passo) => (
                      <div key={passo.titulo} className="bg-gray-50 border border-gray-200 p-3.5 rounded-xl space-y-1">
                        <p className="font-bold text-floresta">{passo.titulo}</p>
                        <p className="text-gray-600">{passo.texto}</p>
                      </div>
                    ))}
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

              {abaInferior === 'perfil' && (
                <div className="space-y-4">
                  <h2 className="text-lg font-bold text-grafite">Meu Perfil</h2>

                  <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl flex items-center gap-3.5">
                    <button type="button" onClick={() => setModalAtivo('selfie')} className="relative shrink-0 group focus:outline-none">
                      {temSelfie && selfieTemporariaUrl ? (
                        <img
                          key={`perfil_${usuarioLogado?.perfil_id}`}
                          src={selfieTemporariaUrl}
                          alt="Selfie do perfil"
                          className="w-16 h-16 rounded-full object-cover border-2 border-floresta shadow-sm"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-amber-100 border-2 border-amber-400 flex items-center justify-center text-2xl">
                          📷
                        </div>
                      )}
                    </button>

                    <div className="text-xs space-y-1 text-gray-700 min-w-0">
                      <p className="font-bold text-sm text-grafite truncate">{usuarioLogado.nome_completo}</p>
                      <p className="text-gray-600 truncate">{usuarioLogado.unidade_formatada || usuarioLogado.unidade}</p>
                      <p className="text-[11px] font-semibold text-emerald-700">
                        {temSelfie ? '✅ Facial ativo (toque na foto para ampliar)' : '⚠️ Selfie pendente para porta'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {acoesPerfil.map((acao) => (
                      <button
                        key={acao.titulo}
                        type="button"
                        onClick={acao.onClick}
                        className="w-full flex items-center justify-between p-3.5 bg-white hover:bg-emerald-50/60 border border-gray-200 rounded-xl transition text-left"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{acao.icone}</span>
                          <div>
                            <p className="text-xs font-bold text-grafite">{acao.titulo}</p>
                            <p className="text-[11px] text-gray-500">{acao.sub}</p>
                          </div>
                        </div>
                        <span className="text-gray-400 text-xs">›</span>
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      limparSessaoDoNavegador();
                      setUsuarioLogado(null);
                      navegarParaAba('login');
                    }}
                    className="w-full py-3 text-xs font-bold text-gray-700 border border-gray-300 rounded-xl hover:bg-gray-50"
                  >
                    Sair da Conta
                  </button>

                  <div className="pt-2 border-t border-gray-200 text-center">
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

              {abaInferior === 'admin' && roleUsuario === 'admin' && (
                <AbaAdmin
                  usuarioLogado={usuarioLogado}
                  perfilDetalhes={perfilDetalhes}
                  condominioId={condominioId}
                  gerarUrlTemporariaSelfie={gerarUrlTemporariaSelfie}
                  onAtualizarMuralEClassificados={carregarMural}
                />
              )}
            </div>
          )}
        </div>
      </div>

      <ModaisDependentes
        modalAtivo={modalAtivo}
        fecharModal={() => {
          setDepGerenciando(null);
          setDependenteSelecionado(null);
          setModalAtivo(null);
        }}
        usuarioLogado={usuarioLogado}
        perfilDetalhes={perfilDetalhes}
        condominioId={condominioId}
        depGerenciando={depGerenciando}
        dependenteSelecionado={dependenteSelecionado}
        dependentesSelfiesMap={dependentesSelfiesMap}
        enviarSelfieParaStoragePrivado={enviarSelfieParaStoragePrivado}
        onAtualizarListaDependentes={carregarDadosDashboard}
      />

      <ModaisPerfil
        modalAtivo={modalAtivo}
        fecharModal={() => setModalAtivo(null)}
        usuarioLogado={usuarioLogado}
        temSelfie={temSelfie}
        selfieTemporariaUrl={selfieTemporariaUrl}
        extratoLista={extratoLista}
        enviarSelfieParaStoragePrivado={enviarSelfieParaStoragePrivado}
        onSelfieAtualizada={(caminhoPrivado, fotoBase64) => {
          setSelfieTemporariaUrl(fotoBase64);
          setPerfilDetalhes((prev: any) => ({ ...(prev || {}), selfie_url: caminhoPrivado, status_facial: 'ativo' }));
          const usuarioAtualizado = { ...usuarioLogado, selfie_url: caminhoPrivado, status_facial: 'ativo' };
          setUsuarioLogado(usuarioAtualizado);
          salvarSessaoNoNavegador(usuarioAtualizado, cpfLogin);
          setMensagem({ tipo: 'sucesso', texto: '✅ Selfie salva! Seu acesso facial na porta já está ativo.' });
          carregarDadosDashboard();
        }}
      />

      {aba === 'painel' && usuarioLogado && (
        <nav className="fixed bottom-3 left-0 right-0 px-2 z-40 pointer-events-none">
          <div className="max-w-md mx-auto bg-white/95 backdrop-blur border border-gray-200 shadow-lg rounded-2xl px-1.5 py-1.5 flex items-center justify-between gap-0.5 pointer-events-auto">
            {abasMenu.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => navegarParaAba('painel', item.id)}
                className={`relative flex-1 min-h-[48px] px-1 py-1.5 rounded-xl flex flex-col items-center justify-center transition ${
                  abaInferior === item.id ? 'bg-emerald-50 text-floresta font-bold' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                <span className="text-base leading-none">{item.icone}</span>
                <span className="text-[10px] mt-1">{item.label}</span>
                {Boolean(item.badge && item.badge > 0) && (
                  <span className="absolute top-1 right-2 bg-ambar text-white text-[9px] font-bold px-1.5 rounded-full">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}