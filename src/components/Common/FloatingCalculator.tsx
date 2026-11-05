import React, { useState, useEffect, useReducer, useRef, useCallback } from 'react';
import { 
  Calculator as CalcIcon, 
  Minus, 
  X, 
  Copy, 
  Check, 
  History, 
  Trash2, 
  Delete,
  Maximize2,
  GripHorizontal,
  RotateCcw
} from 'lucide-react';
import { 
  CalculatorState, 
  INITIAL_CALCULATOR_STATE, 
  calculatorReducer, 
  formatCalculatorNumber 
} from '../../utils/calculatorEngine';

interface FloatingCalculatorProps {
  isOpen: boolean;
  isMinimized: boolean;
  onOpen: () => void;
  onMinimize: () => void;
  onClose: () => void;
}

const STORAGE_CALC_STATE_KEY = 'contaju_calculator_engine_state';
const STORAGE_CALC_POS_KEY = 'contaju_calculator_position';

export const FloatingCalculator: React.FC<FloatingCalculatorProps> = ({
  isOpen,
  isMinimized,
  onOpen,
  onMinimize,
  onClose
}) => {
  // Carrega estado anterior se houver para não perder conta no meio
  const [state, dispatch] = useReducer(calculatorReducer, INITIAL_CALCULATOR_STATE, () => {
    try {
      const saved = localStorage.getItem(STORAGE_CALC_STATE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...INITIAL_CALCULATOR_STATE,
          display: parsed.display || '0',
          memory: parsed.memory || 0,
          history: Array.isArray(parsed.history) ? parsed.history : []
        };
      }
    } catch {
      // fallback
    }
    return INITIAL_CALCULATOR_STATE;
  });

  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);

  // Posição arrastável (Draggable)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(() => {
    try {
      const savedPos = localStorage.getItem(STORAGE_CALC_POS_KEY);
      if (savedPos) {
        const p = JSON.parse(savedPos);
        if (typeof p.x === 'number' && typeof p.y === 'number') {
          return p;
        }
      }
    } catch {
      // fallback
    }
    return null;
  });

  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; initialX: number; initialY: number }>({
    mouseX: 0,
    mouseY: 0,
    initialX: 0,
    initialY: 0
  });

  const containerRef = useRef<HTMLDivElement>(null);

  // Persistir display, memory e history
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CALC_STATE_KEY, JSON.stringify({
        display: state.display,
        memory: state.memory,
        history: state.history
      }));
    } catch {
      // ignore
    }
  }, [state.display, state.memory, state.history]);

  // Salvar posição
  useEffect(() => {
    try {
      if (position) {
        localStorage.setItem(STORAGE_CALC_POS_KEY, JSON.stringify(position));
      } else {
        localStorage.removeItem(STORAGE_CALC_POS_KEY);
      }
    } catch {
      // ignore
    }
  }, [position]);

  // Teclado físico do computador quando aberta
  useEffect(() => {
    if (!isOpen || isMinimized) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Não interceptar se o usuário estiver digitando em um input ou textarea ativo do sistema
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (
        activeTag === 'input' || 
        activeTag === 'textarea' || 
        document.activeElement?.getAttribute('contenteditable') === 'true'
      ) {
        return;
      }

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        dispatch({ type: 'INPUT_DIGIT', digit: e.key });
      } else if (e.key === '.' || e.key === ',') {
        e.preventDefault();
        dispatch({ type: 'INPUT_DECIMAL' });
      } else if (e.key === '+' || e.key === '-' || e.key === '*' || e.key === '/') {
        e.preventDefault();
        dispatch({ type: 'SET_OPERATOR', operator: e.key });
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        dispatch({ type: 'CALCULATE' });
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        dispatch({ type: 'BACKSPACE' });
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onMinimize();
      } else if (e.key === '%') {
        e.preventDefault();
        dispatch({ type: 'PERCENTAGE' });
      } else if (e.key.toLowerCase() === 'c') {
        e.preventDefault();
        dispatch({ type: 'CLEAR_ENTRY' });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isMinimized, onMinimize]);

  // Suporte a Copiar resultado
  const handleCopy = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const numToCopy = state.display.replace(/\./g, ',');
      navigator.clipboard.writeText(numToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  // Suporte a arrastar (Drag handling)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Apenas botão esquerdo
    if (e.button !== 0) return;

    const rect = containerRef.current?.getBoundingClientRect();
    const currentX = rect ? rect.left : (window.innerWidth - 340);
    const currentY = rect ? rect.top : (window.innerHeight - 480);

    isDraggingRef.current = true;
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initialX: currentX,
      initialY: currentY
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const deltaX = moveEvent.clientX - dragStartRef.current.mouseX;
      const deltaY = moveEvent.clientY - dragStartRef.current.mouseY;

      const newX = Math.max(10, Math.min(window.innerWidth - 300, dragStartRef.current.initialX + deltaX));
      const newY = Math.max(10, Math.min(window.innerHeight - 100, dragStartRef.current.initialY + deltaY));

      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, []);

  const handleResetPosition = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPosition(null);
  };

  // Se estiver fechada totalmente, não renderiza
  if (!isOpen) return null;

  // 1. MODO MINIMIZADO: "NUMEROZINHO FLUTUANTE" ELEGANTE NO CANTO DA TELA
  if (isMinimized) {
    const formattedMiniValue = formatCalculatorNumber(state.display);
    const isCustomPos = position !== null;
    const inlineStyle: React.CSSProperties = isCustomPos 
      ? { left: `${position.x}px`, top: `${position.y}px`, bottom: 'auto', right: 'auto' } 
      : {};

    return (
      <div 
        ref={containerRef}
        style={inlineStyle}
        className={`fixed z-40 select-none ${isCustomPos ? '' : 'bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:bottom-5 right-3 sm:right-5'}`}
        title="Calculadora Minimizada - Clique para abrir ou arraste para reposicionar (Alt+C)"
      >
        <div 
          onClick={onOpen}
          className="group flex items-center gap-2.5 px-3.5 py-2.5 rounded-full bg-slate-900/95 dark:bg-[#131316]/95 hover:bg-slate-900 text-white border border-amber-500/50 shadow-xl shadow-amber-500/10 hover:shadow-amber-500/25 hover:border-amber-400 transition-all cursor-pointer backdrop-blur-md"
        >
          {/* Grip drag handle */}
          <div 
            onMouseDown={handleMouseDown}
            onClick={(e) => e.stopPropagation()}
            className="cursor-move p-0.5 text-slate-500 hover:text-amber-400 transition-colors"
            title="Arraste para reposicionar"
          >
            <GripHorizontal className="w-3.5 h-3.5" />
          </div>

          <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30 group-hover:scale-110 transition-transform shrink-0">
            <CalcIcon className="w-3.5 h-3.5" />
          </div>

          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5 leading-none">
              <span className="text-[9px] uppercase tracking-wider font-semibold text-slate-400">
                Calculadora
              </span>
              {state.operator && (
                <span className="text-[9px] font-mono text-amber-400 font-bold bg-amber-500/20 px-1 rounded">
                  {state.operator === '*' ? '×' : state.operator === '/' ? '÷' : state.operator}
                </span>
              )}
            </div>
            <span className="text-xs font-mono font-bold text-amber-400 tracking-tight leading-tight mt-0.5 truncate max-w-[140px]">
              {formattedMiniValue}
            </span>
          </div>

          <div className="flex items-center gap-0.5 ml-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              className="p-1 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors"
              title="Expandir calculadora"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="p-1 text-slate-500 hover:text-slate-300 rounded-full hover:bg-slate-800 transition-colors"
              title="Fechar calculadora"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. MODO EXPANDIDO: JANELA COMPLETA DA CALCULADORA DO SISTEMA
  const formattedDisplay = formatCalculatorNumber(state.display);

  const getPendingExpression = () => {
    if (state.previousValue !== null && state.operator) {
      const opSign = state.operator === '*' ? '×' : state.operator === '/' ? '÷' : state.operator;
      return `${formatCalculatorNumber(String(state.previousValue))} ${opSign}`;
    }
    return '';
  };

  const isCustomPos = position !== null;
  const inlineStyle: React.CSSProperties = isCustomPos 
    ? { left: `${position.x}px`, top: `${position.y}px`, bottom: 'auto', right: 'auto' } 
    : {};

  return (
    <div 
      ref={containerRef}
      style={inlineStyle}
      className={`fixed z-50 w-[calc(100vw-24px)] max-w-xs sm:w-80 rounded-2xl bg-slate-900/95 dark:bg-[#131316]/95 text-white border border-slate-700/80 shadow-2xl shadow-black/70 backdrop-blur-xl overflow-hidden flex flex-col select-none ${
        isCustomPos ? '' : 'bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:bottom-5 right-3 sm:right-5'
      }`}
    >
      {/* Top Window Bar (arrastável pelo cabeçalho) */}
      <div 
        onMouseDown={handleMouseDown}
        className="flex items-center justify-between px-3.5 py-2.5 border-b border-slate-800/80 bg-slate-950/60 cursor-move"
        title="Arraste para mover a calculadora pela tela"
      >
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
            <CalcIcon className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-bold text-slate-200 tracking-tight">
            Calculadora
          </span>
          {state.memory !== 0 && (
            <span 
              className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40"
              title={`Memória ativa: ${state.memory}`}
            >
              M
            </span>
          )}
        </div>

        <div className="flex items-center gap-1" onMouseDown={(e) => e.stopPropagation()}>
          {position !== null && (
            <button
              type="button"
              onClick={handleResetPosition}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="Restaurar posição padrão no canto"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowHistory(prev => !prev)}
            className={`p-1.5 rounded-lg transition-colors ${
              showHistory 
                ? 'bg-amber-500/20 text-amber-400' 
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title="Fita de Histórico de Cálculos"
          >
            <History className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onMinimize}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            title="Minimizar (deixar numerozinho flutuante)"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            title="Fechar calculadora"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Calculator Main Body or History Drawer */}
      {showHistory ? (
        /* History Tape Panel */
        <div className="p-3.5 flex flex-col h-[340px] bg-slate-950/40">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
            <span className="text-xs font-bold text-slate-300">
              Fita de Histórico ({state.history.length})
            </span>
            {state.history.length > 0 && (
              <button
                type="button"
                onClick={() => dispatch({ type: 'CLEAR_HISTORY' })}
                className="text-[10px] text-rose-400 hover:text-rose-300 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                Limpar
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {state.history.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                Nenhum cálculo registrado ainda.
              </div>
            ) : (
              state.history.map(item => (
                <div 
                  key={item.id}
                  onClick={() => {
                    dispatch({ type: 'SET_VALUE', value: item.result });
                    setShowHistory(false);
                  }}
                  className="p-2 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/40 transition-all cursor-pointer group"
                  title="Clique para carregar resultado na calculadora"
                >
                  <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between">
                    <span>{item.expression}</span>
                    <span className="text-[9px] text-slate-500">{item.timestamp}</span>
                  </div>
                  <div className="text-sm font-bold font-mono text-amber-400 text-right mt-0.5 group-hover:text-amber-300">
                    = {formatCalculatorNumber(String(item.result))}
                  </div>
                </div>
              ))
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowHistory(false)}
            className="mt-2 w-full py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
          >
            Voltar para Calculadora
          </button>
        </div>
      ) : (
        /* Normal Calculator View */
        <div className="p-3.5 space-y-3">
          
          {/* LCD Digital Display */}
          <div className="relative p-3 rounded-xl bg-slate-950 border border-slate-800 shadow-inner flex flex-col justify-between min-h-[76px]">
            {/* Expression Subtitle */}
            <div className="text-right text-[11px] font-mono text-slate-400 min-h-[16px] truncate">
              {getPendingExpression()}
            </div>

            {/* Main Numeric Display */}
            <div className="flex items-baseline justify-between gap-2 mt-1">
              <button
                type="button"
                onClick={handleCopy}
                className="p-1 text-slate-500 hover:text-amber-400 rounded transition-colors shrink-0 cursor-pointer"
                title="Copiar resultado (para colar em formulários)"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>

              <div 
                className="text-2xl font-bold font-mono tracking-tight text-right text-amber-400 truncate select-all"
                title={state.display}
              >
                {formattedDisplay}
              </div>
            </div>
          </div>

          {/* Memory Bar */}
          <div className="grid grid-cols-4 gap-1.5 text-[11px] font-bold">
            <button
              type="button"
              disabled={state.memory === 0}
              onClick={() => dispatch({ type: 'MEMORY_CLEAR' })}
              className="py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Memory Clear (MC)"
            >
              MC
            </button>
            <button
              type="button"
              disabled={state.memory === 0}
              onClick={() => dispatch({ type: 'MEMORY_RECALL' })}
              className="py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-amber-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Memory Recall (MR)"
            >
              MR
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'MEMORY_ADD' })}
              className="py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Memory Add (M+)"
            >
              M+
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'MEMORY_SUBTRACT' })}
              className="py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Memory Subtract (M-)"
            >
              M-
            </button>
          </div>

          {/* Main Keypad Grid */}
          <div className="grid grid-cols-4 gap-1.5 text-sm font-bold font-mono">
            {/* Row 1 */}
            <button
              type="button"
              onClick={() => dispatch({ type: 'CLEAR_ALL' })}
              className="py-2.5 rounded-xl bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 active:scale-95 transition-all text-xs font-sans font-bold cursor-pointer"
              title="Limpar tudo (Esc)"
            >
              C
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'CLEAR_ENTRY' })}
              className="py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 active:scale-95 transition-all text-xs font-sans font-bold cursor-pointer"
              title="Limpar entrada atual"
            >
              CE
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'PERCENTAGE' })}
              className="py-2.5 rounded-xl bg-slate-800 text-amber-400 hover:bg-slate-700 active:scale-95 transition-all cursor-pointer"
              title="Porcentagem (%) - Suporta acréscimos e descontos comerciais (ex: 100 + 10% = 110)"
            >
              %
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'SET_OPERATOR', operator: '/' })}
              className={`py-2.5 rounded-xl text-base transition-all active:scale-95 cursor-pointer ${
                state.operator === '/' 
                  ? 'bg-amber-500 text-black font-extrabold shadow-sm' 
                  : 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
              }`}
              title="Divisão (÷)"
            >
              ÷
            </button>

            {/* Row 2 */}
            <button
              type="button"
              onClick={() => dispatch({ type: 'INPUT_DIGIT', digit: '7' })}
              className="py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-white active:scale-95 transition-all cursor-pointer"
            >
              7
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'INPUT_DIGIT', digit: '8' })}
              className="py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-white active:scale-95 transition-all cursor-pointer"
            >
              8
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'INPUT_DIGIT', digit: '9' })}
              className="py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-white active:scale-95 transition-all cursor-pointer"
            >
              9
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'SET_OPERATOR', operator: '*' })}
              className={`py-2.5 rounded-xl text-base transition-all active:scale-95 cursor-pointer ${
                state.operator === '*' 
                  ? 'bg-amber-500 text-black font-extrabold shadow-sm' 
                  : 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
              }`}
              title="Multiplicação (×)"
            >
              ×
            </button>

            {/* Row 3 */}
            <button
              type="button"
              onClick={() => dispatch({ type: 'INPUT_DIGIT', digit: '4' })}
              className="py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-white active:scale-95 transition-all cursor-pointer"
            >
              4
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'INPUT_DIGIT', digit: '5' })}
              className="py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-white active:scale-95 transition-all cursor-pointer"
            >
              5
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'INPUT_DIGIT', digit: '6' })}
              className="py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-white active:scale-95 transition-all cursor-pointer"
            >
              6
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'SET_OPERATOR', operator: '-' })}
              className={`py-2.5 rounded-xl text-base transition-all active:scale-95 cursor-pointer ${
                state.operator === '-' 
                  ? 'bg-amber-500 text-black font-extrabold shadow-sm' 
                  : 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
              }`}
              title="Subtração (-)"
            >
              -
            </button>

            {/* Row 4 */}
            <button
              type="button"
              onClick={() => dispatch({ type: 'INPUT_DIGIT', digit: '1' })}
              className="py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-white active:scale-95 transition-all cursor-pointer"
            >
              1
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'INPUT_DIGIT', digit: '2' })}
              className="py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-white active:scale-95 transition-all cursor-pointer"
            >
              2
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'INPUT_DIGIT', digit: '3' })}
              className="py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-white active:scale-95 transition-all cursor-pointer"
            >
              3
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'SET_OPERATOR', operator: '+' })}
              className={`py-2.5 rounded-xl text-base transition-all active:scale-95 cursor-pointer ${
                state.operator === '+' 
                  ? 'bg-amber-500 text-black font-extrabold shadow-sm' 
                  : 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
              }`}
              title="Adição (+)"
            >
              +
            </button>

            {/* Row 5 */}
            <button
              type="button"
              onClick={() => dispatch({ type: 'TOGGLE_SIGN' })}
              className="py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 active:scale-95 transition-all cursor-pointer"
              title="Inverter Sinal (±)"
            >
              ±
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'INPUT_DIGIT', digit: '0' })}
              className="py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-white active:scale-95 transition-all cursor-pointer"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'INPUT_DECIMAL' })}
              className="py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 active:scale-95 transition-all text-base cursor-pointer"
              title="Separador decimal (,)"
            >
              ,
            </button>
            <button
              type="button"
              onClick={() => dispatch({ type: 'CALCULATE' })}
              className="py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-500 hover:brightness-105 active:scale-95 text-slate-950 font-extrabold text-base shadow-md transition-all cursor-pointer"
              title="Calcular (Enter ou =)"
            >
              =
            </button>
          </div>

          <div className="flex items-center justify-between pt-1 text-[10px] text-slate-500">
            <span>Atalho: Alt+C | Teclado numérico ativo</span>
            <button
              type="button"
              onClick={() => dispatch({ type: 'BACKSPACE' })}
              className="hover:text-slate-300 flex items-center gap-1 transition-colors cursor-pointer"
              title="Apagar último dígito (Backspace)"
            >
              <Delete className="w-3 h-3" />
              Apagar
            </button>
          </div>

        </div>
      )}

    </div>
  );
};
