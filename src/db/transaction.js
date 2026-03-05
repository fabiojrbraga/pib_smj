const { pool } = require("./pool");

async function withTransaction(workFn) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await workFn(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { withTransaction };
