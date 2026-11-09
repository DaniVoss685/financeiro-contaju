import React, { useState, useEffect } from 'react';
import { MonitorDown, CheckCircle2, X, Download, Sparkles } from 'lucide-react';

interface PWAInstallButtonProps {
  className?: string;
  variant?: 'header' | 'button' | 'banner';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  className = '',
  variant = 'header'
}) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [showSafariHelp, setShowSafariHelp] = useState<boolean>(false);
  const [isMacSafari, setIsMacSafari] = useState<boolean>(false);

  useEffect(() => {
    // 1. Detecta se já está rodando em modo aplicativo standalone
    const isStandalone = 
      window.matchMedia('(display-mode: standalone)').matches || 
      (window.navigator as any).standalone === true;

    setIsInstalled(isStandalone);

    // 2. Detecta Safari no macOS / iOS
    const ua = window.navigator.userAgent;
    const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua) && !/Edg/.test(ua);
    const isApple = /Macintosh|iPhone|iPad/.test(ua);
    setIsMacSafari(isSafari && isApple);

    // 3. Captura o evento nativo de instalação antes de ser cancelado pelo browser
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
    } else if (isMacSafari) {
      setShowSafariHelp(true);
    }
  };

  // Se já está instalado, não precisa poluir a tela
  if (isInstalled) {
    return null;
  }

  // Se não houver prompt nem for Safari, esconde
  if (!deferredPrompt && !isMacSafari) {
    return null;
  }

  if (variant === 'header') {
    return (
      <>
        <button
          type="button"
          onClick={handleInstallClick}
          className={`h-10 inline-flex items-center gap-2 px-3 text-sm rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer shrink-0 ${className}`}
          title="Instalar o Contaju como aplicativo (Windows, Mac ou Linux)"
        >
          <MonitorDown className="w-[18px] h-[18px]" strokeWidth={1.75} />
          <span className="hidden 2xl:inline">Instalar app</span>
        </button>

        {/* Modal de Instrução do Safari no Mac */}
        {showSafariHelp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
            <div className="bg-[var(--surface-card)] border border-[var(--border-subtle)] rounded-2xl max-w-sm w-full p-5 shadow-2xl relative text-left">
              <button 
                type="button"
                onClick={() => setShowSafariHelp(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-[var(--text-primary)]">Instalação no Safari / Mac</h3>
              </div>

              <p className="text-xs text-[var(--text-secondary)] mb-3 leading-relaxed">
                Para adicionar o <strong>Contaju</strong> como aplicativo nativo no Dock do seu Mac:
              </p>

              <ol className="text-xs text-slate-700 dark:text-slate-300 space-y-2 list-decimal list-inside bg-[var(--surface-elevated)] p-3 rounded-xl border border-[var(--border-subtle)]">
                <li>Clique no menu superior <strong>Arquivo</strong> do Safari.</li>
                <li>Selecione <strong>"Adicionar ao Dock..."</strong>.</li>
                <li>Clique em <strong>Adicionar</strong>.</li>
              </ol>

              <button
                type="button"
                onClick={() => setShowSafariHelp(false)}
                className="w-full mt-4 py-2 bg-amber-500 text-slate-950 rounded-xl text-xs font-bold hover:bg-amber-400 transition-colors"
              >
                Entendi
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <button
      type="button"
      onClick={handleInstallClick}
      className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-xl text-amber-950 dark:text-amber-300 bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30 transition-all ${className}`}
    >
      <Download className="w-4 h-4 text-amber-500" />
      <span>Instalar no Computador</span>
    </button>
  );
};
