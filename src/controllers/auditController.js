const { all, get } = require('../config/db');

const PAGE_SIZE = 20;

function normalizeFilterValue(value, maxLength = 80) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().slice(0, maxLength);
}

function parsePage(rawPage) {
  const page = Number.parseInt(rawPage, 10);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function formatMetadata(metadataJson) {
  if (!metadataJson) {
    return '-';
  }

  try {
    const parsed = JSON.parse(metadataJson);
    return JSON.stringify(parsed, null, 2);
  } catch (err) {
    return metadataJson;
  }
}

async function listAuditLogs(req, res, next) {
  try {
    const page = parsePage(req.query.page);
    const action = normalizeFilterValue(req.query.action);
    const entityType = normalizeFilterValue(req.query.entityType);
    const actor = normalizeFilterValue(req.query.actor);

    const whereClauses = [];
    const whereParams = [];

    if (action) {
      // [SECURE CODING] Parameterized Query untuk filter action.
      whereClauses.push('a.action LIKE ?');
      whereParams.push(`%${action}%`);
    }

    if (entityType) {
      // [SECURE CODING] Parameterized Query untuk filter entity type.
      whereClauses.push('a.entity_type LIKE ?');
      whereParams.push(`%${entityType}%`);
    }

    if (actor) {
      // [SECURE CODING] Parameterized Query untuk filter actor username/nama.
      whereClauses.push('(u.username LIKE ? OR u.full_name LIKE ?)');
      whereParams.push(`%${actor}%`, `%${actor}%`);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countRow = await get(
      `
      SELECT COUNT(1) AS total
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.actor_user_id
      ${whereSql}
    `,
      whereParams
    );

    const totalItems = Number(countRow?.total || 0);
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const offset = (safePage - 1) * PAGE_SIZE;

    const rows = await all(
      `
      SELECT a.id,
             a.action,
             a.entity_type,
             a.entity_id,
             a.metadata_json,
             a.ip_address,
             a.user_agent,
             a.created_at,
             u.username AS actor_username,
             u.full_name AS actor_name,
             u.role AS actor_role
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.actor_user_id
      ${whereSql}
      ORDER BY a.id DESC
      LIMIT ? OFFSET ?
    `,
      [...whereParams, PAGE_SIZE, offset]
    );

    const logs = rows.map((row) => ({
      ...row,
      metadata_pretty: formatMetadata(row.metadata_json)
    }));

    return res.render('audit/list', {
      title: 'Audit Logs',
      logs,
      filters: {
        action,
        entityType,
        actor
      },
      pagination: {
        page: safePage,
        totalPages,
        totalItems,
        pageSize: PAGE_SIZE,
        hasPrev: safePage > 1,
        hasNext: safePage < totalPages
      }
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listAuditLogs
};
