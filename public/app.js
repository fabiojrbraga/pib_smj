const API_BASE = "/api";
const UNSAVED_ROWS_STORAGE_KEY = "cadlan2_unsaved_rows_v1";

const state = {
  lookups: null,
  table: null,
  busy: false,
  controls: {},
  pinnedSavedRowIds: new Set(),
};

function setStatus(message, type = "info") {
  const statusElement = document.getElementById("statusBar");
  statusElement.textContent = message;
  statusElement.classList.remove("status-error", "status-success");

  if (type === "error") {
    statusElement.classList.add("status-error");
  }
  if (type === "success") {
    statusElement.classList.add("status-success");
  }
}

function setBusy(busy) {
  state.busy = busy;
  Object.values(state.controls).forEach((element) => {
    if (element) {
      element.disabled = busy;
    }
  });
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || "Falha na requisicao.");
  }

  return payload;
}

function buildLookupMap(items) {
  return new Map(items.map((item) => [Number(item.id), `${item.id} - ${item.label}`]));
}

function buildMemberNameMap(items) {
  return new Map(items.map((item) => [Number(item.id), String(item.label || "").trim()]));
}

function buildLookupOptions(items) {
  return items.map((item) => ({
    label: `${item.id} - ${item.label}`,
    value: Number(item.id),
  }));
}

function lookupFormatter(lookupMap) {
  return (cell) => {
    const rawValue = cell.getValue();
    const normalized = Number(rawValue);

    if (!rawValue && rawValue !== 0) {
      return "";
    }

    return lookupMap.get(normalized) || `${rawValue} - ID nao encontrado`;
  };
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return String(value);
  }

  return parsed.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function normalizeDebitCreditCode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "D" || normalized === "C") {
    return normalized;
  }
  return "";
}

function buildOperationTypeMap(operations) {
  return new Map(
    operations.map((item) => [Number(item.id), normalizeDebitCreditCode(item.type)])
  );
}

function buildOperationOptionGroups(operations) {
  const debitOperations = operations.filter(
    (item) => normalizeDebitCreditCode(item.type) === "D"
  );
  const creditOperations = operations.filter(
    (item) => normalizeDebitCreditCode(item.type) === "C"
  );

  return {
    all: buildLookupOptions(operations),
    debit: buildLookupOptions(debitOperations),
    credit: buildLookupOptions(creditOperations),
  };
}

function getOperationOptionsForRow(optionGroups, debitCreditCode) {
  if (debitCreditCode === "D") {
    return optionGroups.debit.length > 0 ? optionGroups.debit : optionGroups.all;
  }

  if (debitCreditCode === "C") {
    return optionGroups.credit.length > 0 ? optionGroups.credit : optionGroups.all;
  }

  return optionGroups.all;
}

function resolveDebitCreditForRow(row, operationTypeMap) {
  const fromExtract = normalizeDebitCreditCode(row.aux_extrato_dc);
  if (fromExtract) {
    return fromExtract;
  }

  const operationId = Number(row.lan_lanope);
  if (!Number.isInteger(operationId) || operationId <= 0) {
    return "";
  }

  return normalizeDebitCreditCode(operationTypeMap.get(operationId));
}

function calculateSignedTotalForRows(rows, operationTypeMap) {
  return rows.reduce((accumulator, row) => {
    const amount = parseMoneyInput(row.lan_valor);
    if (!Number.isFinite(amount) || amount === 0) {
      return accumulator;
    }

    const debitCreditCode = resolveDebitCreditForRow(row, operationTypeMap);
    const absoluteAmount = Math.abs(amount);

    if (debitCreditCode === "C") {
      return accumulator - absoluteAmount;
    }

    return accumulator + absoluteAmount;
  }, 0);
}

function isSavedCadlan2Row(row) {
  return row?.__saved_in_cadlan2 === true;
}

