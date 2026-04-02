const repository = require("./cadlan2.repository");
const { validateCadlan2Batch, validateCadlan2Commit, validateCadlan2Row } = require("./cadlan2.validation");
const { ValidationError } = require("../../shared/errors");

function normalizeDebitCreditCode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "D" || normalized === "C") {
    return normalized;
  }

  return "";
}

function buildDuplicateFitIdErrors(rows) {
  const fitIdLineMap = new Map();

  rows.forEach((row, index) => {
    const fitId = String(row.aux_extrato_fitid || "").trim();
    if (!fitId) {
      return;
    }

    if (!fitIdLineMap.has(fitId)) {
      fitIdLineMap.set(fitId, []);
    }

    fitIdLineMap.get(fitId).push(index + 1);
  });

  return [...fitIdLineMap.entries()]
    .filter(([, lines]) => lines.length > 1)
    .map(([fitId, lines]) => `FITID ${fitId} duplicado nas linhas ${lines.join(", ")}.`);
}

async function validateUniqueExtractFitIdsForBatch(rows) {
  const duplicateErrors = buildDuplicateFitIdErrors(rows);
  if (duplicateErrors.length > 0) {
    throw new ValidationError("Dados invalidos para cadlan2", { formErrors: duplicateErrors });
  }
}

async function validateUniqueExtractFitIdForRow(row, currentRowId = null) {
  const fitId = String(row.aux_extrato_fitid || "").trim();
  if (!fitId) {
    return;
  }

  const existingRows = await repository.findCadlan2RowsByExtractFitIds([fitId]);
  const conflictingRow = existingRows.find((item) => Number(item.id) !== Number(currentRowId || 0));

  if (conflictingRow) {
    throw new ValidationError("Ja existe uma transacao OFX importada com este FITID na cadlan2.", {
      conflictingRowId: conflictingRow.id,
      conflictingFitId: conflictingRow.aux_extrato_fitid,
    });
  }
}

async function validateMinistryForDebitRows(rows) {
  const operationIds = rows.map((row) => row.lan_lanope);
  const operationTypeMap = await repository.getOperationDebitCreditTypes(operationIds);
  const errors = [];

  rows.forEach((row, index) => {
    const auxType = normalizeDebitCreditCode(row.aux_extrato_dc);
    const operationType = normalizeDebitCreditCode(operationTypeMap.get(Number(row.lan_lanope)));
    const debitCreditType = auxType || operationType;
    const hasMinistry = Number.isInteger(row.lan_idmin) && row.lan_idmin > 0;

    if (debitCreditType === "D" && !hasMinistry) {
      errors.push(`Linha ${index + 1}: lan_idmin obrigatorio para debito.`);
    }
  });

  if (errors.length > 0) {
    throw new ValidationError("Dados invalidos para cadlan2", { formErrors: errors });
  }
}

async function getCadlan2Rows() {
  await repository.ensureCadlan2Schema();
  return repository.listCadlan2();
}

async function saveCadlan2Batch(payload) {
  await repository.ensureCadlan2Schema();
  const rows = validateCadlan2Batch(payload);
  await validateUniqueExtractFitIdsForBatch(rows);
  await validateMinistryForDebitRows(rows);
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
  await repository.ensureCadlan2Schema();
  const row = validateCadlan2Row(payload);
  const { id, ...rowData } = row;
  await validateUniqueExtractFitIdForRow(rowData, id);
  await validateMinistryForDebitRows([rowData]);

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

async function commitCadlan2Batch(payload) {
  await repository.ensureCadlan2Schema();
  const selectedIds = validateCadlan2Commit(payload);
  const validation = await repository.validateCadlan2DatabaseRows(selectedIds);
  const hasErrors =
    validation.missingMembers.length > 0 ||
    validation.missingOperations.length > 0 ||
    validation.missingMinistries.length > 0 ||
    validation.debitRowsWithoutMinistry.length > 0;

  if (validation.totalRows === 0) {
    throw new ValidationError("Nenhum registro selecionado foi encontrado na cadlan2 para confirmar.", validation);
  }

  if (validation.missingSelectedIds.length > 0) {
    throw new ValidationError("Nao foi possivel confirmar. Alguns registros selecionados nao existem mais na cadlan2.", validation);
  }

  if (hasErrors) {
    throw new ValidationError(
      "Nao foi possivel confirmar. Existem chaves estrangeiras invalidas nos registros selecionados da cadlan2.",
      validation
    );
  }

  const insertedRows = await repository.commitCadlan2ToCadlan(selectedIds);
  return { insertedRows };
}

module.exports = {
  getCadlan2Rows,
  saveCadlan2Batch,
  saveCadlan2Row,
  commitCadlan2Batch,
};
