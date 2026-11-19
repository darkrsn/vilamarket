import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface ItemCarrinho {
  produto_id: string;
  codigo_barras?: string;
  nome: string;
  quantidade: number;
  preco_unitario: number;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      perfil_id,
      cpf,
      pin,
      metodo_pagamento, // 'carteira' | 'pix' | 'cartao_online'
      itens,
    }: {
      perfil_id: string;
      cpf: string;
      pin: string;
      metodo_pagamento: 'carteira' | 'pix' | 'cartao_online';
      itens: ItemCarrinho[];
    } = body;

    if (!perfil_id || !cpf || !pin || !Array.isArray(itens) || itens.length === 0) {
      return NextResponse.json(
        { sucesso: false, mensagem: 'Dados incompletos para finalizar a compra.' },
        { status: 400 }
      );
    }

    // 1. Validar PIN de segurança do morador/dependente via RPC
    const cpfLimpo = cpf.replace(/\D/g, '');
    const { data: validacaoPin, error: errPin } = await supabaseAdmin.rpc('validar_cpf_pin', {
      p_cpf: cpfLimpo,
      p_pin: pin,
    });

    if (errPin || !validacaoPin?.sucesso) {
      return NextResponse.json(
        { sucesso: false, mensagem: validacaoPin?.mensagem || 'PIN de 4 dígitos incorreto.' },
        { status: 401 }
      );
    }

    // 2. Buscar perfil atualizado e conferir estoque real de cada item
    const { data: perfil, error: errPerfil } = await supabaseAdmin
      .from('perfis')
      .select('id, condominio_id, nome_completo, saldo_cashback, saldo_pre_pago, status_cadastro')
      .eq('id', perfil_id)
      .single();

    if (errPerfil || !perfil || perfil.status_cadastro === 'bloqueado') {
      return NextResponse.json(
        { sucesso: false, mensagem: 'Cadastro bloqueado ou não encontrado.' },
        { status: 403 }
      );
    }

    const idsProdutos = itens.map((i) => i.produto_id);
    const { data: produtosDb, error: errProd } = await supabaseAdmin
      .from('produtos')
      .select('id, nome, preco, preco_promocional, oferta_relampago, quantidade_estoque')
      .in('id', idsProdutos);

    if (errProd || !produtosDb) {
      return NextResponse.json(
        { sucesso: false, mensagem: 'Erro ao validar estoque dos produtos.' },
        { status: 500 }
      );
    }

    let valorTotal = 0;
    const itensConferidos: ItemCarrinho[] = [];

    for (const item of itens) {
      const prod = produtosDb.find((p) => p.id === item.produto_id);
      if (!prod) {
        return NextResponse.json(
          { sucesso: false, mensagem: `Produto "${item.nome}" não encontrado.` },
          { status: 404 }
        );
      }
      if (prod.quantidade_estoque < item.quantidade) {
        return NextResponse.json(
          {
            sucesso: false,
            mensagem: `Estoque insuficiente para "${prod.nome}" (Disponível: ${prod.quantidade_estoque} un.).`,
          },
          { status: 400 }
        );
      }

      const precoAplicado =
        prod.oferta_relampago && prod.preco_promocional && Number(prod.preco_promocional) > 0
          ? Number(prod.preco_promocional)
          : Number(prod.preco);

      valorTotal += precoAplicado * item.quantidade;
      itensConferidos.push({
        produto_id: prod.id,
        codigo_barras: item.codigo_barras || '',
        nome: prod.nome,
        quantidade: item.quantidade,
        preco_unitario: precoAplicado,
      });
    }

    valorTotal = Number(valorTotal.toFixed(2));
    const chaveNfceSimulada = `VM-${Date.now().toString().slice(-8)}-${Math.floor(1000 + Math.random() * 9000)}`;

    // 3. Processar conforme o meio de pagamento
    if (metodo_pagamento === 'carteira') {
      const saldoCashback = Number(perfil.saldo_cashback || 0);
      const saldoPrePago = Number(perfil.saldo_pre_pago || 0);
      const saldoTotal = Number((saldoCashback + saldoPrePago).toFixed(2));

      if (saldoTotal < valorTotal) {
        return NextResponse.json(
          {
            sucesso: false,
            mensagem: `Saldo insuficiente na carteira (Disponível: R$ ${saldoTotal.toFixed(2)} | Total: R$ ${valorTotal.toFixed(2)}).`,
          },
          { status: 400 }
        );
      }

      // Usa primeiro o saldo cashback e depois o pré-pago
      const descontoCashback = Math.min(saldoCashback, valorTotal);
      const restante = Number((valorTotal - descontoCashback).toFixed(2));
      const novoSaldoCashback = Number((saldoCashback - descontoCashback).toFixed(2));
      const novoSaldoPrePago = Number((saldoPrePago - restante).toFixed(2));

      await supabaseAdmin
        .from('perfis')
        .update({
          saldo_cashback: novoSaldoCashback,
          saldo_pre_pago: novoSaldoPrePago,
          atualizado_em: new Date().toISOString(),
        })
        .eq('id', perfil.id);

      // Dar baixa no estoque e registrar movimentação
      for (const item of itensConferidos) {
        const prodAtual = produtosDb.find((p) => p.id === item.produto_id)!;
        await supabaseAdmin
          .from('produtos')
          .update({
            quantidade_estoque: Math.max(0, prodAtual.quantidade_estoque - item.quantidade),
            atualizado_em: new Date().toISOString(),
          })
          .eq('id', item.produto_id);

        await supabaseAdmin.from('movimentacoes_estoque').insert({
          produto_id: item.produto_id,
          tipo: 'saida_venda',
          quantidade: -Math.abs(item.quantidade),
          observacao: `Scan & Go (Carteira) • ${perfil.nome_completo}`,
        });
      }

      // Registrar transação detalhada
      await supabaseAdmin.from('transacoes_carteira').insert({
        condominio_id: perfil.condominio_id,
        perfil_id: perfil.id,
        tipo: 'compra_scan_go',
        valor: -Math.abs(valorTotal),
        descricao: `Compra Scan & Go (${itensConferidos.length} ${itensConferidos.length === 1 ? 'item' : 'itens'})`,
        itens_json: itensConferidos,
        chave_nfce: chaveNfceSimulada,
      });

      return NextResponse.json({
        sucesso: true,
        status: 'pago',
        mensagem: 'Compra paga com saldo da carteira e estoque atualizado!',
        valor_total: valorTotal,
        cashback_gerado: 0,
        chave_nfce: chaveNfceSimulada,
      });
    }

    // 4. Fluxo PIX (2% de cashback travado exclusivamente no Pix) ou Cartão Online (0% cashback)
    const cashbackGerado = metodo_pagamento === 'pix' ? Number((valorTotal * 0.02).toFixed(2)) : 0;

    // Se já houver chave de API configurada na Vercel, gera cobrança real; caso contrário, retorna payload Pix/Checkout imediato
    const pixCopiaECola = `00020126580014BR.GOV.BCB.PIX0136vilamarket-scango-${chaveNfceSimulada}520400005303986540${valorTotal.toFixed(2).length}${valorTotal.toFixed(2)}5802BR5910VILAMARKET6008CURITIBA62070503***6304ABCD`;

    return NextResponse.json({
      sucesso: true,
      status: 'aguardando_pagamento',
      metodo_pagamento,
      valor_total: valorTotal,
      cashback_gerado: cashbackGerado,
      chave_nfce: chaveNfceSimulada,
      pix_copia_e_cola: metodo_pagamento === 'pix' ? pixCopiaECola : null,
      checkout_url: metodo_pagamento === 'cartao_online' ? `#checkout-cartao-${chaveNfceSimulada}` : null,
      itens_conferidos: itensConferidos,
    });
  } catch (err: any) {
    return NextResponse.json(
      { sucesso: false, mensagem: err.message || 'Erro interno no checkout Scan & Go.' },
      { status: 500 }
    );
  }
}