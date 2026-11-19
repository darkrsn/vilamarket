'use client';

import React, { useState } from 'react';

interface ItemAjuda {
  id: string;
  icone: string;
  categoria: string;
  pergunta: string;
  resposta: React.ReactNode;
}

const ITENS_AJUDA: ItemAjuda[] = [
  {
    id: 'acesso-facial',
    icone: '🚪',
    categoria: 'Acesso à Loja',
    pergunta: 'Como entro no minimercado (Acesso Facial)?',
    resposta: (
      <div className="space-y-1.5">
        <p>
          Na tela <strong>Início</strong> ou em <strong>Perfil</strong>, toque na sua foto para
          cadastrar uma selfie bem iluminada e sem acessórios (boné ou óculos escuros).
        </p>
        <p>
          Quando o status estiver verde (<strong>Ativo</strong>), basta olhar para o leitor facial
          na porta da loja por 1 segundo e a trava será liberada automaticamente.
        </p>
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
          ⚠️ Por segurança, evite liberar a entrada para pessoas não cadastradas ou menores sem
          autorização.
        </p>
      </div>
    ),
  },
  {
    id: 'comprar-pagar',
    icone: '📱',
    categoria: 'Compras & Pagamento',
    pergunta: 'Como compro pelo celular (Scan & Go) ou no Totem?',
    resposta: (
      <div className="space-y-1.5">
        <p>
          <strong>Pelo Celular (Scan & Go):</strong> Na tela <strong>Início</strong> ou na aba{' '}
          <strong>Estoque</strong>, toque em <em>Scan & Go</em>, aponte a câmera para o código
          de barras dos produtos na prateleira e pague direto pelo app sem pegar fila no totem.
        </p>
        <p>
          <strong>No Totem da Loja:</strong> Bipe os produtos normalmente, informe seu{' '}
          <strong>CPF + PIN de 4 dígitos</strong> e finalize o pagamento na maquininha ou via Pix.
        </p>
      </div>
    ),
  },
  {
    id: 'carteira-cashback',
    icone: '💰',
    categoria: 'Carteira Digital',
    pergunta: 'Como funcionam o Saldo Pré-Pago e o Cashback?',
    resposta: (
      <div className="space-y-1.5">
        <p>
          <strong>Saldo Pré-Pago:</strong> Você pode adicionar créditos via Pix a qualquer momento na
          tela <strong>Início</strong> para agilizar suas compras ou deixar saldo disponível para a
          família.
        </p>
        <p>
          <strong>Cashback (2% de volta):</strong> Nas compras elegíveis pagas via Pix (no totem ou
          Scan & Go), parte do valor retorna automaticamente para a sua carteira e pode ser
          usado livremente nas próximas compras.
        </p>
      </div>
    ),
  },
  {
    id: 'estoque-ofertas',
    icone: '📦',
    categoria: 'Estoque & Ofertas',
    pergunta: 'Como consultar estoque, ofertas e pedir produtos?',
    resposta: (
      <div className="space-y-1.5">
        <p>
          Na aba <strong>Estoque</strong>, você confere antes de sair de casa se o item desejado
          está disponível na loja (verde = disponível, âmbar = últimas unidades, vermelho =
          esgotado) e aproveita as <strong>Ofertas Relâmpago</strong> com desconto.
        </p>
        <p>
          <strong>Faltou algo na loja?</strong> Use o botão de sugestão dentro da aba Estoque para
          avisar caso algum item tenha acabado na prateleira ou pedir novidades para a próxima
          reposição.
        </p>
      </div>
    ),
  },
  {
    id: 'dependentes',
    icone: '👨‍👩‍👧‍👦',
    categoria: 'Família',
    pergunta: 'Como cadastrar dependentes e controlar gastos?',
    resposta: (
      <div className="space-y-1.5">
        <p>
          Moradores titulares podem cadastrar dependentes a partir de <strong>12 anos</strong> na
          tela <strong>Início</strong> (em <em>Meus Dependentes</em>).
        </p>
        <p>
          Cada dependente possui selfie própria para abrir a porta, PIN individual de 4 dígitos e
          saldo separado. Você pode transferir créditos, bloquear o acesso temporariamente e
          conferir cada item comprado no <strong>Extrato Detalhado</strong> (em <em>Perfil</em>).
        </p>
      </div>
    ),
  },
  {
    id: 'mural-convivencia',
    icone: '📢',
    categoria: 'Comunidade',
    pergunta: 'Para que serve o Mural e quais são as boas práticas?',
    resposta: (
      <div className="space-y-1.5">
        <p>
          No <strong>Mural</strong> publicamos avisos de reposição fresca (pães, hortifrúti,
          congelados), promoções da semana e comunicados importantes da Vila.
        </p>
        <p>
          <strong>Boas práticas:</strong> Certifique-se de que a porta fechou ao sair, mantenha
          freezers e geladeiras bem encostados e avise o suporte caso encontre qualquer produto
          danificado.
        </p>
      </div>
    ),
  },
  {
    id: 'instalar-app',
    icone: '📲',
    categoria: 'Atalho no Celular',
    pergunta: 'Como salvar o VilaMarket na tela inicial do celular?',
    resposta: (
      <div className="space-y-1.5">
        <p>
          <strong>No iPhone (Safari):</strong> Toque no ícone de <strong>Compartilhar</strong>{' '}
          (quadrado com seta para cima na barra inferior) e escolha{' '}
          <strong>Adicionar à Tela de Início</strong>.
        </p>
        <p>
          <strong>No Android (Chrome):</strong> Toque nos <strong>3 pontinhos</strong> no canto
          superior direito e selecione <strong>Instalar aplicativo</strong> ou{' '}
          <strong>Adicionar à tela inicial</strong>.
        </p>
      </div>
    ),
  },
];

