
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

import {
  employeeAdmin,
  employeeDetails,
  employeeRow,
  fail,
  ok,
  scopedRecord,
} from '../../shared/employeeAdmin.ts';

import {
  onlyDigits,
} from '../../shared/cpf.ts';

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export default async function (req: Request) {
  if (req.method !== 'POST') {
    return fail(405, 'metodo_invalido');
  }

  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return fail(400, 'dados_invalidos');
    }

    const admin = await employeeAdmin(
      createClientFromRequest(req),
      body.token
    );

    if (admin.response) {
      return admin.response;
    }

    const { companyId, entities } = admin;

    // Visualização individual do funcionário.
    if (body.id !== undefined) {
      const employee = await scopedRecord(
        entities.Employee,
        body.id,
        companyId
      );

      if (
        !employee ||
        employee.access_role === 'master'
      ) {
        return fail(
          404,
          'funcionario_inexistente'
        );
      }

      if (
        admin.actor.access_role === 'gerente' &&
        employee.id !== admin.actor.id &&
        (employee.access_role || 'funcionario') !==
          'funcionario'
      ) {
        return fail(403, 'perfil_protegido');
      }

      return ok({
        employee: employeeDetails(employee),
      });
    }

    // Toda pesquisa é limitada à empresa da sessão.
    const query: Record<string, unknown> = {
      company_id: companyId,
      access_role: {
        $ne: 'master',
      },
    };

    const term =
      typeof body.term === 'string'
        ? body.term.trim().slice(0, 100)
        : '';

    // Pesquisa por CPF completo ou parcial.
    if (body.by === 'cpf' && term) {
      const cpf = onlyDigits(term);

      query.cpf = {
        $regex: cpf || '^$a',
      };
    }

    // Pesquisa por nome, sem diferenciar maiúsculas.
    if (body.by === 'name' && term) {
      query.full_name = {
        $regex: escapeRegex(term),
        $options: 'i',
      };
    }

    // Pesquisa pelo cargo selecionado.
    if (body.by === 'position') {
      if (
        typeof body.position_id !== 'string' ||
        !body.position_id
      ) {
        return fail(400, 'cargo_invalido');
      }

      const position = await scopedRecord(
        entities.Position,
        body.position_id,
        companyId
      );

      if (!position) {
        return fail(400, 'cargo_invalido');
      }

      query.position_id = body.position_id;
    }

    // Filtro de funcionários ativos.
    if (body.status === 'ativo') {
      query.$or = [
        { status: 'ativo' },
        { status: { $exists: false } },
        { status: null },
        { status: '' },
      ];
    }

    // Filtro agrupado, sem modificar a situação original.
    if (body.status === 'inativo') {
      query.status = {
        $in: [
          'inativo',
          'afastado',
          'desligado',
        ],
      };
    }

    if (
      body.status === 'afastado' ||
      body.status === 'desligado'
    ) {
      query.status = body.status;
    }

    const cursor =
      typeof body.cursor === 'string'
        ? body.cursor
        : undefined;

    const limit = Math.min(
      Math.max(
        Math.floor(Number(body.limit) || 100),
        1
      ),
      200
    );

    const {
      items,
      next_cursor,
    } = await entities.Employee.filter(
      query,
      {
        sort: 'full_name',
        limit,
        cursor,
      }
    );

    const employees = items
      .filter(
        (employee) =>
          employee.company_id === companyId &&
          employee.access_role !== 'master'
      )
      .map(employeeRow);

    return ok({
      employees,
      next_cursor: next_cursor || null,
    });

  } catch {
    return fail(500, 'falha_servidor');
  }
}
