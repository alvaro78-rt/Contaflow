// Backend simulado do ContaFlow, somente em memória.
// Nenhuma chamada sai do navegador: a demonstração não grava nada na base hospedada.
// Os contratos imitam authCpf, createCompany, listCompanies e o painel do dono.

export const DEMO_SEED = {
  master: { name: 'Mestre Demonstração', cpf: '11144477735', password: 'mestre123' },
  companies: [
    {
      name: 'Alfa Contábil (fictícia)',
      owner: { name: 'Dona Alfa', cpf: '39053344705', password: 'alfa123' },
      staff: { ativos: 2, afastados: 1, sem_acesso: 1 },
      payroll: { folhas: 2, finalizadas: 1, proventos: 8200, descontos: 1450, liquido: 6750 },
    },
    {
      name: 'Beta Serviços (fictícia)',
      owner: { name: 'Dono Beta', cpf: '16899535009', password: 'beta123' },
      staff: { ativos: 1, afastados: 0, sem_acesso: 0 },
      payroll: { folhas: 1, finalizadas: 0, proventos: 3100, descontos: 420, liquido: 2680 },
    },
  ],
};

const fail = (status, error) => ({ response: { status, data: { error } } });
const digits = (v) => String(v || '').replace(/\D/g, '');
const competence = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export function createDemoBackend(seed = DEMO_SEED) {
  const db = { companies: [], employees: [], payroll: [], sessions: [] };
  const locks = new Map();
  const faults = { ownerLinkFailures: 0, lostResponses: 0, latencyMs: 6 };
  let seq = 1;
  const nextId = (prefix) => `${prefix}_${String(seq++).padStart(3, '0')}`;
  const hash = (cpf, password) => `demo:${cpf}:${password}`;
  const wait = () => new Promise((resolve) => setTimeout(resolve, faults.latencyMs));
  const shape = (c) => ({ id: c.id, name: c.name, owner_name: c.owner_name, owner_cpf: c.owner_cpf, status: c.status });

  db.employees.push({
    id: nextId('emp'),
    company_id: '',
    full_name: seed.master.name,
    cpf: seed.master.cpf,
    access_role: 'master',
    status: 'ativo',
    password_hash: hash(seed.master.cpf, seed.master.password),
  });

  seed.companies.forEach((c) => {
    const company = { id: nextId('cmp'), name: c.name, owner_name: c.owner.name, owner_cpf: c.owner.cpf, status: 'ativa' };
    db.companies.push(company);
    db.employees.push({
      id: nextId('emp'),
      company_id: company.id,
      full_name: c.owner.name,
      cpf: c.owner.cpf,
      access_role: 'admin',
      status: 'ativo',
      password_hash: hash(c.owner.cpf, c.owner.password),
    });
    for (let i = 0; i < c.staff.ativos; i += 1) {
      db.employees.push({ id: nextId('emp'), company_id: company.id, full_name: `Funcionário ${i + 1}`, cpf: '', access_role: 'funcionario', status: 'ativo', password_hash: '' });
    }
    for (let i = 0; i < c.staff.afastados; i += 1) {
      db.employees.push({ id: nextId('emp'), company_id: company.id, full_name: `Afastado ${i + 1}`, cpf: '', access_role: 'funcionario', status: 'afastado', password_hash: '' });
    }
    for (let i = 0; i < c.staff.sem_acesso; i += 1) {
      db.employees.push({ id: nextId('emp'), company_id: company.id, full_name: `Sem acesso ${i + 1}`, cpf: '', access_role: 'funcionario', status: 'ativo', password_hash: '' });
    }
    db.payroll.push({ company_id: company.id, competence: competence(), ...c.payroll });
  });

  const requireSession = (token) => {
    const value = String(token || '').trim();
    if (!value) throw fail(401, 'sessao_invalida');
    const session = db.sessions.find((s) => s.token === value);
    if (!session) throw fail(401, 'sessao_invalida');
    if (!session.expires_at || new Date(session.expires_at).getTime() <= Date.now()) throw fail(401, 'sessao_expirada');
    const employee = db.employees.find((e) => e.id === session.employee_id);
    if (!employee) throw fail(401, 'sessao_invalida');
    return { session, employee };
  };

  const authCpf = (p) => {
    if (p.action === 'masterExists') {
      return { data: { exists: db.employees.some((e) => e.access_role === 'master') } };
    }
    if (p.action !== 'login') throw fail(400, 'acao_invalida');
    const cpf = digits(p.cpf);
    const employee = db.employees.find((e) => e.cpf === cpf && e.password_hash && e.password_hash === hash(cpf, p.password));
    if (!employee) {
      const exists = db.employees.some((e) => e.cpf === cpf);
      throw fail(401, exists ? 'sem_acesso' : 'credenciais');
    }
    if (employee.status === 'desligado') throw fail(403, 'conta_desligada');
    const company = db.companies.find((c) => c.id === employee.company_id);
    const token = `demo_${nextId('sess')}_token`;
    db.sessions = db.sessions.filter((s) => s.employee_id !== employee.id);
    db.sessions.push({
      token,
      employee_id: employee.id,
      role: employee.access_role,
      expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    });
    return {
      data: {
        ok: true,
        token,
        employee: {
          id: employee.id,
          full_name: employee.full_name,
          access_role: employee.access_role,
          username: employee.username || '',
          company_id: employee.company_id || '',
          company_name: company ? company.name : '',
        },
      },
    };
  };

  const listCompanies = (p) => {
    const { employee } = requireSession(p.token);
    if (employee.access_role !== 'master') throw fail(403, 'somente_mestre');
    return { data: { ok: true, companies: db.companies.map(shape) } };
  };

  const createCompanyRun = (p) => {
    const name = String(p.name || '').trim();
    const ownerName = String(p.owner_name || '').trim();
    const cpf = digits(p.owner_cpf);
    const password = String(p.owner_password || '');

    if (!String(p.token || '').trim()) throw fail(401, 'sessao_invalida');
    const { employee: actor } = requireSession(p.token);
    if (actor.access_role !== 'master') throw fail(403, 'somente_mestre');
    if (name.length < 2 || ownerName.length < 3 || cpf.length !== 11) throw fail(400, 'dados_invalidos');
    if (password.length < 6) throw fail(400, 'senha_curta');

    let company = db.companies.find((c) => c.name === name && c.owner_cpf === cpf) || null;
    let resumed = false;

    if (company) {
      const owner = db.employees.find((e) => e.company_id === company.id && e.cpf === cpf);
      if (owner) return { data: { ok: true, resumed: true, company: shape(company) } };
      resumed = true;
    }

    const conflict = db.employees.some((e) => e.cpf === cpf && e.password_hash && e.company_id !== (company ? company.id : ''));
    if (conflict) throw fail(409, 'cpf_ja_tem_acesso');

    if (!company) {
      company = { id: nextId('cmp'), name, owner_name: ownerName, owner_cpf: cpf, status: 'ativa' };
      db.companies.push(company);
    }

    // Falha entre criar a empresa e vincular o dono.
    if (faults.ownerLinkFailures > 0) {
      faults.ownerLinkFailures -= 1;
      throw fail(500, 'estado_parcial');
    }

    db.employees.push({
      id: nextId('emp'),
      company_id: company.id,
      full_name: ownerName,
      cpf,
      access_role: 'admin',
      status: 'ativo',
      password_hash: hash(cpf, password),
    });

    // Servidor concluiu, mas a resposta se perde no caminho.
    if (faults.lostResponses > 0) {
      faults.lostResponses -= 1;
      throw { timeout: true, response: { status: 504, data: { error: 'resposta_perdida' } } };
    }

    return { data: { ok: true, resumed, company: shape(company) } };
  };

  const createCompany = (p) => {
    const key = `${String(p.name || '').trim()}|${digits(p.owner_cpf)}`;
    const existing = locks.get(key);
    if (existing) return existing;
    const running = Promise.resolve()
      .then(() => createCompanyRun(p))
      .finally(() => locks.delete(key));
    locks.set(key, running);
    return running;
  };

  const companyDashboard = (p) => {
    const { employee } = requireSession(p.token);
    if (!employee.company_id) throw fail(403, 'sem_empresa');
    const company = db.companies.find((c) => c.id === employee.company_id);
    if (!company) throw fail(404, 'empresa_nao_encontrada');

    const team = db.employees.filter((e) => e.company_id === company.id);
    const rows = db.payroll.filter((r) => r.company_id === company.id && r.competence === competence());
    const sum = (field) => rows.reduce((total, r) => total + (Number(r[field]) || 0), 0);

    return {
      data: {
        ok: true,
        company: { id: company.id, name: company.name, status: company.status },
        profile: { name: employee.full_name, role: employee.access_role },
        counts: {
          ativos: team.filter((e) => e.status === 'ativo').length,
          afastados: team.filter((e) => e.status === 'afastado').length,
          sem_acesso: team.filter((e) => !e.password_hash).length,
        },
        competence: competence(),
        payroll: {
          folhas: rows.length,
          finalizadas: rows.filter((r) => r.finalizadas > 0).length,
          proventos: sum('proventos'),
          descontos: sum('descontos'),
          liquido: sum('liquido'),
        },
        read_at: new Date().toISOString(),
      },
    };
  };

  const invoke = async (name, payload = {}) => {
    await wait();
    if (name === 'authCpf') return authCpf(payload);
    if (name === 'listCompanies') return listCompanies(payload);
    if (name === 'createCompany') return createCompany(payload);
    if (name === 'companyDashboard') return companyDashboard(payload);
    throw fail(404, 'funcao_inexistente');
  };

  const expireSession = (token) => {
    const session = db.sessions.find((s) => s.token === token);
    if (session) session.expires_at = new Date(Date.now() - 1000).toISOString();
  };

  const snapshot = () => ({
    empresas: db.companies.map((c) => c.name),
    vinculos: db.employees
      .filter((e) => e.access_role !== 'master')
      .map((e) => ({ nome: e.full_name, empresa_id: e.company_id, papel: e.access_role, tem_senha: Boolean(e.password_hash) })),
    sessoes: db.sessions.length,
  });

  return { invoke, faults, expireSession, snapshot, seed: DEMO_SEED };
}

