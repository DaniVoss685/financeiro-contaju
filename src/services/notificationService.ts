import { storage } from './storageService';
import { formatBRL } from './financialEngine';
import { getSupabaseClient } from './supabaseClient';
import { getActiveOrgId } from './authService';

export interface PushResultado { ok: boolean; motivo?: string; codigo?: string; comVencimentos?: boolean }

const base64ParaBytes = (b64: string): Uint8Array => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};

export class NotificationService {
  private static STORAGE_KEY_LAST_NOTIFICATION = 'contaju_last_due_notification_date';
  private static STORAGE_KEY_ENABLED = 'contaju_push_notifications_enabled';
  private static STORAGE_KEY_PUSH_ORG = 'contaju_push_subscribed_org';

  // ---------------------------------------------------------------------------
  // Aviso com o sistema FECHADO (Web Push): o servidor manda, o aparelho mostra.
  // ---------------------------------------------------------------------------

  /** O aparelho/navegador sabe receber aviso com o app fechado? */
  public static isPushSupported(): boolean {
    return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  /** iPhone/iPad fora do app instalado: o aviso só funciona depois de "Adicionar à Tela de Início". */
  public static needsInstallOnIos(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const instalado = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || (navigator as any).standalone === true;
    return ios && !instalado;
  }

  private static async chamarPush(action: string, dados: Record<string, unknown> = {}): Promise<{ status: number; json: any }> {
    const orgId = getActiveOrgId();
    const client = getSupabaseClient();
    if (!orgId || !client) return { status: 401, json: { error: 'Escolha uma empresa e entre no sistema para ativar o aviso.' } };
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { status: 401, json: { error: 'O login desta aba não está ativo. Saia do sistema e entre de novo.' } };
    try {
      const r = await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, orgId, ...dados })
      });
      const json = await r.json().catch(() => ({}));
      return { status: r.status, json };
    } catch {
      return { status: 0, json: { error: 'Sem conexão com o servidor. Confira a internet e tente de novo.' } };
    }
  }

  private static async getSubscription(): Promise<PushSubscription | null> {
    if (!this.isPushSupported()) return null;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      return reg ? await reg.pushManager.getSubscription() : null;
    } catch {
      return null;
    }
  }

  /** Este aparelho recebe o aviso com o app fechado, para a empresa que está aberta? */
  public static async isPushActive(): Promise<boolean> {
    const sub = await this.getSubscription();
    return !!sub && Notification.permission === 'granted' && localStorage.getItem(this.STORAGE_KEY_PUSH_ORG) === getActiveOrgId();
  }

  /** Liga o aviso neste aparelho: pede permissão, se inscreve e guarda no servidor. */
  public static async enablePush(): Promise<PushResultado> {
    if (this.needsInstallOnIos()) return { ok: false, codigo: 'IOS_INSTALAR', motivo: 'No iPhone, primeiro toque em Compartilhar e em "Adicionar à Tela de Início". Depois abra o app por lá e ative o aviso.' };
    if (!this.isPushSupported()) return { ok: false, codigo: 'NAO_SUPORTADO', motivo: 'Este navegador não consegue receber avisos com o sistema fechado. Use o Chrome, Edge ou Safari atualizado.' };
    const permissao = await Notification.requestPermission();
    if (permissao !== 'granted') return { ok: false, codigo: 'PERMISSAO', motivo: permissao === 'denied' ? 'O navegador está bloqueando os avisos. Libere nas configurações do site (cadeado ao lado do endereço) e tente de novo.' : 'Você não permitiu o aviso. Toque em Ativar de novo e escolha Permitir.' };

    const chave = await this.chamarPush('chave');
    if (chave.status !== 200 || !chave.json.chavePublica) return { ok: false, motivo: chave.json.error || 'Não foi possível ativar agora. Tente de novo.', codigo: chave.json.codigo };

    try {
      // Em desenvolvimento o app desregistra o service worker; aqui garantimos que existe um.
      if (!(await navigator.serviceWorker.getRegistration())) await navigator.serviceWorker.register('/sw.js');
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('sw_timeout')), 10_000))
      ]);
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ParaBytes(chave.json.chavePublica) as BufferSource });
      const dados = sub.toJSON();
      const salvo = await this.chamarPush('inscrever', { subscription: { endpoint: dados.endpoint, keys: dados.keys } });
      if (salvo.status !== 200) return { ok: false, motivo: salvo.json.error || 'Não foi possível salvar este aparelho.' };
      localStorage.setItem(this.STORAGE_KEY_PUSH_ORG, getActiveOrgId() || '');
      this.setEnabledByUser(true);
      return { ok: true };
    } catch (err) {
      console.warn('[NotificationService] Falha ao ativar o aviso:', err);
      return { ok: false, motivo: 'Este aparelho não conseguiu se inscrever no aviso. Se estiver em aba anônima, abra em uma aba normal.' };
    }
  }

  /** Desliga o aviso neste aparelho. */
  public static async disablePush(): Promise<void> {
    const sub = await this.getSubscription();
    if (sub) {
      await this.chamarPush('cancelar', { endpoint: sub.endpoint });
      try { await sub.unsubscribe(); } catch { /* já estava solto */ }
    }
    localStorage.removeItem(this.STORAGE_KEY_PUSH_ORG);
  }

  /** Manda um aviso agora para ESTE aparelho (prova que funciona, mesmo com o app fechado). */
  public static async sendPushTest(): Promise<PushResultado> {
    const sub = await this.getSubscription();
    if (!sub) return { ok: false, motivo: 'Este aparelho ainda não está ativado.' };
    const r = await this.chamarPush('testar', { endpoint: sub.endpoint });
    if (r.status === 200) return { ok: true, comVencimentos: r.json.comVencimentos };
    if (r.json.codigo === 'APARELHO_EXPIRADO') localStorage.removeItem(this.STORAGE_KEY_PUSH_ORG);
    return { ok: false, motivo: r.json.error || 'Não foi possível enviar o teste.', codigo: r.json.codigo };
  }

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

    // Aparelho já recebe o aviso do servidor (funciona até com o app fechado): não duplica aqui.
    const pushOrg = typeof localStorage !== 'undefined' ? localStorage.getItem(this.STORAGE_KEY_PUSH_ORG) : null;
    if (!force && pushOrg && pushOrg === getActiveOrgId()) {
      return { payablesCount: 0, receivablesCount: 0, notified: false };
    }

    const todayStr = new Date(Date.now() - 3 * 3600 * 1000).toISOString().split('T')[0];
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
