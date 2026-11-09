export interface ApprovalNotificationParams {
  userId: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

const ADMIN_EMAIL = 'leonardoricardoarantes@gmail.com';

export const resendService = {
  getApiKey(): string {
    if (typeof window !== 'undefined') {
      const savedKey = localStorage.getItem('contaju_resend_api_key');
      if (savedKey) return savedKey;
    }
    return '';
  },

  setApiKey(key: string) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('contaju_resend_api_key', key.trim());
    }
  },

  getAdminEmail(): string {
    if (typeof window !== 'undefined') {
      const savedEmail = localStorage.getItem('contaju_admin_approval_email');
      if (savedEmail) return savedEmail;
    }
    return ADMIN_EMAIL;
  },

  async sendViaDirectResendApi(
    apiKey: string,
    to: string | string[],
    subject: string,
    html: string,
    attachments?: Array<{ filename: string; content: string }>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const payload: any = {
        from: 'Contaju Sistema <onboarding@resend.dev>',
        to: Array.isArray(to) ? to : [to],
        subject,
        html
      };
      if (attachments && attachments.length > 0) {
        payload.attachments = attachments;
      }
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        return { success: true };
      }
      return { success: false, error: data.message || `Erro Resend: ${response.status}` };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Falha de conexão com a API do Resend' };
    }
  },

  async sendEmail(
    to: string | string[], 
    subject: string, 
    html: string, 
    attachments?: Array<{ filename: string; content: string }>
  ): Promise<{ success: boolean; error?: string }> {
    const userCustomApiKey = this.getApiKey();
    const envApiKey = (
      (typeof process !== 'undefined' ? process.env?.RESEND_API_KEY : undefined) ||
      (typeof import.meta !== 'undefined' ? (import.meta as any).env?.VITE_RESEND_API_KEY : undefined)
    );
    const effectiveKey = userCustomApiKey || envApiKey;

    // Em ambiente de navegador, tenta a rota serverless /api/send-approval
    if (typeof window !== 'undefined') {
      try {
        const serverlessRes = await fetch('/api/send-approval', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to,
            subject,
            html,
            attachments,
            apiKey: effectiveKey || undefined
          })
        });

        const resData = await serverlessRes.json().catch(() => ({}));

        if (serverlessRes.ok && (resData.success || resData.id)) {
          return { success: true };
        }
        
        // Se a chamada serverless retornar erro mas temos a chave configurada, tenta envio direto
        if (effectiveKey) {
          return this.sendViaDirectResendApi(effectiveKey, to, subject, html, attachments);
        }

        const errorMessage = resData.error || resData.message || `Status HTTP ${serverlessRes.status}`;
        console.warn('Aviso no envio de e-mail institucional:', errorMessage);
        return { success: false, error: errorMessage };
      } catch (err: any) {
        if (effectiveKey) {
          return this.sendViaDirectResendApi(effectiveKey, to, subject, html, attachments);
        }
        console.warn('Falha na comunicação com o serviço de e-mail:', err?.message || err);
        return { success: false, error: err?.message || 'Serviço de e-mail temporariamente indisponível' };
      }
    } else {
      // Em ambiente Node.js / scripts
      if (effectiveKey) {
        return this.sendViaDirectResendApi(effectiveKey, to, subject, html, attachments);
      }
      return { success: false, error: 'Chave RESEND_API_KEY não configurada no ambiente.' };
    }
  },

  async sendRegistrationApprovalEmail(params: ApprovalNotificationParams): Promise<{ success: boolean; error?: string }> {
    const adminEmail = this.getAdminEmail();
    const appOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://financeiro-contaju.vercel.app';
    const approvalLink = `${appOrigin}/?approve_user=${params.userId}`;

    const emailSubject = `🔔 Nova Solicitação de Cadastro no Contaju: ${params.name}`;
    
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0e14; color: #ffffff; margin: 0; padding: 24px; }
          .card { background-color: #121620; border: 1px solid #242d3d; border-radius: 16px; max-width: 560px; margin: 0 auto; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
          .header { background: linear-gradient(135deg, #19202D 0%, #121620 100%); padding: 24px; border-bottom: 2px solid #d4af37; text-align: center; }
          .logo { font-size: 22px; font-weight: 900; letter-spacing: 2px; color: #d4af37; margin: 0; }
          .sublogo { font-size: 11px; text-transform: uppercase; color: #94a3b8; letter-spacing: 1.5px; margin-top: 4px; }
          .body { padding: 28px; line-height: 1.6; color: #e2e8f0; font-size: 14px; }
          .badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: bold; background-color: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }
          .info-table { width: 100%; border-collapse: collapse; margin: 20px 0; background-color: #19202d; border-radius: 12px; overflow: hidden; }
          .info-table td { padding: 12px 16px; border-bottom: 1px solid #242d3d; font-size: 13px; }
          .info-table tr:last-child td { border-bottom: none; }
          .label { color: #94a3b8; font-weight: 600; width: 35%; }
          .value { color: #ffffff; font-weight: bold; }
          .btn-container { text-align: center; margin: 28px 0 16px 0; }
          .btn-approve { display: inline-block; padding: 14px 32px; background-color: #d4af37; color: #0b0e14; text-decoration: none; border-radius: 12px; font-weight: 900; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; box-shadow: 0 4px 14px rgba(212, 175, 55, 0.4); }
          .footer { padding: 18px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #1e2634; background-color: #0d1118; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <h1 class="logo">CONTAJU</h1>
            <div class="sublogo">Assessoria Contábil & Gestão Financeira</div>
          </div>
          <div class="body">
            <span class="badge">Solicitação Pendente de Aprovação</span>
            <h2 style="color: #ffffff; margin-top: 14px; font-size: 18px;">Novo Usuário Aguarda Liberação</h2>
            <p>Um novo colaborador preencheu o formulário de cadastro no sistema financeiro e aguarda sua autorização prévia para poder acessar o ambiente.</p>
            
            <table class="info-table">
              <tr>
                <td class="label">Nome Completo:</td>
                <td class="value">${params.name}</td>
              </tr>
              <tr>
                <td class="label">E-mail:</td>
                <td class="value">${params.email}</td>
              </tr>
              <tr>
                <td class="label">Perfil Solicitado:</td>
                <td class="value">${params.role}</td>
              </tr>
              <tr>
                <td class="label">Data/Hora:</td>
                <td class="value">${new Date(params.createdAt).toLocaleString('pt-BR')}</td>
              </tr>
              <tr>
                <td class="label">Status Atual:</td>
                <td class="value" style="color: #fbbf24;">PENDENTE DE APROVAÇÃO</td>
              </tr>
            </table>

            <div class="btn-container">
              <a href="${approvalLink}" class="btn-approve" target="_blank">Aprovar Acesso no Contaju</a>
            </div>

            <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 20px;">
              Você também pode aprovar diretamente acessando o menu <strong>Configurações &gt; Usuários e Perfis de Acesso</strong> dentro do sistema.
            </p>
          </div>
          <div class="footer">
            Contaju Contabilidade & Gestão © ${new Date().getFullYear()} • Notificação de Segurança Interna
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail(adminEmail, emailSubject, emailHtml);
  },

  async sendPasswordResetEmail(email: string, name: string, code: string): Promise<{ success: boolean; error?: string }> {
    const emailSubject = `🔐 Código de Recuperação de Senha: ${code}`;
    
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0e14; color: #ffffff; margin: 0; padding: 24px; }
          .card { background-color: #121620; border: 1px solid #242d3d; border-radius: 16px; max-width: 520px; margin: 0 auto; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
          .header { background: linear-gradient(135deg, #19202D 0%, #121620 100%); padding: 24px; border-bottom: 2px solid #d4af37; text-align: center; }
          .logo { font-size: 22px; font-weight: 900; letter-spacing: 2px; color: #d4af37; margin: 0; }
          .sublogo { font-size: 11px; text-transform: uppercase; color: #94a3b8; letter-spacing: 1.5px; margin-top: 4px; }
          .body { padding: 28px; line-height: 1.6; color: #e2e8f0; font-size: 14px; }
          .badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: bold; background-color: rgba(212, 175, 55, 0.15); color: #d4af37; border: 1px solid rgba(212, 175, 55, 0.3); }
          .code-box { background-color: #19202d; border: 2px dashed #d4af37; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
          .otp-code { font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #ffffff; font-family: monospace; }
          .warning { font-size: 12px; color: #94a3b8; background-color: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 8px; padding: 12px; margin-top: 20px; }
          .footer { padding: 18px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #1e2634; background-color: #0d1118; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <h1 class="logo">CONTAJU</h1>
            <div class="sublogo">Assessoria Contábil & Gestão Financeira</div>
          </div>
          <div class="body">
            <span class="badge">Redefinição de Credencial</span>
            <h2 style="color: #ffffff; margin-top: 14px; font-size: 18px;">Olá, ${name}!</h2>
            <p>Recebemos uma solicitação para redefinir a senha da sua conta de acesso ao Sistema Financeiro Contaju.</p>
            
            <p>Utilize o código de verificação abaixo na tela de login para cadastrar sua nova senha:</p>

            <div class="code-box">
              <div style="font-size: 11px; text-transform: uppercase; color: #d4af37; letter-spacing: 2px; font-weight: bold; margin-bottom: 6px;">Código de Verificação</div>
              <div class="otp-code">${code}</div>
              <div style="font-size: 11px; color: #94a3b8; margin-top: 6px;">Válido por 15 minutos</div>
            </div>

            <div class="warning">
              <strong>⚠️ Não foi você quem solicitou?</strong> Se não reconhece esse pedido, nenhuma alteração foi realizada. Você pode ignorar este e-mail com segurança.
            </div>
          </div>
          <div class="footer">
            Contaju Contabilidade & Gestão © ${new Date().getFullYear()} • Mensagem Automática de Segurança
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail(email, emailSubject, emailHtml);
  },

  async sendTwoFactorCodeEmail(email: string, name: string, code: string): Promise<{ success: boolean; error?: string }> {
    const emailSubject = `🛡️ Código 2FA de Acesso ao Contaju: ${code}`;
    
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0e14; color: #ffffff; margin: 0; padding: 24px; }
          .card { background-color: #121620; border: 1px solid #242d3d; border-radius: 16px; max-width: 520px; margin: 0 auto; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
          .header { background: linear-gradient(135deg, #19202D 0%, #121620 100%); padding: 24px; border-bottom: 2px solid #10b981; text-align: center; }
          .logo { font-size: 22px; font-weight: 900; letter-spacing: 2px; color: #10b981; margin: 0; }
          .sublogo { font-size: 11px; text-transform: uppercase; color: #94a3b8; letter-spacing: 1.5px; margin-top: 4px; }
          .body { padding: 28px; line-height: 1.6; color: #e2e8f0; font-size: 14px; }
          .badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: bold; background-color: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); }
          .code-box { background-color: #19202d; border: 2px solid #10b981; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
          .otp-code { font-size: 34px; font-weight: 900; letter-spacing: 8px; color: #ffffff; font-family: monospace; }
          .footer { padding: 18px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #1e2634; background-color: #0d1118; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <h1 class="logo">CONTAJU</h1>
            <div class="sublogo">Autenticação em Duas Etapas (2FA)</div>
          </div>
          <div class="body">
            <span class="badge">Verificação de Identidade</span>
            <h2 style="color: #ffffff; margin-top: 14px; font-size: 18px;">Olá, ${name}!</h2>
            <p>Uma tentativa de acesso à sua conta no Sistema Financeiro Contaju foi identificada. Para confirmar sua identidade, digite o código de 6 dígitos:</p>

            <div class="code-box">
              <div style="font-size: 11px; text-transform: uppercase; color: #10b981; letter-spacing: 2px; font-weight: bold; margin-bottom: 6px;">Código de Autenticação</div>
              <div class="otp-code">${code}</div>
              <div style="font-size: 11px; color: #94a3b8; margin-top: 6px;">Válido por 10 minutos</div>
            </div>

            <p style="font-size: 12px; color: #94a3b8; text-align: center;">
              Se você não está tentando entrar no sistema, altere sua senha imediatamente e contate a gerência da Contaju.
            </p>
          </div>
          <div class="footer">
            Contaju Contabilidade & Gestão © ${new Date().getFullYear()} • Notificação de Segurança 2FA
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail(email, emailSubject, emailHtml);
  },

  async sendContractAdjustmentEmail(params: ContractAdjustmentEmailParams): Promise<{ success: boolean; error?: string }> {
    const emailSubject = `📄 Comunicado de Atualização Contratual: ${params.contractNumber} • ${params.clientName}`;

    const formatCurrency = (val: number) => {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    };

    const formatDate = (isoStr: string) => {
      if (!isoStr) return '';
      const [y, m, d] = isoStr.split('-');
      if (y && m && d) return `${d}/${m}/${y}`;
      return new Date(isoStr).toLocaleDateString('pt-BR');
    };

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0e14; color: #ffffff; margin: 0; padding: 24px; }
          .card { background-color: #121620; border: 1px solid #242d3d; border-radius: 16px; max-width: 580px; margin: 0 auto; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
          .header { background: linear-gradient(135deg, #19202D 0%, #121620 100%); padding: 24px; border-bottom: 2px solid #d4af37; text-align: center; }
          .logo { font-size: 22px; font-weight: 900; letter-spacing: 2px; color: #d4af37; margin: 0; }
          .sublogo { font-size: 11px; text-transform: uppercase; color: #94a3b8; letter-spacing: 1.5px; margin-top: 4px; }
          .body { padding: 28px; line-height: 1.6; color: #e2e8f0; font-size: 14px; }
          .badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: bold; background-color: rgba(212, 175, 55, 0.15); color: #d4af37; border: 1px solid rgba(212, 175, 55, 0.3); }
          .info-table { width: 100%; border-collapse: collapse; margin: 20px 0; background-color: #19202d; border-radius: 12px; overflow: hidden; }
          .info-table td { padding: 12px 16px; border-bottom: 1px solid #242d3d; font-size: 13px; }
          .info-table tr:last-child td { border-bottom: none; }
          .label { color: #94a3b8; font-weight: 600; width: 38%; }
          .value { color: #ffffff; font-weight: bold; }
          .highlight { color: #10b981; font-size: 16px; font-weight: 900; }
          .diff-badge { display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; margin-left: 8px; background-color: rgba(16, 185, 129, 0.2); color: #34d399; }
          .footer { padding: 18px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #1e2634; background-color: #0d1118; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <h1 class="logo">CONTAJU</h1>
            <div class="sublogo">Assessoria Contábil & Gestão Financeira</div>
          </div>
          <div class="body">
            <span class="badge">Atualização Contratual</span>
            <h2 style="color: #ffffff; margin-top: 14px; font-size: 18px;">Prezado(a) ${params.clientName},</h2>
            <p>Informamos que o seu contrato de prestação de serviços teve seu valor mensal atualizado. Abaixo constam os detalhes do reajuste pactuado:</p>
            
            <table class="info-table">
              <tr>
                <td class="label">Identificador do Contrato:</td>
                <td class="value">${params.contractNumber}</td>
              </tr>
              <tr>
                <td class="label">Objeto / Serviço:</td>
                <td class="value">${params.contractDescription}</td>
              </tr>
              <tr>
                <td class="label">Valor Anterior:</td>
                <td class="value" style="color: #94a3b8; text-decoration: line-through;">${formatCurrency(params.previousAmount)}</td>
              </tr>
              <tr>
                <td class="label">Novo Valor Mensal:</td>
                <td class="value">
                  <span class="highlight">${formatCurrency(params.newAmount)}</span>
                  <span class="diff-badge">${params.percentage >= 0 ? `+${params.percentage.toFixed(2)}%` : `${params.percentage.toFixed(2)}%`}</span>
                </td>
              </tr>
              ${params.dueDay ? `
              <tr>
                <td class="label">Dia do Vencimento:</td>
                <td class="value">Todo dia ${params.dueDay} de cada mês</td>
              </tr>` : ''}
              <tr>
                <td class="label">Data de Vigência:</td>
                <td class="value">${formatDate(params.effectiveDate)}</td>
              </tr>
              <tr>
                <td class="label">Motivo do Reajuste:</td>
                <td class="value">${params.reason || 'Reajuste Anual / Atualização Contratual'}</td>
              </tr>
              ${params.notes ? `
              <tr>
                <td class="label">Observações:</td>
                <td class="value" style="font-weight: normal; color: #cbd5e1;">${params.notes}</td>
              </tr>` : ''}
            </table>

            <p style="font-size: 13px; color: #94a3b8; margin-top: 20px;">
              Permanecemos à inteira disposição para esclarecer eventuais dúvidas. Agradecemos pela contínua parceria e confiança em nossos serviços contábeis e financeiros!
            </p>
          </div>
          <div class="footer">
            Contaju Contabilidade & Gestão © ${new Date().getFullYear()} • Departamento Financeiro
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail(params.clientEmail, emailSubject, emailHtml);
  },

  async sendBackupEmail(params: BackupEmailParams): Promise<{ success: boolean; error?: string }> {
    const isAutomatic = params.triggerType !== 'MANUAL';
    const emailSubject = `📦 Backup Semanal Contaju (.JSON): ${params.stats.companyName || 'Base Financeira'} • ${new Date().toLocaleDateString('pt-BR')}`;
    
    // Converte conteúdo JSON para base64 com suporte total a UTF-8 / acentuação
    const base64Content = typeof Buffer !== 'undefined'
      ? Buffer.from(params.backupJsonContent, 'utf-8').toString('base64')
      : btoa(unescape(encodeURIComponent(params.backupJsonContent)));

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0e14; color: #ffffff; margin: 0; padding: 24px; }
          .card { background-color: #121620; border: 1px solid #242d3d; border-radius: 16px; max-width: 600px; margin: 0 auto; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
          .header { background: linear-gradient(135deg, #19202D 0%, #121620 100%); padding: 24px; border-bottom: 2px solid #d4af37; text-align: center; }
          .logo { font-size: 24px; font-weight: 900; letter-spacing: 2px; color: #d4af37; margin: 0; }
          .sublogo { font-size: 11px; text-transform: uppercase; color: #94a3b8; letter-spacing: 1.5px; margin-top: 4px; }
          .body { padding: 28px; line-height: 1.6; color: #e2e8f0; font-size: 14px; }
          .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: bold; background-color: rgba(212, 175, 55, 0.15); color: #fbbf24; border: 1px solid rgba(212, 175, 55, 0.3); }
          .info-table { width: 100%; border-collapse: collapse; margin: 20px 0; background-color: #19202d; border-radius: 12px; overflow: hidden; }
          .info-table td { padding: 12px 16px; border-bottom: 1px solid #242d3d; font-size: 13px; }
          .info-table tr:last-child td { border-bottom: none; }
          .label { color: #94a3b8; font-weight: 600; width: 45%; }
          .value { color: #ffffff; font-weight: bold; }
          .highlight { color: #10b981; font-weight: 900; }
          .warning { font-size: 12px; color: #cbd5e1; background-color: rgba(212, 175, 55, 0.1); border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 10px; padding: 14px; margin-top: 22px; line-height: 1.5; }
          .footer { padding: 18px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid #1e2634; background-color: #0d1118; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <h1 class="logo">CONTAJU</h1>
            <div class="sublogo">Assessoria Contábil & Gestão Financeira</div>
          </div>
          <div class="body">
            <span class="badge">${isAutomatic ? 'Rotina Automática Semanal' : 'Exportação de Backup Sob Demanda'}</span>
            <h2 style="color: #ffffff; margin-top: 14px; font-size: 18px;">Exportação da Base de Dados Concluída</h2>
            <p>
              Segue em anexo o arquivo de segurança em formato <strong>.JSON</strong> contendo o snapshot estruturado e integral da base de dados do sistema Contaju.
            </p>
            
            <table class="info-table">
              <tr>
                <td class="label">Empresa / Razão Social:</td>
                <td class="value">${params.stats.companyName}</td>
              </tr>
              <tr>
                <td class="label">Disponibilidade de Caixa:</td>
                <td class="value highlight">${params.stats.consolidatedBalanceFormatted}</td>
              </tr>
              <tr>
                <td class="label">Títulos Financeiros (Pagar/Receber):</td>
                <td class="value">${params.stats.totalTitles} títulos</td>
              </tr>
              <tr>
                <td class="label">Contratos Ativos e Recorrentes:</td>
                <td class="value">${params.stats.totalContracts} contratos</td>
              </tr>
              <tr>
                <td class="label">Clientes & Fornecedores:</td>
                <td class="value">${params.stats.totalCounterparties} cadastros</td>
              </tr>
              <tr>
                <td class="label">Contas Bancárias:</td>
                <td class="value">${params.stats.totalBankAccounts} contas</td>
              </tr>
              <tr>
                <td class="label">Arquivo Anexo (.JSON):</td>
                <td class="value" style="color: #38bdf8;">${params.backupFilename}</td>
              </tr>
              <tr>
                <td class="label">Data & Hora da Exportação:</td>
                <td class="value">${new Date().toLocaleString('pt-BR')}</td>
              </tr>
            </table>

            <div class="warning">
              <strong>🔒 Procedimento de Restauração:</strong><br/>
              O arquivo <code>${params.backupFilename}</code> anexado a este e-mail pode ser utilizado para restauração total a qualquer momento. Basta acessar o sistema Contaju, navegar até <strong>Configurações &gt; Segurança e Backup</strong> e enviar o arquivo .JSON na área de Restauração.
            </div>
          </div>
          <div class="footer">
            Contaju Contabilidade & Gestão © ${new Date().getFullYear()} • Rotina Automática de Continuidade e Segurança de Dados
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail(params.toEmail, emailSubject, emailHtml, [
      {
        filename: params.backupFilename,
        content: base64Content
      }
    ]);
  }
};

export interface BackupEmailStats {
  totalTitles: number;
  totalContracts: number;
  totalCounterparties: number;
  totalMovements: number;
  totalBankAccounts: number;
  companyName: string;
  consolidatedBalanceFormatted: string;
}

export interface BackupEmailParams {
  toEmail: string | string[];
  backupFilename: string;
  backupJsonContent: string;
  stats: BackupEmailStats;
  triggerType?: 'AUTOMATICO_SEMANAL' | 'MANUAL';
}

export interface ContractAdjustmentEmailParams {
  clientName: string;
  clientEmail: string;
  contractNumber: string;
  contractDescription: string;
  previousAmount: number;
  newAmount: number;
  percentage: number;
  effectiveDate: string;
  dueDay?: number;
  reason?: string;
  notes?: string;
}

