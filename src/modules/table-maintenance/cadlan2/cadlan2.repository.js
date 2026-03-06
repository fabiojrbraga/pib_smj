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
  const ministryIds = [...new Set(rows.map((item) => item.lan_idmin))];

  const [memberRows] = await db.query(`SELECT id FROM cadmem WHERE id IN (?)`, [memberIds]);
  const [operationRows] = await db.query(`SELECT id FROM cadope WHERE id IN (?)`, [operationIds]);
  const [ministryRows] = await db.query(`SELECT id FROM cadmin WHERE id IN (?)`, [ministryIds]);

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
      row.lan_idmin,
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
      row.lan_idmin,
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
      item.lan_idmin,
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

async function validateCadlan2DatabaseRows(db = pool) {
  const [countRows] = await db.query("SELECT COUNT(*) AS total FROM cadlan2");
  const totalRows = countRows[0].total;

  if (totalRows === 0) {
    return {
      totalRows: 0,
      missingMembers: [],
      missingOperations: [],
      missingMinistries: [],
    };
  }

  const [missingMembersRows] = await db.query(
    `
      SELECT DISTINCT c2.lan_idmem AS id
      FROM cadlan2 c2
      LEFT JOIN cadmem cm ON cm.id = c2.lan_idmem
      WHERE cm.id IS NULL
        AND c2.lan_idmem > 0
      ORDER BY c2.lan_idmem
    `
  );

  const [missingOperationsRows] = await db.query(
    `
      SELECT DISTINCT c2.lan_lanope AS id
      FROM cadlan2 c2
      LEFT JOIN cadope co ON co.id = c2.lan_lanope
      WHERE co.id IS NULL
      ORDER BY c2.lan_lanope
    `
  );

  const [missingMinistriesRows] = await db.query(
    `
      SELECT DISTINCT c2.lan_idmin AS id
      FROM cadlan2 c2
      LEFT JOIN cadmin ci ON ci.id = c2.lan_idmin
      WHERE ci.id IS NULL
      ORDER BY c2.lan_idmin
    `
  );

  return {
    totalRows,
    missingMembers: missingMembersRows.map((item) => item.id),
    missingOperations: missingOperationsRows.map((item) => item.id),
    missingMinistries: missingMinistriesRows.map((item) => item.id),
  };
}

async function commitCadlan2ToCadlan() {
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
        ORDER BY id
      `
    );

    await connection.query("DELETE FROM cadlan2");
    return result.affectedRows;
  });
}

module.exports = {
  listCadlan2,
  getCadlan2RowById,
  validateForeignKeys,
  insertCadlan2Row,
  updateCadlan2Row,
  replaceCadlan2Batch,
  validateCadlan2DatabaseRows,
  commitCadlan2ToCadlan,
};
