'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  converterMoedaParaNumero,
  formatarMoedaInput,
  formatarNomeTitleCase,
  otimizarImagemParaUpload,
} from '@/lib/formatters';

export const CATEGORIAS_CLASSIFICADOS = [
  'Todos',
  'Comida & Doces',
  'Artesanato & Presentes',
  'Eletrônicos & Games',
  'Móveis & Decoração',
  'Serviços & Aulas',
  'Infantil & Brinquedos',
  'Pet & Acessórios',
  'Outros / Desapegos',
];

const CONDICOES_ANUNCIO = [
  'Novo',
  'Seminovo / Usado',
  'Sob Encomenda / Artesanal',
  'Prestação de Serviço',
];

interface AbaMuralClassificadosProps {
  abaAtiva: 'mural' | 'classificados';
  avisosLista: any[];
  classificadosLista: any[];
  usuarioLogado: any;
  perfilDetalhes: any;
  condominioId: string;
  modalNovoAnuncioAberto: boolean;
  abrirModalNovoAnuncio: () => void;
  fecharModalNovoAnuncio: () => void;
  onRecarregarDados: () => Promise<void>;
  setMensagem: (msg: { tipo: 'erro' | 'sucesso'; texto: string } | null) => void;
}

export default function AbaMuralClassificados({
  abaAtiva,
  avisosLista,
  classificadosLista,
  usuarioLogado,
  perfilDetalhes,
  condominioId,
  modalNovoAnuncioAberto,
  abrirModalNovoAnuncio,
  fecharModalNovoAnuncio,
  onRecarregarDados,
  setMensagem,
}: AbaMuralClassificadosProps) {
  const [carregando, setCarregando] = useState(false);
  const [filtroCategoria, setFiltroCategoria] = useState('Todos');
  const [buscaClassificados, setBuscaClassificados] = useState('');
  const [somenteMeusAnuncios, setSomenteMeusAnuncios] = useState(false);

  // Novo Anúncio
  const [anuncioTitulo, setAnuncioTitulo] = useState('');
  const [anuncioTipo, setAnuncioTipo] = useState('Comida & Doces');
  const [anuncioCondicao, setAnuncioCondicao] = useState('Novo');
  const [anuncioPreco, setAnuncioPreco] = useState('');
  const [anuncioDescricao, setAnuncioDescricao] = useState('');
  const [anuncioWhatsapp, setAnuncioWhatsapp] = useState(perfilDetalhes?.whatsapp || '');
  const [anuncioFotoFile, setAnuncioFotoFile] = useState<File | null>(null);
  const [anuncioFotoPreview, setAnuncioFotoPreview] = useState<string | null>(null);

  async function publicarNovoAnuncio(e: React.FormEvent) {
    e.preventDefault();
    if (!usuarioLogado?.perfil_id) return;

    const precoNumerico = converterMoedaParaNumero(anuncioPreco);
    if (!anuncioTitulo.trim()) {
      alert('Informe o título/nome do produto ou serviço.');
      return;
    }

    setCarregando(true);
    try {
      let cId = perfilDetalhes?.condominio_id || condominioId;
      if (!cId) {
        const { data: cData } = await supabase.from('condominios').select('id').limit(1);
        cId = cData?.[0]?.id || null;
      }

      let fotoUrlPublica: string | null = null;
      if (anuncioFotoFile) {
        const otimizado = await otimizarImagemParaUpload(anuncioFotoFile, 1200);
        const caminho = `classificados/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
        const { error: upErr } = await supabase.storage
          .from('comunidade')
          .upload(caminho, otimizado, { contentType: 'image/jpeg', upsert: true });
        if (upErr) throw new Error(upErr.message);
        const { data } = supabase.storage.from('comunidade').getPublicUrl(caminho);
        fotoUrlPublica = data.publicUrl;
      }

      const waLimpo = (anuncioWhatsapp || perfilDetalhes?.whatsapp || '').replace(/\D/g, '');

      const { error } = await supabase.from('classificados').insert({
        condominio_id: cId || null,
        anunciante_id: usuarioLogado.perfil_id,
        titulo: formatarNomeTitleCase(anuncioTitulo.trim()),
        tipo_anuncio: anuncioTipo,
        condicao: anuncioCondicao,
        preco: precoNumerico,
        descricao: anuncioDescricao.trim(),
        whatsapp_contato: waLimpo,
        imagem_url: fotoUrlPublica,
        ativo: true,
        status: 'ativo',
      });

      if (error) throw new Error(error.message);

      setAnuncioTitulo('');
      setAnuncioTipo('Comida & Doces');
      setAnuncioCondicao('Novo');
      setAnuncioPreco('');
      setAnuncioDescricao('');
      setAnuncioFotoFile(null);
      setAnuncioFotoPreview(null);
      fecharModalNovoAnuncio();
      await onRecarregarDados();
      setMensagem({ tipo: 'sucesso', texto: '✅ Anúncio publicado nos Classificados da Vila!' });
    } catch (err: any) {
      alert('Erro ao publicar anúncio: ' + (err.message || 'Tente novamente.'));
    } finally {
      setCarregando(false);
    }
  }

  async function alternarStatusMeuAnuncio(anuncio: any) {
    const novoAtivo = !anuncio.ativo;
    const { error } = await supabase
      .from('classificados')
      .update({ ativo: novoAtivo, status: novoAtivo ? 'ativo' : 'vendido' })
      .eq('id', anuncio.id);

    if (!error) await onRecarregarDados();
  }

  async function excluirAnuncio(id: string) {
    if (!window.confirm('Tem certeza que deseja excluir este anúncio?')) return;
    const { error } = await supabase.from('classificados').delete().eq('id', id);
    if (!error) await onRecarregarDados();
  }

  const classificadosFiltrados = classificadosLista.filter((item) => {
    const ehMeu = item.anunciante_id === usuarioLogado?.perfil_id;
    if (somenteMeusAnuncios && !ehMeu) return false;
    if (!somenteMeusAnuncios && !item.ativo) return false;
    if (filtroCategoria !== 'Todos' && item.tipo_anuncio !== filtroCategoria) return false;
    if (buscaClassificados.trim()) {
      const q = buscaClassificados.toLowerCase();
      const matchTitulo = (item.titulo || '').toLowerCase().includes(q);
      const matchDesc = (item.descricao || '').toLowerCase().includes(q);
      if (!matchTitulo && !matchDesc) return false;
    }
    return true;
  });

  if (abaAtiva === 'mural') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-grafite">Mural de Avisos</h2>
          <span className="text-[11px] font-bold bg-emerald-50 text-floresta px-2.5 py-1 rounded-full">
            {avisosLista.length} {avisosLista.length === 1 ? 'aviso' : 'avisos'}
          </span>
        </div>

        <div className="space-y-4">
          {avisosLista.length === 0 ? (
            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl text-xs text-emerald-950 space-y-1">
              <p className="font-bold text-sm">🎉 Bem-vindo ao VilaMarket!</p>
              <p>
                Compre no minimercado autônomo da Vila usando Pix e ganhe 2% de cashback
                automático na sua carteira.
              </p>
            </div>
          ) : (
            avisosLista.map((aviso) => (
              <article
                key={aviso.id}
                className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm"
              >
                <div className="p-3.5 border-b border-gray-100 flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-floresta text-white flex items-center justify-center text-xs font-bold">
                    VM
                  </span>
                  <div>
                    <p className="text-xs font-bold text-grafite">Administração VilaMarket</p>
                    <p className="text-[10px] text-gray-400">
                      {new Date(aviso.criado_em).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>

                {aviso.imagem_url && (
                  <div className="w-full bg-gray-100">
                    <img
                      src={aviso.imagem_url}
                      alt={aviso.titulo}
                      className="w-full h-auto max-h-[480px] object-contain mx-auto block"
                    />
                  </div>
                )}

                <div className="p-4 space-y-1.5">
                  <h3 className="font-bold text-sm text-grafite">{aviso.titulo}</h3>
                  <p className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">
                    {aviso.conteudo}
                  </p>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-grafite">Classificados da Vila</h2>
          <button
            type="button"
            onClick={() => {
              setAnuncioWhatsapp(perfilDetalhes?.whatsapp || '');
              abrirModalNovoAnuncio();
            }}
            className="bg-floresta hover:bg-floresta-claro text-white text-xs font-bold px-3 py-2 rounded-xl transition"
          >
            + Criar Anúncio
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Buscar bolo, móvel, serviço..."
              value={buscaClassificados}
              onChange={(e) => setBuscaClassificados(e.target.value)}
              className="flex-1 p-2 border rounded-xl text-xs bg-gray-50 focus:bg-white outline-none"
            />
            <button
              type="button"
              onClick={() => setSomenteMeusAnuncios(!somenteMeusAnuncios)}
              className={`px-3 py-2 rounded-xl text-[11px] font-bold border transition shrink-0 ${
                somenteMeusAnuncios
                  ? 'bg-ambar text-white border-ambar'
                  : 'bg-gray-50 text-gray-700 border-gray-200'
              }`}
            >
              Meus Anúncios
            </button>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {CATEGORIAS_CLASSIFICADOS.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setFiltroCategoria(cat)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition ${
                  filtroCategoria === cat
                    ? 'bg-floresta text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {classificadosFiltrados.length === 0 ? (
            <div className="bg-gray-50 border border-dashed border-gray-200 p-6 rounded-xl text-center space-y-2">
              <p className="text-xs text-gray-500">Nenhum anúncio encontrado para este filtro.</p>
              <button
                type="button"
                onClick={() => {
                  setAnuncioWhatsapp(perfilDetalhes?.whatsapp || '');
                  abrirModalNovoAnuncio();
                }}
                className="text-xs font-bold text-floresta underline"
              >
                Publicar o primeiro anúncio agora
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {classificadosFiltrados.map((item) => {
                const ehMeu = item.anunciante_id === usuarioLogado?.perfil_id;
                const waLink = item.whatsapp_contato
                  ? `https://wa.me/55${item.whatsapp_contato.replace(/\D/g, '')}?text=${encodeURIComponent(
                      `Olá! Vi seu anúncio "${item.titulo}" no VilaMarket.`
                    )}`
                  : null;

                return (
                  <div
                    key={item.id}
                    className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm"
                  >
                    {item.imagem_url && (
                      <div className="w-full bg-gray-100">
                        <img
                          src={item.imagem_url}
                          alt={item.titulo}
                          className="w-full h-auto max-h-72 object-contain mx-auto block"
                        />
                      </div>
                    )}

                    <div className="p-3.5 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap gap-1 mb-1">
                            <span className="text-[10px] font-bold bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-full">
                              {item.tipo_anuncio || 'Geral'}
                            </span>
                            <span className="text-[10px] font-semibold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                              {item.condicao || 'Novo'}
                            </span>
                            {!item.ativo && (
                              <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                                Pausado / Vendido
                              </span>
                            )}
                          </div>
                          <h3 className="font-bold text-sm text-grafite">{item.titulo}</h3>
                        </div>
                        <span className="font-extrabold text-sm text-floresta shrink-0">
                          {Number(item.preco) > 0
                            ? `R$ ${Number(item.preco).toFixed(2).replace('.', ',')}`
                            : 'A combinar'}
                        </span>
                      </div>

                      {item.descricao && (
                        <p className="text-xs text-gray-600 whitespace-pre-line">{item.descricao}</p>
                      )}

                      <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-2">
                        <div className="text-[10px] text-gray-500 truncate">
                          <span className="font-bold text-gray-700">
                            {item.perfis?.nome_completo || 'Morador da Vila'}
                          </span>
                          {item.perfis?.unidade_formatada && (
                            <span className="block truncate">{item.perfis.unidade_formatada}</span>
                          )}
                        </div>

                        {ehMeu ? (
                          <div className="flex gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => alternarStatusMeuAnuncio(item)}
                              className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-amber-100 text-amber-900"
                            >
                              {item.ativo ? 'Marcar Vendido' : 'Reativar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => excluirAnuncio(item.id)}
                              className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600"
                            >
                              Excluir
                            </button>
                          </div>
                        ) : (
                          waLink && (
                            <a
                              href={waLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-xl shrink-0 transition"
                            >
                              💬 Chamar no WhatsApp
                            </a>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {modalNovoAnuncioAberto && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={publicarNovoAnuncio}
            className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 my-auto"
          >
            <h3 className="font-bold text-base text-grafite">Novo Anúncio nos Classificados</h3>

            <div>
              <label className="block text-[11px] font-bold text-gray-600 mb-1">
                Nome do Produto ou Serviço *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Bolo de Cenoura Caseiro, Bicicleta Aro 20..."
                value={anuncioTitulo}
                onChange={(e) => setAnuncioTitulo(formatarNomeTitleCase(e.target.value))}
                className="w-full p-2.5 border rounded-xl text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-1">Categoria *</label>
                <select
                  value={anuncioTipo}
                  onChange={(e) => setAnuncioTipo(e.target.value)}
                  className="w-full p-2.5 border rounded-xl text-xs bg-white"
                >
                  {CATEGORIAS_CLASSIFICADOS.filter((c) => c !== 'Todos').map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-1">Condição *</label>
                <select
                  value={anuncioCondicao}
                  onChange={(e) => setAnuncioCondicao(e.target.value)}
                  className="w-full p-2.5 border rounded-xl text-xs bg-white"
                >
                  {CONDICOES_ANUNCIO.map((cond) => (
                    <option key={cond} value={cond}>
                      {cond}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-1">Preço (R$)</label>
                <input
                  type="text"
                  placeholder="0,00 (0 = A combinar)"
                  value={anuncioPreco}
                  onChange={(e) => setAnuncioPreco(formatarMoedaInput(e.target.value))}
                  className="w-full p-2.5 border rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-600 mb-1">
                  WhatsApp de Contato *
                </label>
                <input
                  type="text"
                  required
                  placeholder="41999999999"
                  value={anuncioWhatsapp}
                  onChange={(e) => setAnuncioWhatsapp(e.target.value)}
                  className="w-full p-2.5 border rounded-xl text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-600 mb-1">Descrição *</label>
              <textarea
                rows={3}
                required
                placeholder="Detalhes, sabores, medidas, horários de entrega na Vila..."
                value={anuncioDescricao}
                onChange={(e) => setAnuncioDescricao(e.target.value)}
                className="w-full p-2.5 border rounded-xl text-xs"
              />
            </div>

            <div className="border border-dashed border-gray-300 rounded-xl p-3 bg-gray-50 space-y-2">
              <label className="block text-[11px] font-bold text-gray-700">
                📷 Foto do Anúncio (Opcional)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setAnuncioFotoFile(file);
                  if (file) setAnuncioFotoPreview(URL.createObjectURL(file));
                }}
                className="w-full text-[11px]"
              />
              {anuncioFotoPreview && (
                <img
                  src={anuncioFotoPreview}
                  alt="Preview anúncio"
                  className="w-full max-h-40 object-contain rounded-lg border bg-white"
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setAnuncioFotoFile(null);
                  setAnuncioFotoPreview(null);
                  fecharModalNovoAnuncio();
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
                {carregando ? 'Publicando...' : 'Publicar Anúncio'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}