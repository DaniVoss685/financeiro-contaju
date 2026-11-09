import React, { useState, useRef } from 'react';
import { 
  Upload, 
  Download, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  Users, 
  ArrowRight,
  Sparkles,
  Search,
  Check,
  HelpCircle,
  RefreshCw,
  Eye,
  Trash2,
  Building,
  UserCheck,
  UserPlus
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Counterparty, Contract } from '../../types';
import { storage } from '../../services/storageService';
import { maskCNPJOrCPF, validateFiscalDocument } from '../../utils/cnpjValidator';
import { lookupCNPJ } from '../../services/cnpjLookupService';
import { formatBRL } from '../../services/financialEngine';

export interface ImportClientsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (createdCount: number, updatedCount: number, contractsCount: number) => void;
}

export interface ParsedClientRow {
  rowNumber: number;
  name: string;
  tradeName: string;
  document: string;
  isDocValid: boolean;
  docType: 'CNPJ' | 'CPF' | 'DESCONHECIDO';
  email: string;
  phone: string;
  address: string;
  status: 'ATIVO' | 'INATIVO';
  notes: string;
  action: 'CRIAR' | 'ATUALIZAR' | 'IGNORAR';
  existingClient?: Counterparty;
  isInternalDuplicate?: boolean;
  validationError?: string;
  // Campos de Contrato Recorrente Integrado
  contractMonthly?: number;
  contractDueDay?: number;
  contractBillingMethod?: 'BOLETO' | 'PIX' | 'TRANSFERENCIA' | 'OUTRO';
  contractDescription?: string;
  // Enriquecimento Oficial via Receita Federal
  receitaEnriched?: boolean;
  receitaSituacao?: string;
  receitaCnae?: string;
}

