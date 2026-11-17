const service = require("./cadlan2.ai.service");
const { assertOperationPassword } = require("../../shared/operationPassword");

async function getStatus(req, res, next) {
  try {
    const status = await service.getCadlan2AiStatus();
    res.json(status);
  } catch (error) {
    next(error);
  }
}

async function suggestRows(req, res, next) {
  let stage = "senha de confirmacao";
  try {
    assertOperationPassword(req.body);
    stage = "geracao de sugestoes";
    const result = await service.suggestCadlan2Rows(req.body);
    res.json({
      message: "Sugestoes de IA geradas com sucesso.",
      suggestions: result.suggestions,
      globalWarnings: result.globalWarnings,
      meta: result.meta,
    });
  } catch (error) {
    console.error("[cadlan2-ai] Falha ao gerar sugestoes", {
      stage: error.aiStage || stage,
      status: error.statusCode || 500,
      errorType: error.name,
      message: error.message,
      providerStatus: error.providerStatus || null,
      providerCode: error.providerCode || null,
      networkCode: error.networkCode || null,
      model: error.aiModel || null,
    });
    next(error);
  }
}

module.exports = {
  getStatus,
  suggestRows,
};
