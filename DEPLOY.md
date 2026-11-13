# 🚀 GUIA DE DEPLOY: SISTEMA FINANCEIRO CONTAJU

Este documento orienta o processo de deploy em produção do **Financeiro Contaju** em plataformas modernas de hospedagem estática e serverless (Vercel, Netlify, Cloudflare Pages ou Servidor Próprio).

---

## 1. PREPARAÇÃO DO BUILD DE PRODUÇÃO

O sistema utiliza **Vite + React + TypeScript + Tailwind CSS**.

Para gerar os artefatos otimizados de produção:
```bash
npm run build
```
Os arquivos prontos para entrega serão gerados na pasta `./dist`.

---

## 2. OPÇÃO RECOMENDADA: DEPLOY NA VERCEL

O projeto já inclui o arquivo [`vercel.json`](file:///Users/leonardoricardoarantes/.gemini/antigravity/scratch/financeiro-contaju/vercel.json) com reescrita SPA configurada.

### Via Vercel CLI:
```bash
# 1. Instalar a CLI (caso não tenha)
npm i -g vercel

# 2. Executar o deploy
vercel --prod
```

### Via Painel Web da Vercel:
1. Conecte seu repositório GitHub (`financeiro-contaju`).
2. Framework Preset: **Vite**.
3. Build Command: `npm run build`.
4. Output Directory: `dist`.
5. Em **Environment Variables**, adicione:
   - `VITE_SUPABASE_URL`: sua URL do projeto Supabase
   - `VITE_SUPABASE_ANON_KEY`: sua chave pública anônima do Supabase

---

## 3. OPÇÃO ALTERNATIVA: DEPLOY NO NETLIFY

O projeto já inclui o arquivo [`public/_redirects`](file:///Users/leonardoricardoarantes/.gemini/antigravity/scratch/financeiro-contaju/public/_redirects) para evitar erros 404 em rotas SPA.

### Via Netlify CLI:
```bash
# 1. Instalar a CLI
npm i -g netlify-cli

# 2. Deploy da pasta dist
netlify deploy --prod --dir=dist
```

---

## 4. OPÇÃO: DOCKER / NGINX (SERVIDOR PRÓPRIO)

Para rodar em VPS com Nginx ou Docker:

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY <<EOF /etc/nginx/conf.d/default.conf
server {
    listen 80;
    location / {
        root /usr/share/nginx/html;
        index index.html index.htm;
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

---

## 5. VARIÁVEIS DE AMBIENTE REQUERIDAS

| Variável | Descrição | Exemplo |
| :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | Endpoint da API do Supabase | `https://klqrydjoyxmxkshtyogp.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Chave pública anônima | `eyJhbGciOiJIUzI1Ni...` |

*(O aplicativo possui fallback gracioso e funciona offline via LocalStorage mesmo se o banco estiver temporariamente indisponível).*

---

## 6. COBRANÇA PELO ASAAS (boleto e Pix dos honorários)

Servidor (Vercel `/api`): `asaas.js` (telas), `asaas-webhook.js` (avisos de pagamento), `asaas-cron.js` (robô diário, 07:00 de Brasília, ver `crons` em `vercel.json`).
Banco: `supabase/migrations/20261113180000_cobranca_asaas.sql` (aditiva; o robô nasce **desligado** e o ambiente padrão é **testes**).

| Variável (somente servidor) | Para quê |
| :--- | :--- |
| `SUPABASE_SERVICE_ROLE_KEY` | Já usada pela NFS-e. |
| `NFSE_CERT_SECRET` (ou `ASAAS_KEY_SECRET`) | Segredo de 32+ caracteres que cifra a chave do Asaas de cada empresa. |
| `CRON_SECRET` | Segredo de 16+ caracteres; a Vercel o envia ao rodar o robô. Sem ele o robô não roda. |
| `APP_BASE_URL` (opcional) | Endereço público do site, usado para cadastrar o webhook no Asaas. |

A chave do Asaas de cada empresa **não** é variável de ambiente: é informada na tela *Cobranças > Configurar* e fica cifrada no banco.
O servidor nunca dá baixa em título; a baixa é feita pelo próprio sistema, no navegador, assim que há alguém com o Financeiro aberto.
