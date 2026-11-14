import React, { useState } from 'react';
import { 
  GitMerge, 
  X, 
  Users, 
  BookOpen, 
  CheckCircle2, 
  AlertTriangle, 
  Plus, 
  Check, 
  Building2, 
  TrendingUp, 
  TrendingDown,
  Sparkles,
  Loader2,
  Globe
} from 'lucide-react';
import { AnalyzedImportRow } from '../../services/contaAzulMappingEngine';
import { Counterparty, ChartAccount } from '../../types';
import { storage } from '../../services/storageService';
import { lookupCNPJ } from '../../services/cnpjLookupService';
import { cleanDocumentDigits, isValidCNPJ, maskCNPJOnly } from '../../utils/cnpjValidator';

interface ImportCrossReferenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  analyzedRows: AnalyzedImportRow[];
  counterparties: Counterparty[];
  chartAccounts: ChartAccount[];
  onEntitiesCreated: () => void;
}

export const ImportCrossReferenceModal: React.FC<ImportCrossReferenceModalProps> = ({
  isOpen,
  onClose,
  analyzedRows,
  counterparties,
  chartAccounts,
  onEntitiesCreated
}) => {
  const [activeTab, setActiveTab] = useState<'PARTIES' | 'CATEGORIES'>('PARTIES');
  const [createdFeedback, setCreatedFeedback] = useState<string | null>(null);
  const [autoFetchReceita, setAutoFetchReceita] = useState(true);
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichStatus, setEnrichStatus] = useState<string | null>(null);

  // 1. Levantamento de Contrapartes da Planilha
  const partyStats = React.useMemo(() => {
    if (!isOpen || !analyzedRows || analyzedRows.length === 0) {
      return { items: [], matched: [], suggested: [], newParties: [] };
    }
    const rows = analyzedRows || [];
    const map = new Map<string, {
      name: string;
      document?: string;
      types: Set<'RECEBER' | 'PAGAR'>;
      count: number;
      matchedId?: string;
      suggestedId?: string;
    }>();

    for (const r of rows) {
      const name = (r?.normalized?.fornecedor || '').trim();
      if (!name) continue;

      const doc = (r?.normalized?.documento || '').trim();
      const rowType = r?.normalized?.tipo || 'PAGAR';

      if (!map.has(name)) {
        map.set(name, {
          name,
          document: doc,
          types: new Set([rowType]),
          count: 1,
          matchedId: r.matchedCounterpartyId,
          suggestedId: r.suggestedCounterpartyId
        });
      } else {
        const item = map.get(name)!;
        if (!item.document && doc) item.document = doc;
        item.types.add(rowType);
        item.count++;
      }
    }

    const items = Array.from(map.values());
    const matched = items.filter(i => !!i.matchedId);
    const suggested = items.filter(i => !i.matchedId && !!i.suggestedId);
    const newParties = items.filter(i => !i.matchedId && !i.suggestedId);

    return { items, matched, suggested, newParties };
  }, [analyzedRows, isOpen]);

  // 2. Levantamento de Categorias da Planilha
  const categoryStats = React.useMemo(() => {
    if (!isOpen || !analyzedRows || analyzedRows.length === 0) {
      return { items: [], matched: [], newCategories: [] };
    }
    const rows = analyzedRows || [];
    const map = new Map<string, {
      name: string;
      types: Set<'RECEBER' | 'PAGAR'>;
      count: number;
      matchedId?: string;
      suggestedId?: string;
    }>();

    for (const r of rows) {
      const cat = (r?.normalized?.categoria || '').trim();
      if (!cat) continue;

      const rowType = r?.normalized?.tipo || 'PAGAR';

      if (!map.has(cat)) {
        map.set(cat, {
          name: cat,
          types: new Set([rowType]),
          count: 1,
          matchedId: r.matchedChartAccountId,
          suggestedId: r.suggestedChartAccountId
        });
      } else {
        const item = map.get(cat)!;
        item.types.add(rowType);
        item.count++;
      }
    }

    const items = Array.from(map.values());
    const matched = items.filter(i => !!i.matchedId);
    const newCategories = items.filter(i => !i.matchedId);

    return { items, matched, newCategories };
  }, [analyzedRows, isOpen]);

  if (!isOpen) return null;

  // Criar todas as novas contrapartes no banco com auto-preenchimento opcional via Receita Federal
  const handleCreateAllMissingParties = async () => {
    if (partyStats.newParties.length === 0) return;

    setIsEnriching(true);
    setEnrichStatus('Iniciando cadastro...');

    const currentList = storage.getCounterparties();
    const nowIso = new Date().toISOString();
    const created: Counterparty[] = [];
    let enrichedCount = 0;

    for (let i = 0; i < partyStats.newParties.length; i++) {
      const item = partyStats.newParties[i];
      const isClient = item.types.has('RECEBER') && !item.types.has('PAGAR');
      const isSupplier = item.types.has('PAGAR') && !item.types.has('RECEBER');
      const partyType: 'CLIENTE' | 'FORNECEDOR' | 'AMBOS' = isClient ? 'CLIENTE' : isSupplier ? 'FORNECEDOR' : 'AMBOS';

      let finalName = item.name;
      let finalTradeName = item.name;
      let finalDoc = item.document && !/^[0D]*$/.test(item.document) ? maskCNPJOnly(item.document) : '';
      let finalEmail = '';
      let finalPhone = '';
      let finalAddress: string | undefined = undefined;
      let finalNotes = `Criado automaticamente no cruzamento da importação de planilha.`;

      // Se tiver CNPJ identificado ou se o nome trouxer dígitos de CNPJ, consulta a Receita Federal
      const candidateDigits = cleanDocumentDigits(item.document || item.name);
      if (autoFetchReceita && candidateDigits.length === 14 && isValidCNPJ(candidateDigits)) {
        setEnrichStatus(`Consultando Receita Federal (${i + 1}/${partyStats.newParties.length}): ${item.name}...`);
        try {
          const receitaData = await lookupCNPJ(candidateDigits);
          if (receitaData) {
            enrichedCount++;
            finalName = receitaData.razaoSocial || item.name;
            finalTradeName = receitaData.nomeFantasia || finalName;
            finalDoc = receitaData.formattedCnpj;
            finalAddress = receitaData.enderecoCompleto;
            if (receitaData.telefone) finalPhone = receitaData.telefone;
            if (receitaData.email) finalEmail = receitaData.email;
            finalNotes = `Situação: ${receitaData.situacaoCadastral} • CNAE: ${receitaData.cnaeCodigo} - ${receitaData.cnaeDescricao} • Cadastro auto-preenchido via Receita Federal (BrasilAPI).`;
          }
        } catch (e) {
          console.warn('Erro ao consultar CNPJ:', e);
        }
      }

      const newParty: Counterparty = {
        id: `cp-auto-${Date.now()}-${i}-${Math.floor(Math.random() * 1000)}`,
        type: partyType,
        name: finalName,
        tradeName: finalTradeName,
        document: finalDoc,
        email: finalEmail,
        phone: finalPhone,
        address: finalAddress,
        status: 'ATIVO',
        notes: finalNotes,
        createdAt: nowIso
      };
      created.push(newParty);
    }

    storage.saveCounterparties([...currentList, ...created]);
    setIsEnriching(false);
    setEnrichStatus(null);
    if (enrichedCount > 0) {
      setCreatedFeedback(`${created.length} novas contrapartes cadastradas com sucesso! (${enrichedCount} preenchidas oficialmente com Razão Social, CEP e CNAE da Receita Federal)`);
    } else {
      setCreatedFeedback(`${created.length} novas contrapartes cadastradas com sucesso!`);
    }
    onEntitiesCreated();
  };

  // Criar todas as novas categorias no Plano de Contas
  const handleCreateAllMissingCategories = () => {
    if (categoryStats.newCategories.length === 0) return;

    const currentAccounts = storage.getChartAccounts();
    const nowIso = new Date().toISOString();
    const createdAccounts: ChartAccount[] = [];

    categoryStats.newCategories.forEach((cat, idx) => {
      const isRevenue = cat.types.has('RECEBER') && !cat.types.has('PAGAR');
      const nature = isRevenue ? 'RECEITA_SERVICO' : 'DESPESA_ADMINISTRATIVA';
      const codePrefix = isRevenue ? '3.1.09' : '4.1.09';
      const code = `${codePrefix}.${String(idx + 1).padStart(2, '0')}`;

      const newAcc: ChartAccount = {
        id: `acc-auto-${Date.now()}-${idx}`,
        code,
        name: cat.name,
        nature,
        isAnalytical: true,
        isActive: true,
        status: 'ATIVO',
        cashFlowCategory: 'OPERACIONAL',
        dremap: {
          include: true,
          line: isRevenue ? 'Receita Operacional' : 'Despesas Operacionais',
          multiplier: isRevenue ? 1 : -1
        }
      };
      createdAccounts.push(newAcc);
    });

    storage.saveChartAccounts([...currentAccounts, ...createdAccounts]);
    setCreatedFeedback(`${createdAccounts.length} novas contas criadas no Plano de Contas com sucesso!`);
    onEntitiesCreated();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150 flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="p-4 bg-[var(--surface-elevated)] border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
              <GitMerge className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                Cruzamento e Criação de Dados Cadastrais
              </h3>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Cruze a planilha com os cadastros do app e crie entidades faltantes com 1 clique
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--surface-card)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Feedback Alert */}
        {createdFeedback && (
          <div className="p-3 bg-emerald-500/15 border-b border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between px-4">
            <span className="flex items-center">
              <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-400" />
              {createdFeedback}
            </span>
            <button
              type="button"
              onClick={() => setCreatedFeedback(null)}
              className="text-emerald-400 hover:text-emerald-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] px-4">
          <button
            type="button"
            onClick={() => setActiveTab('PARTIES')}
            className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-colors flex items-center space-x-2 ${
              activeTab === 'PARTIES'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Clientes e Fornecedores ({partyStats.items.length})</span>
            {partyStats.newParties.length > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-amber-500/20 text-amber-300 font-bold">
                {partyStats.newParties.length} novos
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('CATEGORIES')}
            className={`py-2.5 px-4 text-xs font-bold border-b-2 transition-colors flex items-center space-x-2 ${
              activeTab === 'CATEGORIES'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Categorias / Plano de Contas ({categoryStats.items.length})</span>
            {categoryStats.newCategories.length > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-amber-500/20 text-amber-300 font-bold">
                {categoryStats.newCategories.length} novas
              </span>
            )}
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'PARTIES' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-[var(--text-primary)]">
                    Diagnóstico de Contrapartes na Planilha
                  </h4>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    {partyStats.matched.length} vinculadas no app, {partyStats.suggested.length} sugeridas, {partyStats.newParties.length} não cadastradas.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer select-none bg-[var(--surface-card)] px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)]">
                    <input
                      type="checkbox"
                      checked={autoFetchReceita}
                      onChange={e => setAutoFetchReceita(e.target.checked)}
                      className="rounded text-amber-500 focus:ring-amber-500"
                    />
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Auto-Preencher via Receita Federal (CNPJ)</span>
                  </label>

                  {partyStats.newParties.length > 0 && (
                    <button
                      type="button"
                      disabled={isEnriching}
                      onClick={handleCreateAllMissingParties}
                      className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 rounded-xl text-xs font-bold shadow-xs flex items-center space-x-1.5 transition-colors cursor-pointer"
                    >
                      {isEnriching ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Consultando & Criando...</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          <span>Cadastrar Todos ({partyStats.newParties.length})</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {isEnriching && enrichStatus && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center gap-2.5 text-xs text-amber-400 animate-pulse">
                  <Loader2 className="w-4 h-4 animate-spin shrink-0 text-amber-400" />
                  <span>{enrichStatus}</span>
                </div>
              )}

              <div className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-xl overflow-hidden bg-[var(--surface-elevated)]">
                {partyStats.items.map(item => {
                  const isNew = !item.matchedId && !item.suggestedId;
                  const isSuggested = !item.matchedId && !!item.suggestedId;
                  const suggestedParty = isSuggested ? counterparties.find(c => c.id === item.suggestedId) : null;

                  return (
                    <div key={item.name} className="p-3 flex items-center justify-between hover:bg-[var(--surface-card)] transition-colors text-xs">
                      <div>
                        <div className="font-semibold text-[var(--text-primary)] flex items-center space-x-2">
                          <span>{item.name}</span>
                          <span className="text-[10px] font-mono text-[var(--text-secondary)]">
                            ({item.count} títulos)
                          </span>
                        </div>
                        <div className="flex items-center space-x-2 mt-0.5">
                          {item.types.has('RECEBER') && (
                            <span className="text-[10px] text-emerald-400 font-bold flex items-center">
                              <TrendingUp className="w-3 h-3 mr-0.5" /> Cliente (Receita)
                            </span>
                          )}
                          {item.types.has('PAGAR') && (
                            <span className="text-[10px] text-rose-400 font-bold flex items-center">
                              <TrendingDown className="w-3 h-3 mr-0.5" /> Fornecedor (Despesa)
                            </span>
                          )}
                          {isSuggested && suggestedParty && (
                            <span className="text-[10px] text-blue-400 font-medium">
                              Sugerido: "{suggestedParty.name}"
                            </span>
                          )}
                        </div>
                      </div>

                      <div>
                        {item.matchedId ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            Já Cadastrado
                          </span>
                        ) : isSuggested ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                            Similar Encontrado
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            Novo (Criar)
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'CATEGORIES' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-[var(--text-primary)]">
                    Diagnóstico de Categorias da Planilha
                  </h4>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    {categoryStats.matched.length} já mapeadas no Plano de Contas, {categoryStats.newCategories.length} novas categorias.
                  </p>
                </div>

                {categoryStats.newCategories.length > 0 && (
                  <button
                    type="button"
                    onClick={handleCreateAllMissingCategories}
                    className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-bold shadow-xs flex items-center space-x-1.5 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Criar Novas no Plano ({categoryStats.newCategories.length})</span>
                  </button>
                )}
              </div>

              {categoryStats.items.length === 0 ? (
                <div className="p-6 text-center text-xs text-[var(--text-secondary)]">
                  Nenhuma categoria mapeada na coluna de categoria da planilha.
                </div>
              ) : (
                <div className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-xl overflow-hidden bg-[var(--surface-elevated)]">
                  {categoryStats.items.map(item => {
                    const isNew = !item.matchedId;
                    const matchedAcc = item.matchedId ? chartAccounts.find(a => a.id === item.matchedId) : null;

                    return (
                      <div key={item.name} className="p-3 flex items-center justify-between hover:bg-[var(--surface-card)] transition-colors text-xs">
                        <div>
                          <div className="font-semibold text-[var(--text-primary)] flex items-center space-x-2">
                            <span>{item.name}</span>
                            <span className="text-[10px] font-mono text-[var(--text-secondary)]">
                              ({item.count} títulos)
                            </span>
                          </div>
                          {matchedAcc && (
                            <span className="text-[10px] text-[var(--text-secondary)]">
                              Plano de Contas: {matchedAcc.code} - {matchedAcc.name} ({matchedAcc.nature})
                            </span>
                          )}
                        </div>

                        <div>
                          {item.matchedId ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              Mapeado no Plano
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                              Criar Conta Analítica
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-[var(--surface-elevated)] border-t border-[var(--border-subtle)] flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl shadow-xs transition-colors"
          >
            Concluir Cruzamento
          </button>
        </div>

      </div>
    </div>
  );
};
