const { pool } = require("../../db/pool");

async function listMembers(db = pool) {
  const [rows] = await db.query(
    `
      SELECT id, cad_nome
      FROM cadmem
      WHERE cad_ativo = 'A'
      ORDER BY cad_nome
    `
  );

  return rows;
}

async function listOperations(db = pool) {
  const [rows] = await db.query(
    `
      SELECT id, cad_nomeoperacao, cad_credeb
      FROM cadope
      ORDER BY cad_nomeoperacao
    `
  );

  return rows;
}

async function listMinistries(db = pool) {
  const [rows] = await db.query(
    `
      SELECT id, cad_nommin
      FROM cadmin
      ORDER BY cad_nommin
    `
  );

  return rows;
}

module.exports = {
  listMembers,
  listOperations,
  listMinistries,
};
