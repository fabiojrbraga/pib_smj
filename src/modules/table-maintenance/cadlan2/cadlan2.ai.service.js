const https = require("https");
const { env } = require("../../../config/env");
const lookupsService = require("../../lookups/lookups.service");
const { AppError } = require("../../shared/errors");
const repository = require("./cadlan2.ai.repository");
const {
  validateCadlan2AiSuggestRequest,
  validateCadlan2AiRawResponse,
} = require("./cadlan2.ai.validation");
const {
  buildSuggestionToolDefinition,
  buildApplicationSystemInstructions,
  buildUserPrompt,
} = require("./cadlan2.ai.prompt");

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_TOOL_NAME = "return_cadlan2_suggestions";

function clampConfidence(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.min(1, Math.max(0, Number(parsed.toFixed(2))));
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new AppError("A OpenAI retornou um payload invalido para sugestoes.", 502);
  }
}

function postJson(url, body, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const requestBody = JSON.stringify(body);
    const request = https.request(
      {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(requestBody),
          ...headers,
        },
      },
      (response) => {
        const chunks = [];

        response.on("data", (chunk) => {
          chunks.push(chunk);
        });

        response.on("end", () => {
          const responseText = Buffer.concat(chunks).toString("utf-8");
          let payload = {};

          try {
            payload = responseText ? parseJson(responseText) : {};
          } catch (error) {
            reject(error);
            return;
          }

          if (response.statusCode < 200 || response.statusCode >= 300) {
            const apiMessage =
              payload?.error?.message ||
              payload?.message ||
              "Falha ao consultar a OpenAI para gerar sugestoes.";

            reject(new AppError(apiMessage, 502, payload?.error || null));
            return;
          }

          resolve(payload);
        });
      }
    );

    request.setTimeout(timeoutMs, () => {
      request.destroy(new AppError("Tempo limite excedido ao consultar a OpenAI.", 504));
    });

    request.on("error", (error) => {
      reject(
        error instanceof AppError
          ? error
          : new AppError(error.message || "Falha ao consultar a OpenAI.", 502)
      );
    });

    request.write(requestBody);
    request.end();
  });
}

async function callOpenAiForSuggestions({ lookups, prompt, overwrite, rows }) {
  const requestBody = {
    model: env.ai.model,
    temperature: 0.2,
    parallel_tool_calls: false,
    tool_choice: {
      type: "function",
      function: {
        name: OPENAI_TOOL_NAME,
      },
    },
    tools: [buildSuggestionToolDefinition()],
    messages: [
      {
        role: "system",
        content: env.ai.systemPrompt,
      },
      {
        role: "system",
        content: buildApplicationSystemInstructions(),
      },
      {
        role: "user",
        content: buildUserPrompt({
          prompt,
          overwrite,
          lookups,
          rows,
        }),
      },
    ],
  };

  const payload = await postJson(
    OPENAI_CHAT_COMPLETIONS_URL,
    requestBody,
    {
      Authorization: `Bearer ${env.ai.apiKey}`,
    },
    env.ai.timeoutMs
  );

  const toolCall = payload?.choices?.[0]?.message?.tool_calls?.find(
    (item) => item?.type === "function" && item?.function?.name === OPENAI_TOOL_NAME
  );

  if (!toolCall?.function?.arguments) {
    throw new AppError("A OpenAI nao retornou sugestoes estruturadas.", 502);
  }

  return validateCadlan2AiRawResponse(parseJson(toolCall.function.arguments));
}

function buildLookupSets(lookups) {
  return {
    operationIds: new Set(lookups.operations.map((item) => Number(item.id))),
    ministryIds: new Set(lookups.ministries.map((item) => Number(item.id))),
    operationTypes: new Map(
      lookups.operations.map((item) => [Number(item.id), String(item.type || "").trim().toUpperCase()])
    ),
  };
}

function normalizeDebitCreditCode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "D" || normalized === "C") {
    return normalized;
  }

  return "";
}

