function buildSuggestionToolDefinition() {
  return {
    type: "function",
    function: {
      name: "return_cadlan2_suggestions",
      description:
        "Retorna sugestoes de preenchimento para lan_deslan, lan_lanope e lan_idmin das linhas solicitadas.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          suggestions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                clientRowId: {
                  type: "string",
                },
                lan_deslan: {
                  type: ["string", "null"],
                },
                lan_lanope: {
                  type: ["integer", "null"],
                },
                lan_idmin: {
                  type: ["integer", "null"],
                },
                confidence: {
                  type: "number",
                  minimum: 0,
                  maximum: 1,
                },
                reason: {
                  type: "string",
                },
                warnings: {
                  type: "array",
                  items: {
                    type: "string",
                  },
                },
              },
              required: [
                "clientRowId",
                "lan_deslan",
                "lan_lanope",
                "lan_idmin",
                "confidence",
                "reason",
                "warnings",
              ],
            },
          },
          globalWarnings: {
            type: "array",
            items: {
              type: "string",
            },
          },
        },
        required: ["suggestions", "globalWarnings"],
      },
    },
  };
}

function buildApplicationSystemInstructions() {
  return [
    "Voce atua em uma tela de manutencao financeira para sugerir preenchimento de lancamentos.",
    "Use SEMPRE as regras do prompt de sistema configurado pela aplicacao.",
    "Preencha apenas os campos lan_deslan, lan_lanope e lan_idmin.",
    "Nunca invente IDs. Use somente IDs existentes nas listas de operacoes e ministerios fornecidas.",
    "Se estiver incerto, retorne null para o campo e explique nas warnings ou no reason.",
    "Priorize exemplos similares por aux_extrato_desc vindos do historico de cadlan2.",
    "Nao sugira lan_idmin quando nao houver base suficiente.",
    "Retorne exatamente uma sugestao para cada clientRowId recebido.",
    "Lan_deslan deve ser curto, claro e adequado ao historico semelhante.",
  ].join("\n");
}

function buildUserPrompt({ prompt, overwrite, lookups, rows }) {
  const userInstructions = String(prompt || "").trim();

  return [
    "Contexto da solicitacao:",
    JSON.stringify(
      {
        overwrite,
        userInstructions,
        operations: lookups.operations.map((item) => ({
          id: item.id,
          label: item.label,
          type: item.type,
        })),
        ministries: lookups.ministries.map((item) => ({
          id: item.id,
          label: item.label,
        })),
        rows: rows.map((item) => ({
          row: {
            clientRowId: item.clientRowId,
            id: item.id || null,
            lan_deslan: item.lan_deslan,
            lan_valor: item.lan_valor,
            lan_datlan: item.lan_datlan,
            lan_lanope: item.lan_lanope,
            lan_idmin: item.lan_idmin,
            aux_extrato_desc: item.aux_extrato_desc,
            aux_extrato_dc: item.aux_extrato_dc,
            aux_extrato_fitid: item.aux_extrato_fitid,
          },
          similarExamples: item.similarExamples.map((example) => ({
            id: example.id,
            aux_extrato_desc: example.aux_extrato_desc,
            aux_extrato_dc: example.aux_extrato_dc,
            lan_deslan: example.lan_deslan,
            lan_lanope: example.lan_lanope,
            lan_idmin: example.lan_idmin,
            similarity: example.similarity,
          })),
        })),
      },
      null,
      2
    ),
    userInstructions
      ? `Instrucao opcional do usuario: ${userInstructions}`
      : "Nenhuma instrucao adicional do usuario foi informada.",
  ].join("\n\n");
}

module.exports = {
  buildSuggestionToolDefinition,
  buildApplicationSystemInstructions,
  buildUserPrompt,
};
