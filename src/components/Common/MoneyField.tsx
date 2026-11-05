import React from 'react';

/**
 * Campo de dinheiro no padrão brasileiro: 2.500,00.
 * Quem digita só escreve os números; os centavos e os pontos de milhar entram sozinhos.
 */
interface MoneyFieldProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  max?: number;
  autoFocus?: boolean;
  /** Permite valor negativo (ex.: saldo de conta): digite "-" para virar negativo. */
  allowNegative?: boolean;
}

const fmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const MoneyField: React.FC<MoneyFieldProps> = ({ value, onChange, className = '', required, disabled, id, max, autoFocus, allowNegative }) => {
  const display = value ? (value < 0 ? '-' : '') + fmt.format(Math.abs(value)) : '';

  return (
    <input
      id={id}
      type="text"
      inputMode={allowNegative ? "text" : "numeric"}
      autoComplete="off"
      autoFocus={autoFocus}
      disabled={disabled}
      required={required}
      value={display}
      onChange={e => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 13);
        let next = digits ? parseInt(digits, 10) / 100 : 0;
        if (allowNegative && e.target.value.includes('-')) next = -next;
        if (max !== undefined && next > max) next = max;
        onChange(next);
      }}
      onFocus={e => e.target.select()}
      className={className}
    />
  );
};
