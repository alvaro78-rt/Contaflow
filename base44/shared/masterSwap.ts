import { hashPassword, safeEqual } from './authHelpers.ts';
import { isValidCpf } from './cpf.ts';

// Janela em que uma tentativa é considerada "em andamento" e não pode ser duplicada.
export const LOCK_MS = 20000;

const sha256 = async (text) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

// 1. Autorização: proprietário do aplicativo no Base44 (identidade da plataforma).
export const authorizeOwner = (identity, ownerUserId) => {
  if (!identity) return { ok: false, status: 401, error: 'nao_autenticado' };
  if (identity.id !== ownerUserId || identity.role !== 'admin') {
    return { ok: false, status: 403, error: 'somente_proprietario' };
  }
  return { ok: true };
};

// 2. Chave de recuperação, guardada como segredo.
export const checkRecoveryKey = (supplied, expected) => {
  if (!expected) return { ok: false, status: 503, error: 'chave_nao_configurada' };
  if (!supplied) return { ok: false, status: 400, error: 'chave_obrigatoria' };
  if (!safeEqual(supplied, expected)) return { ok: false, status: 403, error: 'chave_invalida' };
  return { ok: true };
};

const validateNewMaster = ({ fullName, cpf, password }) => {
  if (!fullName || fullName.length < 3) return { ok: false, status: 400, error: 'nome_invalido' };
  if (cpf.length !== 11 || !isValidCpf(cpf)) return { ok: false, status: 400, error: 'cpf_invalido' };
  if (password.length < 6) return { ok: false, status: 400, error: 'senha_curta' };
  return { ok: true };
};

const fail = (status, error) => ({ status, body: { error } });

// Núcleo da troca: idempotente e retomável. O mesmo código roda na função e no teste.
export const attemptRecovery = async ({ identity, ownerUserId, expectedKey, suppliedKey, newMaster, store, now }) => {
  // Ordem obrigatória: identidade -> chave -> dados. Nenhuma escrita antes de tudo validar.
  const auth = authorizeOwner(identity, ownerUserId);
  if (!auth.ok) return fail(auth.status, auth.error);

  const key = checkRecoveryKey(String(suppliedKey || '').trim(), expectedKey);
  if (!key.ok) return fail(key.status, key.error);

  const fullName = String(newMaster?.fullName || '').trim();
  const cpf = String(newMaster?.cpf || '');
  const password = String(newMaster?.password || '');
  const valid = validateNewMaster({ fullName, cpf, password });
  if (!valid.ok) return fail(valid.status, valid.error);

  const fingerprint = await sha256(String(suppliedKey).trim());

  let claims = await store.listClaims(fingerprint);
  if (claims.some((c) => c.state === 'concluida')) return fail(409, 'chave_ja_usada');

  let claim = claims.find((c) => c.state === 'em_andamento') || null;
  const resumed = Boolean(claim);

  if (claim) {
    const beat = Number(claim.heartbeat_at || 0);
    if (beat && now - beat < LOCK_MS) return fail(409, 'recuperacao_em_andamento');
    if (claim.new_master_cpf && claim.new_master_cpf !== cpf) return fail(409, 'recuperacao_em_andamento');
    await store.updateClaim(claim.id, { heartbeat_at: now });
  } else {
    const existentes = await store.findByCpf(cpf);
    if (existentes.some((e) => e.access_role !== 'master' && e.password_hash)) {
      return fail(409, 'cpf_em_uso');
    }
    claim = await store.createClaim({
      key_fingerprint: fingerprint,
      new_master_cpf: cpf,
      previous_master_ids: [],
      new_master_id: null,
      state: 'em_andamento',
      heartbeat_at: now,
      recovered_at: new Date(now).toISOString(),
      note: 'iniciada',
    });
    // Dois cliques simultâneos: só a reivindicação mais antiga vale.
    claims = await store.listClaims(fingerprint);
    if (claims[0] && claims[0].id !== claim.id) {
      await store.deleteClaim(claim.id);
      claim = claims[0];
    }
  }

  const hash = await hashPassword(cpf, password);
  const mestres = await store.listMasters();
  let newId = claim.new_master_id || mestres.find((m) => m.cpf === cpf)?.id || null;
  const previousIds = Array.isArray(claim.previous_master_ids) && claim.previous_master_ids.length
    ? claim.previous_master_ids
    : mestres.filter((m) => m.id !== newId).map((m) => m.id);

  if (!newId) {
    // Nasce como mestre já criado, porém desligado: nunca há dois acessos utilizáveis
    // e /mestre segue bloqueada porque o papel de mestre continua existindo.
    const created = await store.createEmployee({
      full_name: fullName,
      cpf,
      access_role: 'master',
      status: 'desligado',
      password_hash: hash,
    });
    const fresh = await store.getClaim(claim.id);
    if (fresh?.new_master_id && fresh.new_master_id !== created.id) {
      await store.deleteEmployee(created.id);
      newId = fresh.new_master_id;
    } else {
      newId = created.id;
      await store.updateClaim(claim.id, { new_master_id: newId, previous_master_ids: previousIds });
    }
  }

  // Desativa o antigo antes de ativar o novo: dois mestres ativos nunca coexistem.
  for (const id of previousIds) {
    if (id === newId) continue;
    await store.updateEmployee(id, { access_role: 'funcionario', status: 'desligado', password_hash: '' });
  }
  await store.updateEmployee(newId, {
    full_name: fullName,
    access_role: 'master',
    status: 'ativo',
    password_hash: hash,
  });

  // Clique perdedor de uma dupla concorrente: retira a própria conta e deixa a vencedora.
  const finalClaim = await store.getClaim(claim.id);
  if (finalClaim?.new_master_id && finalClaim.new_master_id !== newId) {
    await store.updateEmployee(newId, { access_role: 'funcionario', status: 'desligado', password_hash: '' });
    await store.purgeSessions(newId);
    return { status: 200, body: { ok: true, duplicate: true, chave_consumida: true } };
  }

  // Convergência: qualquer outro mestre remanescente é neutralizado.
  const paraPurgar = new Set(previousIds.filter((id) => id !== newId));
  const restantes = (await store.listMasters()).filter((m) => m.id !== newId);
  for (const m of restantes) {
    await store.updateEmployee(m.id, { access_role: 'funcionario', status: 'desligado', password_hash: '' });
    paraPurgar.add(m.id);
  }

  let sessoes = 0;
  for (const id of paraPurgar) {
    const res = await store.purgeSessions(id);
    sessoes += res?.deleted || 0;
  }

  await store.updateClaim(claim.id, {
    state: 'concluida',
    completed_at: new Date(now).toISOString(),
    new_master_id: newId,
    previous_master_ids: [...paraPurgar],
    heartbeat_at: now,
    note: resumed ? 'retomada' : 'concluida',
  });

  const ativos = (await store.listMasters()).filter((m) => m.status === 'ativo');

  return {
    status: 200,
    body: {
      ok: ativos.length === 1,
      master: { id: newId, full_name: fullName },
      mestres_ativos: ativos.length,
      mestres_ativos_ids: ativos.map((m) => m.id),
      contas_anteriores_neutralizadas: [...paraPurgar],
      sessoes_invalidadas: sessoes,
      chave_consumida: true,
      retomada: resumed,
    },
  };
};