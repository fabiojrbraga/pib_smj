const { pool } = require("../../../db/pool");
const { withTransaction } = require("../../../db/transaction");

async function listCadlan2(db = pool) {
  const [rows] = await db.query(
    `
      SELECT
        id,
        lan_idmem,
        lan_deslan,
        lan_valor,
        DATE_FORMAT(lan_datlan, '%Y-%m-%d') AS lan_datlan,
        lan_lanope,
        lan_idmin,
        aux_extrato_desc,
        aux_extrato_dc
      FROM cadlan2
      ORDER BY id
    `
  );

  return rows;
}

async function getCadlan2RowById(id, db = pool) {
  const [rows] = await db.query(
    `
      SELECT
        id,
        lan_idmem,
        lan_deslan,
        lan_valor,
        DATE_FORMAT(lan_datlan, '%Y-%m-%d') AS lan_datlan,
        lan_lanope,
        lan_idmin,
        aux_extrato_desc,
        aux_extrato_dc
      FROM cadlan2
      WHERE id = ?
      LIMIT 1
    `,
    [id]
  );

  return rows[0] || null;
}

async function validateForeignKeys(rows, db = pool) {
  const memberIds = [...new Set(rows.map((item) => item.lan_idmem).filter((id) => Number(id) > 0))];
  const operationIds = [...new Set(rows.map((item) => item.lan_lanope))];
  const ministryIds = [...new Set(rows.map((item) => item.lan_idmin).filter((id) => Number(id) > 0))];

  const [memberRows] = memberIds.length > 0
    ? await db.query(`SELECT id FROM cadmem WHERE id IN (?)`, [memberIds])
    : [[]];
  const [operationRows] = operationIds.length > 0
    ? await db.query(`SELECT id FROM cadope WHERE id IN (?)`, [operationIds])
    : [[]];
  const [ministryRows] = ministryIds.length > 0
    ? await db.query(`SELECT id FROM cadmin WHERE id IN (?)`, [ministryIds])
    : [[]];

  const memberSet = new Set(memberRows.map((item) => item.id));
  const operationSet = new Set(operationRows.map((item) => item.id));
  const ministrySet = new Set(ministryRows.map((item) => item.id));

  const missingMembers = memberIds.filter((id) => !memberSet.has(id));
  const missingOperations = operationIds.filter((id) => !operationSet.has(id));
  const missingMinistries = ministryIds.filter((id) => !ministrySet.has(id));

  return {
    missingMembers,
    missingOperations,
    missingMinistries,
  };
}

