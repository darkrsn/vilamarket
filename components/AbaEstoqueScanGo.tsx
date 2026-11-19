'use client';

import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const CATEGORIAS_LOJA = [
  'Todos',
  'Bebidas & Cervejas',
  'Padaria & Frios',
  'Mercearia',
  'Lanches & Doces',
  'Congelados & Churrasco',
  'Higiene & Limpeza',
];

interface ItemCarrinhoScanGo {
  produto_id: string;
  codigo_barras: string;
  nome: string;
  preco_unitario: number;
  quantidade: number;
  estoque_disponivel: number;
}

function formatarNomeTitleCase(valor: string): string {
  const excecoes = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
  return valor
    .toLowerCase()
    .split(' ')
    .map((palavra, indice) => {
      if (!palavra) return '';
      if (indice > 0 && excecoes.has(palavra)) return palavra;
      return palavra.charAt(0).toUpperCase() + palavra.slice(1);
    })
    .join(' ');
}

function formatarMoedaInput(valorDigitado: string): string {
  const apenasDigitos = valorDigitado.replace(/\D/g, '');
  if (!apenasDigitos) return '';
  const numero = parseInt(apenasDigitos, 10) / 100;
  return numero.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function converterMoedaParaNumero(valorFormatado: string): number {
  if (!valorFormatado) return 0;
  const limpo = valorFormatado.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(limpo);
  return isNaN(num) ? 0 : num;
}

interface PropsAbaEstoque {
  usuarioLogado: any;
  perfilDetalhes: any;
  condominioId: string;
  roleUsuario: string;
  cpfLogin: string;
  onAtualizarDashboard: () => Promise<void>;
  onMensagem: (msg: { tipo: 'erro' | 'sucesso'; texto: string }) => void;
  carrinho: ItemCarrinhoScanGo[];
  setCarrinho: React.Dispatch<React.SetStateAction<ItemCarrinhoScanGo[]>>;
  abrirScanGoDireto?: boolean;
  somenteModalScanGo?: boolean;
  onFecharScanGoDireto?: () => void;
}

export default function AbaEstoqueScanGo({
  usuarioLogado,
  perfilDetalhes,
  condominioId,
  roleUsuario,
  cpfLogin,
  onAtualizarDashboard,
  onMensagem,
  carrinho,
  setCarrinho,
  abrirScanGoDireto,
  somenteModalScanGo,
  onFecharScanGoDireto,
}: PropsAbaEstoque) {
  const [produtosLista, setProdutosLista] = useState<any[]>([]);
  const [sugestoesListaAdmin, setSugestoesListaAdmin] = useState<any[]>([]);
  const [filtroCategoriaLoja, setFiltroCategoriaLoja] = useState('Todos');
  const [buscaLoja, setBuscaLoja] = useState('');
  const [modoEstoqueAdmin, setModoEstoqueAdmin] = useState<'loja' | 'gestao'>('loja');
  const [carregando, setCarregando] = useState(false);

  // Modais internos da Aba Estoque
  const [modalInterno, setModalInterno] = useState<
    null | 'scan_go' | 'sugerir_produto' | 'novo_produto_admin'
  >(null);

  // Scanner Scan & Go
  const scannerVideoRef = useRef<HTMLVideoElement | null>(null);
  const scannerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [scannerStream, setScannerStream] = useState<MediaStream | null>(null);
  const [scannerAtivo, setScannerAtivo] = useState(false);
  const [eanManual, setEanManual] = useState('');
  const [metodoPagamentoScanGo, setMetodoPagamentoScanGo] = useState<'carteira' | 'pix' | 'cartao_online'>('pix');
  const [pinCheckoutScanGo, setPinCheckoutScanGo] = useState('');
  const [cobrancaPendenteScanGo, setCobrancaPendenteScanGo] = useState<any | null>(null);

  // Sugestão / Ruptura
  const [sugestaoTipo, setSugestaoTipo] = useState<'sugestao' | 'ruptura'>('sugestao');
  const [sugestaoNome, setSugestaoNome] = useState('');
  const [sugestaoDetalhes, setSugestaoDetalhes] = useState('');

  // Admin: Produto
  const [prodEditId, setProdEditId] = useState<string | null>(null);
  const [prodNome, setProdNome] = useState('');
  const [prodEan, setProdEan] = useState('');
  const [prodCategoria, setProdCategoria] = useState('Mercearia');
  const [prodPreco, setProdPreco] = useState('');
  const [prodPrecoPromo, setProdPrecoPromo] = useState('');
  const [prodOfertaRelampago, setProdOfertaRelampago] = useState(false);
  const [prodValidade, setProdValidade] = useState('');
  const [prodQtdEstoque, setProdQtdEstoque] = useState('10');
  const [prodEstoqueMin, setProdEstoqueMin] = useState('3');
  const [prodFotoFile, setProdFotoFile] = useState<File | null>(null);
  const [prodFotoPreview, setProdFotoPreview] = useState<string | null>(null);

  useEffect(() => {
    carregarProdutosEstoque();
    if (roleUsuario === 'admin') {
      carregarSugestoesAdmin();
    }
    return () => pararScannerScanGo();
  }, [roleUsuario]);

  useEffect(() => {
    if (abrirScanGoDireto) {
      iniciarScannerScanGo();
    }
  }, [abrirScanGoDireto]);

  async function carregarProdutosEstoque() {
    const { data } = await supabase
      .from('produtos')
      .select('*')
      .order('oferta_relampago', { ascending: false })
      .order('nome', { ascending: true });
    if (data) setProdutosLista(data);
  }

  async function carregarSugestoesAdmin() {
    const { data } = await supabase
      .from('sugestoes_produtos')
      .select('*, perfis:perfil_id (nome_completo, unidade_formatada)')
      .order('criado_em', { ascending: false });
    if (data) setSugestoesListaAdmin(data);
  }

  async function enviarFotoProduto(file: File): Promise<string> {
    const ext = file.name.split('.').pop() || 'jpg';
    const caminho = `produtos/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('comunidade').upload(caminho, file, {
      contentType: file.type || 'image/jpeg',
      upsert: true,
    });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from('comunidade').getPublicUrl(caminho);
    return data.publicUrl;
  }

  async function iniciarScannerScanGo() {
    setCobrancaPendenteScanGo(null);
    setModalInterno('scan_go');
    setScannerAtivo(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      setScannerStream(stream);

      setTimeout(() => {
        if (scannerVideoRef.current) {
          scannerVideoRef.current.srcObject = stream;
        }
        if ('BarcodeDetector' in window) {
          const detector = new (window as any).BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'],
          });
          scannerIntervalRef.current = setInterval(async () => {
            if (scannerVideoRef.current && scannerVideoRef.current.readyState >= 2) {
              try {
                const codigos = await detector.detect(scannerVideoRef.current);
                if (codigos && codigos.length > 0 && codigos[0].rawValue) {
                  adicionarProdutoPorCodigoBarras(codigos[0].rawValue);
                }
              } catch {}
            }
          }, 900);
        }
      }, 200);
    } catch {
      setScannerAtivo(false);
    }
  }

  function pararScannerScanGo() {
    if (scannerIntervalRef.current) {
      clearInterval(scannerIntervalRef.current);
      scannerIntervalRef.current = null;
    }
    if (scannerStream) {
      scannerStream.getTracks().forEach((t) => t.stop());
      setScannerStream(null);
    }
    setScannerAtivo(false);
  }

  function fecharModalScanGo() {
    pararScannerScanGo();
    setCobrancaPendenteScanGo(null);
    setModalInterno(null);
    if (onFecharScanGoDireto) onFecharScanGoDireto();
  }

  function adicionarProdutoAoCarrinho(prod: any) {
    if (!prod || prod.quantidade_estoque <= 0) {
      alert(`Produto "${prod?.nome || 'Item'}" está esgotado no momento.`);
      return;
    }

    const precoEfetivo =
      prod.oferta_relampago && prod.preco_promocional && Number(prod.preco_promocional) > 0
        ? Number(prod.preco_promocional)
        : Number(prod.preco);

    setCarrinho((prev) => {
      const existente = prev.find((item) => item.produto_id === prod.id);
      if (existente) {
        if (existente.quantidade >= prod.quantidade_estoque) {
          alert(`Limite de estoque atingido (${prod.quantidade_estoque} un.).`);
          return prev;
        }
        return prev.map((item) =>
          item.produto_id === prod.id ? { ...item, quantidade: item.quantidade + 1 } : item
        );
      }
      return [
        ...prev,
        {
          produto_id: prod.id,
          codigo_barras: prod.codigo_barras || '',
          nome: prod.nome,
          preco_unitario: precoEfetivo,
          quantidade: 1,
          estoque_disponivel: prod.quantidade_estoque,
        },
      ];
    });
  }

  function adicionarProdutoPorCodigoBarras(ean: string) {
    const limpo = ean.trim();
    if (!limpo) return;
    const encontrado = produtosLista.find((p) => p.codigo_barras === limpo && p.ativo);
    if (!encontrado) {
      alert(`Código de barras "${limpo}" não encontrado no estoque da loja.`);
      return;
    }
    adicionarProdutoAoCarrinho(encontrado);
    setEanManual('');
  }

  function alterarQtdCarrinho(produtoId: string, delta: number) {
    setCarrinho((prev) =>
      prev
        .map((item) => {
          if (item.produto_id !== produtoId) return item;
          const novaQtd = item.quantidade + delta;
          if (novaQtd > item.estoque_disponivel) {
            alert(`Estoque máximo disponível: ${item.estoque_disponivel} un.`);
            return item;
          }
          return { ...item, quantidade: novaQtd };
        })
        .filter((item) => item.quantidade > 0)
    );
  }

  async function finalizarCheckoutScanGo() {
    if (carrinho.length === 0) return;
    if (pinCheckoutScanGo.length !== 4) {
      alert('Digite seu PIN de 4 dígitos para confirmar a compra.');
      return;
    }

    setCarregando(true);
    try {
      const resp = await fetch('/api/scan-and-go/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          perfil_id: usuarioLogado.perfil_id,
          cpf: perfilDetalhes?.cpf || cpfLogin,
          pin: pinCheckoutScanGo,
          metodo_pagamento: metodoPagamentoScanGo,
          itens: carrinho,
        }),
      });

      const res = await resp.json();
      if (!resp.ok || !res.sucesso) {
        alert(res.mensagem || 'Não foi possível concluir o checkout.');
        return;
      }

      if (res.status === 'pago') {
        setCarrinho([]);
        setPinCheckoutScanGo('');
        fecharModalScanGo();
        await Promise.all([onAtualizarDashboard(), carregarProdutosEstoque()]);
        onMensagem({
          tipo: 'sucesso',
          texto: `✅ ${res.mensagem} (Recibo: ${res.chave_nfce})`,
        });
      } else {
        setCobrancaPendenteScanGo(res);
      }
    } catch (err: any) {
      alert('Erro ao conectar com o servidor de checkout: ' + err.message);
    } finally {
      setCarregando(false);
    }
  }

  async function confirmarPagamentoExternoScanGo() {
    if (!cobrancaPendenteScanGo) return;
    setCarregando(true);
    try {
      const resp = await fetch('/api/pix/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          perfil_id: usuarioLogado.perfil_id,
          metodo_pagamento: cobrancaPendenteScanGo.metodo_pagamento,
          valor_total: cobrancaPendenteScanGo.valor_total,
          itens: cobrancaPendenteScanGo.itens_conferidos,
          chave_nfce: cobrancaPendenteScanGo.chave_nfce,
        }),
      });
      const res = await resp.json();
      if (!resp.ok || !res.sucesso) {
        alert(res.mensagem || 'Erro ao confirmar pagamento.');
        return;
      }

      setCarrinho([]);
      setPinCheckoutScanGo('');
      fecharModalScanGo();
      await Promise.all([onAtualizarDashboard(), carregarProdutosEstoque()]);
      onMensagem({ tipo: 'sucesso', texto: `✅ ${res.mensagem}` });
    } catch (err: any) {
      alert('Erro ao confirmar pagamento: ' + err.message);
    } finally {
      setCarregando(false);
    }
  }

  async function enviarSugestaoOuRuptura(e: React.FormEvent) {
    e.preventDefault();
    if (!sugestaoNome.trim() || !usuarioLogado?.perfil_id) return;
    setCarregando(true);

    const { error } = await supabase.from('sugestoes_produtos').insert({
      condominio_id: perfilDetalhes?.condominio_id || condominioId || null,
      perfil_id: usuarioLogado.perfil_id,
      tipo: sugestaoTipo,
      nome_produto: formatarNomeTitleCase(sugestaoNome.trim()),
      detalhes: sugestaoDetalhes.trim(),
      status: 'pendente',
    });

    setCarregando(false);
    if (error) {
      alert('Erro ao enviar: ' + error.message);
      return;
    }

    setSugestaoNome('');
    setSugestaoDetalhes('');
    setModalInterno(null);
    onMensagem({
      tipo: 'sucesso',
      texto:
        sugestaoTipo === 'ruptura'
          ? '✅ Aviso de falta enviado! Vamos repor na loja o quanto antes.'
          : '✅ Sugestão registrada! Obrigado por ajudar a montar o mix da Vila.',
    });
  }

  function abrirModalProdutoAdmin(produto?: any) {
    if (produto) {
      setProdEditId(produto.id);
      setProdNome(produto.nome || '');
      setProdEan(produto.codigo_barras || '');
      setProdCategoria(produto.categoria || 'Mercearia');
      setProdPreco(Number(produto.preco || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
      setProdPrecoPromo(
        produto.preco_promocional
          ? Number(produto.preco_promocional).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
          : ''
      );
      setProdOfertaRelampago(Boolean(produto.oferta_relampago));
      setProdValidade(produto.validade_proxima || '');
      setProdQtdEstoque(String(produto.quantidade_estoque ?? 0));
      setProdEstoqueMin(String(produto.estoque_minimo ?? 3));
      setProdFotoPreview(produto.imagem_url || null);
      setProdFotoFile(null);
    } else {
      setProdEditId(null);
      setProdNome('');
      setProdEan('');
      setProdCategoria('Mercearia');
      setProdPreco('');
      setProdPrecoPromo('');
      setProdOfertaRelampago(false);
      setProdValidade('');
      setProdQtdEstoque('10');
      setProdEstoqueMin('3');
      setProdFotoPreview(null);
      setProdFotoFile(null);
    }
    setModalInterno('novo_produto_admin');
  }

  async function salvarProdutoEstoqueAdmin(e: React.FormEvent) {
    e.preventDefault();
    const precoNum = converterMoedaParaNumero(prodPreco);
    const precoPromoNum = converterMoedaParaNumero(prodPrecoPromo);

    if (!prodNome.trim() || precoNum <= 0) {
      alert('Informe o nome do produto e um preço válido.');
      return;
    }

    setCarregando(true);
    try {
      let imagemFinalUrl = prodFotoPreview;
      if (prodFotoFile) {
        imagemFinalUrl = await enviarFotoProduto(prodFotoFile);
      }

      const payload = {
        condominio_id: perfilDetalhes?.condominio_id || condominioId || null,
        codigo_barras: prodEan.trim() || null,
        nome: formatarNomeTitleCase(prodNome.trim()),
        categoria: prodCategoria,
        preco: precoNum,
        preco_promocional: precoPromoNum > 0 ? precoPromoNum : null,
        oferta_relampago: prodOfertaRelampago,
        validade_proxima: prodValidade || null,
        quantidade_estoque: parseInt(prodQtdEstoque, 10) || 0,
        estoque_minimo: parseInt(prodEstoqueMin, 10) || 3,
        imagem_url: imagemFinalUrl || null,
        ativo: true,
        atualizado_em: new Date().toISOString(),
      };

      if (prodEditId) {
        const { error } = await supabase.from('produtos').update(payload).eq('id', prodEditId);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from('produtos').insert(payload);
        if (error) throw new Error(error.message);
      }

      setModalInterno(null);
      await carregarProdutosEstoque();
      onMensagem({ tipo: 'sucesso', texto: '✅ Produto salvo no estoque da loja!' });
    } catch (err: any) {
      alert('Erro ao salvar produto: ' + err.message);
    } finally {
      setCarregando(false);
    }
  }

  async function adminMovimentarEstoqueRapido(
    produtoId: string,
    tipo: 'entrada' | 'perda_validade' | 'ajuste_inventario',
    quantidade: number,
    observacao: string
  ) {
    setCarregando(true);
    const { data, error } = await supabase.rpc('admin_movimentar_estoque', {
      p_produto_id: produtoId,
      p_tipo: tipo,
      p_quantidade: quantidade,
      p_observacao: observacao,
    });
    setCarregando(false);

    if (error || !data?.sucesso) {
      alert(error?.message || data?.mensagem || 'Erro ao movimentar estoque.');
      return;
    }
    await carregarProdutosEstoque();
  }

  const produtosFiltrados = produtosLista.filter((p) => {
    if (!p.ativo && roleUsuario !== 'admin') return false;
    if (filtroCategoriaLoja !== 'Todos' && p.categoria !== filtroCategoriaLoja) return false;
    if (buscaLoja.trim()) {
      const q = buscaLoja.toLowerCase();
      if (!(p.nome || '').toLowerCase().includes(q) && !(p.codigo_barras || '').includes(q)) {
        return false;
      }
    }
    return true;
  });

  const ofertasRelampago = produtosLista.filter((p) => p.ativo && p.oferta_relampago && p.quantidade_estoque > 0);
  const produtosEstoqueBaixo = produtosLista.filter((p) => p.ativo && p.quantidade_estoque <= (p.estoque_minimo || 3));
  const totalCarrinhoScanGo = carrinho.reduce((acc, item) => acc + item.preco_unitario * item.quantidade, 0);
  const qtdItensCarrinho = carrinho.reduce((acc, item) => acc + item.quantidade, 0);

  return (
    <div className={somenteModalScanGo ? '' : 'space-y-4'}>
      {!somenteModalScanGo && (
        <>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-grafite">Estoque & Loja</h2>
            <button
              type="button"
              onClick={iniciarScannerScanGo}
              className="bg-floresta hover:bg-floresta-claro text-white text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 shadow-sm"
            >
              <span>📷 Scan & Go</span>
              {qtdItensCarrinho > 0 && (
                <span className="bg-ambar text-white text-[10px] px-1.5 py-0.5 rounded-full">
                  {qtdItensCarrinho}
                </span>
              )}
            </button>
          </div>

          {roleUsuario === 'admin' && (
            <div className="grid grid-cols-2 gap-1.5 bg-gray-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setModoEstoqueAdmin('loja')}
                className={`py-2 text-xs font-bold rounded-lg transition ${
                  modoEstoqueAdmin === 'loja' ? 'bg-floresta text-white' : 'text-gray-600'
                }`}
              >
                🛒 Visão Morador
              </button>
              <button
                type="button"
                onClick={() => setModoEstoqueAdmin('gestao')}
                className={`py-2 text-xs font-bold rounded-lg transition ${
                  modoEstoqueAdmin === 'gestao' ? 'bg-floresta text-white' : 'text-gray-600'
                }`}
              >
                📦 Gestão Estoque
              </button>
            </div>
          )}

          {(roleUsuario !== 'admin' || modoEstoqueAdmin === 'loja') && (
            <div className="space-y-3">
              {ofertasRelampago.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl space-y-2">
                  <p className="text-xs font-extrabold text-amber-900 uppercase">
                    ⚡ Ofertas Relâmpago & Validade Próxima
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {ofertasRelampago.map((of) => (
                      <div
                        key={of.id}
                        className="min-w-[165px] bg-white border border-amber-200 rounded-xl p-2.5 flex flex-col justify-between shrink-0"
                      >
                        <div>
                          <span className="text-[9px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                            OFERTA HOJE
                          </span>
                          <p className="text-xs font-bold text-grafite mt-1 line-clamp-2">{of.nome}</p>
                          <p className="text-[10px] text-gray-400 line-through">R$ {Number(of.preco).toFixed(2)}</p>
                          <p className="text-sm font-extrabold text-floresta">
                            R$ {Number(of.preco_promocional || of.preco).toFixed(2)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            adicionarProdutoAoCarrinho(of);
                            setModalInterno('scan_go');
                          }}
                          className="mt-2 w-full bg-floresta text-white text-[11px] font-bold py-1.5 rounded-lg"
                        >
                          + Pegar Oferta
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Buscar produto ou código..."
                  value={buscaLoja}
                  onChange={(e) => setBuscaLoja(e.target.value)}
                  className="flex-1 p-2 border rounded-xl text-xs bg-gray-50 focus:bg-white outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSugestaoTipo('sugestao');
                    setModalInterno('sugerir_produto');
                  }}
                  className="px-3 py-2 rounded-xl text-[11px] font-bold bg-amber-100 text-amber-900 shrink-0"
                >
                  💡 Faltou algo?
                </button>
              </div>

              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {CATEGORIAS_LOJA.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setFiltroCategoriaLoja(cat)}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition ${
                      filtroCategoriaLoja === cat
                        ? 'bg-floresta text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {produtosFiltrados.length === 0 ? (
                <div className="bg-gray-50 border border-dashed border-gray-200 p-6 rounded-xl text-center space-y-2">
                  <p className="text-xs text-gray-500">Nenhum produto encontrado nesta categoria.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSugestaoTipo('sugestao');
                      setModalInterno('sugerir_produto');
                    }}
                    className="text-xs font-bold text-floresta underline"
                  >
                    Pedir este produto para o minimercado
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[440px] overflow-y-auto pr-0.5">
                  {produtosFiltrados.map((prod) => {
                    const esgotado = prod.quantidade_estoque <= 0;
                    const baixo = !esgotado && prod.quantidade_estoque <= (prod.estoque_minimo || 3);
                    const precoFinal =
                      prod.oferta_relampago && prod.preco_promocional && Number(prod.preco_promocional) > 0
                        ? Number(prod.preco_promocional)
                        : Number(prod.preco);

                    return (
                      <div
                        key={prod.id}
                        className="bg-white border border-gray-200 p-3 rounded-xl flex items-center justify-between gap-2.5"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {prod.imagem_url ? (
                            <img
                              src={prod.imagem_url}
                              alt={prod.nome}
                              className="w-12 h-12 rounded-lg object-cover border shrink-0"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-lg shrink-0">
                              🛒
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-grafite truncate">{prod.nome}</p>
                            <p className="text-[10px] text-gray-400">{prod.categoria}</p>
                            <span
                              className={`inline-block mt-1 text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                esgotado
                                  ? 'bg-red-100 text-red-700'
                                  : baixo
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {esgotado
                                ? 'Esgotado'
                                : baixo
                                ? `Últimas ${prod.quantidade_estoque} un.`
                                : `Em estoque: ${prod.quantidade_estoque} un.`}
                            </span>
                          </div>
                        </div>

                        <div className="text-right shrink-0 space-y-1">
                          {prod.oferta_relampago && prod.preco_promocional && (
                            <p className="text-[10px] text-gray-400 line-through">
                              R$ {Number(prod.preco).toFixed(2)}
                            </p>
                          )}
                          <p className="text-sm font-extrabold text-floresta">R$ {precoFinal.toFixed(2)}</p>
                          {esgotado ? (
                            <button
                              type="button"
                              onClick={() => {
                                setSugestaoTipo('ruptura');
                                setSugestaoNome(prod.nome);
                                setModalInterno('sugerir_produto');
                              }}
                              className="text-[10px] font-bold text-amber-800 underline"
                            >
                              Avisar falta
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => adicionarProdutoAoCarrinho(prod)}
                              className="bg-emerald-50 hover:bg-emerald-100 text-floresta border border-emerald-200 text-[11px] font-bold px-2.5 py-1 rounded-lg"
                            >
                              + Cesta
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {roleUsuario === 'admin' && modoEstoqueAdmin === 'gestao' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-gray-50 border border-gray-200 p-2.5 rounded-xl">
                  <span className="text-[10px] text-gray-500 font-bold uppercase">Total SKUs</span>
                  <p className="text-lg font-extrabold text-grafite">{produtosLista.length}</p>
                </div>
                <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-xl">
                  <span className="text-[10px] text-amber-800 font-bold uppercase">Estoque Baixo</span>
                  <p className="text-lg font-extrabold text-amber-900">{produtosEstoqueBaixo.length}</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl">
                  <span className="text-[10px] text-emerald-800 font-bold uppercase">Pedidos Vila</span>
                  <p className="text-lg font-extrabold text-floresta">
                    {sugestoesListaAdmin.filter((s) => s.status === 'pendente').length}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Filtrar item no estoque..."
                  value={buscaLoja}
                  onChange={(e) => setBuscaLoja(e.target.value)}
                  className="flex-1 p-2 border rounded-xl text-xs"
                />
                <button
                  type="button"
                  onClick={() => abrirModalProdutoAdmin()}
                  className="bg-floresta text-white text-xs font-bold px-3 py-2 rounded-xl shrink-0"
                >
                  + Novo Produto
                </button>
              </div>

              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-0.5">
                {produtosFiltrados.map((prod) => {
                  const critico = prod.quantidade_estoque <= (prod.estoque_minimo || 3);
                  return (
                    <div
                      key={prod.id}
                      className={`p-3 rounded-xl border text-xs space-y-2 ${
                        critico ? 'bg-amber-50/70 border-amber-300' : 'bg-white border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-bold text-grafite truncate">{prod.nome}</p>
                            {prod.oferta_relampago && (
                              <span className="text-[9px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                                OFERTA
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-gray-500">
                            EAN: {prod.codigo_barras || 'S/N'} • Preço: R$ {Number(prod.preco).toFixed(2)}
                          </p>
                        </div>

                        <span
                          className={`text-xs font-extrabold px-2.5 py-1 rounded-lg shrink-0 ${
                            prod.quantidade_estoque === 0
                              ? 'bg-red-100 text-red-700'
                              : critico
                              ? 'bg-amber-200 text-amber-950'
                              : 'bg-emerald-100 text-emerald-900'
                          }`}
                        >
                          {prod.quantidade_estoque} un.
                        </span>
                      </div>

                      <div className="grid grid-cols-4 gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => adminMovimentarEstoqueRapido(prod.id, 'entrada', 1, 'Reposição rápida (+1)')}
                          className="py-1.5 rounded-lg font-bold text-[11px] bg-emerald-600 text-white"
                        >
                          +1 Un.
                        </button>
                        <button
                          type="button"
                          onClick={() => adminMovimentarEstoqueRapido(prod.id, 'entrada', 12, 'Entrada caixa (+12)')}
                          className="py-1.5 rounded-lg font-bold text-[11px] bg-emerald-100 text-emerald-900"
                        >
                          +12 Cx
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            adminMovimentarEstoqueRapido(prod.id, 'perda_validade', 1, 'Baixa perda/ajuste (-1)')
                          }
                          className="py-1.5 rounded-lg font-bold text-[11px] bg-red-100 text-red-700"
                        >
                          -1 Perda
                        </button>
                        <button
                          type="button"
                          onClick={() => abrirModalProdutoAdmin(prod)}
                          className="py-1.5 rounded-lg font-bold text-[11px] bg-gray-100 text-grafite"
                        >
                          Editar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {sugestoesListaAdmin.length > 0 && (
                <div className="pt-3 border-t border-gray-200 space-y-2">
                  <h3 className="text-xs font-bold text-grafite uppercase">
                    Pedidos & Avisos de Falta dos Moradores
                  </h3>
                  {sugestoesListaAdmin.map((sug) => (
                    <div
                      key={sug.id}
                      className="p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                            sug.tipo === 'ruptura' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {sug.tipo === 'ruptura' ? 'Faltou na loja' : 'Sugestão'}
                        </span>
                        <p className="font-bold text-grafite truncate mt-0.5">{sug.nome_produto}</p>
                        <p className="text-[10px] text-gray-500 truncate">
                          {sug.perfis?.nome_completo || 'Morador'} • {sug.detalhes}
                        </p>
                      </div>
                      {sug.status === 'pendente' ? (
                        <button
                          type="button"
                          onClick={async () => {
                            await supabase.from('sugestoes_produtos').update({ status: 'atendido' }).eq('id', sug.id);
                            await carregarSugestoesAdmin();
                          }}
                          className="bg-floresta text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg shrink-0"
                        >
                          Atender
                        </button>
                      ) : (
                        <span className="text-[10px] font-bold text-emerald-700 shrink-0">✓ Atendido</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* MODAL SCAN & GO (FECHA AO CLICAR FORA OU EM FECHAR) */}
      {modalInterno === 'scan_go' && (
        <div
          onClick={fecharModalScanGo}
          className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3 my-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-grafite">📱 Scan & Go • VilaMarket</h3>
              <span className="text-[11px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                {qtdItensCarrinho} {qtdItensCarrinho === 1 ? 'item' : 'itens'}
              </span>
            </div>

            {!cobrancaPendenteScanGo ? (
              <>
                {scannerAtivo && (
                  <div className="relative h-36 w-full rounded-xl overflow-hidden bg-black border border-gray-300">
                    <video ref={scannerVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                    <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 h-0.5 bg-red-500 shadow-[0_0_8px_red]" />
                    <span className="absolute bottom-1.5 inset-x-0 text-center text-[10px] text-white bg-black/50 py-0.5">
                      Aponte para o código de barras do produto
                    </span>
                  </div>
                )}

                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="Ou digite o código de barras (EAN)..."
                    value={eanManual}
                    onChange={(e) => setEanManual(e.target.value)}
                    className="flex-1 p-2 border rounded-xl text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => adicionarProdutoPorCodigoBarras(eanManual)}
                    className="bg-floresta text-white text-xs font-bold px-3 rounded-xl"
                  >
                    + Add
                  </button>
                </div>

                <div className="max-h-44 overflow-y-auto space-y-1.5 border-y py-2">
                  {carrinho.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">
                      Sua cesta está vazia. Escaneie um produto ou adicione pelo catálogo.
                    </p>
                  ) : (
                    carrinho.map((item) => (
                      <div key={item.produto_id} className="flex items-center justify-between gap-2 text-xs bg-gray-50 p-2 rounded-lg">
                        <div className="min-w-0">
                          <p className="font-bold text-grafite truncate">{item.nome}</p>
                          <p className="text-[10px] text-gray-500">R$ {item.preco_unitario.toFixed(2)} un.</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => alterarQtdCarrinho(item.produto_id, -1)}
                            className="w-6 h-6 rounded bg-gray-200 font-bold"
                          >
                            -
                          </button>
                          <span className="font-bold w-4 text-center">{item.quantidade}</span>
                          <button
                            type="button"
                            onClick={() => alterarQtdCarrinho(item.produto_id, 1)}
                            className="w-6 h-6 rounded bg-emerald-100 text-floresta font-bold"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {carrinho.length > 0 && (
                  <div className="space-y-2.5">
                    <div className="flex justify-between items-center text-sm font-extrabold">
                      <span>Total a Pagar:</span>
                      <span className="text-floresta">R$ {totalCarrinhoScanGo.toFixed(2)}</span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 text-[10px] font-bold">
                      <button
                        type="button"
                        onClick={() => setMetodoPagamentoScanGo('pix')}
                        className={`py-2 px-1 rounded-xl border text-center ${
                          metodoPagamentoScanGo === 'pix'
                            ? 'bg-floresta text-white border-floresta'
                            : 'bg-gray-50 text-gray-700'
                        }`}
                      >
                        Pix (+2% Cashback)
                      </button>
                      <button
                        type="button"
                        onClick={() => setMetodoPagamentoScanGo('carteira')}
                        className={`py-2 px-1 rounded-xl border text-center ${
                          metodoPagamentoScanGo === 'carteira'
                            ? 'bg-floresta text-white border-floresta'
                            : 'bg-gray-50 text-gray-700'
                        }`}
                      >
                        Saldo Carteira
                      </button>
                      <button
                        type="button"
                        onClick={() => setMetodoPagamentoScanGo('cartao_online')}
                        className={`py-2 px-1 rounded-xl border text-center ${
                          metodoPagamentoScanGo === 'cartao_online'
                            ? 'bg-floresta text-white border-floresta'
                            : 'bg-gray-50 text-gray-700'
                        }`}
                      >
                        Cartão Online
                      </button>
                    </div>

                    <input
                      type="password"
                      maxLength={4}
                      placeholder="Digite seu PIN de 4 dígitos para confirmar"
                      value={pinCheckoutScanGo}
                      onChange={(e) => setPinCheckoutScanGo(e.target.value.replace(/\D/g, ''))}
                      className="w-full p-2.5 border rounded-xl text-center text-sm tracking-widest"
                    />

                    <button
                      type="button"
                      onClick={finalizarCheckoutScanGo}
                      disabled={carregando}
                      className="w-full bg-floresta hover:bg-floresta-claro text-white font-bold py-3 rounded-xl text-xs"
                    >
                      {carregando ? 'Processando...' : `Pagar R$ ${totalCarrinhoScanGo.toFixed(2)}`}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-3 text-center">
                <p className="text-xs font-bold text-floresta">
                  {cobrancaPendenteScanGo.metodo_pagamento === 'pix'
                    ? `Pix Gerado • Ganhe R$ ${Number(cobrancaPendenteScanGo.cashback_gerado).toFixed(2)} de Cashback!`
                    : 'Checkout Cartão de Crédito Online'}
                </p>
                <p className="text-2xl font-extrabold text-grafite">
                  R$ {Number(cobrancaPendenteScanGo.valor_total).toFixed(2)}
                </p>

                {cobrancaPendenteScanGo.pix_copia_e_cola && (
                  <div className="bg-gray-50 p-3 rounded-xl border space-y-2">
                    <input
                      type="text"
                      readOnly
                      value={cobrancaPendenteScanGo.pix_copia_e_cola}
                      className="w-full bg-white border rounded p-1.5 text-[10px] text-gray-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(cobrancaPendenteScanGo.pix_copia_e_cola);
                        alert('Código Pix Copia e Cola copiado!');
                      }}
                      className="w-full bg-amber-100 text-amber-900 font-bold py-1.5 rounded-lg text-xs"
                    >
                      Copiar Código Pix
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={confirmarPagamentoExternoScanGo}
                  disabled={carregando}
                  className="w-full bg-floresta text-white font-bold py-3 rounded-xl text-xs"
                >
                  {carregando ? 'Confirmando...' : '✅ Já Paguei • Liberar Recibo'}
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={fecharModalScanGo}
              className="w-full text-xs text-gray-500 py-1"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* MODAL SUGERIR PRODUTO */}
      {modalInterno === 'sugerir_produto' && (
        <div
          onClick={() => setModalInterno(null)}
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={enviarSugestaoOuRuptura}
            className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-3"
          >
            <h3 className="font-bold text-base text-grafite">Faltou algo na loja?</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSugestaoTipo('sugestao')}
                className={`py-2 rounded-xl text-xs font-bold border ${
                  sugestaoTipo === 'sugestao' ? 'bg-floresta text-white border-floresta' : 'bg-gray-50 text-gray-600'
                }`}
              >
                💡 Sugerir Produto Novo
              </button>
              <button
                type="button"
                onClick={() => setSugestaoTipo('ruptura')}
                className={`py-2 rounded-xl text-xs font-bold border ${
                  sugestaoTipo === 'ruptura' ? 'bg-ambar text-white border-ambar' : 'bg-gray-50 text-gray-600'
                }`}
              >
                ⚠️ Acabou na Prateleira
              </button>
            </div>

            <input
              type="text"
              required
              placeholder="Nome do produto (ex: Pão de Queijo Congelado)"
              value={sugestaoNome}
              onChange={(e) => setSugestaoNome(e.target.value)}
              className="w-full p-2.5 border rounded-xl text-xs"
            />
            <textarea
              rows={2}
              placeholder="Marca preferida ou detalhes (opcional)"
              value={sugestaoDetalhes}
              onChange={(e) => setSugestaoDetalhes(e.target.value)}
              className="w-full p-2.5 border rounded-xl text-xs"
            />

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setModalInterno(null)}
                className="bg-gray-100 text-gray-700 font-bold py-2.5 rounded-xl text-xs"
              >
                Cancelar
              </button>
              <button type="submit" disabled={carregando} className="bg-floresta text-white font-bold py-2.5 rounded-xl text-xs">
                Enviar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL ADMIN: PRODUTO */}
      {modalInterno === 'novo_produto_admin' && (
        <div
          onClick={() => setModalInterno(null)}
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 overflow-y-auto"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={salvarProdutoEstoqueAdmin}
            className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-2.5 my-auto"
          >
            <h3 className="font-bold text-base text-grafite">
              {prodEditId ? 'Editar Produto do Estoque' : 'Cadastrar Produto no Estoque'}
            </h3>

            <input
              type="text"
              required
              placeholder="Nome do Produto *"
              value={prodNome}
              onChange={(e) => setProdNome(formatarNomeTitleCase(e.target.value))}
              className="w-full p-2.5 border rounded-xl text-xs"
            />

            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Código Barras (EAN)"
                value={prodEan}
                onChange={(e) => setProdEan(e.target.value)}
                className="w-full p-2.5 border rounded-xl text-xs"
              />
              <select
                value={prodCategoria}
                onChange={(e) => setProdCategoria(e.target.value)}
                className="w-full p-2.5 border rounded-xl text-xs bg-white"
              >
                {CATEGORIAS_LOJA.filter((c) => c !== 'Todos').map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-0.5">Preço Normal (R$) *</label>
                <input
                  type="text"
                  required
                  placeholder="0,00"
                  value={prodPreco}
                  onChange={(e) => setProdPreco(formatarMoedaInput(e.target.value))}
                  className="w-full p-2 border rounded-xl text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-0.5">Preço Oferta (R$)</label>
                <input
                  type="text"
                  placeholder="Opcional"
                  value={prodPrecoPromo}
                  onChange={(e) => setProdPrecoPromo(formatarMoedaInput(e.target.value))}
                  className="w-full p-2 border rounded-xl text-xs"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs font-bold text-amber-900 bg-amber-50 p-2 rounded-xl border border-amber-200">
              <input
                type="checkbox"
                checked={prodOfertaRelampago}
                onChange={(e) => setProdOfertaRelampago(e.target.checked)}
                className="accent-floresta"
              />
              <span>⚡ Destacar como Oferta Relâmpago</span>
            </label>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-0.5">Qtd Estoque</label>
                <input
                  type="number"
                  value={prodQtdEstoque}
                  onChange={(e) => setProdQtdEstoque(e.target.value)}
                  className="w-full p-2 border rounded-xl text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-0.5">Alerta Mín.</label>
                <input
                  type="number"
                  value={prodEstoqueMin}
                  onChange={(e) => setProdEstoqueMin(e.target.value)}
                  className="w-full p-2 border rounded-xl text-xs"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 mb-0.5">Validade</label>
                <input
                  type="date"
                  value={prodValidade}
                  onChange={(e) => setProdValidade(e.target.value)}
                  className="w-full p-2 border rounded-xl text-[10px]"
                />
              </div>
            </div>

            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setProdFotoFile(f);
                if (f) setProdFotoPreview(URL.createObjectURL(f));
              }}
              className="w-full text-[11px]"
            />

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalInterno(null)}
                className="bg-gray-100 text-gray-700 font-bold py-2.5 rounded-xl text-xs"
              >
                Cancelar
              </button>
              <button type="submit" disabled={carregando} className="bg-floresta text-white font-bold py-2.5 rounded-xl text-xs">
                {carregando ? 'Salvando...' : 'Salvar Produto'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}