export const ImportClientsModal: React.FC<ImportClientsModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedClientRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEnrichingReceita, setIsEnrichingReceita] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState<{ current: number; total: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'CRIAR' | 'ATUALIZAR' | 'IGNORAR'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // 1. Download de Planilha Modelo (.xlsx)
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'Razao_Social_Nome': 'Tech Soluções Digitais Ltda',
        'Nome_Fantasia': 'TechSolucoes',
        'CNPJ_CPF': '12.345.678/0001-90',
        'Email': 'financeiro@techsolucoes.com.br',
        'Telefone': '(11) 98765-4321',
        'Endereco': 'Av. Paulista, 1000, Bela Vista, São Paulo - SP',
        'Status': 'ATIVO',
        'Valor_Contrato_Mensal': 3500.00,
        'Dia_Vencimento': 15,
        'Forma_Cobranca': 'BOLETO',
        'Objeto_Contrato': 'Assessoria Contábil, BPO Financeiro e Folha',
        'Observacoes': 'Cliente corporativo de desenvolvimento de software. Regime: Simples Nacional.'
      },
      {
        'Razao_Social_Nome': 'Clínica Odontológica Sorriso Perfeito ME',
        'Nome_Fantasia': 'Sorriso Perfeito',
        'CNPJ_CPF': '98.765.432/0001-10',
        'Email': 'contato@sorrisoperfeito.com.br',
        'Telefone': '(21) 99887-6655',
        'Endereco': 'Rua das Flores, 250, Sala 301, Centro, Rio de Janeiro - RJ',
        'Status': 'ATIVO',
        'Valor_Contrato_Mensal': 2200.00,
        'Dia_Vencimento': 10,
        'Forma_Cobranca': 'PIX',
        'Objeto_Contrato': 'Contabilidade Consultiva e Conciliação',
        'Observacoes': 'Contrato recorrente de serviços contábeis e BPO Financeiro.'
      },
      {
        'Razao_Social_Nome': 'Carlos Eduardo da Silva',
        'Nome_Fantasia': 'Dr. Carlos Silva',
        'CNPJ_CPF': '123.456.789-00',
        'Email': 'carlos.silva.adv@email.com',
        'Telefone': '(31) 98712-3456',
        'Endereco': 'Rua da Bahia, 500, Lourdes, Belo Horizonte - MG',
        'Status': 'ATIVO',
        'Valor_Contrato_Mensal': 850.00,
        'Dia_Vencimento': 20,
        'Forma_Cobranca': 'PIX',
        'Objeto_Contrato': 'Consultoria Tributária PF & IRPF',
        'Observacoes': 'Pessoa Física - Profissional autônomo (Advogado). Declaração IRPF anual.'
      },
      {
        'Razao_Social_Nome': 'Padaria & Confeitaria Bela Vista Ltda',
        'Nome_Fantasia': 'Panificadora Bela Vista',
        'CNPJ_CPF': '45.123.789/0001-55',
        'Email': 'adm@padariabelavista.com.br',
        'Telefone': '(19) 3234-5678',
        'Endereco': 'Rua Tiradentes, 88, Vila Nova, Campinas - SP',
        'Status': 'ATIVO',
        'Valor_Contrato_Mensal': 1800.00,
        'Dia_Vencimento': 5,
        'Forma_Cobranca': 'BOLETO',
        'Objeto_Contrato': 'Gestão Fiscal e Emissão de Folha',
        'Observacoes': 'Comércio varejista de alimentos. Emissão de notas e conciliação bancária diária.'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);

    // Configuração das larguras ideais de colunas
    ws['!cols'] = [
      { wch: 38 }, // Razao_Social_Nome
      { wch: 25 }, // Nome_Fantasia
      { wch: 22 }, // CNPJ_CPF
      { wch: 32 }, // Email
      { wch: 18 }, // Telefone
      { wch: 45 }, // Endereco
      { wch: 12 }, // Status
      { wch: 20 }, // Valor_Contrato_Mensal
      { wch: 16 }, // Dia_Vencimento
      { wch: 16 }, // Forma_Cobranca
      { wch: 40 }, // Objeto_Contrato
      { wch: 45 }  // Observacoes
    ];

    // Instruções de preenchimento
    const instructionsData = [
      { 'Campo': 'Razao_Social_Nome', 'Obrigatorio': 'SIM', 'Descricao': 'Razão Social oficial da empresa ou Nome Completo da Pessoa Física.' },
      { 'Campo': 'Nome_Fantasia', 'Obrigatorio': 'NÃO', 'Descricao': 'Nome comercial ou marca pela qual a empresa é conhecida.' },
      { 'Campo': 'CNPJ_CPF', 'Obrigatorio': 'RECOMENDADO', 'Descricao': 'CNPJ ou CPF do cliente. Pode ser preenchido com ou sem pontuação (ex: 12345678000190 ou 12.345.678/0001-90).' },
      { 'Campo': 'Email', 'Obrigatorio': 'NÃO', 'Descricao': 'E-mail do setor financeiro ou contato principal para envio de cobranças e faturas.' },
      { 'Campo': 'Telefone', 'Obrigatorio': 'NÃO', 'Descricao': 'Telefone fixo ou WhatsApp comercial para contato.' },
      { 'Campo': 'Endereco', 'Obrigatorio': 'NÃO', 'Descricao': 'Endereço completo (Rua, Número, Bairro, Cidade - UF).' },
      { 'Campo': 'Status', 'Obrigatorio': 'NÃO', 'Descricao': 'Digite ATIVO ou INATIVO. Se não informado, assume ATIVO por padrão.' },
      { 'Campo': 'Valor_Contrato_Mensal', 'Obrigatorio': 'OPCIONAL', 'Descricao': 'Se preenchido (ex: 2500.00), o sistema já cria o Contrato Ativo vinculado a este cliente no módulo Comercial!' },
      { 'Campo': 'Dia_Vencimento', 'Obrigatorio': 'OPCIONAL', 'Descricao': 'Dia do mês para vencimento da mensalidade (1 a 31). Padrão: 10.' },
      { 'Campo': 'Forma_Cobranca', 'Obrigatorio': 'OPCIONAL', 'Descricao': 'BOLETO, PIX, TRANSFERENCIA ou OUTRO.' },
      { 'Campo': 'Objeto_Contrato', 'Obrigatorio': 'OPCIONAL', 'Descricao': 'Descrição dos serviços contratados (ex: Assessoria Contábil e BPO).' },
      { 'Campo': 'Observacoes', 'Obrigatorio': 'NÃO', 'Descricao': 'Notas livres, regime tributário, CNAE ou particularidades do cliente.' }
    ];

    const wsInstructions = XLSX.utils.json_to_sheet(instructionsData);
    wsInstructions['!cols'] = [
      { wch: 25 },
      { wch: 15 },
      { wch: 80 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
    XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instrucoes_Preenchimento');
    XLSX.writeFile(wb, 'modelo_importacao_clientes_contaju.xlsx');
  };

  // 2. Normalização de cabeçalhos
  const cleanHeader = (h: string): string => {
    return (h || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  };

  const processFile = async (selectedFile: File) => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const buffer = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      
      // Primeira aba da planilha
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawJson = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });

      if (rawJson.length === 0) {
        setErrorMessage('A planilha selecionada está vazia ou sem linhas de dados.');
        setIsLoading(false);
        return;
      }

      // Clientes atuais no sistema para checar duplicidades
      const existingCounterparties = storage.getCounterparties().filter(
        c => c.type === 'CLIENTE' || c.type === 'AMBOS'
      );

      const parsed: ParsedClientRow[] = [];
      const seenDocs = new Set<string>();
      const seenNames = new Set<string>();

      rawJson.forEach((row, idx) => {
        // Mapeamento flexível de colunas
        let rawName = '';
        let rawTrade = '';
        let rawDoc = '';
        let rawEmail = '';
        let rawPhone = '';
        let rawAddress = '';
        let rawStatus = 'ATIVO';
        let rawNotes = '';
        let rawMonthly = 0;
        let rawDueDay = 10;
        let rawBilling: 'BOLETO' | 'PIX' | 'TRANSFERENCIA' | 'OUTRO' = 'BOLETO';
        let rawContractDesc = '';

        for (const [key, val] of Object.entries(row)) {
          const cleanedKey = cleanHeader(key);
          const strVal = String(val || '').trim();

          if (cleanedKey.includes('razao') || cleanedKey.includes('cliente') || cleanedKey === 'nome' || cleanedKey === 'name') {
            rawName = rawName || strVal;
          } else if (cleanedKey.includes('fantasia') || cleanedKey === 'tradename') {
            rawTrade = rawTrade || strVal;
          } else if (cleanedKey.includes('cnpj') || cleanedKey.includes('cpf') || cleanedKey.includes('documento') || cleanedKey === 'doc') {
            rawDoc = rawDoc || strVal;
          } else if (cleanedKey.includes('email') || cleanedKey.includes('mail')) {
            rawEmail = rawEmail || strVal;
          } else if (cleanedKey.includes('telefone') || cleanedKey.includes('celular') || cleanedKey.includes('whatsapp') || cleanedKey.includes('fone') || cleanedKey === 'phone') {
            rawPhone = rawPhone || strVal;
          } else if (cleanedKey.includes('endereco') || cleanedKey.includes('rua') || cleanedKey.includes('address')) {
            rawAddress = rawAddress || strVal;
          } else if (cleanedKey.includes('status') || cleanedKey.includes('situacao')) {
            rawStatus = strVal.toUpperCase().includes('INA') ? 'INATIVO' : 'ATIVO';
          } else if (cleanedKey.includes('valorcontrato') || cleanedKey.includes('mensal') || cleanedKey.includes('mrr') || cleanedKey === 'valor') {
            const num = parseFloat(strVal.replace(/[R$\s.]/g, '').replace(',', '.'));
            if (!isNaN(num) && num > 0) rawMonthly = num;
          } else if (cleanedKey.includes('diavenc') || cleanedKey.includes('vencimento')) {
            const dayNum = parseInt(strVal.replace(/\D/g, ''), 10);
            if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) rawDueDay = dayNum;
          } else if (cleanedKey.includes('cobranca') || cleanedKey.includes('formapag')) {
            const upper = strVal.toUpperCase();
            if (upper.includes('PIX')) rawBilling = 'PIX';
            else if (upper.includes('TRANS')) rawBilling = 'TRANSFERENCIA';
            else rawBilling = 'BOLETO';
          } else if (cleanedKey.includes('objeto') || cleanedKey.includes('descricaocontrato')) {
            rawContractDesc = strVal;
          } else if (cleanedKey.includes('obs') || cleanedKey.includes('nota') || cleanedKey.includes('notes')) {
            rawNotes = rawNotes || strVal;
          }
        }

        // Se a linha não tiver nome, ignora se for linha em branco
        if (!rawName.trim()) {
          return;
        }

        // Validação e máscara do Documento
        const maskedDoc = rawDoc.trim() ? maskCNPJOrCPF(rawDoc.trim()) : '';
        const docValidation = maskedDoc ? validateFiscalDocument(maskedDoc) : { isValid: true, type: 'DESCONHECIDO' as const };
        const cleanDigits = maskedDoc.replace(/\D/g, '');

        // Identifica duplicata interna no arquivo
        let isInternalDup = false;
        if (cleanDigits.length >= 11) {
          if (seenDocs.has(cleanDigits)) isInternalDup = true;
          seenDocs.add(cleanDigits);
        } else if (rawName.trim()) {
          const normN = rawName.trim().toLowerCase();
          if (seenNames.has(normN)) isInternalDup = true;
          seenNames.add(normN);
        }

        // Match com banco de dados existente
        const existing = existingCounterparties.find(cp => {
          const cpDigits = (cp.document || '').replace(/\D/g, '');
          if (cleanDigits.length >= 11 && cpDigits === cleanDigits) return true;
          return cp.name.trim().toLowerCase() === rawName.trim().toLowerCase();
        });

        // Ação sugerida
        let defaultAction: 'CRIAR' | 'ATUALIZAR' | 'IGNORAR' = 'CRIAR';
        if (existing) {
          defaultAction = 'ATUALIZAR';
        }

        parsed.push({
          rowNumber: idx + 2, // Linha no Excel
          name: rawName.trim(),
          tradeName: rawTrade.trim(),
          document: maskedDoc,
          isDocValid: docValidation.isValid,
          docType: (docValidation.type as any) || 'DESCONHECIDO',
          email: rawEmail.trim(),
          phone: rawPhone.trim(),
          address: rawAddress.trim(),
          status: rawStatus === 'INATIVO' ? 'INATIVO' : 'ATIVO',
          notes: rawNotes.trim(),
          action: defaultAction,
          existingClient: existing,
          isInternalDuplicate: isInternalDup,
          validationError: !docValidation.isValid ? 'Documento fiscal (CNPJ/CPF) com dígitos verificadores inválidos.' : undefined,
          contractMonthly: rawMonthly > 0 ? rawMonthly : undefined,
          contractDueDay: rawMonthly > 0 ? rawDueDay : undefined,
          contractBillingMethod: rawMonthly > 0 ? rawBilling : undefined,
          contractDescription: rawMonthly > 0 ? (rawContractDesc || 'Prestação de Serviços Contábeis e Consultivos') : undefined
        });
      });

      if (parsed.length === 0) {
        setErrorMessage('Nenhum cliente válido encontrado nas linhas da planilha. Verifique os nomes das colunas.');
      } else {
        setParsedRows(parsed);
        setFile(selectedFile);
      }
    } catch (err: any) {
      console.error('Erro ao ler planilha de clientes:', err);
      setErrorMessage(`Falha ao ler arquivo: ${err.message || 'Formato de planilha inválido.'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      processFile(selected);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      processFile(droppedFile);
    }
  };

  // Alternar ação de uma linha
  const handleToggleRowAction = (rowNumber: number, newAction: 'CRIAR' | 'ATUALIZAR' | 'IGNORAR') => {
    setParsedRows(prev => prev.map(r => r.rowNumber === rowNumber ? { ...r, action: newAction } : r));
  };

  // Ação em massa para todas as linhas filtradas
  const handleBulkAction = (action: 'CRIAR' | 'ATUALIZAR' | 'IGNORAR') => {
    setParsedRows(prev => prev.map(r => {
      if (action === 'ATUALIZAR' && !r.existingClient) return r; // Não pode atualizar quem não existe
      return { ...r, action };
    }));
  };

  // 3. Enriquecimento Oficial em Lote via Receita Federal
  const handleEnrichFromReceita = async () => {
    const eligibleRows = parsedRows.filter(r => r.docType === 'CNPJ' && r.isDocValid && !r.receitaEnriched && r.action !== 'IGNORAR');
    if (eligibleRows.length === 0) {
      alert('Nenhum cliente com CNPJ válido pendente de consulta na Receita Federal.');
      return;
    }

    setIsEnrichingReceita(true);
    setEnrichProgress({ current: 0, total: eligibleRows.length });

    const updatedRows = [...parsedRows];

    for (let i = 0; i < eligibleRows.length; i++) {
      const row = eligibleRows[i];
      const digits = (row.document || '').replace(/\D/g, '');
      setEnrichProgress({ current: i + 1, total: eligibleRows.length });

      try {
        const data = await lookupCNPJ(digits);
        if (data) {
          const idx = updatedRows.findIndex(r => r.rowNumber === row.rowNumber);
          if (idx !== -1) {
            const current = updatedRows[idx];
            updatedRows[idx] = {
              ...current,
              name: data.razaoSocial || current.name,
              tradeName: data.nomeFantasia || current.tradeName,
              address: data.enderecoCompleto || current.address,
              phone: current.phone || data.telefone,
              email: current.email || data.email,
              receitaEnriched: true,
              receitaSituacao: data.situacaoCadastral,
              receitaCnae: data.cnaeCodigo ? `${data.cnaeCodigo} - ${data.cnaeDescricao}` : undefined,
              notes: current.notes
                ? `${current.notes} [CNAE: ${data.cnaeCodigo} | Situação RFB: ${data.situacaoCadastral}]`
                : `CNAE: ${data.cnaeCodigo} - ${data.cnaeDescricao}. Situação RFB: ${data.situacaoCadastral}.`
            };
          }
        }
      } catch (e) {
        console.warn(`Falha na consulta RFB para linha ${row.rowNumber}:`, e);
      }
    }

    setParsedRows(updatedRows);
    setIsEnrichingReceita(false);
    setEnrichProgress(null);
  };

  // Confirmação final da importação
  const handleConfirmImport = () => {
    const rowsToProcess = parsedRows.filter(r => r.action !== 'IGNORAR');
    if (rowsToProcess.length === 0) {
      alert('Nenhum cliente selecionado para criação ou atualização.');
      return;
    }

    const currentCounterparties = storage.getCounterparties();
    const currentContracts = storage.getContracts();
    const currentUser = storage.getCurrentUser();
    const nowIso = new Date().toISOString();
    const todayStr = nowIso.split('T')[0];

    let createdCount = 0;
    let updatedCount = 0;
    const updatedList = [...currentCounterparties];
    const newContracts: Contract[] = [];

    rowsToProcess.forEach(row => {
      let resolvedPartyId = '';

      if (row.action === 'ATUALIZAR' && row.existingClient) {
        resolvedPartyId = row.existingClient.id;
        const idx = updatedList.findIndex(c => c.id === row.existingClient?.id);
        if (idx !== -1) {
          const current = updatedList[idx];
          updatedList[idx] = {
            ...current,
            name: row.name || current.name,
            tradeName: row.tradeName || current.tradeName,
            document: row.document || current.document,
            email: row.email || current.email,
            phone: row.phone || current.phone,
            address: row.address || current.address,
            status: row.status,
            notes: row.notes 
              ? (current.notes ? `${current.notes} | [Importação: ${row.notes}]` : row.notes) 
              : current.notes
          };
          updatedCount++;
        }
      } else if (row.action === 'CRIAR') {
        resolvedPartyId = `cli-imp-${Date.now()}-${row.rowNumber}-${Math.floor(Math.random() * 1000)}`;
        const newClient: Counterparty = {
          id: resolvedPartyId,
          type: 'CLIENTE',
          name: row.name,
          tradeName: row.tradeName || '',
          document: row.document || '',
          email: row.email || '',
          phone: row.phone || '',
          address: row.address || '',
          status: row.status,
          notes: row.notes 
            ? `${row.notes} (Importado via planilha ${file?.name || ''})` 
            : `Importado via planilha ${file?.name || ''}`,
          createdAt: todayStr
        };
        updatedList.push(newClient);
        createdCount++;
      }

      // Vínculo Automático de Contrato Recorrente
      if (resolvedPartyId && row.contractMonthly && row.contractMonthly > 0) {
        newContracts.push({
          id: `ctr-imp-cli-${Date.now()}-${row.rowNumber}`,
          contractNumber: `CTR-${new Date().getFullYear()}-${Math.floor(Math.random() * 90000 + 10000)}`,
          customerId: resolvedPartyId,
          description: row.contractDescription || 'Prestação de Serviços Contábeis e Consultivos',
          items: [],
          monthlyTotal: row.contractMonthly,
          startDate: todayStr,
          entryDate: todayStr,
          periodicity: 'MENSAL',
          dueDay: row.contractDueDay && row.contractDueDay >= 1 && row.contractDueDay <= 31 ? row.contractDueDay : 10,
          dueRule: 'NEXT_MONTH',
          billingMethod: row.contractBillingMethod || 'BOLETO',
          status: 'ATIVO',
          contractType: 'RECORRENTE',
          isRecurring: true,
          createdAt: nowIso
        });
      }
    });

    // Salva no storage
    storage.saveCounterparties(updatedList);
    if (newContracts.length > 0) {
      storage.saveContracts([...currentContracts, ...newContracts]);
    }

    // Registra trilha de auditoria detalhada
    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'CADASTRO_CLIENTE',
      module: 'Comercial & Clientes',
      recordId: `import-cli-${Date.now()}`,
      details: `Importação em lote de clientes via planilha "${file?.name || 'Arquivo'}": ${createdCount} novos cadastros realizados, ${updatedCount} atualizados e ${newContracts.length} contratos ativos gerados.`
    });

    onSuccess(createdCount, updatedCount, newContracts.length);
    onClose();
  };

  // Contadores e métricas de conferência
  const totalRows = parsedRows.length;
  const toCreateCount = parsedRows.filter(r => r.action === 'CRIAR').length;
  const toUpdateCount = parsedRows.filter(r => r.action === 'ATUALIZAR').length;
  const toIgnoreCount = parsedRows.filter(r => r.action === 'IGNORAR').length;
  const internalDupCount = parsedRows.filter(r => r.isInternalDuplicate).length;

  // Filtragem na tabela
  const filteredRows = parsedRows.filter(r => {
    if (statusFilter !== 'ALL' && r.action !== statusFilter) return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const match = r.name.toLowerCase().includes(term) ||
        (r.tradeName && r.tradeName.toLowerCase().includes(term)) ||
        (r.document && r.document.includes(term)) ||
        (r.email && r.email.toLowerCase().includes(term));
      if (!match) return false;
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-[var(--surface-card)] rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-[var(--border-subtle)] text-[var(--text-primary)] animate-in fade-in zoom-in-95 duration-150">
        
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-amber-500/15 text-amber-400 rounded-xl border border-amber-500/30">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                Importação Inteligente de Clientes
                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-semibold">
                  Excel & CSV
                </span>
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Cadastre ou atualize centenas de clientes em lote com modelo pronto para download e proteção contra duplicidades.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1.5 rounded-lg hover:bg-[var(--surface-card)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Se nenhum arquivo foi carregado ainda: Exibe Download do Modelo e Upload */}
          {!file ? (
            <div className="space-y-6">
              
              {/* Card 1: Baixar Planilha Modelo */}
              <div className="p-5 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm">
                    <Sparkles className="w-4 h-4" />
                    <span>Planilha Modelo Oficial ContaJu</span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] max-w-xl">
                    Baixe o modelo pré-formatado em Excel (.xlsx) com colunas prontas, exemplos didáticos (PJ e PF) e aba de instruções para acelerar seu preenchimento.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-[#0b0b0d] rounded-xl text-xs font-bold transition-all shadow-[0_0_15px_rgba(245,158,11,0.25)] flex items-center space-x-2 whitespace-nowrap cursor-pointer active:scale-95"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar Planilha Modelo (.xlsx)</span>
                </button>
              </div>

              {/* Card 2: Dropzone de Upload */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all ${
                  isDragOver 
                    ? 'border-amber-400 bg-amber-500/10' 
                    : 'border-[var(--border-subtle)] hover:border-amber-400/60 bg-[var(--surface-elevated)]/50 hover:bg-[var(--surface-elevated)]'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div className="max-w-md mx-auto space-y-3">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
                    <Upload className="w-7 h-7" />
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-[var(--text-primary)]">
                      Clique para selecionar ou arraste sua planilha aqui
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">
                      Formatos aceitos: Microsoft Excel (<code className="font-mono text-amber-400">.xlsx</code>, <code className="font-mono text-amber-400">.xls</code>) ou <code className="font-mono text-amber-400">.csv</code>
                    </p>
                  </div>

                  <div className="pt-2">
                    <span className="inline-block px-3 py-1 bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-full text-[11px] font-semibold text-[var(--text-secondary)]">
                      O sistema detecta automaticamente CNPJ, CPF, Razão Social, E-mail, Telefone e Endereço
                    </span>
                  </div>
                </div>
              </div>

              {/* Mensagem de Erro de Leitura */}
              {errorMessage && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center space-x-3">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Guia Rápido de Dicas */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-1">
                  <span className="font-bold text-amber-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    Auto-Identificação
                  </span>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Cabeçalhos com variações (ex: "Nome", "Razão Social", "Cliente") são reconhecidos automaticamente.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-1">
                  <span className="font-bold text-amber-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    Sem Duplicidade
                  </span>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Clientes já cadastrados pelo CNPJ ou Razão Social são identificados para atualização, sem duplicar o cadastro.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] space-y-1">
                  <span className="font-bold text-amber-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    Validação Fiscal
                  </span>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Dígitos de CPF e CNPJ são conferidos na hora e formatados com pontuação oficial.
                  </p>
                </div>
              </div>

            </div>
          ) : (
            
            /* Se arquivo já foi carregado: Exibe Conferência e Configuração */
            <div className="space-y-4">
              
              {/* Barra superior de resumo do arquivo */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 bg-[var(--surface-elevated)] rounded-xl border border-[var(--border-subtle)]">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-emerald-500/15 text-emerald-400 rounded-lg border border-emerald-500/30">
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[var(--text-primary)]">
                      {file.name}
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)]">
                      {totalRows} clientes identificados na planilha
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setFile(null); setParsedRows([]); }}
                    className="px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors border border-[var(--border-subtle)] flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Trocar Planilha</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors border border-amber-500/30 flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Baixar Modelo</span>
                  </button>
                </div>
              </div>

              {/* 4 Cards de Métricas de Conferência */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div 
                  onClick={() => setStatusFilter('ALL')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    statusFilter === 'ALL'
                      ? 'bg-amber-500/15 border-amber-400 shadow-xs'
                      : 'bg-[var(--surface-elevated)] border-[var(--border-subtle)] hover:border-amber-400/40'
                  }`}
                >
                  <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase block">Total Lidos</span>
                  <span className="text-lg font-bold text-[var(--text-primary)] font-mono">{totalRows}</span>
                </div>

                <div 
                  onClick={() => setStatusFilter('CRIAR')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    statusFilter === 'CRIAR'
                      ? 'bg-emerald-500/20 border-emerald-400 shadow-xs'
                      : 'bg-[var(--surface-elevated)] border-[var(--border-subtle)] hover:border-emerald-400/40'
                  }`}
                >
                  <span className="text-[10px] font-bold text-emerald-400 uppercase block">Novos Cadastros</span>
                  <span className="text-lg font-bold text-emerald-400 font-mono">+{toCreateCount}</span>
                </div>

                <div 
                  onClick={() => setStatusFilter('ATUALIZAR')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    statusFilter === 'ATUALIZAR'
                      ? 'bg-blue-500/20 border-blue-400 shadow-xs'
                      : 'bg-[var(--surface-elevated)] border-[var(--border-subtle)] hover:border-blue-400/40'
                  }`}
                >
                  <span className="text-[10px] font-bold text-blue-400 uppercase block">Já Existentes (Atualizar)</span>
                  <span className="text-lg font-bold text-blue-400 font-mono">{toUpdateCount}</span>
                </div>

                <div 
                  onClick={() => setStatusFilter('IGNORAR')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    statusFilter === 'IGNORAR'
                      ? 'bg-slate-500/20 border-slate-400 shadow-xs'
                      : 'bg-[var(--surface-elevated)] border-[var(--border-subtle)] hover:border-slate-400/40'
                  }`}
                >
                  <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase block">Ignorados</span>
                  <span className="text-lg font-bold text-[var(--text-secondary)] font-mono">{toIgnoreCount}</span>
                </div>
              </div>

              {/* Alerta de Duplicidade Interna no arquivo, se houver */}
              {internalDupCount > 0 && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    <span>
                      Foram detectadas <strong>{internalDupCount} linhas repetidas</strong> dentro do próprio arquivo. Verifique a lista antes de salvar.
                    </span>
                  </div>
                </div>
              )}

              {/* Filtros e Ações em Massa */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
                <div className="relative flex-1 max-w-xs">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[var(--text-secondary)]" />
                  <input
                    type="text"
                    placeholder="Filtrar por nome, CNPJ ou email..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)] text-xs focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    disabled={isEnrichingReceita}
                    onClick={handleEnrichFromReceita}
                    className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg font-bold transition-all text-[11px] flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                    title="Consultar dados cadastrais na Receita Federal para completar automaticamente Razão Social oficial, Endereço, Contatos e CNAE"
                  >
                    <Sparkles className={`w-3.5 h-3.5 text-amber-400 ${isEnrichingReceita ? 'animate-spin' : ''}`} />
                    <span>
                      {isEnrichingReceita 
                        ? `Consultando Receita Federal (${enrichProgress?.current}/${enrichProgress?.total})...` 
                        : 'Enriquecer via Receita Federal'}
                    </span>
                  </button>

                  <span className="text-[var(--text-secondary)] text-[11px] ml-1">Ações em lote:</span>
                  <button
                    type="button"
                    onClick={() => handleBulkAction('CRIAR')}
                    className="px-2.5 py-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 rounded-lg font-semibold transition-colors text-[11px]"
                  >
                    Marcar Todos Criar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkAction('ATUALIZAR')}
                    className="px-2.5 py-1 bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 border border-blue-500/30 rounded-lg font-semibold transition-colors text-[11px]"
                  >
                    Atualizar Existentes
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkAction('IGNORAR')}
                    className="px-2.5 py-1 bg-slate-500/15 hover:bg-slate-500/25 text-[var(--text-secondary)] border border-[var(--border-subtle)] rounded-lg font-semibold transition-colors text-[11px]"
                  >
                    Ignorar Todos
                  </button>
                </div>
              </div>

              {/* Tabela de Conferência das Linhas */}
              <div className="border border-[var(--border-subtle)] rounded-2xl overflow-hidden bg-[var(--surface-elevated)]">
                <div className="max-h-[360px] overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-[var(--surface-card)] text-[var(--text-secondary)] border-b border-[var(--border-subtle)] font-semibold text-[11px] z-10">
                      <tr>
                        <th className="py-2.5 px-3 w-12 text-center">Linha</th>
                        <th className="py-2.5 px-3">Razão Social / Nome</th>
                        <th className="py-2.5 px-3">CNPJ / CPF</th>
                        <th className="py-2.5 px-3">Contrato Integrado</th>
                        <th className="py-2.5 px-3">Contato (Email / Fone)</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-center w-36">Ação Desejada</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-10 text-center text-xs text-[var(--text-secondary)]">
                            Nenhum cliente corresponde ao filtro selecionado.
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map(row => {
                          const isNew = row.action === 'CRIAR';
                          const isUpdate = row.action === 'ATUALIZAR';
                          const isIgnored = row.action === 'IGNORAR';

                          return (
                            <tr 
                              key={row.rowNumber}
                              className={`transition-colors ${
                                isIgnored 
                                  ? 'opacity-40 bg-transparent' 
                                  : isUpdate
                                  ? 'bg-blue-500/5 hover:bg-blue-500/10'
                                  : 'hover:bg-[var(--surface-card)]'
                              }`}
                            >
                              <td className="py-2 px-3 text-center text-[10px] font-mono text-[var(--text-secondary)]">
                                #{row.rowNumber}
                              </td>

                              <td className="py-2 px-3">
                                <div className="font-semibold text-[var(--text-primary)]">
                                  {row.name}
                                </div>
                                {row.tradeName && (
                                  <div className="text-[10px] text-[var(--text-secondary)]">
                                    Fantasia: {row.tradeName}
                                  </div>
                                )}
                                {row.receitaEnriched && (
                                  <div className="text-[9px] text-amber-300 font-semibold flex items-center gap-1 mt-0.5">
                                    <span>🏛️ Validado na Receita Federal ({row.receitaSituacao || 'ATIVA'})</span>
                                  </div>
                                )}
                                {row.existingClient && (
                                  <div className="text-[10px] text-blue-400 font-semibold flex items-center gap-1 mt-0.5">
                                    <span>⚠️ Já cadastrado no sistema ({row.existingClient.name})</span>
                                  </div>
                                )}
                                {row.isInternalDuplicate && (
                                  <div className="text-[10px] text-amber-400 font-semibold mt-0.5">
                                    ⚡ Repetido na planilha
                                  </div>
                                )}
                              </td>

                              <td className="py-2 px-3 font-mono text-[11px]">
                                {row.document ? (
                                  <div>
                                    <span className="text-[var(--text-primary)]">{row.document}</span>
                                    {row.isDocValid ? (
                                      <span className="text-[9px] text-emerald-400 ml-1 font-bold">✓ Válido</span>
                                    ) : (
                                      <span className="text-[9px] text-rose-400 ml-1 font-bold">⚠ Inválido</span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[var(--text-secondary)] text-[10px]">Não informado</span>
                                )}
                              </td>

                              {/* Coluna Contrato Integrado */}
                              <td className="py-2 px-3">
                                {row.contractMonthly && row.contractMonthly > 0 ? (
                                  <div className="space-y-0.5">
                                    <span className="inline-flex items-center text-[10px] font-bold text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md">
                                      📄 R$ {formatBRL(row.contractMonthly)}/mês
                                    </span>
                                    <div className="text-[9px] text-[var(--text-secondary)]">
                                      Venc. dia {row.contractDueDay || 10} • {row.contractBillingMethod || 'BOLETO'}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-[var(--text-secondary)]">-</span>
                                )}
                              </td>

                              <td className="py-2 px-3 text-[11px] text-[var(--text-secondary)]">
                                <div>{row.email || '-'}</div>
                                <div className="text-[10px] font-mono">{row.phone || ''}</div>
                              </td>

                              <td className="py-2 px-3">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                  row.status === 'ATIVO' 
                                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' 
                                    : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                                }`}>
                                  {row.status}
                                </span>
                              </td>

                              <td className="py-2 px-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleRowAction(row.rowNumber, 'CRIAR')}
                                    title="Cadastrar como novo cliente"
                                    className={`px-2 py-1 text-[10px] font-bold rounded-lg border transition-all ${
                                      isNew 
                                        ? 'bg-emerald-500/25 border-emerald-400 text-emerald-300 shadow-2xs' 
                                        : 'bg-[var(--surface-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-emerald-400'
                                    }`}
                                  >
                                    Novo
                                  </button>

                                  {row.existingClient && (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleRowAction(row.rowNumber, 'ATUALIZAR')}
                                      title="Atualizar dados do cliente já existente"
                                      className={`px-2 py-1 text-[10px] font-bold rounded-lg border transition-all ${
                                        isUpdate 
                                          ? 'bg-blue-500/25 border-blue-400 text-blue-300 shadow-2xs' 
                                          : 'bg-[var(--surface-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-blue-400'
                                      }`}
                                    >
                                      Atualizar
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => handleToggleRowAction(row.rowNumber, 'IGNORAR')}
                                    title="Ignorar esta linha da importação"
                                    className={`px-2 py-1 text-[10px] font-bold rounded-lg border transition-all ${
                                      isIgnored 
                                        ? 'bg-slate-500/30 border-slate-400 text-slate-300' 
                                        : 'bg-[var(--surface-card)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-rose-400'
                                    }`}
                                  >
                                    Ignorar
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Rodapé do Modal com Ações */}
        <div className="px-6 py-4 border-t border-[var(--border-subtle)] bg-[var(--surface-elevated)] flex items-center justify-between">
          <div className="text-xs text-[var(--text-secondary)]">
            {file ? (
              <span>
                Pronto para processar <strong>{toCreateCount + toUpdateCount}</strong> clientes ({toCreateCount} novos, {toUpdateCount} atualizações)
                {parsedRows.some(r => r.action !== 'IGNORAR' && r.contractMonthly && r.contractMonthly > 0) && (
                  <span className="text-amber-400 font-bold ml-1.5">
                    • {parsedRows.filter(r => r.action !== 'IGNORAR' && r.contractMonthly && r.contractMonthly > 0).length} contrato(s) recorrente(s) serão gerados
                  </span>
                )}
              </span>
            ) : (
              <span>Utilize a planilha modelo para garantir correspondência total das colunas.</span>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-card)] rounded-xl transition-colors"
            >
              Cancelar
            </button>

            {file && (
              <button
                type="button"
                disabled={toCreateCount + toUpdateCount === 0}
                onClick={handleConfirmImport}
                className="px-5 py-2.5 text-xs font-bold text-[#0b0b0d] bg-amber-400 hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-[0_0_15px_rgba(245,158,11,0.25)] transition-all flex items-center gap-2 cursor-pointer active:scale-95"
              >
                <Check className="w-4 h-4" />
                <span>Confirmar Importação de {toCreateCount + toUpdateCount} Clientes</span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
