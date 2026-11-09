import React, { useRef } from 'react';
import { 
  Printer, 
  X, 
  Download, 
  Building2, 
  UserCheck, 
  CheckCircle2, 
  Calendar, 
  FileText,
  DollarSign
} from 'lucide-react';
import { FinancialTitle, Settlement, Counterparty, CompanyProfile } from '../../types';
import { storage } from '../../services/storageService';
import { formatBRL, formatDateBR, formatCompetence } from '../../services/financialEngine';
import { numberToWordsBRL } from '../../utils/numberToWords';

interface ReceiptModalProps {
  isOpen: boolean;
  title: FinancialTitle | null;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen,
  title,
  onClose
}) => {
  const printAreaRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !title) return null;

  const company: CompanyProfile = storage.getCompany();
  const counterparties: Counterparty[] = storage.getCounterparties();
  const customer = counterparties.find(c => c.id === title.counterpartyId);
  const settlements = storage.getSettlements().filter(s => s.titleId === title.id);
  const lastSettlement = settlements[settlements.length - 1];

  // Valor recebido: se já tem valor baixado, usa o principal baixado (ou o total pago); caso contrário usa o valor original do título
  const receiptAmount = (title.settledPrincipal > 0) 
    ? title.settledPrincipal 
    : title.originalAmount;

  // Data do pagamento / emissão do recibo
  const paymentDate = lastSettlement?.settlementDate || title.updatedAt?.split('T')[0] || new Date().toISOString().split('T')[0];
  const receiptNumber = `REC-${title.titleNumber.replace(/[^a-zA-Z0-9]/g, '')}`;

  const amountInWords = numberToWordsBRL(receiptAmount);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 print:p-0 print:bg-white print:static">
      <div className="bg-[var(--surface-card)] rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-[var(--border-subtle)] animate-in fade-in zoom-in-95 flex flex-col max-h-[92vh] print:max-h-none print:shadow-none print:border-none print:w-full">
        
        {/* Header - Invisível na Impressão */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--surface-elevated)] shrink-0 print:hidden">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--text-primary)]">
                Recibo de Pagamento / Quitação
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Modelo oficial de quitação para entrega ao cliente
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              title="Imprimir ou Salvar como PDF"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1.5 rounded-xl hover:bg-[var(--surface-elevated)] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modelo do Recibo (Área Imprimível) */}
        <div 
          ref={printAreaRef} 
          className="p-8 sm:p-10 overflow-y-auto space-y-6 flex-1 bg-white text-slate-900 font-sans print:p-6 print:overflow-visible"
        >
          {/* Cabeçalho da Empresa */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b-2 border-slate-800">
            <div>
              <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-slate-950">
                {company?.tradeName || company?.companyName || 'CONTAJU GESTÃO CONTÁBIL'}
              </h1>
              <p className="text-xs text-slate-600 font-medium">
                {company?.companyName}
              </p>
              <p className="text-xs text-slate-600">
                CNPJ: <strong className="font-mono">{company?.cnpj || '00.000.000/0001-00'}</strong>
              </p>
              <p className="text-xs text-slate-500">
                {company?.address ? `${company.address}, ${company.city} - ${company.state}` : 'Brasil'}
              </p>
            </div>

            <div className="text-right sm:text-right bg-slate-100 p-3.5 rounded-xl border border-slate-300 min-w-[200px]">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Número do Recibo</span>
              <span className="text-base font-mono font-black text-slate-900 block">{receiptNumber}</span>
              <div className="mt-1 pt-1 border-t border-slate-200 flex justify-between items-center text-xs">
                <span className="text-slate-500 text-[11px]">Valor:</span>
                <span className="font-mono font-extrabold text-emerald-700 text-sm">{formatBRL(receiptAmount)}</span>
              </div>
            </div>
          </div>

          {/* Título de Recibo */}
          <div className="text-center py-2">
            <h2 className="text-lg font-black uppercase tracking-widest text-slate-900 inline-block border-b-2 border-emerald-600 pb-1">
              RECIBO DE PAGAMENTO
            </h2>
          </div>

          {/* Corpo do Recibo */}
          <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 text-sm leading-relaxed space-y-4">
            <p>
              Recebemos de <strong>{customer?.name || 'Cliente'}</strong>
              {customer?.document && (
                <span>, inscrito no CPF/CNPJ sob o nº <strong className="font-mono">{customer.document}</strong></span>
              )}
              , a importância líquida e certa de <strong className="text-emerald-800 font-mono font-bold">{formatBRL(receiptAmount)}</strong> (<em>{amountInWords}</em>).
            </p>

            <div className="pt-2">
              <span className="text-xs uppercase font-bold text-slate-500 block mb-1">Referente a:</span>
              <div className="p-3 bg-white rounded-xl border border-slate-200 font-medium text-xs text-slate-800 space-y-1">
                <div>
                  • <strong>Serviço/Descrição:</strong> {title.description}
                </div>
                <div>
                  • <strong>Competência Contábil:</strong> {formatCompetence(title.competence)}
                </div>
                <div>
                  • <strong>Título / Parcela:</strong> {title.titleNumber} {title.totalInstallments && title.totalInstallments > 1 ? `(Parcela ${title.installmentIndex || 1}/${title.totalInstallments})` : ''}
                </div>
                {title.contractNumber && (
                  <div>
                    • <strong>Origem:</strong> Contrato Recorrente de Honorários {title.contractNumber}
                  </div>
                )}
              </div>
            </div>

            <p className="text-xs text-slate-600 italic pt-2">
              Pelo que firmamos o presente recibo, dando plena, geral e irrevogável quitação do valor supramencionado exclusivamente referente ao título aqui especificado.
            </p>
          </div>

          {/* Data e Assinatura */}
          <div className="pt-6 flex flex-col sm:flex-row justify-between items-end sm:items-center gap-6">
            <div className="text-xs text-slate-600">
              <span className="block font-bold text-slate-800">
                {company?.city || 'Goiânia'} - {company?.state || 'GO'}, {formatDateBR(paymentDate)}
              </span>
              <span className="text-[10px] text-slate-500">
                Data do Pagamento: {formatDateBR(paymentDate)}
              </span>
            </div>

            <div className="w-full sm:w-64 text-center space-y-1">
              <div className="border-b-2 border-slate-800 pb-1 w-full" />
              <span className="font-bold text-xs text-slate-900 block">
                {company?.tradeName || company?.companyName || 'CONTAJU'}
              </span>
              <span className="text-[10px] text-slate-500 block">
                CNPJ: {company?.cnpj || '00.000.000/0001-00'}
              </span>
            </div>
          </div>

          {/* Rodapé do Recibo */}
          <div className="pt-6 border-t border-slate-200 text-[10px] text-slate-600 flex justify-between items-center">
            <span>Sistema Financeiro Contaju • Documento emitido eletronicamente</span>
            <span className="font-mono">ID: {title.id}</span>
          </div>
        </div>

        {/* Rodapé - Invisível na Impressão */}
        <div className="px-6 py-3 bg-[var(--surface-elevated)] border-t border-[var(--border-subtle)] flex items-center justify-between shrink-0 print:hidden">
          <span className="text-xs text-[var(--text-secondary)]">
            Dica: Utilize a opção de impressão para gerar cópia em papel ou exportar em PDF.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-card)] rounded-xl border border-[var(--border-subtle)] transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
