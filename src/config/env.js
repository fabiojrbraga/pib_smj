const dotenv = require("dotenv");

dotenv.config();

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Variavel obrigatoria ausente: ${name}`);
  }
  return value.trim();
}

function getOptionalEnv(name, defaultValue = "") {
  const value = process.env[name];
  if (!value || !value.trim()) {
    return defaultValue;
  }

  return value.trim();
}

function parseOptionalPositiveIntegerEnv(name, defaultValue) {
  const rawValue = getOptionalEnv(name);
  if (!rawValue) {
    return defaultValue;
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return defaultValue;
  }

  return parsed;
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

function parseAiConfig() {
  const apiKey = getOptionalEnv("OPENAI_API_KEY");
  const systemPrompt = getOptionalEnv("OPENAI_SYSTEM_PROMPT");
  const enabled = Boolean(apiKey && systemPrompt);

  let statusMessage = "Funcionalidade de IA desabilitada.";
  if (enabled) {
    statusMessage = "Funcionalidade de IA disponivel.";
  } else if (apiKey || systemPrompt) {
    statusMessage =
      "Funcionalidade de IA desabilitada por configuracao incompleta. Defina OPENAI_API_KEY e OPENAI_SYSTEM_PROMPT.";
  }

  return {
    enabled,
    apiKey,
    systemPrompt,
    model: getOptionalEnv("OPENAI_MODEL", "gpt-5.4-mini"),
    timeoutMs: parseOptionalPositiveIntegerEnv("OPENAI_TIMEOUT_MS", 20000),
    maxRowsPerRequest: parseOptionalPositiveIntegerEnv("CADLAN2_AI_MAX_ROWS", 20),
    maxExamplesPerRow: parseOptionalPositiveIntegerEnv("CADLAN2_AI_MAX_EXAMPLES", 4),
    statusMessage,
  };
}

const env = {
  port: Number(process.env.PORT || 3000),
  dbConfig: parseDatabaseUrl(),
  ai: parseAiConfig(),
};

module.exports = { env };