const attempt = async (fn) => {
  try {
    const res = await fn();
    return { ok: true, data: res && res.data !== undefined ? res.data : res };
  } catch (e) {
    const code = (e && e.response && e.response.data && e.response.data.error) || (e && e.timeout ? 'resposta_perdida' : 'erro');
    return { ok: false, code, status: (e && e.response && e.response.status) || 0 };
  }
};

export async function runDemoTests() {
  const rows = [];
  const add = (cenario, esperado, obtido, ok, obs = '') => rows.push({ cenario, esperado, obtido, ok, obs });
  const S = DEMO_SEED;

  // 1. Sucesso ponta a ponta
  {
    const b = createDemoBackend();
    const nova = { name: 'Gama Contábil (fictícia)', owner_name: 'Dono Gama', owner_cpf: '52998224725', owner_password: 'gama123' };
    const loginM = await attempt(() => b.invoke('authCpf', { action: 'login', cpf: S.master.cpf, password: S.master.password }));
    const criada = await attempt(() => b.invoke('createCompany', { token: loginM.data && loginM.data.token, ...nova }));
    const loginD = await attempt(() => b.invoke('authCpf', { action: 'login', cpf: nova.owner_cpf, password: nova.owner_password }));
    const painel = await attempt(() => b.invoke('companyDashboard', { token: loginD.data && loginD.data.token }));
    const ok = criada.ok && loginD.ok && painel.ok && painel.data.company.name === nova.name;
    add('Sucesso: mestre cria, dono entra e abre o painel', 'empresa criada, login do dono ok, painel da mesma empresa',
      painel.ok ? `painel de ${painel.data.company.name}` : `erro ${painel.code}`, ok,
      'Três saltos: criação, login por CPF e leitura do painel no servidor simulado.');
  }

  // 2. Isolamento entre as duas empresas fictícias
  {
    const b = createDemoBackend();
    const a = await attempt(() => b.invoke('authCpf', { action: 'login', cpf: S.companies[0].owner.cpf, password: S.companies[0].owner.password }));
    const beta = await attempt(() => b.invoke('authCpf', { action: 'login', cpf: S.companies[1].owner.cpf, password: S.companies[1].owner.password }));
    const pA = await attempt(() => b.invoke('companyDashboard', { token: a.data.token }));
    const pB = await attempt(() => b.invoke('companyDashboard', { token: beta.data.token }));
    const ok = pA.ok && pB.ok && pA.data.company.name === S.companies[0].name && pB.data.company.name === S.companies[1].name
      && pA.data.payroll.liquido !== pB.data.payroll.liquido;
    add('Duas empresas fictícias: cada dono vê só a sua', 'painel A = Alfa, painel B = Beta, números diferentes',
      `${pA.data && pA.data.company.name} / ${pB.data && pB.data.company.name}`, ok,
      'O painel deriva a empresa da sessão, não do navegador.');
  }

  // 3. Recusa de acesso a outra empresa
  {
    const b = createDemoBackend();
    const a = await attempt(() => b.invoke('authCpf', { action: 'login', cpf: S.companies[0].owner.cpf, password: S.companies[0].owner.password }));
    const beta = await attempt(() => b.invoke('authCpf', { action: 'login', cpf: S.companies[1].owner.cpf, password: S.companies[1].owner.password }));
    const pB = await attempt(() => b.invoke('companyDashboard', { token: beta.data.token }));
    const forcado = await attempt(() => b.invoke('companyDashboard', { token: a.data.token, company_id: pB.data.company.id, force_company: pB.data.company.id }));
    const lista = await attempt(() => b.invoke('listCompanies', { token: a.data.token }));
    const ok = forcado.ok && forcado.data.company.name === S.companies[0].name && !lista.ok && lista.code === 'somente_mestre';
    add('Recusa de acesso a outra empresa', 'pedido com empresa alheia continua devolvendo a própria; lista do mestre negada',
      `devolveu ${forcado.data && forcado.data.company.name}; lista = ${lista.code || 'permitida'}`, ok,
      'O identificador enviado pelo navegador é ignorado.');
  }

  // 4 a 6. Sessão expirada
  {
    const b = createDemoBackend();
    const m = await attempt(() => b.invoke('authCpf', { action: 'login', cpf: S.master.cpf, password: S.master.password }));
    b.expireSession(m.data.token);
    const lista = await attempt(() => b.invoke('listCompanies', { token: m.data.token }));
    const antes = b.snapshot().empresas.length;
    const criacao = await attempt(() => b.invoke('createCompany', { token: m.data.token, name: 'Delta Fictícia', owner_name: 'Dono Delta', owner_cpf: '15350946056', owner_password: 'delta123' }));
    const depois = b.snapshot().empresas.length;
    const ok = !lista.ok && lista.code === 'sessao_expirada' && !criacao.ok && depois === antes;
    add('Sessão expirada: lista e criação recusadas', '401 sessao_expirada nas duas, nenhuma empresa criada',
      `lista = ${lista.code}, criação = ${criacao.code}, empresas ${antes}→${depois}`, ok);
  }
  {
    const b = createDemoBackend();
    const d = await attempt(() => b.invoke('authCpf', { action: 'login', cpf: S.companies[0].owner.cpf, password: S.companies[0].owner.password }));
    b.expireSession(d.data.token);
    const painel = await attempt(() => b.invoke('companyDashboard', { token: d.data.token }));
    add('Sessão expirada: painel não mostra números', '401 sessao_expirada, painel vazio',
      painel.code || 'mostrou números', !painel.ok && painel.code === 'sessao_expirada');
  }

  // 7. Falha entre criar empresa e vincular dono
  {
    const b = createDemoBackend();
    const m = await attempt(() => b.invoke('authCpf', { action: 'login', cpf: S.master.cpf, password: S.master.password }));
    const nova = { name: 'Épsilon Fictícia', owner_name: 'Dono Épsilon', owner_cpf: '15350946056', owner_password: 'epsilon1' };
    b.faults.ownerLinkFailures = 1;
    const falha = await attempt(() => b.invoke('createCompany', { token: m.data.token, ...nova }));
    const meio = b.snapshot();
    const semDono = !meio.vinculos.some((v) => v.empresa_id && v.tem_senha && v.nome === nova.owner_name);
    const retomada = await attempt(() => b.invoke('createCompany', { token: m.data.token, ...nova }));
    const fim = b.snapshot();
    const umaEmpresa = fim.empresas.filter((n) => n === nova.name).length;
    const ok = !falha.ok && falha.code === 'estado_parcial' && semDono && retomada.ok && retomada.data.resumed === true && umaEmpresa === 1;
    add('Falha entre criar empresa e vincular dono', 'estado_parcial; empresa existe sem dono; retomada vincula sem duplicar',
      `${falha.code}; retomada resumed=${retomada.data && retomada.data.resumed}; empresas com o nome = ${umaEmpresa}`, ok,
      'A lista atual não confirma o vínculo: fica como cadastro pendente de confirmação.');
  }

  // 8. Resposta perdida depois de o servidor concluir
  {
    const b = createDemoBackend();
    const m = await attempt(() => b.invoke('authCpf', { action: 'login', cpf: S.master.cpf, password: S.master.password }));
    const nova = { name: 'Zeta Fictícia', owner_name: 'Dono Zeta', owner_cpf: '15350946056', owner_password: 'zeta123' };
    b.faults.lostResponses = 1;
    const perdida = await attempt(() => b.invoke('createCompany', { token: m.data.token, ...nova }));
    const fim = b.snapshot();
    const criada = fim.empresas.filter((n) => n === nova.name).length;
    const dono = fim.vinculos.filter((v) => v.nome === nova.owner_name && v.tem_senha).length;
    const repetida = await attempt(() => b.invoke('createCompany', { token: m.data.token, ...nova }));
    const fim2 = b.snapshot();
    const ok = !perdida.ok && perdida.code === 'resposta_perdida' && criada === 1 && dono === 1
      && repetida.ok && repetida.data.resumed === true && fim2.empresas.filter((n) => n === nova.name).length === 1;
    add('Resposta perdida após o servidor concluir', 'erro de timeout, mas empresa e dono existem; reenvio retoma sem duplicar',
      `${perdida.code}; empresa=${criada}, dono=${dono}; resumed=${repetida.data && repetida.data.resumed}`, ok,
      'Resultado desconhecido: só a lista pode indicar o que ficou.');
  }

  // 9. Concorrência (somente demonstração)
  {
    const b = createDemoBackend();
    const m = await attempt(() => b.invoke('authCpf', { action: 'login', cpf: S.master.cpf, password: S.master.password }));
    const nova = { name: 'Eta Fictícia', owner_name: 'Dono Eta', owner_cpf: '52998224725', owner_password: 'eta12345' };
    const dois = await Promise.all([
      attempt(() => b.invoke('createCompany', { token: m.data.token, ...nova })),
      attempt(() => b.invoke('createCompany', { token: m.data.token, ...nova })),
    ]);
    const fim = b.snapshot();
    const empresas = fim.empresas.filter((n) => n === nova.name).length;
    const donos = fim.vinculos.filter((v) => v.nome === nova.owner_name).length;
    add('Duplo clique simultâneo (só na demonstração)', 'uma empresa e um dono',
      `empresas=${empresas}, donos=${donos}`, empresas === 1 && donos === 1 && dois.every((r) => r.ok),
      'O motor serializa pelo par nome + CPF.');
  }

  // 10. Painel: erro x lista vazia
  {
    const b = createDemoBackend();
    const m = await attempt(() => b.invoke('authCpf', { action: 'login', cpf: S.master.cpf, password: S.master.password }));
    const nova = { name: 'Theta Fictícia', owner_name: 'Dono Theta', owner_cpf: '15350946056', owner_password: 'theta123' };
    await attempt(() => b.invoke('createCompany', { token: m.data.token, ...nova }));
    const d = await attempt(() => b.invoke('authCpf', { action: 'login', cpf: nova.owner_cpf, password: nova.owner_password }));
    const vazio = await attempt(() => b.invoke('companyDashboard', { token: d.data.token }));
    const erro = await attempt(() => b.invoke('companyDashboard', { token: 'token-invalido' }));
    const ok = vazio.ok && vazio.data.payroll.folhas === 0 && !erro.ok && erro.code === 'sessao_invalida';
    add('Painel diferencia erro de empresa sem folha', 'empresa nova = folhas 0 com ok; token inválido = erro',
      `vazio folhas=${vazio.data && vazio.data.payroll.folhas}; inválido=${erro.code}`, ok);
  }

  return {
    rows,
    notes: [
      'Formulário sai de "Criando…": o envio tem trava e o botão é liberado em sucesso, erro, exceção e timeout (finally). Verificado por leitura do código e demonstrável no passo 2 com falha ativada.',
      'Repetição automática: não existe — nenhum reenvio é disparado pelo formulário.',
      'Dados marcados como "cadastro pendente de confirmação" continuam sem confirmação porque a lista do mestre não devolve o vínculo de acesso do dono.',
    ],
  };
}