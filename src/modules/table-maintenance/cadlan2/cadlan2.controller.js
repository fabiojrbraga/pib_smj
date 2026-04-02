const service = require("./cadlan2.service");

async function listRows(req, res, next) {
  try {
    const rows = await service.getCadlan2Rows();
    res.json({ rows });
  } catch (error) {
    next(error);
  }
}

async function saveBatch(req, res, next) {
  try {
    const result = await service.saveCadlan2Batch(req.body);
    res.json({
      message: "cadlan2 atualizada com sucesso.",
      total: result.total,
    });
  } catch (error) {
    next(error);
  }
}

async function saveRow(req, res, next) {
  try {
    const result = await service.saveCadlan2Row(req.body);
    res.json({
      message: result.created
        ? "Linha salva com sucesso na cadlan2."
        : "Linha atualizada com sucesso na cadlan2.",
      row: result.row,
    });
  } catch (error) {
    next(error);
  }
}

async function commitBatch(req, res, next) {
  try {
    const result = await service.commitCadlan2Batch(req.body);
    res.json({
      message: "Registros selecionados enviados para cadlan com sucesso.",
      insertedRows: result.insertedRows,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listRows,
  saveBatch,
  saveRow,
  commitBatch,
};
