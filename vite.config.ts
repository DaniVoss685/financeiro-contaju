import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv, Plugin } from 'vite';

function devApiServerlessPlugin(): Plugin {
  return {
    name: 'dev-api-serverless',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url) return next();
        const url = new URL(req.url, 'http://localhost:3000');

        // Decorador de resposta compatível com Vercel Serverless
        const decorateRes = (targetRes: any) => {
          if (!targetRes.status) {
            targetRes.status = function(code: number) {
              this.statusCode = code;
              return this;
            };
          }
          if (!targetRes.json) {
            targetRes.json = function(data: any) {
              this.setHeader('Content-Type', 'application/json');
              this.end(JSON.stringify(data));
              return this;
            };
          }
        };

        if (url.pathname === '/api/ai-models') {
          try {
            decorateRes(res);
            const mod = await import('./api/ai-models.js');
            const query: Record<string, string> = {};
            url.searchParams.forEach((v, k) => { query[k] = v; });
            (req as any).query = query;
            return await mod.default(req, res);
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message }));
            return;
          }
        }

        if (url.pathname === '/api/agents') {
          try {
            decorateRes(res);
            const buffers: Buffer[] = [];
            for await (const chunk of req) {
              buffers.push(chunk);
            }
            const rawBody = Buffer.concat(buffers).toString();
            try {
              (req as any).body = rawBody ? JSON.parse(rawBody) : {};
            } catch {
              (req as any).body = {};
            }
            const mod = await import('./api/agents.js');
            return await mod.default(req, res);
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message }));
            return;
          }
        }

        if (url.pathname === '/api/send-approval' || url.pathname === '/api/send-email') {
          try {
            decorateRes(res);
            const buffers: Buffer[] = [];
            for await (const chunk of req) {
              buffers.push(chunk);
            }
            const rawBody = Buffer.concat(buffers).toString();
            try {
              (req as any).body = rawBody ? JSON.parse(rawBody) : {};
            } catch {
              (req as any).body = {};
            }
            const mod = await import('./api/send-approval.js');
            return await mod.default(req, res);
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message }));
            return;
          }
        }

        const rotaServidor: Record<string, string> = { '/api/nfse': './api/nfse.js', '/api/asaas': './api/asaas.js', '/api/asaas-webhook': './api/asaas-webhook.js', '/api/asaas-cron': './api/asaas-cron.js' };
        if (rotaServidor[url.pathname]) {
          try {
            decorateRes(res);
            // As funções de servidor leem process.env; no ambiente local os valores vêm do .env / .env.local
            const localEnv = loadEnv('development', process.cwd(), '');
            for (const k of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'NFSE_CERT_SECRET', 'NFSE_SIGN_ALG', 'ASAAS_KEY_SECRET', 'APP_BASE_URL', 'CRON_SECRET', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
              if (!process.env[k] && localEnv[k]) process.env[k] = localEnv[k];
            }
            const buffers: Buffer[] = [];
            for await (const chunk of req) {
              buffers.push(chunk);
            }
            const rawBody = Buffer.concat(buffers).toString();
            try {
              (req as any).body = rawBody ? JSON.parse(rawBody) : {};
            } catch {
              (req as any).body = {};
            }
            const consulta: Record<string, string> = {};
            url.searchParams.forEach((v, k) => { consulta[k] = v; });
            (req as any).query = consulta;
            const mod = await import(/* @vite-ignore */ rotaServidor[url.pathname]);
            return await mod.default(req, res);
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message }));
            return;
          }
        }

        next();
      });
    }
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), devApiServerlessPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: true as const,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

