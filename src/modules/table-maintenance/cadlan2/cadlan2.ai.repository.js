const { pool } = require("../../../db/pool");

function normalizeDebitCreditCode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "D" || normalized === "C") {
    return normalized;
  }

  return "";
}

function normalizeDescription(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buildSearchTerms(description) {
  const normalized = normalizeDescription(description);
  if (!normalized) {
    return [];
  }

  return [
    ...new Set(
      normalized
        .split(" ")
        .map((term) => term.trim())
        .filter((term) => term.length >= 3)
        .sort((left, right) => right.length - left.length)
        .slice(0, 6)
    ),
  ];
}

function calculateSimilarityScore(sourceDescription, candidateDescription) {
  const source = normalizeDescription(sourceDescription);
  const candidate = normalizeDescription(candidateDescription);

  if (!source || !candidate) {
    return 0;
  }

  if (source === candidate) {
    return 1;
  }

  const sourceTokens = new Set(source.split(" "));
  const candidateTokens = new Set(candidate.split(" "));
  let sharedTokens = 0;

  sourceTokens.forEach((token) => {
    if (candidateTokens.has(token)) {
      sharedTokens += 1;
    }
  });

  const unionSize = new Set([...sourceTokens, ...candidateTokens]).size || 1;
  const jaccard = sharedTokens / unionSize;
  const substringBoost = source.includes(candidate) || candidate.includes(source) ? 0.2 : 0;
  const startsWithBoost =
    source.startsWith(candidate.slice(0, Math.min(candidate.length, 10))) ||
    candidate.startsWith(source.slice(0, Math.min(source.length, 10)))
      ? 0.1
      : 0;

  return Math.min(1, Number((jaccard + substringBoost + startsWithBoost).toFixed(4)));
}

async function findSimilarCadlan2Rows(row, options = {}, db = pool) {
  const maxExamples = Number(options.limit) > 0 ? Number(options.limit) : 4;
  const candidateLimit = Number(options.candidateLimit) > 0 ? Number(options.candidateLimit) : 40;
  const searchTerms = buildSearchTerms(row.aux_extrato_desc);
  const debitCreditCode = normalizeDebitCreditCode(row.aux_extrato_dc);
  const whereClauses = [
    "TRIM(COALESCE(aux_extrato_desc, '')) <> ''",
    "TRIM(COALESCE(lan_deslan, '')) <> ''",
    "lan_lanope IS NOT NULL",
    "lan_lanope > 0",
  ];
  const params = [];

  const persistedId = Number(row.id);
  if (Number.isInteger(persistedId) && persistedId > 0) {
    whereClauses.push("id <> ?");
    params.push(persistedId);
  }

  if (debitCreditCode) {
    whereClauses.push(
      "(COALESCE(NULLIF(UPPER(TRIM(aux_extrato_dc)), ''), ?) = ?)"
    );
    params.push(debitCreditCode, debitCreditCode);
  }

  if (searchTerms.length > 0) {
    whereClauses.push(
      `(${searchTerms.map(() => "UPPER(aux_extrato_desc) LIKE ?").join(" OR ")})`
    );
    params.push(...searchTerms.map((term) => `%${term.toUpperCase()}%`));
  }

  params.push(candidateLimit);

  const [rows] = await db.query(
    `
      SELECT
        id,
        aux_extrato_desc,
        aux_extrato_dc,
        lan_deslan,
        lan_lanope,
        lan_idmin
      FROM cadlan2
      WHERE ${whereClauses.join("\n        AND ")}
      ORDER BY id DESC
      LIMIT ?
    `,
    params
  );

  return rows
    .map((candidate) => ({
      id: Number(candidate.id),
      aux_extrato_desc: String(candidate.aux_extrato_desc || "").trim(),
      aux_extrato_dc: normalizeDebitCreditCode(candidate.aux_extrato_dc),
      lan_deslan: String(candidate.lan_deslan || "").trim(),
      lan_lanope: Number(candidate.lan_lanope) || 0,
      lan_idmin: Number(candidate.lan_idmin) || 0,
      similarity: calculateSimilarityScore(row.aux_extrato_desc, candidate.aux_extrato_desc),
    }))
    .filter((candidate) => candidate.similarity > 0)
    .sort((left, right) => right.similarity - left.similarity || right.id - left.id)
    .slice(0, maxExamples);
}

module.exports = {
  findSimilarCadlan2Rows,
};
