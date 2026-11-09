import { storage } from './storageService';
import { formatBRL } from './financialEngine';

export class NotificationService {
  private static STORAGE_KEY_LAST_NOTIFICATION = 'contaju_last_due_notification_date';
  private static STORAGE_KEY_ENABLED = 'contaju_push_notifications_enabled';

  /**
   * Verifica se o navegador suporta notificações nativas
   */
  public static isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  /**
   * Retorna o status de permissão atual
   */
  public static getPermission(): NotificationPermission {
    if (!this.isSupported()) return 'denied';
    return Notification.permission;
  }

  /**
   * Verifica se as notificações estão ativadas pelo usuário nas configurações do app
   */
  public static isEnabledByUser(): boolean {
    if (typeof localStorage === 'undefined') return false;
    const val = localStorage.getItem(this.STORAGE_KEY_ENABLED);
    return val !== 'false'; // Padrão: ativado se houver permissão
  }

  /**
   * Salva preferência do usuário
   */
  public static setEnabledByUser(enabled: boolean): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(this.STORAGE_KEY_ENABLED, enabled ? 'true' : 'false');
  }

  /**
   * Solicita permissão para notificações push nativas
   */
  public static async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) return 'denied';

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        this.setEnabledByUser(true);
        // Exibe notificação de boas-vindas / teste
        await this.showNotification('Notificações Ativadas!', {
          body: 'O Contaju agora enviará alertas matinais sobre contas vencendo no dia.',
          tag: 'contaju-welcome'
        });
      }
      return permission;
    } catch (err) {
      console.warn('[NotificationService] Erro ao solicitar permissão:', err);
      return 'denied';
    }
  }

  /**
   * Dispara uma notificação nativa via Service Worker ou Notification API
   */
  public static async showNotification(title: string, options: NotificationOptions = {}): Promise<void> {
    if (!this.isSupported() || Notification.permission !== 'granted') return;

    const defaultOptions: NotificationOptions = {
      icon: '/pwa-icon.svg',
      badge: '/pwa-icon.svg',
      tag: 'contaju-due-alert',
      ...options
    };

    try {
      // 1. Tenta via Service Worker Registration (padrão PWA moderno e móvel)
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        if (registration && registration.showNotification) {
          await registration.showNotification(title, defaultOptions);
          return;
        }
      }

      // 2. Fallback direto via Notification API (Desktop / Browsers sem SW ativo imediato)
      new Notification(title, defaultOptions);
    } catch (err) {
      console.warn('[NotificationService] Falha ao exibir notificação:', err);
    }
  }

  /**
   * Varre títulos vencendo hoje e dispara o alerta nativo diário
   * @param force se true, ignora trava de repetição diária
   */
  public static async checkAndNotifyDueToday(force: boolean = false): Promise<{ payablesCount: number; receivablesCount: number; notified: boolean }> {
    if (!this.isSupported() || Notification.permission !== 'granted' || !this.isEnabledByUser()) {
      return { payablesCount: 0, receivablesCount: 0, notified: false };
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const lastNotifiedDate = typeof localStorage !== 'undefined' ? localStorage.getItem(this.STORAGE_KEY_LAST_NOTIFICATION) : null;

    if (!force && lastNotifiedDate === todayStr) {
      // Já notificou hoje
      return { payablesCount: 0, receivablesCount: 0, notified: false };
    }

    try {
      const titles = storage.getTitles().filter(t => t.documentState !== 'CANCELADO');

      const duePayables = titles.filter(t => 
        t.type === 'PAGAR' && 
        t.balancePrincipal > 0 && 
        t.dueDate === todayStr
      );

      const dueReceivables = titles.filter(t => 
        t.type === 'RECEBER' && 
        t.balancePrincipal > 0 && 
        t.dueDate === todayStr
      );

      const payCount = duePayables.length;
      const recCount = dueReceivables.length;

      if (payCount === 0 && recCount === 0) {
        return { payablesCount: 0, receivablesCount: 0, notified: false };
      }

      const payTotal = duePayables.reduce((acc, t) => acc + t.balancePrincipal, 0);
      const recTotal = dueReceivables.reduce((acc, t) => acc + t.balancePrincipal, 0);

      let title = 'Contaju: Alerta Financeiro do Dia';
      let body = '';

      if (payCount > 0 && recCount > 0) {
        title = `Contaju: ${payCount} conta(s) a pagar e ${recCount} a receber hoje!`;
        body = `A pagar: ${formatBRL(payTotal)} • A receber: ${formatBRL(recTotal)}. Clique para acessar.`;
      } else if (payCount > 0) {
        title = `Contaju: ${payCount} conta(s) a pagar vencem hoje!`;
        body = `Total a pagar hoje: ${formatBRL(payTotal)}. Evite juros e multas de atraso.`;
      } else {
        title = `Contaju: ${recCount} recebimento(s) previstos para hoje!`;
        body = `Total previsto: ${formatBRL(recTotal)}. Acompanhe suas cobranças.`;
      }

      await this.showNotification(title, {
        body,
        tag: `due-alert-${todayStr}`,
        data: { url: payCount > 0 ? '/#pagar' : '/#receber' }
      });

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.STORAGE_KEY_LAST_NOTIFICATION, todayStr);
      }

      return { payablesCount: payCount, receivablesCount: recCount, notified: true };
    } catch (err) {
      console.warn('[NotificationService] Erro ao checar títulos de hoje:', err);
      return { payablesCount: 0, receivablesCount: 0, notified: false };
    }
  }
}
