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

function normalizeOptionalText(maxLength) {
  return z.preprocess(
    (value) => {
      if (value === null || value === undefined) {
        return "";
      }

      return String(value).trim();
    },
    z.string().max(maxLength)
  );
}

function normalizeOptionalInteger() {
  return z.preprocess(
    (value) => {
      if (value === null || value === undefined || value === "") {
        return null;
      }

      const parsed = Number(value);
      if (!Number.isInteger(parsed)) {
        return value;
      }

      return parsed;
    },
    z.number().int().positive().nullable()
  );
}

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

const requestRowSchema = z.object({
  clientRowId: z.string().trim().min(1).max(120),
  id: z.coerce.number().int().positive().optional(),
  lan_idmem: z.preprocess(
    (value) => {
      if (value === null || value === undefined || value === "") {
        return 0;
      }

      const parsed = Number(value);
      if (!Number.isInteger(parsed)) {
        return value;
      }

      return parsed;
    },
    z.number().int().min(0)
  ),
  lan_deslan: normalizeOptionalText(150),
  lan_valor: z.preprocess(
    (value) => {
      if (value === null || value === undefined || value === "") {
        return null;
      }

      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        return value;
      }

      return parsed;
    },
    z.number().positive().max(99999999.99).nullable()
  ),
  lan_datlan: z.preprocess(
    (value) => {
      if (value === null || value === undefined) {
        return "";
      }

      return String(value).trim();
    },
    z.string().refine((value) => value === "" || isRealIsoDate(value), "lan_datlan deve estar no formato YYYY-MM-DD")
  ),
  lan_lanope: z.preprocess(
    (value) => {
      if (value === null || value === undefined || value === "") {
        return 0;
      }

      const parsed = Number(value);
      if (!Number.isInteger(parsed)) {
        return value;
      }

      return parsed;
    },
    z.number().int().min(0)
  ),
  lan_idmin: z.preprocess(
    (value) => {
      if (value === null || value === undefined || value === "") {
        return 0;
      }

      const parsed = Number(value);
      if (!Number.isInteger(parsed)) {
        return value;
      }

      return parsed;
    },
    z.number().int().min(0)
  ),
  aux_extrato_desc: normalizeOptionalText(300),
  aux_extrato_dc: auxDebitCreditSchema,
  aux_extrato_fitid: normalizeOptionalText(120),
});

const requestSchema = z.object({
  prompt: normalizeOptionalText(3000).optional(),
  scope: z.enum(["selected", "visible"]).default("selected"),
  overwrite: z.coerce.boolean().default(false),
  rows: z.array(requestRowSchema).min(1, "Selecione ao menos uma linha").max(50, "Limite maximo de 50 linhas por solicitacao"),
});

const rawSuggestionSchema = z.object({
  clientRowId: z.string().trim().min(1).max(120),
  lan_deslan: z.preprocess(
    (value) => {
      if (value === null || value === undefined) {
        return null;
      }

      const normalized = String(value).trim();
      return normalized || null;
    },
    z.string().max(150).nullable()
  ),
  lan_lanope: normalizeOptionalInteger(),
  lan_idmin: normalizeOptionalInteger(),
  confidence: z.preprocess(
    (value) => {
      if (value === null || value === undefined || value === "") {
        return 0;
      }

      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : value;
    },
    z.number().min(0).max(1)
  ),
  reason: normalizeOptionalText(600),
  warnings: z.array(normalizeOptionalText(220)).max(10),
});

const rawResponseSchema = z.object({
  suggestions: z.array(rawSuggestionSchema).max(50),
  globalWarnings: z.array(normalizeOptionalText(220)).max(20),
});

function validateCadlan2AiSuggestRequest(payload) {
  const parsed = requestSchema.safeParse(payload);

  if (!parsed.success) {
    throw new ValidationError("Dados invalidos para sugestao por IA", parsed.error.flatten());
  }

  return {
    prompt: parsed.data.prompt || "",
    scope: parsed.data.scope,
    overwrite: parsed.data.overwrite,
    rows: parsed.data.rows,
  };
}

function validateCadlan2AiRawResponse(payload) {
  const parsed = rawResponseSchema.safeParse(payload);

  if (!parsed.success) {
    throw new ValidationError("Resposta invalida recebida da IA", parsed.error.flatten());
  }

  return parsed.data;
}

module.exports = {
  validateCadlan2AiSuggestRequest,
  validateCadlan2AiRawResponse,
};
