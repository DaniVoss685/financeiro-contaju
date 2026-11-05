import React, { useState } from 'react';
import { Lightbulb, Plus, ThumbsUp, CheckCircle2, Clock, MessageSquare, Filter } from 'lucide-react';
import { ImprovementRequest } from '../../types';
import { storage } from '../../services/storageService';
import { PremiumSelect } from '../Common/PremiumSelect';

export const ImprovementsView: React.FC = () => {
  const [requests, setRequests] = useState<ImprovementRequest[]>(storage.getImprovementRequests());
  const currentUser = storage.getCurrentUser();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ImprovementRequest['category']>('RELATORIOS');
  const [description, setDescription] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newReq: ImprovementRequest = {
      id: `req-${Date.now()}`,
      title,
      category,
      description,
      status: 'EM_ANALISE',
      votes: 1,
      createdAt: new Date().toISOString(),
      requestedBy: currentUser.name
    };

    const updated = [newReq, ...requests];
    storage.saveImprovementRequests(updated);
    setRequests(updated);

    storage.addAuditLog({
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'SUGESTAO_MELHORIA',
      module: 'Central de Melhorias',
      recordId: newReq.id,
      details: `Nova solicitação de melhoria: "${newReq.title}".`
    });

    setIsModalOpen(false);
    setTitle('');
    setDescription('');
  };

  const handleVote = (id: string) => {
    const updated = requests.map(r => r.id === id ? { ...r, votes: r.votes + 1 } : r);
    storage.saveImprovementRequests(updated);
    setRequests(updated);
  };

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[var(--surface-card)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-2xs">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 dark:text-amber-400">
              <Lightbulb className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
                Central de Melhorias & Feedback Contínuo
              </h1>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Proponha e vote em melhorias de produtividade, automação de processos e novos relatórios.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Sugerir Nova Melhoria</span>
        </button>
      </div>

      {/* Grid de Solicitações */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {requests.length === 0 ? (
          <div className="col-span-2 p-12 text-center bg-[var(--surface-card)] rounded-2xl border border-[var(--border-subtle)] text-[var(--text-secondary)]">
            Nenhuma sugestão cadastrada ainda. Seja o primeiro a propor uma melhoria!
          </div>
        ) : (
          requests.map(r => (
            <div key={r.id} className="bg-[var(--surface-card)] p-5 rounded-2xl border border-[var(--border-subtle)] shadow-2xs flex flex-col justify-between hover:border-amber-500/40 transition-colors">
              <div>
                <div className="flex justify-between items-start gap-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                    {r.category}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    r.status === 'CONCLUIDO' 
                      ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300' 
                      : r.status === 'EM_ANDAMENTO'
                      ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30'
                      : 'bg-slate-200 dark:bg-slate-800 text-[var(--text-secondary)]'
                  }`}>
                    {r.status === 'CONCLUIDO' ? '✓ IMPLEMENTADO' : r.status === 'EM_ANDAMENTO' ? 'EM DESENVOLVIMENTO' : 'EM ANÁLISE'}
                  </span>
                </div>

                <h3 className="font-bold text-sm text-[var(--text-primary)] mt-3">
                  {r.title}
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                  {r.description}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex justify-between items-center text-xs">
                <span className="text-[11px] text-[var(--text-secondary)]">
                  Por: <strong>{r.requestedBy}</strong>
                </span>

                <button
                  type="button"
                  onClick={() => handleVote(r.id)}
                  className="px-3 py-1.5 rounded-xl bg-[var(--surface-elevated)] hover:bg-amber-500/20 text-[var(--text-primary)] hover:text-amber-800 dark:hover:text-amber-300 border border-[var(--border-subtle)] flex items-center gap-1.5 transition-all cursor-pointer font-semibold shadow-2xs"
                  title="Votar nesta sugestão"
                >
                  <ThumbsUp className="w-3.5 h-3.5 text-amber-500" />
                  <span>{r.votes} Voto(s)</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal de Criação */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--surface-card)] rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-[var(--border-subtle)] animate-in fade-in zoom-in-95">
            <div className="p-5 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)]">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-sm text-[var(--text-primary)]">Nova Sugestão de Melhoria</h3>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-[var(--text-secondary)] mb-1">Título da Melhoria *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Alerta de vencimento por WhatsApp"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] px-3 py-2 text-[var(--text-primary)] focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-[var(--text-secondary)] mb-1">Categoria *</label>
                <PremiumSelect
                  value={category}
                  onChange={e => setCategory(e.target.value as any)}
                  className="w-full rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] px-3 py-2 text-[var(--text-primary)] focus:ring-2 focus:ring-amber-500 focus:outline-none cursor-pointer"
                >
                  <option value="RELATORIOS">Relatórios & DRE</option>
                  <option value="AUTOMACAO">Automação & Processos</option>
                  <option value="CONCILIACAO">Conciliação Bancária & OFX</option>
                  <option value="INTERFACE">Interface & Experiência (UX)</option>
                  <option value="OUTROS">Outros</option>
                </PremiumSelect>
              </div>

              <div>
                <label className="block font-semibold text-[var(--text-secondary)] mb-1">Descrição e Benefício *</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Explique qual dificuldade você enfrenta e qual benefício prático esta melhoria trará para sua rotina..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] p-3 text-[var(--text-primary)] focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-elevated)] rounded-xl border border-[var(--border-subtle)] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-xl shadow-md transition-all cursor-pointer"
                >
                  Enviar Sugestão
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
