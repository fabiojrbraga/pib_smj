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

const auxDescriptionSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined) {
      return "";
    }

    return String(value);
  },
  z.string().trim().max(300)
);

const auxDebitCreditSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined) {
      return "";
    }

    return String(value).trim().toUpperCase();
  },
  z
    .string()
    .max(1)
    .refine(
      (value) => value === "" || value === "D" || value === "C",
      "aux_extrato_dc deve ser D, C ou vazio"
    )
);

const memberIdSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined) {
      return 0;
    }

    if (typeof value === "string" && value.trim() === "") {
      return 0;
    }

    return value;
  },
  z.coerce.number().int().min(0)
);

const ministryIdSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined) {
      return 0;
    }

    if (typeof value === "string" && value.trim() === "") {
      return 0;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return value;
    }

    if (parsed <= 0) {
      return 0;
    }

    return parsed;
  },
  z.coerce.number().int().min(0)
);

const rowSchema = z.object({
  lan_idmem: memberIdSchema,
  lan_deslan: z.string().trim().min(1).max(150),
  lan_valor: z.coerce.number().positive().max(99999999.99),
  lan_datlan: z.string().refine(isRealIsoDate, "lan_datlan deve estar no formato YYYY-MM-DD"),
  lan_lanope: z.coerce.number().int().positive(),
  lan_idmin: ministryIdSchema,
  aux_extrato_desc: auxDescriptionSchema,
  aux_extrato_dc: auxDebitCreditSchema,
});

const optionalIdSchema = z.preprocess(
  (value) => {
    if (value === null || value === undefined) {
      return undefined;
    }

    if (typeof value === "string" && value.trim() === "") {
      return undefined;
    }

    return value;
  },
  z.coerce.number().int().positive().optional()
);

const batchSchema = z.object({
  rows: z.array(rowSchema).min(1, "Informe ao menos um registro"),
});

const singleRowSchema = z.object({
  row: rowSchema.extend({
    id: optionalIdSchema,
  }),
});

function normalizeRows(rows) {
  return rows.map((row) => ({
    lan_idmem: Number(row.lan_idmem),
    lan_deslan: row.lan_deslan.trim(),
    lan_valor: Number(row.lan_valor),
    lan_datlan: row.lan_datlan,
    lan_lanope: Number(row.lan_lanope),
    lan_idmin: Number(row.lan_idmin),
    aux_extrato_desc: row.aux_extrato_desc.trim(),
    aux_extrato_dc: row.aux_extrato_dc,
  }));
}

function normalizeRow(row) {
  const normalizedRow = {
    lan_idmem: Number(row.lan_idmem),
    lan_deslan: row.lan_deslan.trim(),
    lan_valor: Number(row.lan_valor),
    lan_datlan: row.lan_datlan,
    lan_lanope: Number(row.lan_lanope),
    lan_idmin: Number(row.lan_idmin),
    aux_extrato_desc: row.aux_extrato_desc.trim(),
    aux_extrato_dc: row.aux_extrato_dc,
  };

  if (Number.isInteger(row.id) && row.id > 0) {
    normalizedRow.id = Number(row.id);
  }

  return normalizedRow;
}

function validateCadlan2Batch(payload) {
  const parsed = batchSchema.safeParse(payload);

  if (!parsed.success) {
    throw new ValidationError("Dados invalidos para cadlan2", parsed.error.flatten());
  }

  return normalizeRows(parsed.data.rows);
}

function validateCadlan2Row(payload) {
  const parsed = singleRowSchema.safeParse(payload);

  if (!parsed.success) {
    throw new ValidationError("Dados invalidos para cadlan2", parsed.error.flatten());
  }

  return normalizeRow(parsed.data.row);
}

module.exports = {
  validateCadlan2Batch,
  validateCadlan2Row,
};
