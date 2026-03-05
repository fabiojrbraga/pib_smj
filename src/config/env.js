const dotenv = require("dotenv");

dotenv.config();

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Variavel obrigatoria ausente: ${name}`);
  }
  return value.trim();
}

function parseDatabaseUrl() {
  const databaseUrl = getRequiredEnv("DATABASE_URL");
  let parsedUrl;

  try {
    parsedUrl = new URL(databaseUrl);
  } catch (error) {
    throw new Error("DATABASE_URL invalida. Use formato mariadb://usuario:senha@host:porta/banco");
  }

  const protocol = parsedUrl.protocol.replace(":", "");
  if (!["mariadb", "mysql"].includes(protocol)) {
    throw new Error("DATABASE_URL deve usar protocolo mariadb:// ou mysql://");
  }

  const database = parsedUrl.pathname.replace(/^\//, "");
  if (!database) {
    throw new Error("DATABASE_URL deve conter o nome do banco");
  }

  if (!parsedUrl.username) {
    throw new Error("DATABASE_URL deve conter usuario");
  }

  return {
    host: parsedUrl.hostname,
    port: parsedUrl.port ? Number(parsedUrl.port) : 3306,
    user: decodeURIComponent(parsedUrl.username),
    password: decodeURIComponent(parsedUrl.password),
    database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    decimalNumbers: true,
  };
}

const env = {
  port: Number(process.env.PORT || 3000),
  dbConfig: parseDatabaseUrl(),
};

module.exports = { env };
