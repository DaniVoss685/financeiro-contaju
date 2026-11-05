import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Lock, 
  Mail, 
  ArrowRight, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  AlertCircle, 
  Sun, 
  Moon, 
  CheckCircle2, 
  UserCheck, 
  Briefcase, 
  UserPlus, 
  Clock, 
  Send,
  Sparkles,
  KeyRound,
  RotateCw,
  ArrowLeft,
  ShieldAlert,
  X,
  UserX
} from 'lucide-react';
import { storage } from '../../services/storageService';
import { signInWithPassword, signUp, requestPasswordReset, updatePassword, onPasswordRecovery } from '../../services/authService';
import { User, UserRole } from '../../types';
import { PremiumSelect } from '../Common/PremiumSelect';
import { GoldenLionLogo } from '../Common/GoldenLionLogo';
import { IconTile, IconBadge } from '../Common/ui';
import { TWallet, TBank, TChart, TFile } from '../Common/tileIcons';

interface LoginViewProps {
  onLoginSuccess: (user: User) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [authMode, setAuthMode] = useState<
    'LOGIN' | 'REGISTER' | 'TWO_FACTOR' | 'FORGOT_PASSWORD_REQUEST' | 'FORGOT_PASSWORD_VERIFY'
  >('LOGIN');
  const [users, setUsers] = useState<User[]>(storage.getUsers());

