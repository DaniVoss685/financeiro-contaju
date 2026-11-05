// Gera src/styles/neutralize.generated.css a partir das classes realmente usadas no código.
// Uso: node scripts/gen-neutralize-css.mjs src src/styles/neutralize.generated.css
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
const files = [];
(function walk(d){ for (const e of fs.readdirSync(d,{withFileTypes:true})) { const p=path.join(d,e.name); if(e.isDirectory()) walk(p); else if(/\.(tsx|ts)$/.test(e.name)) files.push(p);} })(root);
const text = files.map(f=>fs.readFileSync(f,'utf8')).join('\n');

const NEUTRALIZE = ['emerald','green','amber','yellow','orange']; // tintas decorativas
const tokens = new Set(text.match(/[a-z:\-\[\]#0-9]*(?:bg|border)-(?:emerald|green|amber|yellow|orange)-\d{2,3}(?:\/\[[0-9.]+\]|\/\d{1,3})?/g) || []);

const rules = { bg: [], bgHover: [], border: [], darkBg: [], darkBgHover: [], darkBorder: [], solidGold: [], solidHover: [] };
for (const t of tokens) {
  const m = t.match(/^((?:dark:)?(?:hover:)?)(bg|border)-(emerald|green|amber|yellow|orange)-(\d{2,3})(\/\[[0-9.]+\]|\/\d{1,3})?$/);
  if (!m) continue;
  const [, variant, kind, fam, shade, alpha] = m;
  const sel = `[class~="${t}"]`;
  const dark = variant.startsWith('dark:');
  const hover = variant.endsWith('hover:');
  if (kind === 'bg') {
    if (!alpha && ['50','100','200'].includes(shade)) continue; // já neutros pela paleta
    const isSolid = !alpha && ['500','600','700'].includes(shade) && (fam==='emerald'||fam==='green');
    if (isSolid && !dark && !hover) { rules.solidGold.push(sel); continue; }
    if (isSolid && hover) { rules.solidHover.push(sel); continue; }
    if (!alpha && fam !== 'emerald' && fam !== 'green' && ['400','500','600','700'].includes(shade)) continue; // dourado sólido (botão primário) permanece
    if (!alpha && !['800','900','950'].includes(shade) && !isSolid) continue;
    (dark ? (hover ? rules.darkBgHover : rules.darkBg) : (hover ? rules.bgHover : rules.bg)).push(sel);
  } else {
    (dark ? rules.darkBorder : rules.border).push(sel);
  }
}
const list = a => [...new Set(a)].sort();
const out = [];
out.push('/* GERADO: neutraliza tintas decorativas (verde/dourado) — cor fica no texto e em alertas. */');
const join = (a, pre='') => list(a).map(s => pre+s).join(',\n');
if (rules.bg.length) out.push(`${join(rules.bg)} {\n  background-color: var(--tint-neutral);\n}`);
if (rules.bgHover.length) out.push(`${list(rules.bgHover).map(s=>s+':hover').join(',\n')} {\n  background-color: var(--tint-neutral-hover);\n}`);
if (rules.darkBg.length) out.push(`${join(rules.darkBg,'html.dark ')} {\n  background-color: var(--tint-neutral);\n}`);
if (rules.darkBgHover.length) out.push(`${list(rules.darkBgHover).map(s=>'html.dark '+s+':hover').join(',\n')} {\n  background-color: var(--tint-neutral-hover);\n}`);
if (rules.border.length) out.push(`${join(rules.border)} {\n  border-color: var(--border-subtle);\n}`);
if (rules.darkBorder.length) out.push(`${join(rules.darkBorder,'html.dark ')} {\n  border-color: var(--border-subtle);\n}`);
if (rules.solidGold.length) {
  out.push(`${join(rules.solidGold)} {\n  background-color: var(--brand-gold-fill);\n  border-color: transparent;\n  color: #18181b;\n}`);
  out.push(`${list(rules.solidGold).map(s=>s+', '+s+' *').join(',\n')} {\n  color: #18181b;\n}`);
  out.push(`${list(rules.solidGold).map(s=>s+':hover').join(',\n')} {\n  filter: brightness(1.06);\n}`);
}
if (rules.solidHover.length) out.push(`${list(rules.solidHover).map(s=>s+':hover').join(',\n')} {\n  background-color: var(--brand-gold-fill);\n  filter: brightness(1.06);\n}`);
fs.writeFileSync(process.argv[3], out.join('\n\n') + '\n');
console.log(Object.fromEntries(Object.entries(rules).map(([k,v])=>[k,new Set(v).size])));
