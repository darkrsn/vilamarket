'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  formatarCPFVisual,
  formatarNomeTitleCase,
  otimizarImagemParaUpload,
} from '@/lib/formatters';

interface AbaAdminProps {
  usuarioLogado: any;
  perfilDetalhes: any;
  condominioId: string;
  gerarUrlTemporariaSelfie: (caminho: string | null) => Promise<string | null>;
  onAtualizarMuralEClassificados: () => Promise<void>;
}

export default function AbaAdmin({
  usuarioLogado,
  perfilDetalhes,
  condominioId,
  gerarUrlTemporariaSelfie,
  onAtualizarMuralEClassificados,
}: AbaAdminProps) {
  const [carregando, setCarregando] = useState(false);
  const [adminSecao, setAdminSecao] = useState<'moradores' | 'classificados' | 'mural'>('moradores');
  const [adminMoradores, setAdminMoradores] = useState<any[]>([]);
  const [classificadosLista, setClassificadosLista] = useState<any[]>([]);
  const [avisosLista, setAvisosLista] = useState<any[]>([]);

  const [adminBuscaMorador, setAdminBuscaMorador] = useState('');
  const [adminFiltroStatus, setAdminFiltroStatus] = useState<'todos' | 'aprovado' | 'bloqueado' | 'sem_selfie'>('todos');
  const [adminEditandoMorador, setAdminEditandoMorador] = useState<any | null>(null);
  const [adminEditNome, setAdminEditNome] = useState('');
  const [adminEditWhatsapp, setAdminEditWhatsapp] = useState('');
  const [adminEditUnidade, setAdminEditUnidade] = useState('');
  const [adminEditStatus, setAdminEditStatus] = useState('aprovado');
  const [adminFotoAmpliadaUrl, setAdminFotoAmpliadaUrl] = useState<string | null>(null);

  // Mural
  const [adminAvisoEditId, setAdminAvisoEditId] = useState<string | null>(null);
  const [adminAvisoTitulo, setAdminAvisoTitulo] = useState('');
  const [adminAvisoConteudo, setAdminAvisoConteudo] = useState('');
  const [adminAvisoFotoFile, setAdminAvisoFotoFile] = useState<File | null>(null);
  const [adminAvisoFotoPreview, setAdminAvisoFotoPreview] = useState<string | null>(null);

  async function carregarDadosAdmin() {
    const [resPerfis, resClass, resAvisos] = await Promise.all([
      supabase
        .from('perfis')
        .select('id, nome_completo, cpf, whatsapp, unidade_formatada, role, status_cadastro, status_facial, selfie_url, saldo_cashback, saldo_pre_pago, criado_em')
        .order('nome_completo', { ascending: true }),
      supabase
        .from('classificados')
        .select('*, perfis:anunciante_id (nome_completo, unidade_formatada)')
        .order('criado_em', { ascending: false }),
      supabase
        .from('avisos_mural')
        .select('*')
        .order('fixado', { ascending: false })
        .order('criado_em', { ascending: false }),
    ]);

    if (resPerfis.data) setAdminMoradores(resPerfis.data);
    if (resClass.data) setClassificadosLista(resClass.data);
    if (resAvisos.data) setAvisosLista(resAvisos.data);
  }

  useEffect(() => {
    carregarDadosAdmin();
  }, []);

  async function adminAlternarBloqueioMorador(morador: any) {
    const novoStatus = morador.status_cadastro === 'bloqueado' ? 'aprovado' : 'bloqueado';
    setCarregando(true);
    const { data, error } = await supabase.rpc('admin_atualizar_perfil', {
      p_perfil_id: morador.id,
      p_nome_completo: morador.nome_completo,
      p_whatsapp: morador.whatsapp || '',
      p_unidade_formatada: morador.unidade_formatada || '',
      p_status_cadastro: novoStatus,
      p_remover_foto: false,
    });
    setCarregando(false);

    if (error || !data?.sucesso) {
      alert(error?.message || data?.mensagem || 'Erro ao alterar status.');
      return;
    }
    await carregarDadosAdmin();
  }

  function adminAbrirEdicaoMorador(morador: any) {
    setAdminEditandoMorador(morador);
    setAdminEditNome(morador.nome_completo || '');
    setAdminEditWhatsapp(morador.whatsapp || '');
    setAdminEditUnidade(morador.unidade_formatada || '');
    setAdminEditStatus(morador.status_cadastro || 'aprovado');
  }

  async function adminSalvarEdicaoMorador(e: React.FormEvent) {
    e.preventDefault();
    if (!adminEditandoMorador) return;
    setCarregando(true);

    const { data, error } = await supabase.rpc('admin_atualizar_perfil', {
      p_perfil_id: adminEditandoMorador.id,
      p_nome_completo: formatarNomeTitleCase(adminEditNome),
      p_whatsapp: adminEditWhatsapp.replace(/\D/g, ''),
      p_unidade_formatada: adminEditUnidade,
      p_status_cadastro: adminEditStatus,
      p_remover_foto: false,
    });
    setCarregando(false);

    if (error || !data?.sucesso) {
      alert(error?.message || data?.mensagem || 'Erro ao salvar dados.');
      return;
    }

    setAdminEditandoMorador(null);
    await carregarDadosAdmin();
    alert('Dados do morador atualizados!');
  }

  async function adminVisualizarSelfieMorador(morador: any) {
    if (!morador.selfie_url) {
      alert('Este morador ainda não enviou foto facial.');
      return;
    }
    const url = await gerarUrlTemporariaSelfie(morador.selfie_url);
    if (url) {
      setAdminFotoAmpliadaUrl(url);
      setAdminEditandoMorador(morador);
    } else {
      alert('Não foi possível carregar a imagem.');
    }
  }

  async function adminRemoverFotoMorador(morador: any) {
    if (!window.confirm(`Remover a foto facial de ${morador.nome_completo}? Ele precisará tirar uma nova selfie.`)) {
      return;
    }
    setCarregando(true);
    try {
      if (morador.selfie_url && !morador.selfie_url.startsWith('data:image')) {
        await supabase.storage.from('selfies').remove([morador.selfie_url]);
      }
      const { data, error } = await supabase.rpc('admin_atualizar_perfil', {
        p_perfil_id: morador.id,
        p_nome_completo: morador.nome_completo,
        p_whatsapp: morador.whatsapp || '',
        p_unidade_formatada: morador.unidade_formatada || '',
        p_status_cadastro: morador.status_cadastro || 'aprovado',
        p_remover_foto: true,
      });
      if (error || !data?.sucesso) throw new Error(error?.message || data?.mensagem);

      setAdminFotoAmpliadaUrl(null);
      setAdminEditandoMorador(null);
      await carregarDadosAdmin();
      alert('Foto removida! O status do morador voltou para Selfie Pendente.');
    } catch (err: any) {
      alert('Erro ao remover foto: ' + err.message);
    } finally {
      setCarregando(false);
    }
  }

  async function adminSalvarAvisoMural(e: React.FormEvent) {
    e.preventDefault();
    if (!adminAvisoTitulo.trim() || !adminAvisoConteudo.trim()) return;
    setCarregando(true);

    try {
      let cId = perfilDetalhes?.condominio_id || condominioId;
      if (!cId) {
        const { data: cData } = await supabase.from('condominios').select('id').limit(1);
        cId = cData?.[0]?.id || null;
      }

      let imagemFinalUrl = adminAvisoFotoPreview;
      if (adminAvisoFotoFile) {
        const otimizado = await otimizarImagemParaUpload(adminAvisoFotoFile, 1200);
        const caminho = `mural/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
        const { error: upErr } = await supabase.storage
          .from('comunidade')
          .upload(caminho, otimizado, { contentType: 'image/jpeg', upsert: true });
        if (upErr) throw new Error(upErr.message);
        const { data } = supabase.storage.from('comunidade').getPublicUrl(caminho);
        imagemFinalUrl = data.publicUrl;
      }

      const { data, error } = await supabase.rpc('admin_salvar_aviso_mural', {
        p_admin_id: usuarioLogado.perfil_id,
        p_aviso_id: adminAvisoEditId || null,
        p_condominio_id: cId || null,
        p_titulo: adminAvisoTitulo.trim(),
        p_conteudo: adminAvisoConteudo.trim(),
        p_imagem_url: imagemFinalUrl || null,
      });

      if (error || !data?.sucesso) {
        throw new Error(error?.message || data?.mensagem || 'Erro ao salvar aviso.');
      }

      setAdminAvisoEditId(null);
      setAdminAvisoTitulo('');
      setAdminAvisoConteudo('');
      setAdminAvisoFotoFile(null);
      setAdminAvisoFotoPreview(null);
      await carregarDadosAdmin();
      await onAtualizarMuralEClassificados();
      alert('Aviso publicado no Mural!');
    } catch (err: any) {
      alert('Erro ao salvar aviso: ' + err.message);
    } finally {
      setCarregando(false);
    }
  }

  async function adminExcluirAvisoMural(id: string) {
    if (!window.confirm('Excluir este aviso do Mural?')) return;
    const { data, error } = await supabase.rpc('admin_excluir_aviso_mural', {
      p_admin_id: usuarioLogado.perfil_id,
      p_aviso_id: id,
    });
    if (!error && data?.sucesso) {
      await carregarDadosAdmin();
      await onAtualizarMuralEClassificados();
    } else {
      alert(error?.message || data?.mensagem || 'Erro ao excluir aviso.');
    }
  }

  const adminMoradoresFiltrados = adminMoradores.filter((m) => {
    if (adminFiltroStatus === 'aprovado' && m.status_cadastro !== 'aprovado') return false;
    if (adminFiltroStatus === 'bloqueado' && m.status_cadastro !== 'bloqueado') return false;
    if (adminFiltroStatus === 'sem_selfie' && Boolean(m.selfie_url)) return false;

    if (adminBuscaMorador.trim()) {
      const q = adminBuscaMorador.toLowerCase();
      const qNumeros = adminBuscaMorador.replace(/\D/g, '');
      const matchNome = (m.nome_completo || '').toLowerCase().includes(q);
      const matchCpf = qNumeros ? (m.cpf || '').includes(qNumeros) : (m.cpf || '').includes(q);
      const matchUnidade = (m.unidade_formatada || '').toLowerCase().includes(q);
      if (!matchNome && !matchCpf && !matchUnidade) return false;
    }
    return true;
  });

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-grafite">Painel Admin</h2>
          <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
            {adminMoradores.length} cadastros
          </span>
        </div>

        <div className="grid grid-cols-3 gap-1.5 bg-gray-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setAdminSecao('moradores')}
            className={`py-2 text-[11px] font-bold rounded-lg transition ${
              adminSecao === 'moradores' ? 'bg-floresta text-white' : 'text-gray-600'
            }`}
          >
            Moradores
          </button>
          <button
            type="button"
            onClick={() => setAdminSecao('classificados')}
            className={`py-2 text-[11px] font-bold rounded-lg transition ${
              adminSecao === 'classificados' ? 'bg-floresta text-white' : 'text-gray-600'
            }`}
          >
            Classificados
          </button>
          <button
            type="button"
            onClick={() => setAdminSecao('mural')}
            className={`py-2 text-[11px] font-bold rounded-lg transition ${
              adminSecao === 'mural' ? 'bg-floresta text-white' : 'text-gray-600'
            }`}
          >
            Mural Avisos
          </button>
        </div>

        {adminSecao === 'moradores' && (
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Buscar por nome, CPF ou bloco/casa..."
              value={adminBuscaMorador}
              onChange={(e) => setAdminBuscaMorador(e.target.value)}
              className="w-full p-2.5 border rounded-xl text-xs"
            />

            <div className="flex gap-1 overflow-x-auto pb-1">
              {[
                { id: 'todos', label: 'Todos' },
                { id: 'aprovado', label: 'Ativos' },
                { id: 'bloqueado', label: 'Bloqueados' },
                { id: 'sem_selfie', label: 'Sem Foto' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setAdminFiltroStatus(f.id as any)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                    adminFiltroStatus === f.id ? 'bg-floresta text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-0.5">
              {adminMoradoresFiltrados.map((m) => {
                const bloqueado = m.status_cadastro === 'bloqueado';
                return (
                  <div
                    key={m.id}
                    className={`p-3 rounded-xl border text-xs space-y-2 ${
                      bloqueado ? 'bg-red-50/60 border-red-200' : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-bold text-grafite truncate">{m.nome_completo}</p>
                        <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-gray-200 text-gray-700">
                          {m.role}
                        </span>
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                            bloqueado ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {bloqueado ? 'Bloqueado' : 'Ativo'}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-600 truncate mt-0.5">
                        {m.unidade_formatada || 'Sem unidade'}
                      </p>
                      <p className="text-[10px] text-gray-500">
                        CPF: {formatarCPFVisual(m.cpf || '')} • WA: {m.whatsapp || 'N/I'}
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => adminAlternarBloqueioMorador(m)}
                        className={`py-1.5 rounded-lg font-bold text-[11px] ${
                          bloqueado ? 'bg-emerald-600 text-white' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {bloqueado ? 'Desbloquear' : 'Bloquear'}
                      </button>

                      <button
                        type="button"
                        onClick={() => adminAbrirEdicaoMorador(m)}
                        className="py-1.5 rounded-lg font-bold text-[11px] bg-white border border-gray-300 text-grafite"
                      >
                        Dados / Editar
                      </button>

                      <button
                        type="button"
                        onClick={() => adminVisualizarSelfieMorador(m)}
                        disabled={!m.selfie_url}
                        className={`py-1.5 rounded-lg font-bold text-[11px] ${
                          m.selfie_url
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        {m.selfie_url ? 'Ver Foto' : 'Sem Foto'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {adminSecao === 'classificados' && (
          <div className="space-y-2.5 max-h-[480px] overflow-y-auto">
            {classificadosLista.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-6">
                Nenhum anúncio publicado nos Classificados.
              </p>
            ) : (
              classificadosLista.map((item) => (
                <div
                  key={item.id}
                  className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold text-emerald-800">
                        {item.tipo_anuncio} • {item.condicao}
                      </span>
                      <p className="font-bold text-grafite">{item.titulo}</p>
                      <p className="text-[10px] text-gray-500">
                        Por: {item.perfis?.nome_completo || 'Morador'}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        item.ativo ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {item.ativo ? 'Ativo' : 'Oculto'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await supabase
                          .from('classificados')
                          .update({ ativo: !item.ativo })
                          .eq('id', item.id);
                        await carregarDadosAdmin();
                        await onAtualizarMuralEClassificados();
                      }}
                      className="py-1.5 rounded-lg font-bold text-[11px] bg-amber-100 text-amber-900"
                    >
                      {item.ativo ? 'Ocultar Anúncio' : 'Aprovar / Ativar'}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm('Excluir este anúncio definitivamente?')) return;
                        await supabase.from('classificados').delete().eq('id', item.id);
                        await carregarDadosAdmin();
                        await onAtualizarMuralEClassificados();
                      }}
                      className="py-1.5 rounded-lg font-bold text-[11px] bg-red-100 text-red-700"
                    >
                      Excluir Definitivo
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {adminSecao === 'mural' && (
          <div className="space-y-4">
            <form
              onSubmit={adminSalvarAvisoMural}
              className="bg-gray-50 border border-gray-200 p-3.5 rounded-xl space-y-2.5"
            >
              <h3 className="text-xs font-bold text-grafite">
                {adminAvisoEditId ? '✏️ Editar Aviso do Mural' : '📢 Novo Aviso no Feed'}
              </h3>

              <input
                type="text"
                required
                placeholder="Título do aviso (ex: Reposição de Pães Frescos!)"
                value={adminAvisoTitulo}
                onChange={(e) => setAdminAvisoTitulo(e.target.value)}
                className="w-full p-2 border rounded-xl text-xs bg-white"
              />

              <textarea
                rows={3}
                required
                placeholder="Escreva o comunicado para os moradores..."
                value={adminAvisoConteudo}
                onChange={(e) => setAdminAvisoConteudo(e.target.value)}
                className="w-full p-2 border rounded-xl text-xs bg-white"
              />

              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-gray-600">
                  Imagem do Aviso (Opcional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setAdminAvisoFotoFile(file);
                    if (file) setAdminAvisoFotoPreview(URL.createObjectURL(file));
                  }}
                  className="w-full text-[11px]"
                />
                {adminAvisoFotoPreview && (
                  <div className="relative">
                    <img
                      src={adminAvisoFotoPreview}
                      alt="Preview aviso"
                      className="w-full max-h-48 object-contain rounded-lg border bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setAdminAvisoFotoFile(null);
                        setAdminAvisoFotoPreview(null);
                      }}
                      className="mt-1 text-[10px] text-red-600 font-bold underline"
                    >
                      Remover imagem
                    </button>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                {adminAvisoEditId && (
                  <button
                    type="button"
                    onClick={() => {
                      setAdminAvisoEditId(null);
                      setAdminAvisoTitulo('');
                      setAdminAvisoConteudo('');
                      setAdminAvisoFotoFile(null);
                      setAdminAvisoFotoPreview(null);
                    }}
                    className="flex-1 py-2 rounded-xl text-xs font-bold bg-gray-200 text-gray-700"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  type="submit"
                  disabled={carregando}
                  className="flex-1 py-2 rounded-xl text-xs font-bold bg-floresta text-white"
                >
                  {carregando ? 'Salvando...' : adminAvisoEditId ? 'Salvar Alterações' : 'Publicar no Feed'}
                </button>
              </div>
            </form>

            <div className="space-y-2">
              {avisosLista.map((av) => (
                <div
                  key={av.id}
                  className="p-3 bg-white border border-gray-200 rounded-xl text-xs space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-grafite">{av.titulo}</p>
                      <p className="text-[11px] text-gray-600 line-clamp-2">{av.conteudo}</p>
                    </div>
                    {av.imagem_url && (
                      <img
                        src={av.imagem_url}
                        alt={av.titulo}
                        className="w-12 h-12 rounded-lg object-cover shrink-0 border"
                      />
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAdminAvisoEditId(av.id);
                        setAdminAvisoTitulo(av.titulo);
                        setAdminAvisoConteudo(av.conteudo);
                        setAdminAvisoFotoPreview(av.imagem_url || null);
                        setAdminAvisoFotoFile(null);
                      }}
                      className="py-1.5 rounded-lg font-bold text-[11px] bg-gray-100 text-grafite"
                    >
                      Editar Aviso
                    </button>
                    <button
                      type="button"
                      onClick={() => adminExcluirAvisoMural(av.id)}
                      className="py-1.5 rounded-lg font-bold text-[11px] bg-red-50 text-red-600"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {adminEditandoMorador && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4">
            <h3 className="font-bold text-base text-grafite">
              {adminFotoAmpliadaUrl ? 'Foto Facial do Morador' : 'Editar Dados do Morador'}
            </h3>

            {adminFotoAmpliadaUrl ? (
              <div className="space-y-3 text-center">
                <p className="text-xs font-bold text-gray-700">{adminEditandoMorador.nome_completo}</p>
                <img
                  src={adminFotoAmpliadaUrl}
                  alt="Selfie Morador"
                  className="w-64 h-64 mx-auto object-cover rounded-2xl border-2 border-floresta"
                />
                <button
                  type="button"
                  onClick={() => adminRemoverFotoMorador(adminEditandoMorador)}
                  disabled={carregando}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl text-xs"
                >
                  🗑️ Remover Foto (Solicitar Nova Selfie)
                </button>
              </div>
            ) : (
              <form onSubmit={adminSalvarEdicaoMorador} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">Nome Completo</label>
                  <input
                    type="text"
                    required
                    value={adminEditNome}
                    onChange={(e) => setAdminEditNome(formatarNomeTitleCase(e.target.value))}
                    className="w-full p-2.5 border rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">WhatsApp</label>
                  <input
                    type="text"
                    value={adminEditWhatsapp}
                    onChange={(e) => setAdminEditWhatsapp(e.target.value)}
                    className="w-full p-2.5 border rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">Unidade / Endereço</label>
                  <input
                    type="text"
                    value={adminEditUnidade}
                    onChange={(e) => setAdminEditUnidade(e.target.value)}
                    className="w-full p-2.5 border rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 mb-1">Status de Acesso</label>
                  <select
                    value={adminEditStatus}
                    onChange={(e) => setAdminEditStatus(e.target.value)}
                    className="w-full p-2.5 border rounded-xl text-xs bg-white"
                  >
                    <option value="aprovado">Aprovado (Ativo)</option>
                    <option value="bloqueado">Bloqueado</option>
                    <option value="pendente_aprovacao">Pendente de Aprovação</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={carregando}
                  className="w-full bg-floresta text-white font-bold py-2.5 rounded-xl text-xs"
                >
                  {carregando ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </form>
            )}

            <button
              type="button"
              onClick={() => {
                setAdminEditandoMorador(null);
                setAdminFotoAmpliadaUrl(null);
              }}
              className="w-full text-xs text-gray-500 py-1"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </>
  );
}