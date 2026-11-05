import React, { useState, useEffect } from 'react';
import { Bot } from 'lucide-react';
import { storage } from '../../services/storageService';
import { AiProviderConfig } from '../../types';
import { NavigationScreen } from '../Sidebar';

interface AiHealthStatusPillProps {
  onNavigate?: (screen: NavigationScreen) => void;
}

export const AiHealthStatusPill: React.FC<AiHealthStatusPillProps> = ({ onNavigate }) => {
  const [aiConfig, setAiConfig] = useState<AiProviderConfig>(() => storage.getAiConfig());

  useEffect(() => {
    const unsub = storage.subscribe(() => {
      setAiConfig(storage.getAiConfig());
    });
    return unsub;
  }, []);

  const isConnected = Boolean(aiConfig.apiKey && aiConfig.apiKey.trim().length > 0);
  const primaryModel = aiConfig.primaryModel || 'deepseek-v4-pro';

  const handleClick = () => {
    if (onNavigate) {
      onNavigate('IA');
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="h-10 inline-flex items-center gap-2 px-3 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer select-none"
      title={
        isConnected
          ? `IA conectada. Modelo principal: ${primaryModel}. Clique para abrir a Central de IA`
          : 'IA ainda não conectada. Clique para conectar'
      }
    >
      <span className="relative flex items-center justify-center shrink-0">
        <Bot className="w-[18px] h-[18px]" strokeWidth={1.75} />
        <span
          className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-[var(--surface-card)] ${
            isConnected ? 'bg-[var(--status-success)]' : 'bg-[var(--brand-gold-fill)]'
          }`}
        />
      </span>
      <span className="truncate max-w-[120px]">{isConnected ? 'IA conectada' : 'Conectar IA'}</span>
    </button>
  );
};
