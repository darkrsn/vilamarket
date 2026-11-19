import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      perfil_id,
      metodo_pagamento, // 'pix' | 'cartao_online'
      valor_total,
      itens,
      chave_nfce,
    } = body;

    if (!perfil_id || !valor_total || !Array.isArray(itens)) {
      return NextResponse.json({ sucesso: false, mensagem: 'Payload inválido.' }, { status: 400 });
    }

    const { data: perfil, error: errPerfil } = await supabaseAdmin
      .from('perfis')
      .select('id, condominio_id, nome_completo, saldo_cashback')
      .eq('id', perfil_id)
      .single();

    if (errPerfil || !perfil) {
      return NextResponse.json({ sucesso: false, mensagem: 'Perfil não encontrado.' }, { status: 404 });
    }

    const totalNum = Number(valor_total);
    const cashbackGerado = metodo_pagamento === 'pix' ? Number((totalNum * 0.02).toFixed(2)) : 0;

    // 1. Creditar 2% de cashback se pago via Pix
    if (cashbackGerado > 0) {
      const novoCashback = Number((Number(perfil.saldo_cashback || 0) + cashbackGerado).toFixed(2));
      await supabaseAdmin
        .from('perfis')
        .update({ saldo_cashback: novoCashback, atualizado_em: new Date().toISOString() })
        .eq('id', perfil.id);
    }

    // 2. Baixa de estoque em cada item
    for (const item of itens) {
      const { data: prod } = await supabaseAdmin
        .from('produtos')
        .select('id, quantidade_estoque')
        .eq('id', item.produto_id)
        .single();

      if (prod) {
        await supabaseAdmin
          .from('produtos')
          .update({
            quantidade_estoque: Math.max(0, prod.quantidade_estoque - Number(item.quantidade)),
            atualizado_em: new Date().toISOString(),
          })
          .eq('id', prod.id);

        await supabaseAdmin.from('movimentacoes_estoque').insert({
          produto_id: prod.id,
          tipo: 'saida_venda',
          quantidade: -Math.abs(Number(item.quantidade)),
          observacao: `Scan & Go (${metodo_pagamento.toUpperCase()}) • ${perfil.nome_completo}`,
        });
      }
    }

    // 3. Gravar compra no extrato com itens detalhados + NFC-e
    await supabaseAdmin.from('transacoes_carteira').insert({
      condominio_id: perfil.condominio_id,
      perfil_id: perfil.id,
      tipo: `compra_${metodo_pagamento}`,
      valor: -Math.abs(totalNum),
      descricao: `Scan & Go (${metodo_pagamento === 'pix' ? 'Pix +2% Cashback' : 'Cartão Online'})`,
      itens_json: itens,
      chave_nfce: chave_nfce || `VM-${Date.now().toString().slice(-8)}`,
    });

    if (cashbackGerado > 0) {
      await supabaseAdmin.from('transacoes_carteira').insert({
        condominio_id: perfil.condominio_id,
        perfil_id: perfil.id,
        tipo: 'cashback_pix',
        valor: cashbackGerado,
        descricao: 'Bônus Cashback 2% (Compra Pix Scan & Go)',
      });
    }

    return NextResponse.json({
      sucesso: true,
      mensagem:
        cashbackGerado > 0
          ? `Pagamento confirmado! Você ganhou R$ ${cashbackGerado.toFixed(2)} de cashback.`
          : 'Pagamento confirmado e estoque atualizado!',
      cashback_gerado: cashbackGerado,
    });
  } catch (err: any) {
    return NextResponse.json(
      { sucesso: false, mensagem: err.message || 'Erro no webhook de pagamento.' },
      { status: 500 }
    );
  }
}