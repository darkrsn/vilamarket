'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import CameraBiometrica from './CameraBiometrica';

interface ModaisPerfilProps {
  modalAtivo: string | null;
  fecharModal: () => void;
  usuarioLogado: any;
  temSelfie: boolean;
  selfieTemporariaUrl: string | null;
  extratoLista: any[];
  enviarSelfieParaStoragePrivado: (base64: string, perfilId: string) => Promise<string>;
  onSelfieAtualizada: (caminhoPrivado: string, fotoBase64: string) => void;
}

export default function ModaisPerfil({
  modalAtivo,
  fecharModal,
  usuarioLogado,
  temSelfie,
  selfieTemporariaUrl,
  extratoLista,
  enviarSelfieParaStoragePrivado,
  onSelfieAtualizada,
}: ModaisPerfilProps) {
  const [carregando, setCarregando] = useState(false);

  // Selfie
  const [fotoCapturada, setFotoCapturada] = useState<string | null>(null);
  const [modoTrocaSelfie, setModoTrocaSelfie] = useState(false);

  // PIN
  const [pinAtualTroca, setPinAtualTroca] = useState('');
  const [novoPinTroca, setNovoPinTroca] = useState('');
  const [confirmarNovoPinTroca, setConfirmarNovoPinTroca] = useState('');

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

      const fotoSalva = fotoCapturada;
      setFotoCapturada(null);
      setModoTrocaSelfie(false);
      fecharModal();
      onSelfieAtualizada(caminhoPrivado, fotoSalva);
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
    fecharModal();
  }

  if (modalAtivo === 'selfie') {
    return (
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
                Verifique se o seu rosto está bem iluminado e nítido para abertura rápida na porta:
              </p>
              {selfieTemporariaUrl ? (
                <img
                  key={usuarioLogado.perfil_id}
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
                onClick={() => setModoTrocaSelfie(true)}
                className="w-full bg-floresta hover:bg-floresta-claro text-white font-bold py-3 rounded-xl text-xs transition"
              >
                📷 Tirar Nova Foto / Atualizar Selfie
              </button>
            </div>
          ) : !fotoCapturada ? (
            <CameraBiometrica
              autoIniciar={true}
              onCapturar={(img) => setFotoCapturada(img)}
            />
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
                  onClick={() => {
                    setFotoCapturada(null);
                    setModoTrocaSelfie(true);
                  }}
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
              setFotoCapturada(null);
              setModoTrocaSelfie(false);
              fecharModal();
            }}
            className="w-full text-xs text-gray-500 py-1"
          >
            Fechar
          </button>
        </div>
      </div>
    );
  }

  if (modalAtivo === 'pin') {
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <form
          onSubmit={salvarTrocaPinLogado}
          className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3"
        >
          <h3 className="font-bold text-base text-grafite">Alterar PIN de 4 dígitos</h3>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            required
            placeholder="PIN Atual (4 dígitos)"
            value={pinAtualTroca}
            onChange={(e) => setPinAtualTroca(e.target.value.replace(/\D/g, '').slice(0, 4))}
            className="w-full p-2.5 border rounded-xl text-center text-sm"
          />
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            required
            placeholder="Novo PIN (4 dígitos)"
            value={novoPinTroca}
            onChange={(e) => setNovoPinTroca(e.target.value.replace(/\D/g, '').slice(0, 4))}
            className="w-full p-2.5 border rounded-xl text-center text-sm"
          />
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            required
            placeholder="Confirmar Novo PIN"
            value={confirmarNovoPinTroca}
            onChange={(e) => setConfirmarNovoPinTroca(e.target.value.replace(/\D/g, '').slice(0, 4))}
            className="w-full p-2.5 border rounded-xl text-center text-sm"
          />
          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              type="button"
              onClick={fecharModal}
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
    );
  }

  if (modalAtivo === 'extrato') {
    return (
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
            onClick={fecharModal}
            className="w-full bg-gray-100 text-gray-800 font-bold py-2.5 rounded-xl text-xs"
          >
            Fechar
          </button>
        </div>
      </div>
    );
  }

  return null;
}