function buildNormalizedSuggestion(rawSuggestion, requestRow, lookupSets) {
  const warnings = [...rawSuggestion.warnings];
  const suggestion = {
    clientRowId: requestRow.clientRowId,
    suggestedFields: {
      lan_deslan: rawSuggestion.lan_deslan || null,
      lan_lanope: rawSuggestion.lan_lanope || null,
      lan_idmin: rawSuggestion.lan_idmin || null,
    },
    confidence: clampConfidence(rawSuggestion.confidence),
    reason: rawSuggestion.reason || "Sugestao gerada pela IA.",
    warnings,
    supportingExamples: requestRow.similarExamples,
  };

  if (
    suggestion.suggestedFields.lan_lanope !== null &&
    !lookupSets.operationIds.has(Number(suggestion.suggestedFields.lan_lanope))
  ) {
    suggestion.suggestedFields.lan_lanope = null;
    warnings.push("A IA retornou uma operacao invalida e a sugestao foi descartada.");
  }

  if (
    suggestion.suggestedFields.lan_idmin !== null &&
    !lookupSets.ministryIds.has(Number(suggestion.suggestedFields.lan_idmin))
  ) {
    suggestion.suggestedFields.lan_idmin = null;
    warnings.push("A IA retornou um ministerio invalido e a sugestao foi descartada.");
  }

  if (suggestion.suggestedFields.lan_deslan) {
    suggestion.suggestedFields.lan_deslan = suggestion.suggestedFields.lan_deslan.trim().slice(0, 150);
  }

  const debitCreditCode =
    normalizeDebitCreditCode(requestRow.aux_extrato_dc) ||
    normalizeDebitCreditCode(lookupSets.operationTypes.get(Number(suggestion.suggestedFields.lan_lanope)));

  if (debitCreditCode === "D" && !suggestion.suggestedFields.lan_idmin) {
    warnings.push("Linha de debito sem ministerio sugerido com confianca suficiente.");
  }

  return suggestion;
}

async function getCadlan2AiStatus() {
  return {
    enabled: env.ai.enabled,
    model: env.ai.enabled ? env.ai.model : null,
    message: env.ai.statusMessage,
    limits: {
      maxRowsPerRequest: env.ai.maxRowsPerRequest,
      maxExamplesPerRow: env.ai.maxExamplesPerRow,
    },
  };
}

async function suggestCadlan2Rows(payload) {
  if (!env.ai.enabled) {
    throw new AppError("Funcionalidade de IA nao configurada neste ambiente.", 503, {
      enabled: false,
      message: env.ai.statusMessage,
    });
  }

  const request = validateCadlan2AiSuggestRequest(payload);
  if (request.rows.length > env.ai.maxRowsPerRequest) {
    throw new AppError(
      `Limite de ${env.ai.maxRowsPerRequest} linha(s) por solicitacao de IA excedido.`,
      422
    );
  }

  const lookups = await lookupsService.getAllLookups();
  const rowsWithExamples = await Promise.all(
    request.rows.map(async (row) => ({
      ...row,
      similarExamples: await repository.findSimilarCadlan2Rows(row, {
        limit: env.ai.maxExamplesPerRow,
      }),
    }))
  );

  const rawResponse = await callOpenAiForSuggestions({
    lookups,
    prompt: request.prompt,
    overwrite: request.overwrite,
    rows: rowsWithExamples,
  });

  const suggestionsByRowId = new Map(
    rawResponse.suggestions.map((item) => [item.clientRowId, item])
  );
  const lookupSets = buildLookupSets(lookups);

  const suggestions = rowsWithExamples.map((row) => {
    const rawSuggestion = suggestionsByRowId.get(row.clientRowId);

    if (!rawSuggestion) {
      return {
        clientRowId: row.clientRowId,
        suggestedFields: {
          lan_deslan: null,
          lan_lanope: null,
          lan_idmin: null,
        },
        confidence: 0,
        reason: "A IA nao retornou sugestao para esta linha.",
        warnings: ["Nenhuma sugestao estruturada foi recebida para esta linha."],
        supportingExamples: row.similarExamples,
      };
    }

    return buildNormalizedSuggestion(rawSuggestion, row, lookupSets);
  });

  return {
    suggestions,
    globalWarnings: rawResponse.globalWarnings,
    meta: {
      model: env.ai.model,
      rowsAnalyzed: rowsWithExamples.length,
      promptProvided: Boolean(String(request.prompt || "").trim()),
    },
  };
}

module.exports = {
  getCadlan2AiStatus,
  suggestCadlan2Rows,
};
