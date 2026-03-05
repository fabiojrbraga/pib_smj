const API_BASE = "/api";

const state = {
  lookups: null,
  table: null,
  busy: false,
  controls: {},
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
    element.disabled = busy;
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

function createGrid(lookups, rows) {
  const memberOptions = buildLookupOptions(lookups.members);
  const operationOptions = buildLookupOptions(lookups.operations);
  const ministryOptions = buildLookupOptions(lookups.ministries);

  const memberMap = buildLookupMap(lookups.members);
  const operationMap = buildLookupMap(lookups.operations);
  const ministryMap = buildLookupMap(lookups.ministries);

  state.table = new Tabulator("#grid", {
    layout: "fitColumns",
    height: "65vh",
    data: rows,
    selectableRows: true,
    clipboard: true,
    clipboardPasteParser: "range",
    clipboardPasteAction: "replace",
    rowHeader: {
      formatter: "rowSelection",
      titleFormatter: "rowSelection",
      headerSort: false,
      hozAlign: "center",
      width: 54,
      cellClick: (event, cell) => {
        cell.getRow().toggleSelect();
      },
    },
    columns: [
      {
        title: "lan_idmem",
        field: "lan_idmem",
        editor: "list",
        editorParams: {
          values: memberOptions,
          autocomplete: true,
          listOnEmpty: true,
          verticalNavigation: "table",
        },
        formatter: lookupFormatter(memberMap),
        headerFilter: "input",
      },
      {
        title: "lan_datlan",
        field: "lan_datlan",
        editor: "date",
      },
      {
        title: "aux_extrato_dc",
        field: "aux_extrato_dc",
        width: 130,
        hozAlign: "center",
      },
      {
        title: "aux_extrato_desc",
        field: "aux_extrato_desc",
        widthGrow: 2,
        headerFilter: "input",
      },
      {
        title: "lan_deslan",
        field: "lan_deslan",
        editor: "input",
        validator: ["required"],
        headerFilter: "input",
      },
      {
        title: "lan_valor",
        field: "lan_valor",
        editor: "input",
        hozAlign: "right",
        formatter: (cell) => formatMoney(cell.getValue()),
      },
      {
        title: "lan_lanope",
        field: "lan_lanope",
        editor: "list",
        editorParams: {
          values: operationOptions,
          autocomplete: true,
          listOnEmpty: true,
          verticalNavigation: "table",
        },
        formatter: lookupFormatter(operationMap),
        headerFilter: "input",
      },
      {
        title: "lan_idmin",
        field: "lan_idmin",
        editor: "list",
        editorParams: {
          values: ministryOptions,
          autocomplete: true,
          listOnEmpty: true,
          verticalNavigation: "table",
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

      return {
        lan_idmem: "",
        lan_deslan: "",
        lan_valor: Number(Math.abs(amount).toFixed(2)),
        lan_datlan: date,
        lan_lanope: "",
        lan_idmin: "",
        aux_extrato_desc: description,
        aux_extrato_dc: deriveDebitCredit(trnType, amount),
      };
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

function collectRowsForSave() {
  const rows = state.table.getData();
  const validRows = [];
  const errors = [];

  const memberSet = new Set(state.lookups.members.map((item) => Number(item.id)));
  const operationSet = new Set(state.lookups.operations.map((item) => Number(item.id)));
  const ministrySet = new Set(state.lookups.ministries.map((item) => Number(item.id)));

  rows.forEach((row, index) => {
    const line = index + 1;
    if (isBlankRow(row)) {
      return;
    }

    const lan_idmem = parsePositiveInteger(row.lan_idmem);
    const lan_lanope = parsePositiveInteger(row.lan_lanope);
    const lan_idmin = parsePositiveInteger(row.lan_idmin);
    const lan_deslan = String(row.lan_deslan || "").trim();
    const lan_valor = parseMoneyInput(row.lan_valor);
    const lan_datlan = String(row.lan_datlan || "").trim();

    if (!lan_idmem) {
      errors.push(`Linha ${line}: lan_idmem invalido.`);
    } else if (!memberSet.has(lan_idmem)) {
      errors.push(`Linha ${line}: lan_idmem ${lan_idmem} nao existe.`);
    }

    if (!lan_deslan) {
      errors.push(`Linha ${line}: lan_deslan obrigatorio.`);
    } else if (lan_deslan.length > 150) {
      errors.push(`Linha ${line}: lan_deslan excede 150 caracteres.`);
    }

    if (!Number.isFinite(lan_valor) || lan_valor <= 0) {
      errors.push(`Linha ${line}: lan_valor deve ser maior que zero.`);
    }

    if (!isIsoDate(lan_datlan)) {
      errors.push(`Linha ${line}: lan_datlan invalida. Use YYYY-MM-DD.`);
    }

    if (!lan_lanope) {
      errors.push(`Linha ${line}: lan_lanope invalido.`);
    } else if (!operationSet.has(lan_lanope)) {
      errors.push(`Linha ${line}: lan_lanope ${lan_lanope} nao existe.`);
    }

    if (!lan_idmin) {
      errors.push(`Linha ${line}: lan_idmin invalido.`);
    } else if (!ministrySet.has(lan_idmin)) {
      errors.push(`Linha ${line}: lan_idmin ${lan_idmin} nao existe.`);
    }

    validRows.push({
      lan_idmem,
      lan_deslan,
      lan_valor: Number(lan_valor.toFixed(2)),
      lan_datlan,
      lan_lanope,
      lan_idmin,
    });
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

  createGrid(lookups, cadlan2Data.rows);

  setStatus(`Dados carregados. ${cadlan2Data.rows.length} linha(s) na cadlan2.`, "success");
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
    {
      lan_idmem: "",
      lan_deslan: "",
      lan_valor: "",
      lan_datlan: "",
      lan_lanope: "",
      lan_idmin: "",
      aux_extrato_desc: "",
      aux_extrato_dc: "",
    },
    true
  );
}

function handleDeleteRows() {
  const selectedRows = state.table.getSelectedRows();
  if (selectedRows.length === 0) {
    setStatus("Selecione ao menos uma linha para exclusao.");
    return;
  }

  selectedRows.forEach((row) => row.delete());
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

    await fetchLookupsAndRows();
    setStatus(`${payload.message} Total de linhas: ${payload.total}.`, "success");
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

function bindControls() {
  state.controls.reload = document.getElementById("reloadButton");
  state.controls.import = document.getElementById("importButton");
  state.controls.add = document.getElementById("addButton");
  state.controls.remove = document.getElementById("removeButton");
  state.controls.save = document.getElementById("saveButton");
  state.controls.commit = document.getElementById("commitButton");
  state.controls.ofxFile = document.getElementById("ofxFileInput");

  state.controls.reload.addEventListener("click", handleReload);
  state.controls.import.addEventListener("click", handleImportClick);
  state.controls.add.addEventListener("click", handleAddRow);
  state.controls.remove.addEventListener("click", handleDeleteRows);
  state.controls.save.addEventListener("click", handleSave);
  state.controls.commit.addEventListener("click", handleCommit);
  state.controls.ofxFile.addEventListener("change", handleImportFileSelected);
}

async function initialize() {
  bindControls();
  await handleReload();
}

initialize();