  // Campos de Login
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Campos de 2FA
  const [twoFactorUserId, setTwoFactorUserId] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  // Campos de Recuperação de Senha
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Campos de Cadastro
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regRole, setRegRole] = useState<UserRole>('OPERADOR');

  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>(storage.getTheme());

  // Contador regressivo para reenvio de código
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Verificar se há link de aprovação direta vindo do e-mail (?approve_user=ID)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const approveUserId: string | null = null;
      if (approveUserId) {
        const result = storage.approveUser(approveUserId, 'Administrador (via E-mail)');
        if (result.success && result.user) {
          setSuccessNotice(`🎉 Sucesso! O usuário "${result.user.name}" foi aprovado pelo administrador e agora possui acesso liberado ao sistema.`);
          setUsers(storage.getUsers());
          setEmail(result.user.email);
        }
        // Limpar query param sem recarregar
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch {
      // ignore
    }
  }, []);

  // Hidratação em tempo real dos usuários vindos do banco de dados Supabase
  useEffect(() => {
    storage.initializeDatabaseFirst().then(() => {
      setUsers(storage.getUsers());
    });

    const unsubscribe = storage.subscribe(() => {
      setUsers(storage.getUsers());
    });
    return unsubscribe;
  }, []);

  // Ao abrir o link de recuperação enviado por e-mail, mostra a tela de nova senha
  const [recovering, setRecovering] = useState(false);
  useEffect(() => onPasswordRecovery(() => setRecovering(true)), []);
  const handleNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (newPassword.length < 8) {
      setErrorMessage('A nova senha precisa de pelo menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setErrorMessage('As senhas não conferem.');
      return;
    }
    setIsLoading(true);
    const res = await updatePassword(newPassword);
    setIsLoading(false);
    if (res.success) {
      setRecovering(false);
      setSuccessNotice('Senha alterada. Entre com a nova senha.');
      setNewPassword('');
      setConfirmNewPassword('');
    } else {
      setErrorMessage(res.error || 'Não foi possível alterar a senha.');
    }
  };

  const handleToggleTheme = () => {
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    storage.setTheme(nextTheme);
    setCurrentTheme(nextTheme);
    document.documentElement.classList.toggle('light', nextTheme === 'light');
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessNotice(null);

    if (!email.trim()) {
      setErrorMessage('Informe seu e-mail.');
      return;
    }

    setIsLoading(true);

    try {
      const result = await signInWithPassword(email, password);
      setIsLoading(false);

      if (result.success && result.user) {
        onLoginSuccess(result.user);
      } else {
        setErrorMessage(result.error || 'Credenciais inválidas. Verifique seu e-mail e senha.');
      }
    } catch {
      setIsLoading(false);
      setErrorMessage('Erro ao tentar autenticar. Tente novamente.');
    }
  };

  const handleTwoFactorSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFactorUserId) return;

    setErrorMessage(null);
    setIsLoading(true);

    setTimeout(() => {
      const result = storage.verifyTwoFactorAndLogin(twoFactorUserId, twoFactorCode);
      setIsLoading(false);

      if (result.success && result.user) {
        onLoginSuccess(result.user);
      } else {
        setErrorMessage(result.error || 'Código de verificação incorreto ou expirado.');
      }
    }, 300);
  };

  const handleResendTwoFactor = async () => {
    if (!twoFactorUserId || resendCooldown > 0) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await storage.resendTwoFactorCode(twoFactorUserId);
      setIsLoading(false);
      if (res.success) {
        setResendCooldown(60);
        setSuccessNotice('Novo código de verificação 2FA enviado para o seu e-mail!');
      } else {
        setErrorMessage(res.error || 'Erro ao reenviar código.');
      }
    } catch {
      setIsLoading(false);
      setErrorMessage('Falha ao reenviar código 2FA.');
    }
  };

  const handleRequestPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessNotice(null);

    if (!resetEmail.trim()) {
      setErrorMessage('Informe seu e-mail corporativo cadastrado.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await requestPasswordReset(resetEmail.trim());
      setIsLoading(false);

      if (res.success) {
        setAuthMode('LOGIN');
        setSuccessNotice('Enviamos um link para o seu e-mail. Abra o link para criar a nova senha.');
      } else {
        setErrorMessage(res.error || 'Não foi possível solicitar redefinição para este e-mail.');
      }
    } catch {
      setIsLoading(false);
      setErrorMessage('Erro ao solicitar código de recuperação.');
    }
  };

  const handleResetPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessNotice(null);

    if (!resetCode.trim()) {
      setErrorMessage('Informe o código de 6 dígitos recebido por e-mail.');
      return;
    }
    if (newPassword.length < 6) {
      setErrorMessage('A nova senha deve possuir pelo menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setErrorMessage('As senhas digitadas não conferem.');
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      const res = storage.resetPasswordWithCode(resetEmail, resetCode, newPassword);
      setIsLoading(false);

      if (res.success) {
        setUsers(storage.getUsers());
        setEmail(resetEmail);
        setPassword('');
        setAuthMode('LOGIN');
        setSuccessNotice('Sua senha foi redefinida com sucesso! Você já pode entrar com sua nova senha.');
      } else {
        setErrorMessage(res.error || 'Falha ao redefinir a senha.');
      }
    }, 400);
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessNotice(null);

    if (!regName.trim()) {
      setErrorMessage('Por favor, preencha seu nome completo.');
      return;
    }
    if (!regEmail.trim()) {
      setErrorMessage('Por favor, preencha seu e-mail.');
      return;
    }
    if (regPassword.length < 6) {
      setErrorMessage('A senha deve possuir no mínimo 6 caracteres.');
      return;
    }

    setIsLoading(true);

    try {
      const result: any = await signUp(regName, regEmail, regPassword);
      setIsLoading(false);

      if (result.success && result.user) {
        onLoginSuccess(result.user);
        return;
      }
      if (result.success && result.needsConfirmation) {
        setSuccessNotice('Cadastro recebido. Se a consultoria autorizou este e-mail, entre com seu e-mail e senha.');
        // Limpar formulário de cadastro e voltar para aba de login
        setRegName('');
        setRegEmail('');
        setRegPassword('');
        setRegConfirmPassword('');
        setEmail(regEmail);
        setAuthMode('LOGIN');
      } else {
        setErrorMessage(result.error || 'Não foi possível criar a conta.');
      }
    } catch {
      setIsLoading(false);
      setErrorMessage('Ocorreu um erro ao processar sua solicitação. Tente novamente.');
    }
  };

  const handleSelectQuickUser = (user: User) => {
    setEmail(user.email);
    setPassword(user.password || '');
    setErrorMessage(null);
    setSuccessNotice(null);
  };

  const handleDirectQuickLogin = async (user: User) => {
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessNotice(null);
    try {
      const result = await storage.login(user.email, user.password || '');
      setIsLoading(false);
      if (result.requiresTwoFactor && result.twoFactorUserId) {
        setTwoFactorUserId(result.twoFactorUserId);
        setMaskedEmail(result.maskedEmail || user.email);
        setTwoFactorCode('');
        setResendCooldown(60);
        setAuthMode('TWO_FACTOR');
        setSuccessNotice('Este usuário possui 2FA ativado. Digite o código de 6 dígitos enviado para o e-mail corporativo.');
        return;
      }
      if (result.success && result.user) {
        onLoginSuccess(result.user);
      } else {
        setErrorMessage(result.error || 'Erro ao realizar login.');
      }
    } catch {
      setIsLoading(false);
      setErrorMessage('Erro ao realizar login.');
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return {
          label: '👑 Gestor Geral (Acesso Total)',
          badgeClass: 'bg-amber-500/25 text-amber-900 dark:text-amber-300 border border-amber-500/60 font-black shadow-xs'
        };
      case 'ADMIN':
        return {
          label: 'Administrador Geral',
          badgeClass: 'bg-amber-500/15 text-amber-500 border border-amber-500/30 font-semibold'
        };
      case 'GESTOR_FINANCEIRO':
        return {
          label: 'Gestora Financeira',
          badgeClass: 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 font-semibold'
        };
      case 'OPERADOR':
        return {
          label: 'Operador Financeiro',
          badgeClass: 'bg-blue-500/15 text-blue-500 border border-blue-500/30 font-semibold'
        };
      case 'CONSULTA':
        return {
          label: 'Apenas Consulta',
          badgeClass: 'bg-slate-500/15 text-slate-400 border border-slate-500/30 font-semibold'
        };
    }
  };

  const [rememberedUsers, setRememberedUsers] = useState<User[]>(() => storage.getRememberedUsers());

  const handleForgetQuickUser = (e: React.MouseEvent, userId: string) => {
    e.stopPropagation();
    storage.forgetUser(userId);
    setRememberedUsers(storage.getRememberedUsers());
  };

  const pendingUsers = users.filter(u => u.status === 'PENDENTE');

  return (
    <div className="min-h-screen w-full bg-[var(--surface-canvas)] flex flex-col justify-between text-[var(--text-primary)] transition-colors duration-200">
      
      {/* Barra superior: marca e tema */}
      <header className="w-full max-w-7xl mx-auto px-6 py-5 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <GoldenLionLogo size="md" />
          <span className="leading-tight">
            <span className="block text-[17px] font-semibold tracking-tight">ContaJu</span>
            <span className="block text-xs text-[var(--text-muted)]">Gestão financeira</span>
          </span>
        </div>

        <button
          onClick={handleToggleTheme}
          type="button"
          title={`Alternar para o modo ${currentTheme === 'dark' ? 'claro' : 'escuro'}`}
          className="h-10 flex items-center gap-2 px-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-sm cursor-pointer"
        >
          {currentTheme === 'dark' ? (
            <>
              <Sun className="w-4 h-4" strokeWidth={1.75} />
              <span>Modo claro</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4" strokeWidth={1.75} />
              <span>Modo escuro</span>
            </>
          )}
        </button>
      </header>

      {/* Conteúdo Central */}
      <main className="login-main w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] gap-8 xl:gap-16 items-center my-auto">

        {/* Painel de marca (somente telas grandes) */}
        <section className="hidden lg:flex flex-col justify-between gap-12 relative overflow-hidden rounded-3xl border border-[var(--gold-edge)] hero-glow bg-[var(--surface-card)] p-10 xl:p-12 min-h-[520px]">
          <div>
            <IconTile className="w-14 h-14 rounded-2xl [&>svg]:w-7 [&>svg]:h-7"><TWallet /></IconTile>
            <h2 className="mt-10 text-[34px] leading-[42px] xl:text-[40px] xl:leading-[48px] font-semibold tracking-tight max-w-lg">
              Tesouraria, contratos e resultado num só lugar.
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-[var(--text-secondary)] max-w-md">
              Acompanhe contas a receber e a pagar, concilie o extrato do banco e veja o DRE por competência e por caixa.
            </p>
          </div>

          <ul className="space-y-5">
            <li className="flex items-center gap-4">
              <IconBadge tone="success"><TBank /></IconBadge>
              <span className="text-sm text-[var(--text-secondary)]">Conciliação bancária com sugestões automáticas</span>
            </li>
            <li className="flex items-center gap-4">
              <IconBadge tone="gold"><TChart /></IconBadge>
              <span className="text-sm text-[var(--text-secondary)]">DRE gerencial e fluxo de caixa em tempo real</span>
            </li>
            <li className="flex items-center gap-4">
              <IconBadge tone="info"><TFile /></IconBadge>
              <span className="text-sm text-[var(--text-secondary)]">Contratos recorrentes e faturamento em lote</span>
            </li>
          </ul>
        </section>

        <div className="w-full max-w-lg mx-auto space-y-5">

        
        {/* Formulário Principal: Login ou Cadastro */}
        <div className="elevate hero-glow w-full bg-[var(--surface-card)] p-6 sm:p-8 rounded-3xl border border-[var(--border-subtle)] flex flex-col justify-between">
          <div>
            
            {/* Alternador de Abas ou Botão Voltar */}
            {authMode === 'LOGIN' || authMode === 'REGISTER' ? (
              <div className="flex p-1 bg-[var(--surface-elevated)] rounded-2xl border border-[var(--border-subtle)] mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('LOGIN');
                    setErrorMessage(null);
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    authMode === 'LOGIN'
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Entrar na Conta
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('REGISTER');
                    setErrorMessage(null);
                    setSuccessNotice(null);
                  }}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    authMode === 'REGISTER'
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  Criar conta
                </button>
              </div>
            ) : (
              <div className="mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('LOGIN');
                    setErrorMessage(null);
                    setSuccessNotice(null);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-amber-500 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Voltar para o Login</span>
                </button>
              </div>
            )}

            {/* Cabeçalho do Card */}
            <div className="mb-5">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 mb-2.5">
                {authMode === 'LOGIN' && <ShieldCheck className="w-3.5 h-3.5" />}
                {authMode === 'REGISTER' && <UserPlus className="w-3.5 h-3.5" />}
                {authMode === 'TWO_FACTOR' && <ShieldAlert className="w-3.5 h-3.5 text-emerald-500" />}
                {authMode === 'FORGOT_PASSWORD_REQUEST' && <KeyRound className="w-3.5 h-3.5 text-amber-500" />}
                {authMode === 'FORGOT_PASSWORD_VERIFY' && <KeyRound className="w-3.5 h-3.5 text-amber-500" />}
                
                {authMode === 'LOGIN' && 'Acesso seguro'}
                {authMode === 'REGISTER' && 'Novo cadastro'}
                {authMode === 'TWO_FACTOR' && 'Autenticação em Duas Etapas'}
                {authMode === 'FORGOT_PASSWORD_REQUEST' && 'Recuperação de Credencial'}
                {authMode === 'FORGOT_PASSWORD_VERIFY' && 'Redefinição de Senha'}
              </span>
              <h1 className="text-2xl font-black text-[var(--text-primary)] tracking-tight">
                {authMode === 'LOGIN' && 'Entrar'}
                {authMode === 'REGISTER' && 'Criar cadastro'}
                {authMode === 'TWO_FACTOR' && 'Código de Verificação (2FA)'}
                {authMode === 'FORGOT_PASSWORD_REQUEST' && 'Esqueceu sua Senha?'}
                {authMode === 'FORGOT_PASSWORD_VERIFY' && 'Criar Nova Senha'}
              </h1>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                {authMode === 'LOGIN' && 'Use seu e-mail e senha.'}
                {authMode === 'REGISTER' && 'Informe seu nome, e-mail e senha.'}
                {authMode === 'TWO_FACTOR' && `Digite o código de 6 dígitos enviado para ${maskedEmail}.`}
                {authMode === 'FORGOT_PASSWORD_REQUEST' && 'Informe o seu e-mail corporativo cadastrado para receber o código de recuperação.'}
                {authMode === 'FORGOT_PASSWORD_VERIFY' && 'Informe o código de 6 dígitos enviado para o seu e-mail e digite sua nova senha.'}
              </p>
            </div>

            {/* Banner de Sucesso */}
            {successNotice && (
              <div className="mb-5 p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-start gap-3 text-emerald-600 dark:text-emerald-300 text-xs animate-in fade-in">
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-[var(--text-primary)]">Informação</p>
                  <p className="text-[11px] leading-relaxed text-slate-300">{successNotice}</p>
                </div>
              </div>
            )}

            {/* Banner de Erro */}
            {errorMessage && (
              <div className="mb-5 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-start gap-2.5 text-rose-500 dark:text-rose-400 text-xs animate-shake">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorMessage}</span>
              </div>
            )}

            {recovering && (
              <form onSubmit={handleNewPassword} className="space-y-4 mb-2">
                <h3 className="text-[15px] font-semibold">Crie sua nova senha</h3>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Nova senha" className="w-full h-11 px-4 rounded-xl border border-[var(--border-subtle)] text-sm" />
                <input type="password" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} placeholder="Repita a nova senha" className="w-full h-11 px-4 rounded-xl border border-[var(--border-subtle)] text-sm" />
                <button type="submit" disabled={isLoading} className="w-full h-12 rounded-xl bg-amber-500 text-slate-950 font-semibold text-sm disabled:opacity-50">Salvar nova senha</button>
              </form>
            )}

            {/* Formulário: LOGIN */}
            {!recovering && authMode === 'LOGIN' && (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider mb-1.5">
                    E-mail
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--text-secondary)]">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full pl-10 pr-4 h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-sm transition-all font-medium"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
                      Senha
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setResetEmail(email);
                        setErrorMessage(null);
                        setSuccessNotice(null);
                        setAuthMode('FORGOT_PASSWORD_REQUEST');
                      }}
                      className="text-[11px] text-amber-500 hover:text-amber-400 font-bold hover:underline cursor-pointer"
                    >
                      Esqueceu a senha?
                    </button>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--text-secondary)]">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full pl-10 pr-10 h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-sm transition-all font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full mt-2 h-12 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      Validando Acesso...
                    </span>
                  ) : (
                    <>
                      <span>Entrar no Sistema</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* Formulário: TWO_FACTOR (2FA) */}
            {authMode === 'TWO_FACTOR' && (
              <form onSubmit={handleTwoFactorSubmit} className="space-y-4 animate-in fade-in">
                <div className="p-4 rounded-2xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] text-center space-y-2">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 flex items-center justify-center">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-[var(--text-primary)]">Verificação de Segurança 2FA</h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      Enviamos um código de 6 dígitos para o e-mail:
                    </p>
                    <p className="font-mono text-xs font-bold text-emerald-500 mt-1">
                      {maskedEmail}
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider text-center mb-2">
                    Digite o Código de 6 Dígitos
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    autoFocus
                    required
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="w-full text-center py-3 text-2xl tracking-[12px] font-mono font-black rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/30 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                  />
                  <span className="text-[10px] text-center block text-[var(--text-secondary)] mt-1.5">
                    O código expira em 10 minutos.
                  </span>
                </div>

                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={handleResendTwoFactor}
                    disabled={isLoading || resendCooldown > 0}
                    className="flex-1 py-2.5 px-3 rounded-xl border border-[var(--border-subtle)] hover:bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>{resendCooldown > 0 ? `Reenviar (${resendCooldown}s)` : 'Reenviar Código'}</span>
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading || twoFactorCode.length < 6}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black uppercase tracking-wider transition-all shadow-md cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    {isLoading ? 'Verificando...' : 'Confirmar'}
                  </button>
                </div>
              </form>
            )}

            {/* Formulário: FORGOT_PASSWORD_REQUEST (Digitar e-mail) */}
            {authMode === 'FORGOT_PASSWORD_REQUEST' && (
              <form onSubmit={handleRequestPasswordReset} className="space-y-4 animate-in fade-in">
                <div>
                  <label className="block text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider mb-1.5">
                    Seu E-mail Corporativo
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[var(--text-secondary)]">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="seu.email@contaju.com.br"
                      required
                      autoFocus
                      className="w-full pl-10 pr-4 h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-sm transition-all font-medium"
                    />
                  </div>
                  <span className="text-[10px] text-[var(--text-secondary)] block mt-1">
                    Enviaremos um código de verificação para este e-mail via API Resend.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      Enviando Código...
                    </span>
                  ) : (
                    <>
                      <span>Enviar Código por E-mail</span>
                      <Send className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}

            {/* Formulário: FORGOT_PASSWORD_VERIFY (Validar código e nova senha) */}
            {authMode === 'FORGOT_PASSWORD_VERIFY' && (
              <form onSubmit={handleResetPasswordSubmit} className="space-y-3.5 animate-in fade-in">
                <div>
                  <label className="block text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider mb-1">
                    Código de 6 Dígitos do E-mail *
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    required
                    autoFocus
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="Ex: 482910"
                    className="w-full text-center py-2.5 text-xl tracking-[8px] font-mono font-bold rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/40 focus:outline-none focus:border-amber-500 text-xs transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider mb-1">
                    Nova Senha *
                  </label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:outline-none focus:border-amber-500 text-sm transition-all font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider mb-1">
                    Confirmar Nova Senha *
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Repita a nova senha"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]/50 focus:outline-none focus:border-amber-500 text-sm transition-all font-medium"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full mt-2 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isLoading ? 'Redefinindo...' : 'Salvar Nova Senha e Entrar'}
                </button>
              </form>
            )}

            {/* Formulário: CRIAR CADASTRO */}
            {!recovering && authMode === 'REGISTER' && (
              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider mb-1.5">Nome completo</label>
                  <input type="text" required autoComplete="name" value={regName} onChange={(e) => setRegName(e.target.value)} className="w-full h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)] focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-sm transition-all font-medium px-4" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider mb-1.5">E-mail</label>
                  <input type="email" required autoComplete="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} className="w-full h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)] focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-sm transition-all font-medium px-4" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider mb-1.5">Senha</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} required autoComplete="new-password" value={regPassword} onChange={(e) => setRegPassword(e.target.value)} className="w-full h-11 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-elevated)] text-[var(--text-primary)] focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 text-sm transition-all font-medium pl-4 pr-11" />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full mt-2 h-12 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isLoading ? (
                    <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span>Criar cadastro</span>
                  )}
                </button>
              </form>
            )}

          </div>

        </div>
        </div>
      </main>

      {/* Rodapé */}
      <footer className="w-full max-w-7xl mx-auto px-6 py-4 text-center text-xs text-[var(--text-secondary)] border-t border-[var(--border-subtle)]">
        <p>
          Contaju Contabilidade & Gestão © {new Date().getFullYear()} — Sistema Financeiro Corporativo.
        </p>
      </footer>

    </div>
  );
};
