import React, { useCallback, useEffect, useState } from 'react';
import { Building2, ArrowRightCircle, MailPlus, UserPlus, History, CheckCircle2, Clock } from 'lucide-react';
import { Card, Badge, IconTile } from '../Common/ui';
import { getSupabaseClient } from '../../services/supabaseClient';
import { getOrgs, getActiveOrgId, switchOrg, type OrgInfo } from '../../services/authService';

interface Invitation {
  email: string;
  company_name: string;
  claimed_org_id: string | null;
  created_at: string;
}
interface Consultant {
  email: string;
  created_at: string;
}
interface AccessLog {
  id: string;
  org_id: string;
  created_at: string;
  action: string;
}

const inputCls =
  'w-full h-11 px-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--brand-gold)]';

const fmt = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const ConsultoriaView: React.FC = () => {
  const orgs: OrgInfo[] = getOrgs();
  const active = getActiveOrgId();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [consultantEmail, setConsultantEmail] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'erro'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const c = getSupabaseClient();
    if (!c) return;
    const [inv, con, log] = await Promise.all([
      c.from('contaju_invitations').select('email, company_name, claimed_org_id, created_at').order('created_at', { ascending: false }),
      c.from('contaju_consultants').select('email, created_at').order('created_at'),
      c.from('contaju_consultant_access_log').select('id, org_id, created_at, action').order('created_at', { ascending: false }).limit(20)
    ]);
    setInvitations((inv.data as Invitation[]) || []);
    setConsultants((con.data as Consultant[]) || []);
    setLogs((log.data as AccessLog[]) || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const orgName = (id: string) => orgs.find(o => o.id === id)?.name || 'Empresa';

  const authorize = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!company.trim() || !email.includes('@')) {
      setMsg({ tone: 'erro', text: 'Informe o nome da empresa e um e-mail válido.' });
      return;
    }
    setBusy(true);
    const { error } = await getSupabaseClient()!.rpc('contaju_add_invitation', {
      p_email: email.trim().toLowerCase(),
      p_company: company.trim()
    });
    setBusy(false);
    if (error) {
      setMsg({ tone: 'erro', text: 'Não foi possível autorizar. Confira se você é consultor.' });
      return;
    }
    setMsg({ tone: 'ok', text: `${email.trim().toLowerCase()} autorizado. No primeiro acesso, a empresa "${company.trim()}" é criada.` });
    setCompany('');
    setEmail('');
    load();
  };

  const addConsultant = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!consultantEmail.includes('@')) {
      setMsg({ tone: 'erro', text: 'Informe um e-mail válido.' });
      return;
    }
    setBusy(true);
    const { error } = await getSupabaseClient()!.rpc('contaju_add_consultant', { p_email: consultantEmail.trim().toLowerCase() });
    setBusy(false);
    if (error) {
      setMsg({ tone: 'erro', text: 'Não foi possível adicionar o consultor.' });
      return;
    }
    setMsg({ tone: 'ok', text: `${consultantEmail.trim().toLowerCase()} agora é consultor e enxerga todas as empresas.` });
    setConsultantEmail('');
    load();
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--text-secondary)] max-w-2xl">
        Aqui você escolhe qual empresa quer acompanhar, libera o acesso de novas empresas e define quem é consultor.
        Cada empresa só enxerga os próprios dados; consultores enxergam todas.
      </p>

      {msg && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${
            msg.tone === 'ok'
              ? 'border-transparent bg-[var(--status-success-bg)] text-[var(--status-success)]'
              : 'border-transparent bg-[var(--status-danger-bg)] text-[var(--status-danger)]'
          }`}
        >
          {msg.text}
        </div>
      )}

      <Card hero>
        <div className="flex items-center gap-3 mb-5">
          <IconTile><Building2 /></IconTile>
          <div>
            <h2 className="text-[17px] font-semibold">Empresas</h2>
            <p className="text-sm text-[var(--text-secondary)]">Clique em "Acessar" para ver as finanças da empresa.</p>
          </div>
        </div>
        {orgs.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">Nenhuma empresa ainda. Autorize o primeiro e-mail abaixo.</p>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {orgs.map(o => (
              <li key={o.id} className="flex items-center justify-between gap-4 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{o.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">{o.role === 'CONSULTOR' ? 'Acesso como consultor' : 'Empresa própria'}</p>
                </div>
                {o.id === active ? (
                  <Badge tone="gold"><CheckCircle2 className="w-3.5 h-3.5 mr-1" />Você está aqui</Badge>
                ) : (
                  <button
                    type="button"
                    onClick={() => switchOrg(o.id)}
                    className="btn-gold h-10 px-4 rounded-xl text-sm font-semibold inline-flex items-center gap-2 shrink-0"
                  >
                    Acessar <ArrowRightCircle className="w-4 h-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-center gap-3 mb-5">
            <IconTile><MailPlus /></IconTile>
            <div>
              <h2 className="text-[17px] font-semibold">Autorizar uma empresa</h2>
              <p className="text-sm text-[var(--text-secondary)]">Só e-mails liberados aqui conseguem usar o sistema.</p>
            </div>
          </div>
          <form onSubmit={authorize} className="space-y-3">
            <input className={inputCls} placeholder="Nome da empresa" value={company} onChange={e => setCompany(e.target.value)} />
            <input className={inputCls} type="email" placeholder="E-mail do responsável" value={email} onChange={e => setEmail(e.target.value)} />
            <button type="submit" disabled={busy} className="btn-gold h-11 px-5 rounded-xl text-sm font-semibold disabled:opacity-50">
              Autorizar
            </button>
          </form>
          {invitations.length > 0 && (
            <ul className="mt-5 divide-y divide-[var(--border-subtle)]">
              {invitations.map(i => (
                <li key={i.email} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{i.company_name}</p>
                    <p className="text-xs text-[var(--text-muted)] truncate">{i.email}</p>
                  </div>
                  {i.claimed_org_id ? <Badge tone="success">Já entrou</Badge> : <Badge tone="gold"><Clock className="w-3.5 h-3.5 mr-1" />Aguardando</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="flex items-center gap-3 mb-5">
            <IconTile><UserPlus /></IconTile>
            <div>
              <h2 className="text-[17px] font-semibold">Consultores</h2>
              <p className="text-sm text-[var(--text-secondary)]">Enxergam e ajudam todas as empresas.</p>
            </div>
          </div>
          <form onSubmit={addConsultant} className="flex gap-3">
            <input className={inputCls} type="email" placeholder="E-mail do consultor" value={consultantEmail} onChange={e => setConsultantEmail(e.target.value)} />
            <button type="submit" disabled={busy} className="btn-gold h-11 px-5 rounded-xl text-sm font-semibold shrink-0 disabled:opacity-50">
              Adicionar
            </button>
          </form>
          <ul className="mt-5 divide-y divide-[var(--border-subtle)]">
            {consultants.map(c => (
              <li key={c.email} className="py-3 text-sm truncate">{c.email}</li>
            ))}
          </ul>
        </Card>
      </div>

      <Card>
        <div className="flex items-center gap-3 mb-5">
          <IconTile><History /></IconTile>
          <div>
            <h2 className="text-[17px] font-semibold">Últimos acessos de consultores</h2>
            <p className="text-sm text-[var(--text-secondary)]">Registro de quem entrou em qual empresa.</p>
          </div>
        </div>
        {logs.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">Nenhum acesso registrado ainda.</p>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {logs.map(l => (
              <li key={l.id} className="flex items-center justify-between py-3 text-sm">
                <span className="truncate">{orgName(l.org_id)}</span>
                <span className="text-xs text-[var(--text-muted)] shrink-0 ml-3">{fmt(l.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};

export default ConsultoriaView;
