const { app } = require("./app");
const { env } = require("./config/env");
const { pool } = require("./db/pool");

async function startServer() {
  try {
    await pool.query("SELECT 1");

    app.listen(env.port, () => {
      console.log(`Servidor em execucao: http://localhost:${env.port}`);
    });
  } catch (error) {
    console.error("Falha ao iniciar servidor:", error.message);
    process.exit(1);
  }
}

startServer();
