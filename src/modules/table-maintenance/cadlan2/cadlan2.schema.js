const { pool } = require("../../../db/pool");

let schemaReadyPromise = null;

async function runCadlan2SchemaMigration(db = pool) {
  const [columnRows] = await db.query(
    `
      SELECT COUNT(*) AS total
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'cadlan2'
        AND COLUMN_NAME = 'aux_extrato_fitid'
    `
  );

  if (Number(columnRows[0]?.total || 0) === 0) {
    await db.query(
      `
        ALTER TABLE cadlan2
        ADD COLUMN aux_extrato_fitid VARCHAR(120) NULL AFTER aux_extrato_dc
      `
    );
  }

  const [indexRows] = await db.query(
    `
      SELECT COUNT(*) AS total
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'cadlan2'
        AND COLUMN_NAME = 'aux_extrato_fitid'
        AND NON_UNIQUE = 0
    `
  );

  if (Number(indexRows[0]?.total || 0) === 0) {
    await db.query(
      `
        ALTER TABLE cadlan2
        ADD UNIQUE KEY ux_cadlan2_aux_extrato_fitid (aux_extrato_fitid)
      `
    );
  }
}

async function ensureCadlan2Schema(db = pool) {
  if (db !== pool) {
    await runCadlan2SchemaMigration(db);
    return;
  }

  if (!schemaReadyPromise) {
    schemaReadyPromise = runCadlan2SchemaMigration().catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }

  await schemaReadyPromise;
}

module.exports = {
  ensureCadlan2Schema,
};