async function getOperationDebitCreditTypes(operationIds, db = pool) {
  const normalizedIds = [...new Set(operationIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  if (normalizedIds.length === 0) {
    return new Map();
  }

  const [rows] = await db.query(
    `
      SELECT
        id,
        cad_credeb
      FROM cadope
      WHERE id IN (?)
    `,
    [normalizedIds]
  );

  return new Map(
    rows.map((item) => [
      Number(item.id),
      String(item.cad_credeb || "").trim().toUpperCase(),
    ])
  );
}

async function insertCadlan2Row(row, db = pool) {
  const [result] = await db.query(
    `
      INSERT INTO cadlan2 (
        lan_idmem,
        lan_deslan,
        lan_valor,
        lan_datlan,
        lan_lanope,
        lan_idmin,
        aux_extrato_desc,
        aux_extrato_dc
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      row.lan_idmem,
      row.lan_deslan,
      row.lan_valor,
      row.lan_datlan,
      row.lan_lanope,
      row.lan_idmin ?? 0,
      row.aux_extrato_desc,
      row.aux_extrato_dc,
    ]
  );

  return getCadlan2RowById(result.insertId, db);
}

async function updateCadlan2Row(id, row, db = pool) {
  const [result] = await db.query(
    `
      UPDATE cadlan2
      SET
        lan_idmem = ?,
        lan_deslan = ?,
        lan_valor = ?,
        lan_datlan = ?,
        lan_lanope = ?,
        lan_idmin = ?,
        aux_extrato_desc = ?,
        aux_extrato_dc = ?
      WHERE id = ?
    `,
    [
      row.lan_idmem,
      row.lan_deslan,
      row.lan_valor,
      row.lan_datlan,
      row.lan_lanope,
      row.lan_idmin ?? 0,
      row.aux_extrato_desc,
      row.aux_extrato_dc,
      id,
    ]
  );

  if (result.affectedRows === 0) {
    return null;
  }

  return getCadlan2RowById(id, db);
}

async function replaceCadlan2Batch(rows) {
  return withTransaction(async (connection) => {
    await connection.query("DELETE FROM cadlan2");

    const values = rows.map((item) => [
      item.lan_idmem,
      item.lan_deslan,
      item.lan_valor,
      item.lan_datlan,
      item.lan_lanope,
      item.lan_idmin ?? 0,
      item.aux_extrato_desc,
      item.aux_extrato_dc,
    ]);

    await connection.query(
      `
        INSERT INTO cadlan2 (
          lan_idmem,
          lan_deslan,
          lan_valor,
          lan_datlan,
          lan_lanope,
          lan_idmin,
          aux_extrato_desc,
          aux_extrato_dc
        ) VALUES ?
      `,
      [values]
    );

    const [resultRows] = await connection.query("SELECT COUNT(*) AS total FROM cadlan2");
    return resultRows[0].total;
  });
}

function normalizeSelectedIds(selectedIds) {
  return [...new Set((Array.isArray(selectedIds) ? selectedIds : []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
}

async function validateCadlan2DatabaseRows(selectedIds, db = pool) {
  const normalizedSelectedIds = normalizeSelectedIds(selectedIds);

  if (normalizedSelectedIds.length === 0) {
    return {
      totalRows: 0,
      missingSelectedIds: [],
      missingMembers: [],
      missingOperations: [],
      missingMinistries: [],
      debitRowsWithoutMinistry: [],
    };
  }

  const [selectedRowIds] = await db.query(
    `
      SELECT id
      FROM cadlan2
      WHERE id IN (?)
      ORDER BY id
    `,
    [normalizedSelectedIds]
  );
  const existingSelectedIds = selectedRowIds.map((item) => Number(item.id));
  const existingSelectedIdsSet = new Set(existingSelectedIds);
  const missingSelectedIds = normalizedSelectedIds.filter((id) => !existingSelectedIdsSet.has(id));
  const totalRows = existingSelectedIds.length;

  if (totalRows === 0) {
    return {
      totalRows: 0,
      missingSelectedIds,
      missingMembers: [],
      missingOperations: [],
      missingMinistries: [],
      debitRowsWithoutMinistry: [],
    };
  }

  const [missingMembersRows] = await db.query(
    `
      SELECT DISTINCT c2.lan_idmem AS id
      FROM cadlan2 c2
      LEFT JOIN cadmem cm ON cm.id = c2.lan_idmem
      WHERE c2.id IN (?)
        AND cm.id IS NULL
        AND c2.lan_idmem > 0
      ORDER BY c2.lan_idmem
    `,
    [existingSelectedIds]
  );

  const [missingOperationsRows] = await db.query(
    `
      SELECT DISTINCT c2.lan_lanope AS id
      FROM cadlan2 c2
      LEFT JOIN cadope co ON co.id = c2.lan_lanope
      WHERE c2.id IN (?)
        AND co.id IS NULL
      ORDER BY c2.lan_lanope
    `,
    [existingSelectedIds]
  );

  const [missingMinistriesRows] = await db.query(
    `
      SELECT DISTINCT c2.lan_idmin AS id
      FROM cadlan2 c2
      LEFT JOIN cadmin ci ON ci.id = c2.lan_idmin
      WHERE c2.id IN (?)
        AND ci.id IS NULL
        AND c2.lan_idmin > 0
      ORDER BY c2.lan_idmin
    `,
    [existingSelectedIds]
  );

  const [debitRowsWithoutMinistryRows] = await db.query(
    `
      SELECT c2.id
      FROM cadlan2 c2
      LEFT JOIN cadope co ON co.id = c2.lan_lanope
      WHERE c2.id IN (?)
        AND COALESCE(NULLIF(UPPER(TRIM(c2.aux_extrato_dc)), ''), UPPER(TRIM(co.cad_credeb)), '') = 'D'
        AND (c2.lan_idmin IS NULL OR c2.lan_idmin <= 0)
      ORDER BY c2.id
    `,
    [existingSelectedIds]
  );

  return {
    totalRows,
    missingSelectedIds,
    missingMembers: missingMembersRows.map((item) => item.id),
    missingOperations: missingOperationsRows.map((item) => item.id),
    missingMinistries: missingMinistriesRows.map((item) => item.id),
    debitRowsWithoutMinistry: debitRowsWithoutMinistryRows.map((item) => item.id),
  };
}

async function commitCadlan2ToCadlan(selectedIds) {
  const normalizedSelectedIds = normalizeSelectedIds(selectedIds);
  if (normalizedSelectedIds.length === 0) {
    return 0;
  }

  return withTransaction(async (connection) => {
    const [result] = await connection.query(
      `
        INSERT INTO cadlan (
          lan_idmem,
          lan_deslan,
          lan_valor,
          lan_datlan,
          lan_lanope,
          lan_idmin
        )
        SELECT
          lan_idmem,
          lan_deslan,
          lan_valor,
          lan_datlan,
          lan_lanope,
          lan_idmin
        FROM cadlan2
        WHERE id IN (?)
        ORDER BY id
      `,
      [normalizedSelectedIds]
    );

    return result.affectedRows;
  });
}

module.exports = {
  listCadlan2,
  getCadlan2RowById,
  validateForeignKeys,
  getOperationDebitCreditTypes,
  insertCadlan2Row,
  updateCadlan2Row,
  replaceCadlan2Batch,
  validateCadlan2DatabaseRows,
  commitCadlan2ToCadlan,
};
