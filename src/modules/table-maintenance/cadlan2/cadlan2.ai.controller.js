const service = require("./cadlan2.ai.service");

async function getStatus(req, res, next) {
  try {
    const status = await service.getCadlan2AiStatus();
    res.json(status);
  } catch (error) {
    next(error);
  }
}

async function suggestRows(req, res, next) {
  try {
    const result = await service.suggestCadlan2Rows(req.body);
    res.json({
      message: "Sugestoes de IA geradas com sucesso.",
      suggestions: result.suggestions,
      globalWarnings: result.globalWarnings,
      meta: result.meta,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getStatus,
  suggestRows,
};
