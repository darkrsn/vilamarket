'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

export default function VilaMarketApp() {
  const [aba, setAba] = useState<'login' | 'cadastro' | 'confirmar_wa' | 'esqueci_pin' | 'painel'>('login');
  const [abaInferior, setAbaInferior] = useState<'inicio' | 'mural' | 'perfil' | 'admin'>('inicio');
  const [unidades, setUnidades] = useState<any[]>([]);
  const [condominioId, setCondominioId] = useState<string>('');
  const [mensagem, setMensagem] = useState<{ tipo: 'erro' | 'sucesso'; texto: string } | null>(null);
  const [carregando, setCarregando] = useState(false);

  // Dados Login & Usuário Logado
  const [cpf, setCpf] = useState('');
  const [pin, setPin] = useState('');
  const [usuarioLogado, setUsuarioLogado] = useState<any>(null);
  const [perfilDetalhes, setPerfilDetalhes] = useState<any>(null);

  // Dados Cadastro
  const [nome, setNome] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [dataNasc, setDataNasc] = useState('');
  const [ruaSelecionada, setRuaSelecionada] = useState('Rua Sargento Lafayette');
  const [tipoUnidade, setTipoUnidade] = useState<'bloco' | 'casa'>('bloco');
  const [unidadeId, setUnidadeId] = useState('');
  const [complementoApto, setComplementoApto] = useState('');

  // Código WhatsApp (Ativação e Reset PIN)
  const [codigoWa, setCodigoWa] = useState('');
  const [novoPin, setNovoPin] = useState('');

  // Estados dos Modais da Dashboard (Selfie, Alterar PIN, Extrato, Dependentes e Pix)
  const [modalAtivo, setModalAtivo] = useState<
    null | 'selfie' | 'pin' | 'extrato' | 'novo_dependente' | 'pix_dependente'
  >(null);

  // 1. Estados Modal Selfie (Câmera Frontal)
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [streamCamera, setStreamCamera] = useState<MediaStream | null>(null);
  const [fotoCapturada, setFotoCapturada] = useState<string | null>(null);

  // 2. Estados Modal Alterar PIN
  const [pinAtualTroca, setPinAtualTroca] = useState('');
  const [novoPinTroca, setNovoPinTroca] = useState('');
  const [confirmarNovoPinTroca, setConfirmarNovoPinTroca] = useState('');

  // 3. Estados Extrato e Dependentes
  const [extratoLista, setExtratoLista] = useState<any[]>([]);
  const [dependentesLista, setDependentesLista] = useState<any[]>([]);

  // 4. Estados Cadastro de Dependente (Mínimo 12 anos)
  const [depNome, setDepNome] = useState('');
  const [depCpf, setDepCpf] = useState('');
  const [depNascimento, setDepNascimento] = useState('');
  const [depPin, setDepPin] = useState('');
  const [depSelfieBase64, setDepSelfieBase64] = useState<string | null>(null);

  // 5. Estados Recarga Pix Dependente
  const [dependenteSelecionado, setDependenteSelecionado] = useState<any>(null);
  const [valorPix, setValorPix] = useState('20.00');
  const [pixCopiaECola, setPixCopiaECola] = useState('');

  // 6. Estados Mural / Classificados
  const [subAbaMural, setSubAbaMural] = useState<'avisos' | 'classificados'>('avisos');

  useEffect(() => {
    carregarUnidades();
  }, []);

  useEffect(() => {
    if (aba === 'painel' && usuarioLogado?.perfil_id) {
      carregarDadosDashboard();