function getPersistedRowId(row) {
  const id = Number(row?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return id;
}

function isPinnedSavedRow(row) {
  const id = getPersistedRowId(row);
  return id !== null && state.pinnedSavedRowIds.has(id);
}

function markRowAsSavedInCadlan2(row) {
  return {
    ...row,
    __saved_in_cadlan2: true,
  };
}

function markRowAsUnsavedInCadlan2(row) {
  return {
    ...normalizeUnsavedRowForStorage(row),
    __saved_in_cadlan2: false,
  };
}

function isCompletelyBlankRow(row) {
  return (
    isBlank(row.lan_idmem) &&
    isBlank(row.lan_deslan) &&
    isBlank(row.lan_valor) &&
    isBlank(row.lan_datlan) &&
    isBlank(row.lan_lanope) &&
    isBlank(row.lan_idmin) &&
    isBlank(row.aux_extrato_desc) &&
    isBlank(row.aux_extrato_dc)
  );
}

function normalizeUnsavedRowForStorage(row) {
  return {
    lan_idmem: row.lan_idmem ?? "",
    lan_deslan: row.lan_deslan ?? "",
    lan_valor: row.lan_valor ?? "",
    lan_datlan: row.lan_datlan ?? "",
    lan_lanope: row.lan_lanope ?? "",
    lan_idmin: row.lan_idmin ?? "",
    aux_extrato_desc: row.aux_extrato_desc ?? "",
    aux_extrato_dc: row.aux_extrato_dc ?? "",
  };
}

function persistUnsavedRowsToLocalStorage(rowsData = null) {
  try {
    const sourceRows = Array.isArray(rowsData) ? rowsData : state.table?.getData() || [];
    const unsavedRows = sourceRows
      .filter((row) => !isSavedCadlan2Row(row))
      .map((row) => normalizeUnsavedRowForStorage(row))
      .filter((row) => !isCompletelyBlankRow(row));

    if (unsavedRows.length === 0) {
      window.localStorage.removeItem(UNSAVED_ROWS_STORAGE_KEY);
      return;
    }

    window.localStorage.setItem(UNSAVED_ROWS_STORAGE_KEY, JSON.stringify(unsavedRows));
  } catch (error) {
    // Storage failures should not interrupt the main grid flow.
    console.warn("Falha ao persistir linhas nao salvas no storage local.", error);
  }
}

function loadUnsavedRowsFromLocalStorage() {
  try {
    const rawValue = window.localStorage.getItem(UNSAVED_ROWS_STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((row) => row && typeof row === "object")
      .map((row) => markRowAsUnsavedInCadlan2(row))
      .filter((row) => !isCompletelyBlankRow(row));
  } catch (error) {
    console.warn("Falha ao carregar linhas nao salvas do storage local.", error);
    return [];
  }
}

function clearUnsavedRowsFromLocalStorage() {
  try {
    window.localStorage.removeItem(UNSAVED_ROWS_STORAGE_KEY);
  } catch (error) {
    console.warn("Falha ao limpar linhas nao salvas do storage local.", error);
  }
}

function normalizeIsoDateForFilter(value) {
  const normalized = String(value || "").trim();
  return isIsoDate(normalized) ? normalized : "";
}

function getActiveDateRange() {
  const fromInput = normalizeIsoDateForFilter(state.controls.dateFrom?.value);
  const toInput = normalizeIsoDateForFilter(state.controls.dateTo?.value);

  if (fromInput && toInput && fromInput > toInput) {
    return {
      from: toInput,
      to: fromInput,
    };
  }

  return {
    from: fromInput,
    to: toInput,
  };
}

function applyGridFilters() {
  if (!state.table || !state.controls.showSaved) {
    return;
  }

  const shouldShowSavedRows = state.controls.showSaved.checked;
  const dateRange = getActiveDateRange();

  state.table.setFilter((rowData) => {
    if (!shouldShowSavedRows && isSavedCadlan2Row(rowData) && !isPinnedSavedRow(rowData)) {
      return false;
    }

    if (!dateRange.from && !dateRange.to) {
      return true;
    }

    const rowDate = normalizeIsoDateForFilter(rowData.lan_datlan);
    if (!rowDate) {
      return false;
    }

    if (dateRange.from && rowDate < dateRange.from) {
      return false;
    }

    if (dateRange.to && rowDate > dateRange.to) {
      return false;
    }

    return true;
  });
}

function saveButtonFormatter(cell) {
  const rowData = cell.getRow().getData();
  const isSaved = isSavedCadlan2Row(rowData);
  const actionLabel = isSaved ? "Atualizar linha na cadlan2" : "Salvar linha na cadlan2";
  const buttonClass = isSaved ? "row-save-btn row-save-btn-saved" : "row-save-btn";

  return `
    <button class="${buttonClass}" type="button" title="${actionLabel}" aria-label="${actionLabel}">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 2h13l3 3v17H4V2zm2 2v4h10V4H6zm0 8v8h12v-8H6z"></path>
      </svg>
    </button>
  `;
}

function applySavedRowClass(rowComponent) {
  const rowElement = rowComponent.getElement();
  if (!rowElement) {
    return;
  }

  const rowData = rowComponent.getData();
  const isSaved = isSavedCadlan2Row(rowData);

  rowElement.classList.toggle("tabulator-row-saved", isSaved);
  rowElement.classList.toggle("tabulator-row-saved-recent", isSaved && isPinnedSavedRow(rowData));
}

function auxDescriptionFormatter(cell) {
  const description = String(cell.getValue() || "").trim();
  if (!description) {
    return "";
  }

  const content = document.createElement("span");
  content.textContent = description;
  content.title = description;
  return content;
}

function createGrid(lookups, rows) {
  const memberOptions = buildLookupOptions(lookups.members);
  const ministryOptions = buildLookupOptions(lookups.ministries);

  const memberMap = buildLookupMap(lookups.members);
  const memberNameMap = buildMemberNameMap(lookups.members);
  memberMap.set(0, "0 - Nao informado");
  const operationMap = buildLookupMap(lookups.operations);
  const ministryMap = buildLookupMap(lookups.ministries);
  ministryMap.set(0, "0 - Nao informado");
  const operationTypeMap = buildOperationTypeMap(lookups.operations);
  const operationOptionGroups = buildOperationOptionGroups(lookups.operations);

  state.table = new Tabulator("#grid", {
    layout: "fitColumns",
    height: "65vh",
    data: rows,
    resizableColumns: true,
    resizableColumnFit: true,
    layoutColumnsOnNewData: false,
    persistenceMode: "local",
    persistenceID: "cadlan2-grid-layout",
    persistence: {
      columns: true,
    },
    columnDefaults: {
      minWidth: 110,
      resizable: true,
    },
    selectableRows: true,
    clipboard: true,
    clipboardPasteParser: "range",
    clipboardPasteAction: "replace",
    dataChanged: (data) => persistUnsavedRowsToLocalStorage(data),
    rowFormatter: applySavedRowClass,
    rowUpdated: applySavedRowClass,
    rowHeader: {
      formatter: "rowSelection",
      titleFormatter: "rowSelection",
      headerSort: false,
      hozAlign: "center",
      width: 54,
      resizable: false,
      cellClick: (event, cell) => {
        cell.getRow().toggleSelect();
      },
    },
    columns: [
      {
        title: "",
        field: "__save",
        width: 78,
        minWidth: 78,
        hozAlign: "center",
        headerSort: false,
        resizable: false,
        formatter: saveButtonFormatter,
        cellClick: (event, cell) => {
          if (state.busy) {
            return;
          }
          void handleSaveRow(cell.getRow());
        },
      },
      {
        title: "lan_idmem",
        field: "lan_idmem",
        width: 220,
        editor: "list",
        editorParams: {
          values: memberOptions,
          autocomplete: true,
          allowEmpty: true,
          listOnEmpty: true,
          sort: "asc",
          freetext: false,
          verticalNavigation: "editor",
        },
        formatter: lookupFormatter(memberMap),
        headerFilter: "input",
        cellEdited: (cell) => {
          const selectedMemberId = parsePositiveInteger(cell.getValue());
          if (!selectedMemberId) {
            return;
          }

          const selectedMemberName = memberNameMap.get(selectedMemberId);
          if (!selectedMemberName) {
            return;
          }

          const rowComponent = cell.getRow();
          const rowData = rowComponent.getData();
          const updates = {};

          if (String(rowData.lan_deslan || "").trim() !== selectedMemberName) {
            updates.lan_deslan = selectedMemberName;
          }

          if (Number(rowData.lan_lanope) !== 1) {
            updates.lan_lanope = 1;
          }

          if (Object.keys(updates).length > 0) {
            void rowComponent.update(updates);
          }
        },
      },
      {
        title: "lan_datlan",
        field: "lan_datlan",
        width: 140,
        editor: "date",
      },
      {
        title: "aux_extrato_dc",
        field: "aux_extrato_dc",
        width: 140,
        hozAlign: "center",
      },
      {
        title: "aux_extrato_desc",
        field: "aux_extrato_desc",
        width: 440,
        formatter: auxDescriptionFormatter,
        headerFilter: "input",
      },
      {
        title: "lan_deslan",
        field: "lan_deslan",
        width: 440,
        editor: "input",
        validator: ["required"],
        headerFilter: "input",
      },
      {
        title: "lan_valor",
        field: "lan_valor",
        width: 180,
        editor: "input",
        hozAlign: "right",
        formatter: (cell) => formatMoney(cell.getValue()),
        bottomCalc: (values, data) => calculateSignedTotalForRows(data, operationTypeMap),
        bottomCalcFormatter: (cell) => formatMoney(cell.getValue()),
      },
      {
        title: "lan_lanope",
        field: "lan_lanope",
        width: 280,
        editor: "list",
        editorParams: (cell) => {
          const rowData = cell.getRow().getData();
          const debitCreditCode = normalizeDebitCreditCode(rowData.aux_extrato_dc);

          return {
            values: getOperationOptionsForRow(operationOptionGroups, debitCreditCode),
            autocomplete: true,
            allowEmpty: true,
            listOnEmpty: true,
            sort: "asc",
            freetext: false,
            verticalNavigation: "editor",
          };
        },
        formatter: lookupFormatter(operationMap),
        headerFilter: "input",
      },
      {
        title: "lan_idmin",
        field: "lan_idmin",
        width: 250,
        editor: "list",
        editorParams: {
          values: ministryOptions,
          autocomplete: true,
          allowEmpty: true,
          listOnEmpty: true,
          sort: "asc",
          freetext: false,
          verticalNavigation: "editor",
        },
        formatter: lookupFormatter(ministryMap),
        headerFilter: "input",
      },
    ],
  });
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function isBlankRow(row) {
  return (
    isBlank(row.lan_idmem) &&
    isBlank(row.lan_deslan) &&
    isBlank(row.lan_valor) &&
    isBlank(row.lan_datlan) &&
    isBlank(row.lan_lanope) &&
    isBlank(row.lan_idmin)
  );
}

function parsePositiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function parseMemberIdForSave(value) {
  if (isBlank(value)) {
    return 0;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function parseMinistryIdForSave(value) {
  if (isBlank(value)) {
    return 0;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function parseMoneyInput(value) {
  if (typeof value === "number") {
    return value;
  }

  const textValue = String(value || "").trim();
  if (!textValue) {
    return Number.NaN;
  }

  let normalized = textValue.replace(/\s/g, "");
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }

  return Number(normalized);
}

function isIsoDate(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return false;
  }

  const parsed = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
}

function parseOfxAmount(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return Number.NaN;
  }

  let normalized = rawValue.replace(/\s/g, "");
  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (lastComma >= 0) {
    normalized = normalized.replace(",", ".");
  }

  return Number(normalized);
}

function parseOfxDate(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 8) {
    return "";
  }

  const isoDate = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  return isIsoDate(isoDate) ? isoDate : "";
}

function extractTagValue(block, tagName) {
  const closedTagRegex = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`, "i");
  const closedTagMatch = block.match(closedTagRegex);
  if (closedTagMatch && closedTagMatch[1]) {
    return closedTagMatch[1].trim();
  }

  const openTagRegex = new RegExp(`<${tagName}>([^\\n\\r<]+)`, "i");
  const openTagMatch = block.match(openTagRegex);
  if (openTagMatch && openTagMatch[1]) {
    return openTagMatch[1].trim();
  }

  return "";
}

function deriveDebitCredit(trnType, amount) {
  if (Number.isFinite(amount)) {
    if (amount < 0) {
      return "D";
    }
    if (amount > 0) {
      return "C";
    }
  }

  const normalizedType = String(trnType || "").trim().toUpperCase();
  const debitTypes = new Set(["DEBIT", "PAYMENT", "ATM", "POS", "FEE", "CHECK"]);
  const creditTypes = new Set(["CREDIT", "DEP", "DIRECTDEP", "INT", "DIV"]);

  if (debitTypes.has(normalizedType)) {
    return "D";
  }
  if (creditTypes.has(normalizedType)) {
    return "C";
  }

  return "";
}

function buildOfxDescription(transactionBlock) {
  const name = extractTagValue(transactionBlock, "NAME");
  const memo = extractTagValue(transactionBlock, "MEMO");
  const fitId = extractTagValue(transactionBlock, "FITID");

  if (name && memo && name !== memo) {
    return `${name} | ${memo}`.slice(0, 300);
  }
  if (memo) {
    return memo.slice(0, 300);
  }
  if (name) {
    return name.slice(0, 300);
  }
  if (fitId) {
    return fitId.slice(0, 300);
  }

  return "";
}

function parseOfxTransactions(ofxText) {
  const normalizedOfx = String(ofxText || "").replace(/\r\n/g, "\n");
  const transactionMatches = [...normalizedOfx.matchAll(/<STMTTRN>([\s\S]*?)(?=<STMTTRN>|<\/BANKTRANLIST>|$)/gi)];

  return transactionMatches
    .map((match) => {
      const transactionBlock = match[1];
      const amount = parseOfxAmount(extractTagValue(transactionBlock, "TRNAMT"));
      const trnType = extractTagValue(transactionBlock, "TRNTYPE");
      const postedDate = extractTagValue(transactionBlock, "DTPOSTED");
      const userDate = extractTagValue(transactionBlock, "DTUSER");
      const date = parseOfxDate(postedDate || userDate);
      const description = buildOfxDescription(transactionBlock);

      if (!Number.isFinite(amount) || amount === 0) {
        return null;
      }

      return markRowAsUnsavedInCadlan2({
        lan_idmem: "",
        lan_deslan: "",
        lan_valor: Number(Math.abs(amount).toFixed(2)),
        lan_datlan: date,
        lan_lanope: "",
        lan_idmin: "",
        aux_extrato_desc: description,
        aux_extrato_dc: deriveDebitCredit(trnType, amount),
      });
    })
    .filter((item) => Boolean(item));
}

async function readTextFileWithFallback(file) {
  const buffer = await file.arrayBuffer();
  const utf8Text = new TextDecoder("utf-8").decode(buffer);

  if (!utf8Text.includes("\ufffd")) {
    return utf8Text;
  }

  try {
    return new TextDecoder("windows-1252").decode(buffer);
  } catch (error) {
    return utf8Text;
  }
}

function buildValidationContext() {
  return {
    memberSet: new Set(state.lookups.members.map((item) => Number(item.id))),
    operationSet: new Set(state.lookups.operations.map((item) => Number(item.id))),
    ministrySet: new Set(state.lookups.ministries.map((item) => Number(item.id))),
    operationTypeMap: buildOperationTypeMap(state.lookups.operations),
  };
}

function validateRowForSave(row, lineLabel, validationContext) {
  const errors = [];
  const lan_idmem = parseMemberIdForSave(row.lan_idmem);
  const lan_lanope = parsePositiveInteger(row.lan_lanope);
  const lan_idmin = parseMinistryIdForSave(row.lan_idmin);
  const lan_deslan = String(row.lan_deslan || "").trim();
  const lan_valor = parseMoneyInput(row.lan_valor);
  const lan_datlan = String(row.lan_datlan || "").trim();
  const auxExtractDescription = String(row.aux_extrato_desc || "").trim();
  const rawAuxDebitCredit = String(row.aux_extrato_dc || "").trim();
  const auxDebitCredit = normalizeDebitCreditCode(rawAuxDebitCredit);
  const operationDebitCredit = lan_lanope
    ? normalizeDebitCreditCode(validationContext.operationTypeMap.get(lan_lanope))
    : "";
  const debitCreditType = auxDebitCredit || operationDebitCredit;

  if (lan_idmem === null) {
    errors.push(`${lineLabel}: lan_idmem invalido.`);
  } else if (lan_idmem > 0 && !validationContext.memberSet.has(lan_idmem)) {
    errors.push(`${lineLabel}: lan_idmem ${lan_idmem} nao existe.`);
  }

  if (!lan_deslan) {
    errors.push(`${lineLabel}: lan_deslan obrigatorio.`);
  } else if (lan_deslan.length > 150) {
    errors.push(`${lineLabel}: lan_deslan excede 150 caracteres.`);
  }

  if (!Number.isFinite(lan_valor) || lan_valor <= 0) {
    errors.push(`${lineLabel}: lan_valor deve ser maior que zero.`);
  }

  if (!isIsoDate(lan_datlan)) {
    errors.push(`${lineLabel}: lan_datlan invalida. Use YYYY-MM-DD.`);
  }

  if (auxExtractDescription.length > 300) {
    errors.push(`${lineLabel}: aux_extrato_desc excede 300 caracteres.`);
  }

  if (rawAuxDebitCredit && !auxDebitCredit) {
    errors.push(`${lineLabel}: aux_extrato_dc invalido. Use D, C ou vazio.`);
  }

  if (!lan_lanope) {
    errors.push(`${lineLabel}: lan_lanope invalido.`);
  } else if (!validationContext.operationSet.has(lan_lanope)) {
    errors.push(`${lineLabel}: lan_lanope ${lan_lanope} nao existe.`);
  } else if (auxDebitCredit) {
    const operationType = normalizeDebitCreditCode(validationContext.operationTypeMap.get(lan_lanope));
    if (operationType && operationType !== auxDebitCredit) {
      errors.push(
        `${lineLabel}: lan_lanope ${lan_lanope} nao corresponde ao tipo ${auxDebitCredit} do extrato.`
      );
    }
  }

  if (debitCreditType === "D") {
    if (!lan_idmin) {
      errors.push(`${lineLabel}: lan_idmin obrigatorio para debito.`);
    } else if (!validationContext.ministrySet.has(lan_idmin)) {
      errors.push(`${lineLabel}: lan_idmin ${lan_idmin} nao existe.`);
    }
  } else if (lan_idmin && !validationContext.ministrySet.has(lan_idmin)) {
    errors.push(`${lineLabel}: lan_idmin ${lan_idmin} nao existe.`);
  }

  return {
    errors,
    row: {
      lan_idmem,
      lan_deslan,
      lan_valor: Number(lan_valor.toFixed(2)),
      lan_datlan,
      lan_lanope,
      lan_idmin: lan_idmin === null ? 0 : lan_idmin,
      aux_extrato_desc: auxExtractDescription,
      aux_extrato_dc: auxDebitCredit,
    },
  };
}

function collectRowsForSave() {
  const rows = state.table.getData();
  const validRows = [];
  const errors = [];
  const validationContext = buildValidationContext();

  rows.forEach((row, index) => {
    if (isBlankRow(row)) {
      return;
    }

    const validation = validateRowForSave(row, `Linha ${index + 1}`, validationContext);
    if (validation.errors.length > 0) {
      errors.push(...validation.errors);
      return;
    }

    validRows.push(validation.row);
  });

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  if (validRows.length === 0) {
    throw new Error("Nao ha linhas preenchidas para salvar.");
  }

  return validRows;
}

async function fetchLookupsAndRows() {
  const [lookups, cadlan2Data] = await Promise.all([
    requestJson("/lookups"),
    requestJson("/cadlan2"),
  ]);

  state.lookups = lookups;

  if (state.table) {
    state.table.destroy();
    state.table = null;
  }

  state.pinnedSavedRowIds.clear();

  const localUnsavedRows = loadUnsavedRowsFromLocalStorage();
  const savedRowsFromDatabase = cadlan2Data.rows.map((row) => markRowAsSavedInCadlan2(row));
  createGrid(lookups, [...savedRowsFromDatabase, ...localUnsavedRows]);
  applyGridFilters();

  const restoredRowsMessage =
    localUnsavedRows.length > 0
      ? ` ${localUnsavedRows.length} linha(s) local(is) nao salva(s) restaurada(s).`
      : "";

  setStatus(
    `Dados carregados. ${cadlan2Data.rows.length} linha(s) na cadlan2.${restoredRowsMessage}`,
    "success"
  );
}

async function handleReload() {
  setBusy(true);
  setStatus("Recarregando dados...");

  try {
    await fetchLookupsAndRows();
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
}

function handleAddRow() {
  state.table.addRow(
    markRowAsUnsavedInCadlan2({
      lan_idmem: "",
      lan_deslan: "",
      lan_valor: "",
      lan_datlan: "",
      lan_lanope: "",
      lan_idmin: "",
      aux_extrato_desc: "",
      aux_extrato_dc: "",
    }),
    true
  );
  persistUnsavedRowsToLocalStorage();
}

function handleDeleteRows() {
  const selectedRows = state.table.getSelectedRows();
  if (selectedRows.length === 0) {
    setStatus("Selecione ao menos uma linha para exclusao.");
    return;
  }

  selectedRows.forEach((row) => row.delete());
  persistUnsavedRowsToLocalStorage();
  setStatus(`${selectedRows.length} linha(s) removida(s) da grade.`);
}

async function handleSave() {
  setBusy(true);
  setStatus("Validando e salvando na cadlan2...");

  try {
    const rows = collectRowsForSave();
    const payload = await requestJson("/cadlan2/batch", {
      method: "PUT",
      body: JSON.stringify({ rows }),
    });

    state.pinnedSavedRowIds.clear();
    clearUnsavedRowsFromLocalStorage();
    await fetchLookupsAndRows();
    setStatus(`${payload.message} Total de linhas: ${payload.total}.`, "success");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
}

async function handleSaveRow(rowComponent) {
  const rowData = rowComponent.getData();
  if (isBlankRow(rowData)) {
    setStatus("A linha selecionada esta em branco.");
    return;
  }

  const visiblePosition = rowComponent.getPosition(true);
  const rowLabel = Number.isInteger(visiblePosition) ? `Linha ${visiblePosition}` : "Linha selecionada";

  setBusy(true);
  setStatus(`${rowLabel}: validando e salvando na cadlan2...`);

  try {
    const validationContext = buildValidationContext();
    const validation = validateRowForSave(rowData, rowLabel, validationContext);
    if (validation.errors.length > 0) {
      throw new Error(validation.errors.join("\n"));
    }

    const payloadRow = validation.row;
    const persistedId = Number(rowData.id);
    if (isSavedCadlan2Row(rowData) && Number.isInteger(persistedId) && persistedId > 0) {
      payloadRow.id = persistedId;
    }

    const payload = await requestJson("/cadlan2/row", {
      method: "PUT",
      body: JSON.stringify({ row: payloadRow }),
    });

    const savedRow = markRowAsSavedInCadlan2(payload.row);
    const savedRowId = getPersistedRowId(savedRow);
    if (savedRowId !== null) {
      state.pinnedSavedRowIds.add(savedRowId);
    }

    await rowComponent.update(savedRow);
    rowComponent.reformat();
    persistUnsavedRowsToLocalStorage();
    applyGridFilters();
    setStatus(`${rowLabel} salva com sucesso. ID ${payload.row.id}.`, "success");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
}

async function handleCommit() {
  const shouldCommit = window.confirm(
    "Confirma o envio de todos os registros da cadlan2 para a cadlan? A cadlan2 sera limpa apos o envio."
  );

  if (!shouldCommit) {
    return;
  }

  setBusy(true);
  setStatus("Confirmando lote para cadlan...");

  try {
    const payload = await requestJson("/cadlan2/commit", {
      method: "POST",
      body: JSON.stringify({}),
    });

    await fetchLookupsAndRows();
    setStatus(`${payload.message} ${payload.insertedRows} linha(s) processada(s).`, "success");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
}

function handleImportClick() {
  const fileInput = state.controls.ofxFile;
  fileInput.value = "";
  fileInput.click();
}

async function handleImportFileSelected(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  setBusy(true);
  setStatus(`Importando arquivo ${file.name}...`);

  try {
    const fileText = await readTextFileWithFallback(file);
    const importedRows = parseOfxTransactions(fileText);

    if (importedRows.length === 0) {
      throw new Error("Nenhum lancamento valido foi encontrado no OFX.");
    }

    await state.table.addData(importedRows, false);
    persistUnsavedRowsToLocalStorage();
    applyGridFilters();
    setStatus(
      `${importedRows.length} lancamento(s) importado(s). Preencha lan_deslan e demais campos obrigatorios antes de salvar.`,
      "success"
    );
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
    event.target.value = "";
  }
}

function handleFilterControlChanged() {
  applyGridFilters();
}

function handleClearDateFilters() {
  state.controls.dateFrom.value = "";
  state.controls.dateTo.value = "";
  applyGridFilters();
}

function bindControls() {
  state.controls.reload = document.getElementById("reloadButton");
  state.controls.import = document.getElementById("importButton");
  state.controls.add = document.getElementById("addButton");
  state.controls.remove = document.getElementById("removeButton");
  state.controls.save = document.getElementById("saveButton");
  state.controls.commit = document.getElementById("commitButton");
  state.controls.ofxFile = document.getElementById("ofxFileInput");
  state.controls.showSaved = document.getElementById("showSavedCheckbox");
  state.controls.dateFrom = document.getElementById("dateFromFilter");
  state.controls.dateTo = document.getElementById("dateToFilter");
  state.controls.clearDateFilter = document.getElementById("clearDateFilterButton");

  state.controls.reload.addEventListener("click", handleReload);
  state.controls.import.addEventListener("click", handleImportClick);
  state.controls.add.addEventListener("click", handleAddRow);
  state.controls.remove.addEventListener("click", handleDeleteRows);
  state.controls.save.addEventListener("click", handleSave);
  state.controls.commit.addEventListener("click", handleCommit);
  state.controls.ofxFile.addEventListener("change", handleImportFileSelected);
  state.controls.showSaved.addEventListener("change", handleFilterControlChanged);
  state.controls.dateFrom.addEventListener("change", handleFilterControlChanged);
  state.controls.dateTo.addEventListener("change", handleFilterControlChanged);
  state.controls.clearDateFilter.addEventListener("click", handleClearDateFilters);
}

async function initialize() {
  bindControls();
  await handleReload();
}

initialize();
