import { getSupabaseClient } from './supabaseClient';
import { storage } from './storageService';
import type { User, UserRole } from '../types';

/**
 * Login real pelo Supabase Auth. Quem pode entrar é decidido no banco:
 * - e-mail de consultor (tabela contaju_consultants) entra e vê todas as empresas;
 * - e-mail autorizado pela consultoria (contaju_invitations) ganha a própria empresa no primeiro acesso;
 * - qualquer outro e-mail cria conta, mas não entra no sistema.
 */

export interface OrgInfo {
  id: string;
  name: string;
  role: string;
}

const KEY_ORGS = 'contaju_orgs';
const KEY_ACTIVE = 'contaju_active_org';
const KEY_CONSULTANT = 'contaju_is_consultant';

export function getOrgs(): OrgInfo[] {
  try {
    return JSON.parse(localStorage.getItem(KEY_ORGS) || '[]');
  } catch {
    return [];
  }
}
export function isConsultant(): boolean {
  return localStorage.getItem(KEY_CONSULTANT) === 'true';
}
export function getActiveOrgId(): string | null {
  return localStorage.getItem(KEY_ACTIVE);
}
export function setActiveOrgId(id: string): void {
  localStorage.setItem(KEY_ACTIVE, id);
}

const KEEP_KEYS = new Set([
  'contaju_auth_session', 'contaju_current_user_id', 'contaju_theme', 'contaju_orgs', 'contaju_active_org',
  'contaju_is_consultant', 'contaju_view_mode', 'contaju_cache_org', 'contaju_limpeza_mock_v2', 'contaju_supabase_url', 'contaju_supabase_anon_key',
  'contaju_supabase_auto_sync', 'contaju_sidebar_minimized', 'contaju_calc_open', 'contaju_calc_minimized'
]);

/** Apaga o cache local dos dados (nunca mistura empresas no mesmo navegador). */
export function purgeLocalData(): void {
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('contaju_') && !KEEP_KEYS.has(k) && !k.startsWith('sb-')) toRemove.push(k);
  }
  toRemove.forEach(k => localStorage.removeItem(k));
  try {
    Object.keys(sessionStorage).filter(k => k.startsWith('contaju_filter_')).forEach(k => sessionStorage.removeItem(k));
  } catch {
    // ignora
  }
}

/** Troca a empresa ativa (consultor) e recarrega com os dados dela. */
export async function switchOrg(orgId: string): Promise<void> {
  setActiveOrgId(orgId);
  const client = getSupabaseClient();
  if (isConsultant()) await client?.rpc('contaju_log_access', { p_org: orgId });
  purgeLocalData();
  localStorage.setItem('contaju_cache_org', orgId);
  window.location.reload();
}

function friendlyError(message: string): string {
  const m = (message || '').toLowerCase();
  if (m.includes('invalid login')) return 'E-mail ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail pelo link que enviamos e depois entre.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Este e-mail já tem conta. Use "Entrar".';
  if (m.includes('password should be') || m.includes('weak')) return 'Escolha uma senha mais forte (mínimo de 6 caracteres).';
  if (m.includes('rate limit') || m.includes('too many')) return 'Muitas tentativas. Aguarde um minuto e tente de novo.';
  return 'Não foi possível concluir. Tente novamente.';
}

