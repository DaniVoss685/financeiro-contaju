import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle2, AlertTriangle, Building, Sparkles, Loader2, ShieldAlert } from 'lucide-react';
import { validateFiscalDocument, maskCNPJOrCPF } from '../../utils/cnpjValidator';
import { lookupCNPJ, CNPJCompanyData } from '../../services/cnpjLookupService';

interface CNPJInputFieldProps {
  id?: string;
  value: string;
  onChange: (value: string, isValid: boolean) => void;
  onDataFetched?: (data: CNPJCompanyData) => void;
  label?: string;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  helpText?: string;
  autoFetch?: boolean;
}

export const CNPJInputField: React.FC<CNPJInputFieldProps> = ({
  id = 'fiscal-document-input',
  value,
  onChange,
  onDataFetched,
  label = 'CNPJ (ou CPF) *',
  required = false,
  placeholder = '00.000.000/0000-00',
  disabled = false,
  className = '',
  helpText,
  autoFetch = true
}) => {
  const [isLoadingReceita, setIsLoadingReceita] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);
  const [situacaoAlert, setSituacaoAlert] = useState<string | null>(null);
  // Ao abrir um cadastro que já tem CNPJ, não busca de novo sozinho (isso apagava o endereço, o telefone e o
  // e-mail que a pessoa tinha corrigido). A busca automática só roda quando o CNPJ é digitado ou colado.
  // O botão "Auto-Preencher Receita" continua disponível para buscar de propósito.
  const [lastSearchedDigits, setLastSearchedDigits] = useState<string>(() => {
    const d = (value || '').replace(/\D/g, '');
    return d.length === 14 ? d : '';
  });

  const validation = validateFiscalDocument(value || '');

  const handleLookupReceita = async (explicitDigits?: string) => {
    const raw = explicitDigits || (value || '').replace(/\D/g, '');
    if (raw.length !== 14) return;

    setIsLoadingReceita(true);
    setFetchError(null);
    setSuccessInfo(null);
    setSituacaoAlert(null);

    try {
      const data = await lookupCNPJ(raw);
      if (data) {
        setLastSearchedDigits(raw);
        setSuccessInfo(`Dados de "${data.razaoSocial || data.nomeFantasia}" importados da Receita Federal!`);
        
        if (!data.isRegular) {
          setSituacaoAlert(`ALERTA: Situação ${data.situacaoCadastral} na Receita Federal (Empresa Inativa/Irregular)!`);
        }

        if (onDataFetched) {
          onDataFetched(data);
        }
      } else {
        setFetchError('CNPJ não localizado nas bases públicas da Receita Federal. Preencha os dados manualmente.');
      }
    } catch {
      setFetchError('Falha temporária ao consultar dados na Receita Federal.');
    } finally {
      setIsLoadingReceita(false);
    }
  };

  // Disparo automático quando o usuário completa ou cola os 14 dígitos válidos de CNPJ
  useEffect(() => {
    if (!autoFetch || !onDataFetched) return;
    const cleanDigits = (value || '').replace(/\D/g, '');

    if (cleanDigits.length === 14 && validation.isValid && validation.type === 'CNPJ') {
      if (cleanDigits !== lastSearchedDigits && !isLoadingReceita) {
        const timeoutId = setTimeout(() => {
          handleLookupReceita(cleanDigits);
        }, 350);
        return () => clearTimeout(timeoutId);
      }
    } else {
      setSuccessInfo(null);
      setSituacaoAlert(null);
    }
  }, [value, validation.isValid, validation.type, autoFetch, lastSearchedDigits, isLoadingReceita]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const masked = maskCNPJOrCPF(raw);
    const valid = validateFiscalDocument(masked);
    setFetchError(null);
    onChange(masked, valid.isValid);
  };

  const handleBlur = () => {
    const cleanDigits = (value || '').replace(/\D/g, '');
    if (cleanDigits.length === 14 && validation.isValid && validation.type === 'CNPJ' && cleanDigits !== lastSearchedDigits) {
      handleLookupReceita(cleanDigits);
    }
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="block font-semibold text-[var(--text-secondary)] text-xs">
          {label}
        </label>
        <div className="flex items-center space-x-2">
          {validation.status === 'valid' && validation.type === 'CNPJ' && onDataFetched && (
            <button
              type="button"
              disabled={isLoadingReceita || disabled}
              onClick={() => handleLookupReceita()}
              className="inline-flex items-center text-[10px] font-bold text-amber-400 bg-amber-500/15 hover:bg-amber-500/25 px-2.5 py-0.5 rounded-full border border-amber-500/40 transition-colors cursor-pointer shadow-2xs"
              title="Buscar Razão Social, CEP, Endereço e CNAE na Receita Federal"
            >
              {isLoadingReceita ? (
                <>
                  <Loader2 className="w-3 h-3 mr-1 animate-spin text-amber-400" />
                  Consultando Receita...
                </>
              ) : (
                <>
                  <Sparkles className="w-3 h-3 mr-1 text-amber-400" />
                  Auto-Preencher Receita
                </>
              )}
            </button>
          )}

          {validation.status === 'valid' && (
            <span className="inline-flex items-center text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30 animate-in fade-in">
              <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-400" />
              {validation.type} Válido
            </span>
          )}
          {validation.status === 'invalid' && (
            <span className="inline-flex items-center text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/30 animate-in fade-in">
              <AlertTriangle className="w-3 h-3 mr-1 text-rose-400" />
              {validation.type} Inválido
            </span>
          )}
        </div>
      </div>

      <div className="relative">
        <input
          id={id}
          type="text"
          required={required}
          disabled={disabled}
          value={value || ''}
          onChange={handleChange}
          onBlur={handleBlur}
          maxLength={18}
          placeholder={placeholder}
          className={`w-full rounded-xl border bg-[var(--surface-elevated)] text-[var(--text-primary)] px-3 py-2 font-mono text-xs focus:outline-none transition-all ${
            validation.status === 'valid'
              ? 'border-emerald-500/60 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400'
              : validation.status === 'invalid'
              ? 'border-rose-500/60 focus:border-rose-400 focus:ring-1 focus:ring-rose-400'
              : 'border-[var(--border-subtle)] focus:border-amber-400'
          }`}
        />
        <div className="absolute right-3 top-2.5 pointer-events-none text-slate-400">
          <Building className="w-4 h-4 opacity-50" />
        </div>
      </div>

      {/* Alerta de Irregularidade Fiscal (Opção 2 - CNPJ Baixado ou Inapto) */}
      {situacaoAlert && (
        <div className="p-2 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-400 text-[11px] font-bold flex items-center gap-1.5 animate-in fade-in">
          <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{situacaoAlert}</span>
        </div>
      )}

      {/* Feedback de Sucesso */}
      {successInfo && !situacaoAlert && (
        <div className="p-2 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-[11px] font-semibold flex items-center gap-1.5 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{successInfo}</span>
        </div>
      )}

      {/* Helper / validation message */}
      <div className="flex items-center justify-between text-[11px] pt-0.5">
        {fetchError ? (
          <p className="text-amber-400 font-medium flex items-center">
            <AlertTriangle className="w-3 h-3 mr-1 flex-shrink-0" />
            {fetchError}
          </p>
        ) : validation.status === 'invalid' ? (
          <p className="text-rose-400 font-medium flex items-center">
            <AlertTriangle className="w-3 h-3 mr-1 flex-shrink-0" />
            {validation.message}
          </p>
        ) : validation.status === 'valid' ? (
          <p className="text-emerald-400 font-medium flex items-center">
            <CheckCircle2 className="w-3 h-3 mr-1 flex-shrink-0" />
            {isLoadingReceita ? 'Consultando bases oficiais da Receita Federal...' : validation.message}
          </p>
        ) : (
          <p className="text-[var(--text-muted)] flex items-center">
            {helpText || (validation.digits.length > 0 ? validation.message : 'Digite os 14 números do CNPJ para conferência automática.')}
          </p>
        )}

        {validation.digits.length > 0 && validation.status !== 'valid' && (
          <span className="text-[10px] font-mono text-[var(--text-muted)]">
            {validation.digits.length}/14 dígitos
          </span>
        )}
      </div>
    </div>
  );
};
