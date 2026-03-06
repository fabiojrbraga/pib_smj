const repository = require("./cadlan2.repository");
const { validateCadlan2Batch, validateCadlan2Row } = require("./cadlan2.validation");
const { ValidationError } = require("../../shared/errors");

async function getCadlan2Rows() {
  return repository.listCadlan2();
}

async function saveCadlan2Batch(payload) {
  const rows = validateCadlan2Batch(payload);
  const foreignKeysValidation = await repository.validateForeignKeys(rows);

  const hasForeignKeyErrors =
    foreignKeysValidation.missingMembers.length > 0 ||
    foreignKeysValidation.missingOperations.length > 0 ||
    foreignKeysValidation.missingMinistries.length > 0;

  if (hasForeignKeyErrors) {
    throw new ValidationError("Foram encontrados IDs inexistentes nas chaves estrangeiras", foreignKeysValidation);
  }

  const total = await repository.replaceCadlan2Batch(rows);
  return { total };
}

async function saveCadlan2Row(payload) {
  const row = validateCadlan2Row(payload);
  const { id, ...rowData } = row;

  const foreignKeysValidation = await repository.validateForeignKeys([rowData]);
  const hasForeignKeyErrors =
    foreignKeysValidation.missingMembers.length > 0 ||
    foreignKeysValidation.missingOperations.length > 0 ||
    foreignKeysValidation.missingMinistries.length > 0;

  if (hasForeignKeyErrors) {
    throw new ValidationError("Foram encontrados IDs inexistentes nas chaves estrangeiras", foreignKeysValidation);
  }

  if (id) {
    const updatedRow = await repository.updateCadlan2Row(id, rowData);
    if (!updatedRow) {
      throw new ValidationError(`Registro ${id} nao encontrado na cadlan2 para atualizacao.`);
    }

    return {
      row: updatedRow,
      created: false,
    };
  }

  const insertedRow = await repository.insertCadlan2Row(rowData);
  return {
    row: insertedRow,
    created: true,
  };
}

async function commitCadlan2Batch() {
  const validation = await repository.validateCadlan2DatabaseRows();
  const hasErrors =
    validation.missingMembers.length > 0 ||
    validation.missingOperations.length > 0 ||
    validation.missingMinistries.length > 0;

  if (hasErrors) {
    throw new ValidationError("Nao foi possivel confirmar. Existem chaves estrangeiras invalidas na cadlan2.", validation);
  }

  if (validation.totalRows === 0) {
    throw new ValidationError("Nao ha registros na cadlan2 para confirmar.");
  }

  const insertedRows = await repository.commitCadlan2ToCadlan();
  return { insertedRows };
}

module.exports = {
  getCadlan2Rows,
  saveCadlan2Batch,
  saveCadlan2Row,
  commitCadlan2Batch,
};
