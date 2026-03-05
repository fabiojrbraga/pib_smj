const { z } = require("zod");
const { ValidationError } = require("../../shared/errors");

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

function isRealIsoDate(dateText) {
  if (!isoDateRegex.test(dateText)) {
    return false;
  }

  const parsed = new Date(`${dateText}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return parsed.toISOString().slice(0, 10) === dateText;
}

const rowSchema = z.object({
  lan_idmem: z.coerce.number().int().positive(),
  lan_deslan: z.string().trim().min(1).max(150),
  lan_valor: z.coerce.number().positive().max(99999999.99),
  lan_datlan: z.string().refine(isRealIsoDate, "lan_datlan deve estar no formato YYYY-MM-DD"),
  lan_lanope: z.coerce.number().int().positive(),
  lan_idmin: z.coerce.number().int().positive(),
});

const batchSchema = z.object({
  rows: z.array(rowSchema).min(1, "Informe ao menos um registro"),
});

function normalizeRows(rows) {
  return rows.map((row) => ({
    lan_idmem: Number(row.lan_idmem),
    lan_deslan: row.lan_deslan.trim(),
    lan_valor: Number(row.lan_valor),
    lan_datlan: row.lan_datlan,
    lan_lanope: Number(row.lan_lanope),
    lan_idmin: Number(row.lan_idmin),
  }));
}

function validateCadlan2Batch(payload) {
  const parsed = batchSchema.safeParse(payload);

  if (!parsed.success) {
    throw new ValidationError("Dados invalidos para cadlan2", parsed.error.flatten());
  }

  return normalizeRows(parsed.data.rows);
}

module.exports = {
  validateCadlan2Batch,
};