export default function AbaAjuda() {
  const [abertoId, setAbertoId] = useState<string>('acesso-facial');

  function alternarItem(id: string) {
    setAbertoId((atual) => (atual === id ? '' : id));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-grafite">Central de Ajuda</h2>
          <p className="text-xs text-gray-500">
            Guia rápido de todas as funções do minimercado autônomo
          </p>
        </div>
        <span className="text-[11px] font-bold bg-emerald-50 text-floresta px-2.5 py-1 rounded-full">
          24h
        </span>
      </div>

      {/* Lista Sanfona (FAQ) */}
      <div className="space-y-2">
        {ITENS_AJUDA.map((item) => {
          const estaAberto = abertoId === item.id;
          return (
            <div
              key={item.id}
              className={`border rounded-xl transition overflow-hidden ${
                estaAberto
                  ? 'border-floresta/40 bg-emerald-50/30 shadow-xs'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <button
                type="button"
                onClick={() => alternarItem(item.id)}
                className="w-full flex items-center justify-between gap-3 p-3.5 text-left"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-lg shrink-0">{item.icone}</span>
                  <div className="min-w-0">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-floresta">
                      {item.categoria}
                    </span>
                    <span className="block text-xs font-bold text-grafite leading-snug">
                      {item.pergunta}
                    </span>
                  </div>
                </div>
                <span
                  className={`text-gray-400 text-sm font-bold shrink-0 transition-transform duration-200 ${
                    estaAberto ? 'rotate-90 text-floresta' : ''
                  }`}
                >
                  ›
                </span>
              </button>

              {estaAberto && (
                <div className="px-3.5 pb-3.5 pt-2 border-t border-gray-100 text-xs text-gray-700 leading-relaxed">
                  {item.resposta}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Card de Suporte Direto */}
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-2.5">
        <div className="space-y-0.5">
          <p className="text-xs font-bold text-grafite">Precisa de atendimento imediato?</p>
          <p className="text-[11px] text-gray-600">
            Problemas com a porta, leitura de código ou cobrança? Fale direto com a administração.
          </p>
        </div>

        <a
          href="https://wa.me/5541991455623?text=Ol%C3%A1!%20Preciso%20de%20ajuda%20com%20o%20VilaMarket."
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full text-center bg-floresta hover:bg-floresta-claro text-white font-bold py-3 rounded-xl text-xs transition shadow-xs"
        >
          💬 Falar com o Suporte no WhatsApp
        </a>
      </div>
    </div>
  );
}