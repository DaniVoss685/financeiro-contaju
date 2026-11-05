import React, { useState } from 'react';
import { 
  Upload, 
  Download, 
  FileSpreadsheet, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  Users, 
  Building2, 
  ArrowRight,
  Sparkles,
  Share2,
  Search,
  Check,
  HelpCircle,
  Clock
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Contract, Counterparty, AcquisitionChannel, SocialNetworkType } from '../../types';
import { storage } from '../../services/storageService';
import { formatBRL, formatDateBR } from '../../services/financialEngine';

interface ImportContractsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (count: number) => void;
}

interface ParsedContractRow {
  clientName: string;
  clientDoc?: string;
  contractNumber: string;
  description: string;
  entryDate: string; // YYYY-MM-DD
  monthlyTotal: number;
  dueDay: number;
  dueRule: 'NEXT_MONTH' | 'SAME_MONTH';
  billingMethod: 'BOLETO' | 'PIX' | 'TRANSFERENCIA' | 'OUTRO';
  acquisitionChannel: AcquisitionChannel;
  acquisitionReferrerName?: string;
  acquisitionSocialNetwork?: string;
  acquisitionNotes?: string;
  isExistingClient: boolean;
  existingClientId?: string;
  isValid: boolean;
  validationError?: string;
}

export const ImportContractsModal: React.FC<ImportContractsModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedContractRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  // 1. Download de Planilha Modelo (.xlsx)
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'Cliente_Razao_Social': 'Clínica Odontológica Sorriso Ltda',
        'CNPJ_CPF': '12.345.678/0001-90',
        'Numero_Contrato': 'CTR-2026-101',
        'Objeto_Descricao': 'Assessoria Contábil, Fiscal e Folha de Pagamento',
        'Data_Entrada': '2026-01-15',
        'Valor_Mensal': 2850.00,
        'Dia_Vencimento': 10,
        'Regra_Vencimento': 'MES_SEGUINTE',
        'Forma_Cobranca': 'BOLETO',
        'Canal_Aquisicao': 'INDICACAO',
        'Quem_Indicou': 'Dr. Marcos Silveira (Cliente)',
        'Qual_Rede_Social': '',
        'Observacoes_Aquisicao': 'Cliente veio por recomendação em reunião de negócios'
      },
      {
        'Cliente_Razao_Social': 'Tech Solutions Inovação Digital ME',
        'CNPJ_CPF': '98.765.432/0001-10',
        'Numero_Contrato': 'CTR-2026-102',
        'Objeto_Descricao': 'BPO Financeiro e Contabilidade Consultiva',
        'Data_Entrada': '2026-02-01',
        'Valor_Mensal': 3500.00,
        'Dia_Vencimento': 15,
        'Regra_Vencimento': 'MES_SEGUINTE',
        'Forma_Cobranca': 'PIX',
        'Canal_Aquisicao': 'REDE_SOCIAL',
        'Quem_Indicou': '',
        'Qual_Rede_Social': 'Instagram',
        'Observacoes_Aquisicao': 'Contato via mensagem direta @techsolutions'
      },
      {
        'Cliente_Razao_Social': 'Vanguard Engenharia e Obras',
        'CNPJ_CPF': '45.123.789/0001-55',
        'Numero_Contrato': 'CTR-2026-103',
        'Objeto_Descricao': 'Gestão Contábil Lucro Presumido',
        'Data_Entrada': '2026-03-10',
        'Valor_Mensal': 4200.00,
        'Dia_Vencimento': 20,
        'Regra_Vencimento': 'MES_SEGUINTE',
        'Forma_Cobranca': 'BOLETO',
        'Canal_Aquisicao': 'MECANISMO_PESQUISA',
        'Quem_Indicou': '',
        'Qual_Rede_Social': '',
        'Observacoes_Aquisicao': 'Pesquisa no Google: escritório de contabilidade para construtoras'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);

    // Ajuste de largura das colunas
    ws['!cols'] = [
      { wch: 36 }, // Cliente_Razao_Social
      { wch: 20 }, // CNPJ_CPF
      { wch: 18 }, // Numero_Contrato
      { wch: 45 }, // Objeto_Descricao
      { wch: 14 }, // Data_Entrada
      { wch: 14 }, // Valor_Mensal
      { wch: 16 }, // Dia_Vencimento
      { wch: 18 }, // Regra_Vencimento
      { wch: 16 }, // Forma_Cobranca
      { wch: 22 }, // Canal_Aquisicao
      { wch: 28 }, // Quem_Indicou
      { wch: 20 }, // Qual_Rede_Social
      { wch: 40 }  // Observacoes_Aquisicao
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Modelo_Contratos');
    XLSX.writeFile(wb, 'modelo_importacao_contratos_leao_dourado.xlsx');
  };

  // 2. Auxiliar para converter datas do Excel ou strings variadas para YYYY-MM-DD
  const parseFlexibleDate = (raw: any): string => {
    if (!raw) return new Date().toISOString().split('T')[0];
    
    // Se for número serial de data do Excel
    if (typeof raw === 'number') {
      const dateObj = XLSX.SSF.parse_date_code(raw);
      if (dateObj) {
        const y = String(dateObj.y).padStart(4, '0');
        const m = String(dateObj.m).padStart(2, '0');
        const d = String(dateObj.d).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }

    const str = String(raw).trim();
    // Se já estiver em formato YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      return str;
    }
    // Se estiver em formato DD/MM/YYYY
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
      const [day, month, year] = str.split('/');
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    return new Date().toISOString().split('T')[0];
  };

  // 3. Normalização do Canal de Aquisição
  const normalizeAcquisitionChannel = (raw: any): AcquisitionChannel => {
    if (!raw) return 'OUTRO';
    const s = String(raw).toUpperCase().trim();
    if (s.includes('INDICA') || s.includes('AMIGO') || s.includes('PARCEIRO')) return 'INDICACAO';
    if (s.includes('REDE') || s.includes('INSTA') || s.includes('LINKED') || s.includes('FACE') || s.includes('SOCIAL')) return 'REDE_SOCIAL';
    if (s.includes('PESQUISA') || s.includes('GOOGLE') || s.includes('BUSCA') || s.includes('SEO') || s.includes('MECANISMO')) return 'MECANISMO_PESQUISA';
    if (s.includes('PROSPEC') || s.includes('OUTBOUND') || s.includes('LIGACAO') || s.includes('COLD')) return 'PROSPECCAO_ATIVA';
    if (s.includes('EVENTO') || s.includes('PALESTRA') || s.includes('FEIRA')) return 'EVENTO';
    return 'OUTRO';
  };

  // 4. Leitura do arquivo carregado
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setIsLoading(true);
    setErrorMessage('');

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const firstSheetName = wb.SheetNames[0];
        const ws = wb.Sheets[firstSheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!rawJson || rawJson.length === 0) {
          setErrorMessage('A planilha selecionada está vazia.');
          setIsLoading(false);
          return;
        }

        const existingClients = storage.getCounterparties().filter(c => c.type === 'CLIENTE' || c.type === 'AMBOS');

        // Mapeia e cruza cada linha com clientes existentes
        const parsed: ParsedContractRow[] = rawJson.map((row, index) => {
          // Busca campos com tolerância a variações de cabeçalho
          const clientName = (
            row['Cliente_Razao_Social'] || 
            row['Cliente'] || 
            row['Razao_Social'] || 
            row['Razão Social'] || 
            row['Nome'] || 
            ''
          ).toString().trim();

          const clientDoc = (
            row['CNPJ_CPF'] || 
            row['CNPJ'] || 
            row['CPF'] || 
            row['Documento'] || 
            ''
          ).toString().trim();

          const contractNumber = (
            row['Numero_Contrato'] || 
            row['Contrato'] || 
            row['Nº Contrato'] || 
            `CTR-IMP-${Date.now().toString().slice(-4)}-${index + 1}`
          ).toString().trim();

          const description = (
            row['Objeto_Descricao'] || 
            row['Descricao'] || 
            row['Descrição'] || 
            row['Objeto'] || 
            'Honorários Contábeis Recorrentes'
          ).toString().trim();

          const entryDate = parseFlexibleDate(row['Data_Entrada'] || row['Data Entrada'] || row['Data_Inicio'] || row['Inicio']);

          // Valor monetário com tratamento de vírgula/ponto
          let rawAmount = row['Valor_Mensal'] || row['Valor'] || row['Honorarios'] || row['Mensalidade'] || 0;
          if (typeof rawAmount === 'string') {
            rawAmount = parseFloat(rawAmount.replace(/\./g, '').replace(',', '.')) || 0;
          }
          const monthlyTotal = Number(rawAmount) || 0;

          const dueDay = parseInt(row['Dia_Vencimento'] || row['Vencimento'] || '10') || 10;
          
          const rawDueRule = String(row['Regra_Vencimento'] || '').toUpperCase();
          const dueRule = rawDueRule.includes('MESMO') ? 'SAME_MONTH' : 'NEXT_MONTH';

          const rawMethod = String(row['Forma_Cobranca'] || row['Forma'] || 'BOLETO').toUpperCase();
          const billingMethod = (['BOLETO', 'PIX', 'TRANSFERENCIA', 'OUTRO'].includes(rawMethod) ? rawMethod : 'BOLETO') as any;

          const acquisitionChannel = normalizeAcquisitionChannel(row['Canal_Aquisicao'] || row['Origem'] || row['Canal']);
          const acquisitionReferrerName = (row['Quem_Indicou'] || row['Indicador'] || row['Indicado_Por'] || '').toString().trim();
          const acquisitionSocialNetwork = (row['Qual_Rede_Social'] || row['Rede_Social'] || row['Instagram'] || '').toString().trim();
          const acquisitionNotes = (row['Observacoes_Aquisicao'] || row['Obs'] || row['Observações'] || '').toString().trim();

          // Cruzamento de dados: verifica se cliente já existe por documento ou nome
          let existingMatch: Counterparty | undefined = undefined;
          const cleanDoc = clientDoc.replace(/\D/g, '');

          if (cleanDoc.length >= 11) {
            existingMatch = existingClients.find(c => c.document?.replace(/\D/g, '') === cleanDoc);
          }
          if (!existingMatch && clientName) {
            existingMatch = existingClients.find(c => c.name.toLowerCase().trim() === clientName.toLowerCase());
          }

          const isValid = !!clientName && monthlyTotal > 0;
          let validationError = '';
          if (!clientName) validationError = 'Nome do cliente não informado.';
          else if (monthlyTotal <= 0) validationError = 'Valor mensal deve ser maior que zero.';

          return {
            clientName,
            clientDoc,
            contractNumber,
            description,
            entryDate,
            monthlyTotal,
            dueDay: Math.min(31, Math.max(1, dueDay)),
            dueRule,
            billingMethod,
            acquisitionChannel,
            acquisitionReferrerName,
            acquisitionSocialNetwork,
            acquisitionNotes,
            isExistingClient: !!existingMatch,
            existingClientId: existingMatch?.id,
            isValid,
            validationError
          };
        });

        setParsedRows(parsed);
      } catch (err) {
        setErrorMessage('Falha ao processar a planilha. Verifique se o arquivo segue o modelo padrão.');
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsBinaryString(uploadedFile);
  };

  // 5. Confirmação e gravação final
  const handleConfirmImport = () => {
    const validRows = parsedRows.filter(r => r.isValid);
    if (validRows.length === 0) return;

    const newCounterparties: Counterparty[] = [];
    const newContracts: Contract[] = [];
    const clientMapByNameOrDoc = new Map<string, string>();

    const services = storage.getServices();
    const defaultService = services[0] || { id: 'srv-default', defaultAccountId: 'acc-1.1.01' };

    validRows.forEach((row, idx) => {
      let finalCustomerId = row.existingClientId;

      // Se for cliente novo e ainda não instanciado nesta leva
      if (!finalCustomerId) {
        const clientKey = row.clientDoc ? row.clientDoc.replace(/\D/g, '') : row.clientName.toLowerCase();
        
        if (clientMapByNameOrDoc.has(clientKey)) {
          finalCustomerId = clientMapByNameOrDoc.get(clientKey)!;
        } else {
          finalCustomerId = `cli-import-${Date.now()}-${idx}`;
          const newClient: Counterparty = {
            id: finalCustomerId,
            type: 'CLIENTE',
            name: row.clientName,
            document: row.clientDoc || '',
            email: '',
            phone: '',
            status: 'ATIVO',
            createdAt: row.entryDate ? `${row.entryDate}T00:00:00.000Z` : new Date().toISOString()
          };
          newCounterparties.push(newClient);
          clientMapByNameOrDoc.set(clientKey, finalCustomerId);
        }
      }

      // Cria o contrato enriquecido com dados de aquisição e data de entrada
      const contract: Contract = {
        id: `ctr-import-${Date.now()}-${idx}`,
        companyId: 'comp-1',
        contractNumber: row.contractNumber,
        customerId: finalCustomerId,
        description: row.description,
        startDate: row.entryDate,
        entryDate: row.entryDate,
        acquisitionChannel: row.acquisitionChannel,
        acquisitionReferrerName: row.acquisitionReferrerName || undefined,
        acquisitionSocialNetwork: row.acquisitionSocialNetwork || undefined,
        acquisitionNotes: row.acquisitionNotes || undefined,
        periodicity: 'MENSAL',
        billingFrequency: 'MENSAL',
        dueDay: row.dueDay,
        dueRule: row.dueRule,
        billingMethod: row.billingMethod,
        monthlyTotal: row.monthlyTotal,
        items: [
          {
            id: `item-import-${Date.now()}-${idx}`,
            serviceId: defaultService.id,
            description: row.description,
            quantity: 1,
            unitPrice: row.monthlyTotal,
            accountId: defaultService.defaultAccountId || 'acc-1.1.01',
            total: row.monthlyTotal
          }
        ],
        status: 'ATIVO',
        createdAt: new Date().toISOString()
      };

      newContracts.push(contract);
    });

    const result = storage.batchImportContracts(newContracts, newCounterparties);
    onSuccess(result.importedContracts);
    onClose();
  };

  const totalValidRows = parsedRows.filter(r => r.isValid).length;
  const newClientsCount = parsedRows.filter(r => r.isValid && !r.isExistingClient).length;
  const totalMrrToAdd = parsedRows.filter(r => r.isValid).reduce((sum, r) => sum + r.monthlyTotal, 0);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#131316] rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden border border-slate-200 dark:border-[#26262b] animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        
        {/* Header Dourado Leão */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-200 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20]">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-black border border-amber-500/50 flex items-center justify-center shadow-[0_0_10px_rgba(245,158,11,0.25)]">
              <FileSpreadsheet className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Importação em Lote de Contratos Recorrentes
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Cruze e cadastre contratos e clientes com datas de entrada e origens de aquisição.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corpo com Scroll */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
          
          {/* Passo 1: Download da Planilha Modelo */}
          <div className="p-4 rounded-xl bg-amber-500/10 dark:bg-amber-500/10 border border-amber-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center space-x-1.5 text-amber-900 dark:text-amber-300 font-bold">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Modelo Oficial Pronto para Preenchimento (.XLSX)</span>
              </div>
              <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80">
                Baixe a planilha de exemplo com as colunas formatadas: Cliente, Data de Entrada, Valor, e Campos de Aquisição (Indicação, Rede Social, Pesquisa).
              </p>
            </div>

            <button
              onClick={handleDownloadTemplate}
              className="px-3.5 py-2 bg-slate-900 dark:bg-[#1b1b20] hover:bg-slate-800 text-amber-400 border border-amber-500/30 rounded-xl font-bold transition-all shadow-xs flex items-center space-x-1.5 shrink-0 text-xs"
            >
              <Download className="w-4 h-4" />
              <span>Baixar Planilha Modelo (.xlsx)</span>
            </button>
          </div>

          {/* Passo 2: Upload da Planilha Preenchida */}
          <div className="border-2 border-dashed border-slate-300 dark:border-[#26262b] hover:border-amber-500 dark:hover:border-amber-500/60 rounded-2xl p-6 text-center transition-colors">
            <input
              type="file"
              id="contractsExcelInput"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <label htmlFor="contractsExcelInput" className="cursor-pointer block space-y-2">
              <Upload className="w-8 h-8 mx-auto text-amber-500/80" />
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {file ? file.name : 'Clique para selecionar a planilha de contratos preenchida (.xlsx ou .csv)'}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                O sistema fará o cruzamento automático com os clientes já cadastrados na base.
              </div>
            </label>
          </div>

          {errorMessage && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-800 dark:text-rose-300 flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Passo 3: Prévia dos Contratos Lidos & Cruzamento */}
          {parsedRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                <span className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px]">
                  Pré-Visualização & Cruzamento de Dados ({parsedRows.length} linhas lidas)
                </span>
                <div className="flex items-center space-x-2 text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 font-semibold">
                    {totalValidRows} Válidos
                  </span>
                  {newClientsCount > 0 && (
                    <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-950/50 text-blue-800 dark:text-blue-300 font-semibold">
                      +{newClientsCount} Novos Clientes
                    </span>
                  )}
                </div>
              </div>

              <div className="border border-slate-200 dark:border-[#26262b] rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-[#1b1b20] text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-[#26262b] sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3">Cliente / Contratante</th>
                      <th className="py-2.5 px-3">Cruzamento</th>
                      <th className="py-2.5 px-3">Data Entrada</th>
                      <th className="py-2.5 px-3 text-right">Valor Mensal</th>
                      <th className="py-2.5 px-3">Origem da Aquisição</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#26262b]">
                    {parsedRows.map((r, i) => (
                      <tr key={i} className={r.isValid ? 'hover:bg-slate-50 dark:hover:bg-[#1b1b20]/40' : 'bg-rose-50/50 dark:bg-rose-950/20'}>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900 dark:text-slate-100">{r.clientName || '—'}</div>
                          {r.clientDoc && <div className="text-[10px] text-slate-500 font-mono">{r.clientDoc}</div>}
                        </td>
                        <td className="py-2.5 px-3">
                          {r.isExistingClient ? (
                            <span className="inline-flex items-center text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded">
                              <Check className="w-3 h-3 mr-1" />
                              Cliente Já Cadastrado
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-[10px] font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded">
                              <Users className="w-3 h-3 mr-1" />
                              Cadastrar Novo Cliente
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-700 dark:text-slate-300">
                          {formatDateBR(r.entryDate)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900 dark:text-amber-400">
                          {formatBRL(r.monthlyTotal)}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex flex-col text-[11px]">
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {r.acquisitionChannel === 'INDICACAO' && '🤝 Indicação'}
                              {r.acquisitionChannel === 'REDE_SOCIAL' && '📱 Rede Social'}
                              {r.acquisitionChannel === 'MECANISMO_PESQUISA' && '🔍 Pesquisa / Google'}
                              {r.acquisitionChannel === 'PROSPECCAO_ATIVA' && '🎯 Prospecção Ativa'}
                              {r.acquisitionChannel === 'EVENTO' && '🎤 Evento'}
                              {r.acquisitionChannel === 'OUTRO' && 'Outro'}
                            </span>
                            {r.acquisitionReferrerName && (
                              <span className="text-[10px] text-slate-500">Por: {r.acquisitionReferrerName}</span>
                            )}
                            {r.acquisitionSocialNetwork && (
                              <span className="text-[10px] text-slate-500">Rede: {r.acquisitionSocialNetwork}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {r.isValid ? (
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Pronto</span>
                          ) : (
                            <span className="text-[10px] font-bold text-rose-600" title={r.validationError}>Inválido</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* Rodapé com Resumo & Confirmação */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-[#26262b] bg-slate-50 dark:bg-[#1b1b20] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="text-xs text-slate-600 dark:text-slate-400">
            {parsedRows.length > 0 && (
              <span>
                Total a importar: <strong className="text-slate-900 dark:text-white">{totalValidRows} contratos</strong> (Acréscimo de <strong className="text-emerald-600 dark:text-emerald-400">{formatBRL(totalMrrToAdd)}/mês</strong> no MRR)
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 dark:border-[#26262b] rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#131316] transition-colors"
            >
              Cancelar
            </button>

            <button
              onClick={handleConfirmImport}
              disabled={totalValidRows === 0 || isLoading}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 disabled:opacity-50 text-slate-950 font-bold rounded-xl shadow-md transition-all flex items-center space-x-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirmar e Importar {totalValidRows > 0 ? `(${totalValidRows})` : ''}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
