// Checagem não destrutiva: só envia GET aos endpoints de funções.
// HTTP 405 indica que a rota existe e exige POST; não valida a lógica interna.
import { readdir } from 'node:fs/promises';

const appUrl = process.env.BASE44_SITE_URL || 'https://contabilidade-1.base44.app';
const origin = new URL(appUrl);
if (origin.protocol !== 'https:' || !origin.hostname.endsWith('.base44.app')) {
  throw new Error('BASE44_SITE_URL deve ser um endereço HTTPS *.base44.app');
}

const entries = await readdir(new URL('../base44/functions/', import.meta.url), { withFileTypes: true });
const names = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
let missing = 0;
let errors = 0;

for (const name of names) {
  try {
    const url = new URL('/functions/' + encodeURIComponent(name), origin);
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(12000),
    });
    if (response.status === 404) {
      console.log('AUSENTE ' + name + ' (HTTP 404)');
      missing++;
    } else if (response.status === 405) {
      console.log('ROTA OK ' + name + ' (HTTP 405, somente POST)');
    } else {
      console.log('REVISAR ' + name + ' (HTTP ' + response.status + ')');
      errors++;
    }
  } catch (error) {
    console.log('ERRO DE REDE ' + name + ': ' + (error?.message || 'sem resposta'));
    errors++;
  }
}

console.log('\nResultado: ' + (names.length - missing - errors) + '/' + names.length +
  ' endpoints disponíveis; ' + missing + ' ausentes; ' + errors + ' com resposta inconclusiva.');
console.log('Esta checagem NÃO lê funcionários nem confirma as versões ou o funcionamento das funções.');
if (missing || errors) process.exitCode = 1;
