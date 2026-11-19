'use client';

import { useState } from 'react';

interface AbaInicioProps {
  usuarioLogado: any;
  perfilDetalhes: any;
  temSelfie: boolean;
  selfieTemporariaUrl: string | null;
  roleUsuario: string;
  dependentesLista: any[];
  dependentesSelfiesMap: Record<string, string>;
  avisosLista: any[];
  onAbrirSelfie: () => void;
  onAbrirScanGo: () => void;
  onAbrirNovoDependente: () => void;
  onGerenciarDependente: (dep: any) => void;
  onAbrirPixDependente: (dep: any) => void;
  onVerMural: () => void;
}

export default function AbaInicio({
  usuarioLogado,
  perfilDetalhes,
  temSelfie,
  selfieTemporariaUrl,
  roleUsuario,
  dependentesLista,
  dependentesSelfiesMap,
  avisosLista,
  onAbrirSelfie,
  onAbrirScanGo,
  onAbrirNovoDependente,
  onGerenciarDependente,
  onAbrirPixDependente,
  onVerMural,
}: AbaInicioProps) {
  const [avisoExpandido, setAvisoExpandido] = useState<any | null>(null);

  const saldoTotalUnificado =
    Number(perfilDetalhes?.saldo_cashback ?? usuarioLogado?.saldo_cashback ?? 0) +
    Number(perfilDetalhes?.saldo_pre_pago ?? usuarioLogado?.saldo_pre_pago ?? 0);

  return (
    <>
      {!temSelfie ? (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase text-amber-800">⚠️ Selfie Facial Pendente</p>
            <button
              type="button"
              onClick={onAbrirSelfie}
              className="text-[11px] bg-floresta text-white px-2.5 py-1 rounded-lg font-bold shrink-0"
            >
              Enviar Selfie
            </button>
          </div>
          <h2 className="text-lg font-bold text-grafite mt-1">Olá, {usuarioLogado.nome_completo}</h2>
          <p className="text-xs text-gray-600">{usuarioLogado.unidade_formatada || usuarioLogado.unidade}</p>
        </div>
      ) : (
        <div className="bg-emerald-50/70 border border-emerald-200 p-4 rounded-xl flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase text-emerald-800">✅ Acesso Facial Ativo</p>
            <h2 className="text-lg font-bold text-grafite truncate mt-0.5">Olá, {usuarioLogado.nome_completo}</h2>
            <p className="text-xs text-gray-600 truncate">{usuarioLogado.unidade_formatada || usuarioLogado.unidade}</p>
          </div>
          <button type="button" onClick={onAbrirSelfie} className="shrink-0 group focus:outline-none">
            {selfieTemporariaUrl ? (
              <img
                key={usuarioLogado?.perfil_id}
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

      {/* Card Unificado de Saldo + Scan & Go */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-50 border border-gray-200 p-4 rounded-2xl flex flex-col justify-center">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Saldo</span>
          <p className="text-2xl font-extrabold text-grafite mt-1">R$ {saldoTotalUnificado.toFixed(2)}</p>
        </div>

        <button
          type="button"
          onClick={onAbrirScanGo}
          className="bg-floresta hover:bg-floresta-claro text-white p-4 rounded-2xl flex flex-col items-center justify-center gap-1.5 shadow-sm transition active:scale-[0.98]"
        >
          <span className="text-2xl">📱</span>
          <span className="text-sm font-extrabold tracking-tight">Scan & Go</span>
        </button>
      </div>

      {/* Meus Dependentes */}
      {(roleUsuario === 'titular' || roleUsuario === 'admin') && (
        <div className="pt-3 border-t border-gray-200 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-grafite">Meus Dependentes</h3>
            <button
              type="button"
              onClick={onAbrirNovoDependente}
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
                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
                          👤
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-bold text-grafite truncate">{dep.nome_completo}</p>
                          <span
                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                              depBloqueado ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {depBloqueado ? 'Bloqueado' : 'Ativo'}
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
                        onClick={() => onGerenciarDependente(dep)}
                        className="bg-white border border-gray-300 text-grafite text-xs font-bold px-2.5 py-2 rounded-xl hover:bg-gray-100"
                        title="Gerenciar foto ou cadastro"
                      >
                        ⚙️
                      </button>
                      <button
                        type="button"
                        onClick={() => onAbrirPixDependente(dep)}
                        className="bg-ambar text-white text-xs font-bold px-3 py-2 rounded-xl transition"
                      >
                        + Saldo
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Último Recado do Mural */}
      {avisosLista.length > 0 && (
        <div className="pt-3 border-t border-gray-200">
          <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3.5 space-y-2 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-sm">📢</span>
                <span className="text-[11px] font-extrabold text-amber-900 uppercase tracking-wide">
                  Mural • Último Recado
                </span>
              </div>
              <button
                type="button"
                onClick={onVerMural}
                className="text-[11px] font-bold text-floresta hover:underline shrink-0"
              >
                Ver todos ({avisosLista.length}) ›
              </button>
            </div>

            <div
              onClick={() => setAvisoExpandido(avisosLista[0])}
              className="cursor-pointer space-y-1.5"
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-bold text-xs text-grafite leading-snug">{avisosLista[0].titulo}</h4>
                <span className="text-[10px] text-gray-500 shrink-0">
                  {new Date(avisosLista[0].criado_em).toLocaleDateString('pt-BR')}
                </span>
              </div>

              {avisosLista[0].imagem_url && (
                <img
                  src={avisosLista[0].imagem_url}
                  alt={avisosLista[0].titulo}
                  className="w-full max-h-36 object-cover rounded-xl border border-amber-200/70"
                />
              )}

              <p className="text-[11px] text-gray-700 line-clamp-2 leading-relaxed">{avisosLista[0].conteudo}</p>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EXPANDIDO DO AVISO (FECHA AO CLICAR FORA) */}
      {avisoExpandido && (
        <div
          onClick={() => setAvisoExpandido(null)}
          className="fixed inset-0 !m-0 w-screen h-screen bg-black/75 z-50 flex items-center justify-center p-4 overflow-y-auto"
        >
          <article
            onClick={(e) => e.stopPropagation()}
            className="bg-white border border-gray-200 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl my-auto"
          >
            <div className="p-3.5 border-b border-gray-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-floresta text-white flex items-center justify-center text-xs font-bold">
                  VM
                </span>
                <div>
                  <p className="text-xs font-bold text-grafite">Administração VilaMarket</p>
                  <p className="text-[10px] text-gray-400">
                    {new Date(avisoExpandido.criado_em).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAvisoExpandido(null)}
                className="text-xs font-bold text-gray-500 hover:text-grafite px-2 py-1 rounded-lg bg-gray-100"
              >
                ✕
              </button>
            </div>

            {avisoExpandido.imagem_url && (
              <div className="w-full bg-gray-100">
                <img
                  src={avisoExpandido.imagem_url}
                  alt={avisoExpandido.titulo}
                  className="w-full h-auto max-h-[520px] object-contain mx-auto block"
                />
              </div>
            )}

            <div className="p-4 space-y-1.5">
              <h3 className="font-bold text-sm text-grafite">{avisoExpandido.titulo}</h3>
              <p className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">
                {avisoExpandido.conteudo}
              </p>
            </div>
          </article>
        </div>
      )}
    </>
  );
}