async function finishLogin(): Promise<{ success: boolean; user?: User; error?: string }> {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Conexão com o banco indisponível.' };

  const { data: sessionData } = await client.auth.getSession();
  const authUser = sessionData.session?.user;
  if (!authUser) return { success: false, error: 'Sessão não iniciada.' };

  // 1º acesso: se a consultoria autorizou este e-mail, cria a empresa dele
  await client.rpc('contaju_claim_invitation');

  const consultantRes = await client.rpc('contaju_is_consultant');
  const consultant = consultantRes.data === true;

  const orgsRes = await client
    .from('contaju_memberships')
    .select('org_id, role, contaju_organizations(id, name)')
    .eq('user_id', authUser.id);
  let orgs: OrgInfo[] = (orgsRes.data || []).map((r: any) => ({
    id: r.org_id,
    name: r.contaju_organizations?.name || 'Empresa',
    role: r.role
  }));

  if (consultant) {
    const all = await client.from('contaju_organizations').select('id, name').order('name');
    const mine = new Set(orgs.map(o => o.id));
    orgs = [...orgs, ...(all.data || []).filter((o: any) => !mine.has(o.id)).map((o: any) => ({ id: o.id, name: o.name, role: 'CONSULTOR' }))];
  }

  if (!consultant && orgs.length === 0) {
    await client.auth.signOut();
    return {
      success: false,
      error: 'Seu e-mail ainda não foi autorizado pela consultoria. Peça a liberação e tente de novo.'
    };
  }

  const email = (authUser.email || '').toLowerCase();
  const fullName = (authUser.user_metadata?.full_name as string) || email.split('@')[0];
  const membershipRole = orgs.find(o => o.role !== 'CONSULTOR')?.role;
  const role: UserRole = consultant ? 'SUPER_ADMIN' : membershipRole === 'OWNER' ? 'ADMIN' : 'OPERADOR';

  const user: User = {
    id: authUser.id,
    name: fullName,
    email,
    role,
    status: 'ATIVO',
    password: '',
    createdAt: new Date().toISOString()
  } as User;

  localStorage.setItem(KEY_ORGS, JSON.stringify(orgs));
  localStorage.setItem(KEY_CONSULTANT, String(consultant));
  const own = orgs.find(o => o.role !== 'CONSULTOR') || orgs[0];
  if (!getActiveOrgId() || !orgs.some(o => o.id === getActiveOrgId())) setActiveOrgId(own.id);

  const active = getActiveOrgId() as string;
  if (localStorage.getItem('contaju_cache_org') !== active) {
    purgeLocalData();
    localStorage.setItem('contaju_cache_org', active);
  }
  // Uma vez por empresa neste aparelho: descarta qualquer cópia local antiga (dados de exemplo) e baixa só o que está na nuvem
  if (localStorage.getItem('contaju_limpeza_mock_v2') !== active) {
    purgeLocalData();
    localStorage.setItem('contaju_cache_org', active);
    localStorage.setItem('contaju_limpeza_mock_v2', active);
  }
  storage.startSession(user);
  return { success: true, user };
}

export async function signInWithPassword(email: string, password: string) {
  const client = getSupabaseClient();
  if (!client) return { success: false as const, error: 'Conexão com o banco indisponível.' };
  const { error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) return { success: false as const, error: friendlyError(error.message) };
  return finishLogin();
}

export async function signUp(name: string, email: string, password: string) {
  const client = getSupabaseClient();
  if (!client) return { success: false as const, error: 'Conexão com o banco indisponível.' };
  const { data, error } = await client.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { full_name: name.trim() } }
  });
  if (error) return { success: false as const, error: friendlyError(error.message) };
  if (!data.session) {
    // E-mail autorizado pela consultoria já nasce confirmado: basta entrar com a senha recém-criada
    const login = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (login.error) {
      return { success: true as const, needsConfirmation: true as const };
    }
  }
  const res = await finishLogin();
  return { ...res, needsConfirmation: false as const };
}

export async function requestPasswordReset(email: string) {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Conexão com o banco indisponível.' };
  const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: window.location.origin
  });
  return error ? { success: false, error: friendlyError(error.message) } : { success: true };
}

export async function updatePassword(newPassword: string) {
  const client = getSupabaseClient();
  if (!client) return { success: false, error: 'Conexão com o banco indisponível.' };
  const { error } = await client.auth.updateUser({ password: newPassword });
  return error ? { success: false, error: friendlyError(error.message) } : { success: true };
}

export function onPasswordRecovery(cb: () => void): () => void {
  const client = getSupabaseClient();
  if (!client) return () => {};
  const { data } = client.auth.onAuthStateChange(event => {
    if (event === 'PASSWORD_RECOVERY') cb();
  });
  return () => data.subscription.unsubscribe();
}

export async function signOut() {
  const client = getSupabaseClient();
  try {
    await client?.auth.signOut();
  } catch {
    // ignora
  }
  localStorage.removeItem(KEY_ORGS);
  localStorage.removeItem(KEY_ACTIVE);
  localStorage.removeItem(KEY_CONSULTANT);
  localStorage.removeItem('contaju_cache_org');
  purgeLocalData();
}
