'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { calcularIdade, formatarCPFVisual, formatarNomeTitleCase } from '@/lib/formatters';
import CameraBiometrica from './CameraBiometrica';

interface ModaisDependentesProps {
  modalAtivo: string | null;
  fecharModal: () => void;
  usuarioLogado: any;
  perfilDetalhes: any;
  condominioId: string;
  depGerenciando: any | null;
  dependenteSelecionado: any | null;
  dependentesSelfiesMap: Record<string, string>;
  enviarSelfieParaStoragePrivado: (base64: string, perfilId: string) => Promise<string>;
  onAtualizarListaDependentes: (novoDep?: any, fotoBase64?: string | null) => Promise<void>;
}

export default function ModaisDependentes({
  modalAtivo,
  fecharModal,
  usuarioLogado,
  perfilDetalhes,
  condominioId,
  depGerenciando,
  dependenteSelecionado,
  dependentesSelfiesMap,
  enviarSelfieParaStoragePrivado,
  onAtualizarListaDependentes,
}: ModaisDependentesProps) {
  const [carregando, setCarregando] = useState(false);

  // Novo Dependente
  const [depNome, setDepNome] = useState('');
  const [depCpf, setDepCpf] = useState('');
  const [depNascimento, setDepNascimento] = useState('');
  const [depPin, setDepPin] = useState('');
  const [depSelfieBase64, setDepSelfieBase64] = useState<string | null>(null);
  const [aceiteLgpdDependente, setAceiteLgpdDependente] = useState(false);

  // Gerenciar Dependente
  const [depFotoNovaBase64, setDepFotoNovaBase64] = useState<string | null>(null);
  const [abrindoCameraGerenciar, setAbrindoCameraGerenciar] = useState(false);

  // Transferência / Pix
  const [origemSaldo, setOrigemSaldo] = useState<'pre_pago' | 'cashback' | 'pix'>('pre_pago');
  const [valorPix, setValorPix] = useState('20.00');
  const [pinConfirmacaoPix, setPinConfirmacaoPix] = useState('');

  const depDataCompleta = Boolean(depNascimento && depNascimento.split('-')[0]?.length === 4);
  const depMenorDe12 = depDataCompleta && calcularIdade(depNascimento) < 12;

  async function cadastrarDependente(e: React.FormEvent) {
    e.preventDefault();
    const cpfDepLimpo = depCpf.replace(/\D/g, '');
    if (cpfDepLimpo.length !== 11) {
      alert('Digite os 11 dígitos completos do CPF do dependente.');
      return;
    }
    if (!depNascimento || calcularIdade(depNascimento) < 12) {
      alert('O cadastro de dependente é permitido somente para maiores de 12 anos.');
      return;
    }
    if (depSelfieBase64 && !aceiteLgpdDependente) {
      alert('Por exigência da LGPD (Art. 14), confirme o consentimento parental para o uso da imagem facial do dependente.');
      return;
    }
    if (depPin.length !== 4) {
      alert('O PIN do dependente deve ter 4 dígitos.');
      return;
    }

    setCarregando(true);
    try {
      let cId: string | null = perfilDetalhes?.condominio_id || condominioId || null;
      if (!cId) {
        const { data: conds } = await supabase.from('condominios').select('id').limit(1);
        cId = conds?.[0]?.id || null;
      }

      const tId: string | null = usuarioLogado?.perfil_id || null;
      if (!tId) throw new Error('Sessão do titular não identificada. Faça login novamente.');

      const emailTecnicoDep = `user_${cpfDepLimpo}@vilamarket.com.br`;
      const senhaAuthDep = `VM#${depPin}#${cpfDepLimpo.slice(-4)}`;

      const { data: sessaoTitularAtual } = await supabase.auth.getSession();

      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: emailTecnicoDep,
        password: senhaAuthDep,
      });

      if (authErr || !authData.user) {
        throw new Error(authErr?.message || 'CPF já cadastrado');
      }

      const novoDepId = authData.user.id;
      let caminhoSelfieDep: string | null = null;
      if (depSelfieBase64) {
        caminhoSelfieDep = await enviarSelfieParaStoragePrivado(depSelfieBase64, novoDepId);
      }

      if (sessaoTitularAtual?.session) {
        await supabase.auth.setSession({
          access_token: sessaoTitularAtual.session.access_token,
          refresh_token: sessaoTitularAtual.session.refresh_token,
        });
      }

      const nomeFormatadoDep = formatarNomeTitleCase(depNome.trim());

      const { error: insertErr } = await supabase.from('perfis').insert({
        id: novoDepId,
        condominio_id: cId,
        unidade_id: perfilDetalhes?.unidade_id || null,
        complemento_apto: perfilDetalhes?.complemento_apto || null,
        unidade_formatada:
          perfilDetalhes?.unidade_formatada || usuarioLogado.unidade_formatada || usuarioLogado.unidade || '',
        titular_id: tId,
        nome_completo: nomeFormatadoDep,
        cpf: cpfDepLimpo,
        data_nascimento: depNascimento,
        role: 'dependente',
        selfie_url: caminhoSelfieDep,
        pin_hash: 'temp',
        status_cadastro: 'aprovado',
        status_facial: caminhoSelfieDep ? 'ativo' : 'pendente',
      });

      if (insertErr) throw new Error(insertErr.message);

      await supabase.rpc('definir_pin_usuario', {
        p_perfil_id: novoDepId,
        p_pin_aberto: depPin,
      });

      const novoObj = {
        id: novoDepId,
        nome_completo: nomeFormatadoDep,
        cpf: cpfDepLimpo,
        role: 'dependente',
        selfie_url: caminhoSelfieDep,
        status_facial: caminhoSelfieDep ? 'ativo' : 'pendente',
        status_cadastro: 'aprovado',
        saldo_pre_pago: 0,
        criado_em: new Date().toISOString(),
      };

      const fotoTemporaria = depSelfieBase64;
      setDepNome('');
      setDepCpf('');
      setDepNascimento('');
      setDepPin('');
      setDepSelfieBase64(null);
      setAceiteLgpdDependente(false);
      fecharModal();
      await onAtualizarListaDependentes(novoObj, fotoTemporaria);
      alert(
        caminhoSelfieDep
          ? 'Dependente cadastrado com sucesso e acesso facial ativo!'
          : 'Dependente cadastrado! Você pode adicionar a selfie dele depois em Gerenciar.'
      );
    } catch (err: any) {
      alert('Erro ao cadastrar dependente: ' + (err.message || 'Tente novamente.'));
    } finally {
      setCarregando(false);
    }
  }

  async function salvarNovaSelfieDependente() {
    if (!depGerenciando || !depFotoNovaBase64) return;
    setCarregando(true);
    try {
      if (depGerenciando.selfie_url && !depGerenciando.selfie_url.startsWith('data:image')) {
        await supabase.storage.from('selfies').remove([depGerenciando.selfie_url]);
      }

      const caminhoNovo = await enviarSelfieParaStoragePrivado(depFotoNovaBase64, depGerenciando.id);
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('atualizar_selfie_usuario', {
        p_perfil_id: depGerenciando.id,
        p_caminho_selfie: caminhoNovo,
      });

      if (rpcErr || !rpcRes?.sucesso) {
        throw new Error(rpcErr?.message || rpcRes?.mensagem || 'Erro ao atualizar foto.');
      }

      setDepFotoNovaBase64(null);
      setAbrindoCameraGerenciar(false);
      fecharModal();
      await onAtualizarListaDependentes();
      alert('Selfie do dependente atualizada e acesso facial liberado!');
    } catch (err: any) {
      alert('Erro ao salvar selfie: ' + (err.message || 'Tente novamente.'));
    } finally {
      setCarregando(false);
    }
  }

  async function removerFotoDependente() {
    if (!depGerenciando) return;
    if (!window.confirm(`Remover a foto facial de ${depGerenciando.nome_completo}?`)) return;
    setCarregando(true);
    try {
      if (depGerenciando.selfie_url && !depGerenciando.selfie_url.startsWith('data:image')) {
        await supabase.storage.from('selfies').remove([depGerenciando.selfie_url]);
      }
      const { error } = await supabase
        .from('perfis')
        .update({ selfie_url: null, status_facial: 'pendente' })
        .eq('id', depGerenciando.id)
        .eq('titular_id', usuarioLogado.perfil_id);

      if (error) throw new Error(error.message);

      fecharModal();
      await onAtualizarListaDependentes();
      alert('Foto facial do dependente removida.');
    } catch (err: any) {
      alert('Erro ao remover foto: ' + err.message);
    } finally {
      setCarregando(false);
    }
  }

  async function excluirDependente() {
    if (!depGerenciando) return;
    if (!window.confirm(`Tem certeza que deseja excluir o dependente ${depGerenciando.nome_completo}?`)) return;
    setCarregando(true);
    try {
      if (depGerenciando.selfie_url && !depGerenciando.selfie_url.startsWith('data:image')) {
        await supabase.storage.from('selfies').remove([depGerenciando.selfie_url]);
      }
      const { data, error } = await supabase.rpc('excluir_dependente_titular', {
        p_titular_id: usuarioLogado.perfil_id,
        p_dependente_id: depGerenciando.id,
      });

      if (error || !data?.sucesso) {
        throw new Error(error?.message || data?.mensagem || 'Não foi possível excluir o dependente.');
      }

      fecharModal();
      await onAtualizarListaDependentes();
      alert('Dependente excluído com sucesso.');
    } catch (err: any) {
      alert('Erro ao excluir dependente: ' + err.message);
    } finally {
      setCarregando(false);
    }
  }

  async function confirmarTransferenciaOuPix() {
    if (!dependenteSelecionado) return;
    if (pinConfirmacaoPix.length !== 4) {
      alert('Por segurança, digite o SEU PIN de 4 dígitos para confirmar esta operação.');
      return;
    }

    setCarregando(true);
    const cpfTitularLimpo = (perfilDetalhes?.cpf || '').replace(/\D/g, '');
    const { data: checkPin, error: errPin } = await supabase.rpc('validar_cpf_pin', {
      p_cpf: cpfTitularLimpo,
      p_pin: pinConfirmacaoPix,
    });

    if (errPin || !checkPin?.sucesso) {
      setCarregando(false);
      alert(checkPin?.mensagem || 'PIN de segurança incorreto.');
      return;
    }

    const valorNumerico = parseFloat(valorPix);

    if (origemSaldo === 'pix') {
      const { data, error } = await supabase.rpc('adicionar_saldo_pix', {
        p_perfil_id: dependenteSelecionado.id,
        p_valor: valorNumerico,
      });
      setCarregando(false);
      if (error || !data?.sucesso) {
        alert(error?.message || data?.mensagem || 'Erro ao creditar saldo.');
        return;
      }
      alert(data.mensagem);
    } else {
      const { data, error } = await supabase.rpc('transferir_saldo_dependente', {
        p_titular_id: usuarioLogado.perfil_id,
        p_dependente_id: dependenteSelecionado.id,
        p_valor: valorNumerico,
        p_origem: origemSaldo,
      });
      setCarregando(false);
      if (error || !data?.sucesso) {
        alert(error?.message || data?.mensagem || 'Erro ao transferir saldo.');
        return;
      }
      alert(data.mensagem);
    }

    setPinConfirmacaoPix('');
    fecharModal();
    await onAtualizarListaDependentes();
  }

  if (modalAtivo === 'novo_dependente') {
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
        <form
          onSubmit={cadastrarDependente}
          className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 my-auto"
        >
          <h3 className="font-bold text-base text-grafite">Adicionar Dependente</h3>

          <input
            type="text"
            required
            placeholder="Nome Completo do Dependente"
            value={depNome}
            onChange={(e) => setDepNome(formatarNomeTitleCase(e.target.value))}
            className="w-full p-2.5 border rounded-xl text-xs"
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-1">CPF *</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={14}
                required
                placeholder="000.000.000-00"
                value={depCpf}
                onChange={(e) => setDepCpf(formatarCPFVisual(e.target.value))}
                className="w-full p-2.5 border rounded-xl text-xs"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 mb-1">Nascimento *</label>
              <input
                type="date"
                required
                max={new Date().toISOString().split('T')[0]}
                value={depNascimento}
                onChange={(e) => {
                  const novaData = e.target.value;
                  setDepNascimento(novaData);
                  if (novaData && novaData.split('-')[0]?.length === 4 && calcularIdade(novaData) < 12) {
                    alert('O cadastro de dependente é permitido somente para maiores de 12 anos.');
                  }
                }}
                className={`w-full p-2.5 border rounded-xl text-xs outline-none ${
                  depMenorDe12 ? 'border-red-500 bg-red-50 text-red-900' : 'border-gray-200'
                }`}
              />
            </div>
          </div>

          {depMenorDe12 && (
            <p className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1.5 rounded-lg">
              ⚠️ Cadastro permitido somente para maiores de 12 anos.
            </p>
          )}

          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            required
            placeholder="PIN de 4 dígitos do Dependente"
            value={depPin}
            onChange={(e) => setDepPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            className="w-full p-2.5 border rounded-xl text-xs"
          />

          <div className="border rounded-xl p-3 bg-gray-50 text-center space-y-2">
            {!depSelfieBase64 ? (
              <CameraBiometrica
                onCapturar={(img) => setDepSelfieBase64(img)}
                textoBotaoAbrir="📷 Tirar Selfie do Dependente (Opcional agora)"
                subtextoBotaoAbrir="Se o dependente não estiver perto, salve agora e tire a foto depois."
              />
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
              Declaro ser responsável legal e autorizo o tratamento dos dados e imagem facial do
              dependente exclusivamente para acesso ao VilaMarket (Art. 14 da LGPD).
            </span>
          </label>

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
              disabled={carregando || depMenorDe12}
              className={`font-bold py-2.5 rounded-xl text-xs ${
                depMenorDe12
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-floresta text-white'
              }`}
            >
              {carregando ? 'Salvando...' : 'Salvar Dependente'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (modalAtivo === 'gerenciar_dependente' && depGerenciando) {
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
        <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 my-auto">
          <div>
            <h3 className="font-bold text-base text-grafite">{depGerenciando.nome_completo}</h3>
            <p className="text-[11px] text-gray-500">
              CPF: {formatarCPFVisual(depGerenciando.cpf || '')} • Status facial:{' '}
              <span className={depGerenciando.selfie_url ? 'text-emerald-700 font-bold' : 'text-amber-600 font-bold'}>
                {depGerenciando.selfie_url ? 'Ativo (Foto cadastrada)' : 'Pendente de selfie'}
              </span>
            </p>
          </div>

          <div className="border rounded-xl p-3 bg-gray-50 text-center space-y-3">
            {depFotoNovaBase64 ? (
              <div className="space-y-2">
                <img
                  src={depFotoNovaBase64}
                  alt="Nova selfie"
                  className="w-32 h-32 rounded-full mx-auto object-cover border-2 border-emerald-600 scale-x-[-1]"
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDepFotoNovaBase64(null)}
                    className="bg-gray-200 text-gray-700 font-bold py-2 rounded-lg text-xs"
                  >
                    Tirar Outra
                  </button>
                  <button
                    type="button"
                    onClick={salvarNovaSelfieDependente}
                    disabled={carregando}
                    className="bg-floresta text-white font-bold py-2 rounded-lg text-xs"
                  >
                    {carregando ? 'Salvando...' : 'Salvar Foto'}
                  </button>
                </div>
              </div>
            ) : abrindoCameraGerenciar ? (
              <CameraBiometrica
                autoIniciar={true}
                onCapturar={(img) => {
                  setDepFotoNovaBase64(img);
                  setAbrindoCameraGerenciar(false);
                }}
              />
            ) : (
              <div className="space-y-3">
                {dependentesSelfiesMap[depGerenciando.id] ? (
                  <img
                    src={dependentesSelfiesMap[depGerenciando.id]}
                    alt="Foto atual"
                    className="w-28 h-28 rounded-full mx-auto object-cover border-2 border-emerald-600"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full mx-auto bg-amber-100 text-amber-800 flex items-center justify-center text-xs font-bold">
                    Sem foto
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setAbrindoCameraGerenciar(true)}
                    className="w-full bg-floresta text-white font-bold py-2.5 rounded-xl text-xs"
                  >
                    📷 {depGerenciando.selfie_url ? 'Trocar Selfie' : 'Tirar Selfie Agora'}
                  </button>

                  {depGerenciando.selfie_url && (
                    <button
                      type="button"
                      onClick={removerFotoDependente}
                      disabled={carregando}
                      className="w-full bg-amber-50 text-amber-800 border border-amber-200 font-bold py-2 rounded-xl text-xs"
                    >
                      🗑️ Apagar Somente a Foto
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-gray-200 space-y-2">
            <button
              type="button"
              onClick={excluirDependente}
              disabled={carregando}
              className="w-full bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 font-bold py-2.5 rounded-xl text-xs"
            >
              ❌ Excluir Dependente da Unidade
            </button>

            <button
              type="button"
              onClick={() => {
                setDepFotoNovaBase64(null);
                setAbrindoCameraGerenciar(false);
                fecharModal();
              }}
              className="w-full bg-gray-100 text-gray-700 font-bold py-2 rounded-xl text-xs"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (modalAtivo === 'pix_dependente' && dependenteSelecionado) {
    const pixCopiaECola = `00020126580014BR.GOV.BCB.PIX0136vilamarket-pix-${dependenteSelecionado.cpf}520400005303986540520.005802BR5910VILAMARKET6008CURITIBA62070503***6304ABCD`;
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4">
          <h3 className="font-bold text-base text-grafite">
            Enviar Saldo • {dependenteSelecionado.nome_completo}
          </h3>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-bold text-gray-600">De onde sairá o saldo?</label>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setOrigemSaldo('pre_pago')}
                className={`p-2 rounded-xl text-[11px] font-bold border text-center ${
                  origemSaldo === 'pre_pago' ? 'bg-floresta text-white border-floresta' : 'bg-gray-50 text-gray-700 border-gray-200'
                }`}
              >
                Meu Pré-Pago
                <span className="block text-[10px] font-normal opacity-90">
                  R$ {Number(perfilDetalhes?.saldo_pre_pago ?? usuarioLogado.saldo_pre_pago ?? 0).toFixed(2)}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setOrigemSaldo('cashback')}
                className={`p-2 rounded-xl text-[11px] font-bold border text-center ${
                  origemSaldo === 'cashback' ? 'bg-ambar text-white border-ambar' : 'bg-amber-50 text-amber-900 border-amber-200'
                }`}
              >
                Meu Cashback
                <span className="block text-[10px] font-normal opacity-90">
                  R$ {Number(perfilDetalhes?.saldo_cashback ?? usuarioLogado.saldo_cashback ?? 0).toFixed(2)}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setOrigemSaldo('pix')}
                className={`p-2 rounded-xl text-[11px] font-bold border text-center ${
                  origemSaldo === 'pix' ? 'bg-emerald-700 text-white border-emerald-700' : 'bg-gray-50 text-gray-700 border-gray-200'
                }`}
              >
                Novo Pix
                <span className="block text-[10px] font-normal opacity-90">Recarga</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {['10.00', '20.00', '50.00'].map((v) => (
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

          {origemSaldo === 'pix' && (
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
          )}

          <div>
            <label className="block text-[11px] font-bold text-gray-600 mb-1">
              Confirme seu PIN de 4 dígitos (Segurança):
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="••••"
              value={pinConfirmacaoPix}
              onChange={(e) => setPinConfirmacaoPix(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="w-full p-2.5 border rounded-xl text-center text-sm tracking-widest"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={fecharModal}
              className="bg-gray-100 text-gray-700 font-bold py-2.5 rounded-xl text-xs"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmarTransferenciaOuPix}
              disabled={carregando}
              className="bg-floresta text-white font-bold py-2.5 rounded-xl text-xs"
            >
              {carregando ? 'Processando...' : origemSaldo === 'pix' ? 'Confirmar Pix' : 'Transferir Agora'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}