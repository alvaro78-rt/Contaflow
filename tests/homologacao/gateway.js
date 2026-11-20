import { registerHooks } from 'node:module';
import { attendance, fixture } from '../fixture.js';
import { openFixtureDatabase } from './sqlite-sdk.js';

export const fakeAccounts = {
  master: '52998224725',
  rh: '15350946056',
  worker: '11144477735',
};
export const fakePassword = 'contaflow-somente-homologacao';

const names = [
  'authCpf', 'companyDashboard', 'createCompany', 'createEmployeeAccess', 'employeeCatalog',
  'employeePortal', 'enterCompany', 'listCompanies', 'listEmployees', 'manageCompany', 'payrollService', 'rhService',
];

export async function createGateway(path) {
  const hook = registerHooks({
    resolve(specifier, context, next) {
      if (specifier === 'npm:@base44/sdk@0.8.54') {
        return next(new URL('./sqlite-sdk.js', import.meta.url).href, context);
      }
      const hashesPrefix = 'npm:@noble/hashes@2.2.0/';
      if (specifier.startsWith(hashesPrefix)) {
        return next('@noble/hashes/' + specifier.slice(hashesPrefix.length), context);
      }
      return next(specifier, context);
    },
  });

  let handlers;
  let newPasswordHash;
  try {
    handlers = new Map(await Promise.all(names.map(async (name) => [
      name, (await import('../../base44/functions/' + name + '/entry.ts')).default,
    ])));
    ({ newPasswordHash } = await import('../../base44/shared/passwords.ts'));
  } finally {
    hook.deregister();
  }

  const records = fixture();
  records.AuthSession = [];
  records.Company[0].name = 'Empresa Fictícia A';
  records.Company[1].name = 'Empresa Fictícia B';
  const password_hash = await newPasswordHash(fakePassword);
  records.Employee.push({ id: 'master', full_name: 'Mestre de teste', access_role: 'master', status: 'ativo' });
  for (const employee of records.Employee) {
    if (Object.hasOwn(fakeAccounts, employee.id)) {
      Object.assign(employee, { cpf: fakeAccounts[employee.id], password_hash, dependents: [] });
    }
  }
  Object.assign(records, { MasterRecovery: [], User: [] });
  attendance(records);
  const db = openFixtureDatabase(path, records);

  return {
    close: () => db.close(),
    invoke(name, request) {
      return handlers.get(name)?.(request) ?? Response.json({ error: 'funcao_indisponivel' }, { status: 404 });
    },
  };
}
