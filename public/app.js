const API_BASE = "/api";
const UNSAVED_ROWS_STORAGE_KEY = "cadlan2_unsaved_rows_v1";
const COMBOBOX_FIELDS = new Set(["lan_lanope"]);
const COMBOBOX_NAV_KEYS = new Set(["ArrowDown", "ArrowUp", "Enter"]);

const state = {
  lookups: null,
  table: null,
  busy: false,
  controls: {},
  pinnedSavedRowIds: new Set(),
  ai: {
    enabled: false,
    limits: {
      maxRowsPerRequest: 20,
      maxExamplesPerRow: 4,
    },
    suggestions: [],
    globalWarnings: [],
    rowMap: new Map(),
    overwrite: false,
  },
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

function setAiPanelVisible(visible) {
  if (!state.controls.aiPanel || !state.controls.aiSuggest) {
    return;
  }

  state.controls.aiPanel.hidden = !visible;
  state.controls.aiSuggest.setAttribute("aria-expanded", visible ? "true" : "false");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resetAiSuggestions() {
  state.ai.suggestions = [];
  state.ai.globalWarnings = [];
  state.ai.rowMap = new Map();
  state.ai.overwrite = false;
  renderAiSuggestions();
}

function setAiAvailability(payload = null) {
  const enabled = payload?.enabled === true;

  state.ai.enabled = enabled;
  if (payload?.limits) {
    state.ai.limits = {
      ...state.ai.limits,
      ...payload.limits,
    };
  }

  if (!state.controls.aiSuggest || !state.controls.aiPanel) {
    return;
  }

  state.controls.aiSuggest.hidden = !enabled;
  state.controls.aiSuggest.disabled = !enabled;

  if (!enabled) {
    setAiPanelVisible(false);
    resetAiSuggestions();
  }
}

function formatAiConfidence(confidence) {
  const normalized = Number(confidence);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return "Confianca baixa";
  }

  return `Confianca ${Math.round(normalized * 100)}%`;
}

function isEmptyLookupValue(value) {
  if (value === null || value === undefined || value === "") {
    return true;
  }

  const parsed = Number(value);
  return !Number.isInteger(parsed) || parsed <= 0;
}

function buildAiFieldUpdates(rowData, suggestedFields, overwrite) {
  const updates = {};

  const suggestedDescription = String(suggestedFields.lan_deslan || "").trim();
  if (
    suggestedDescription &&
    (overwrite || isBlank(rowData.lan_deslan)) &&
    String(rowData.lan_deslan || "").trim() !== suggestedDescription
  ) {
    updates.lan_deslan = suggestedDescription;
  }

  const suggestedOperation = parsePositiveInteger(suggestedFields.lan_lanope);
  if (
    suggestedOperation &&
    (overwrite || isEmptyLookupValue(rowData.lan_lanope)) &&
    Number(rowData.lan_lanope) !== suggestedOperation
  ) {
    updates.lan_lanope = suggestedOperation;
  }

  const suggestedMinistry = parsePositiveInteger(suggestedFields.lan_idmin);
  if (
    suggestedMinistry &&
    (overwrite || isEmptyLookupValue(rowData.lan_idmin)) &&
    Number(rowData.lan_idmin) !== suggestedMinistry
  ) {
    updates.lan_idmin = suggestedMinistry;
  }

  return updates;
}

function getAiScopeRowComponents(scope) {
  if (scope === "visible") {
    return getActiveRowComponents();
  }

  return getActiveSelectedRows();
}

function buildAiRowLabel(rowComponent, fallbackIndex) {
  const visiblePosition = rowComponent.getPosition(true);
  if (Number.isInteger(visiblePosition)) {
    return `Linha ${visiblePosition}`;
  }

  return `Linha ${fallbackIndex + 1}`;
}

function collectRowsForAiSuggestion() {
  const scope = state.controls.aiScope?.value || "selected";
  const overwrite = state.controls.aiOverwrite?.checked === true;
  const prompt = String(state.controls.aiPrompt?.value || "").trim();
  const rowComponents = getAiScopeRowComponents(scope).filter((rowComponent) => {
    const rowData = rowComponent.getData();
    return !isBlankRow(rowData) || !isBlank(rowData.aux_extrato_desc);
  });

  if (rowComponents.length === 0) {
    throw new Error(
      scope === "visible"
        ? "Nao ha linhas visiveis adequadas para enviar para a IA."
        : "Selecione ao menos uma linha para gerar sugestoes por IA."
    );
  }

  if (rowComponents.length > state.ai.limits.maxRowsPerRequest) {
    throw new Error(
      `A IA aceita no maximo ${state.ai.limits.maxRowsPerRequest} linha(s) por solicitacao.`
    );
  }

  const requestTimestamp = Date.now();
  const rowMap = new Map();
  const rows = rowComponents.map((rowComponent, index) => {
    const rowData = rowComponent.getData();
    const persistedId = getPersistedRowId(rowData);
    const clientRowId =
      persistedId !== null
        ? `saved-${persistedId}`
        : `draft-${requestTimestamp}-${index + 1}-${Math.floor(Math.random() * 100000)}`;

    rowMap.set(clientRowId, {
      rowComponent,
      rowLabel: buildAiRowLabel(rowComponent, index),
    });

    return {
      clientRowId,
      id: persistedId || undefined,
      lan_idmem: parseMemberIdForSave(rowData.lan_idmem) ?? 0,
      lan_deslan: String(rowData.lan_deslan || "").trim(),
      lan_valor: Number.isFinite(parseMoneyInput(rowData.lan_valor))
        ? Number(parseMoneyInput(rowData.lan_valor).toFixed(2))
        : null,
      lan_datlan: String(rowData.lan_datlan || "").trim(),
      lan_lanope: parsePositiveInteger(rowData.lan_lanope) || 0,
      lan_idmin: parseMinistryIdForSave(rowData.lan_idmin) ?? 0,
      aux_extrato_desc: String(rowData.aux_extrato_desc || "").trim(),
      aux_extrato_dc: normalizeDebitCreditCode(rowData.aux_extrato_dc),
      aux_extrato_fitid: normalizeExtractFitId(rowData.aux_extrato_fitid),
    };
  });

  return {
    scope,
    overwrite,
    prompt,
    rows,
    rowMap,
  };
}

function buildAiSuggestionDetails(suggestion, operationMap, ministryMap) {
  const details = [];

  if (suggestion.suggestedFields.lan_deslan) {
    details.push(
      `<li><strong>lan_deslan</strong>: ${escapeHtml(suggestion.suggestedFields.lan_deslan)}</li>`
    );
  }

  if (suggestion.suggestedFields.lan_lanope) {
    details.push(
      `<li><strong>lan_lanope</strong>: ${escapeHtml(
        operationMap.get(Number(suggestion.suggestedFields.lan_lanope)) ||
          `${suggestion.suggestedFields.lan_lanope} - ID nao encontrado`
      )}</li>`
    );
  }

  if (suggestion.suggestedFields.lan_idmin) {
    details.push(
      `<li><strong>lan_idmin</strong>: ${escapeHtml(
        ministryMap.get(Number(suggestion.suggestedFields.lan_idmin)) ||
          `${suggestion.suggestedFields.lan_idmin} - ID nao encontrado`
      )}</li>`
    );
  }

  return details.join("");
}

function renderAiSuggestions() {
  if (!state.controls.aiSummary || !state.controls.aiResults || !state.controls.aiApply) {
    return;
  }

  const operationMap = buildLookupMap(state.lookups?.operations || []);
  const ministryMap = buildLookupMap(state.lookups?.ministries || []);
  const cards = [];
  let applicableRows = 0;

  if (state.ai.suggestions.length === 0) {
    state.controls.aiSummary.textContent =
      "Selecione algumas linhas e use a IA somente quando fizer sentido.";
    state.controls.aiResults.innerHTML = "";
    state.controls.aiApply.disabled = true;
    return;
  }

  state.ai.suggestions.forEach((suggestion, index) => {
    const rowReference = state.ai.rowMap.get(suggestion.clientRowId);
    const rowComponent = rowReference?.rowComponent || null;
    const rowLabel = rowReference?.rowLabel || `Linha ${index + 1}`;
    const rowData = rowComponent?.getData() || {};
    const applicableUpdates = buildAiFieldUpdates(
      rowData,
      suggestion.suggestedFields,
      state.ai.overwrite
    );
    const hasApplicableUpdates = Object.keys(applicableUpdates).length > 0;

    if (hasApplicableUpdates) {
      applicableRows += 1;
    }

    const supportingExamplesMarkup = (suggestion.supportingExamples || [])
      .map(
        (example) =>
          `<li>${escapeHtml(example.aux_extrato_desc)} <span class="assistant-chip">${Math.round(
            Number(example.similarity || 0) * 100
          )}%</span></li>`
      )
      .join("");

    const warningsMarkup = (suggestion.warnings || [])
      .filter((warning) => !isBlank(warning))
      .map((warning) => `<li>${escapeHtml(warning)}</li>`)
      .join("");

    const suggestionDetails = buildAiSuggestionDetails(suggestion, operationMap, ministryMap);
    const emptyStateMarkup = hasApplicableUpdates
      ? ""
      : `<p class="assistant-card-empty">Sem alteracoes aplicaveis para esta linha no modo atual.</p>`;

    cards.push(`
      <article class="assistant-card">
        <div class="assistant-card-header">
          <h3 class="assistant-card-title">${escapeHtml(rowLabel)}</h3>
          <span class="assistant-card-confidence">${escapeHtml(
            formatAiConfidence(suggestion.confidence)
          )}</span>
        </div>
        <p class="assistant-card-copy">${escapeHtml(String(rowData.aux_extrato_desc || "(Sem aux_extrato_desc)"))}</p>
        ${
          suggestionDetails
            ? `<ul class="assistant-card-list">${suggestionDetails}</ul>`
            : `<p class="assistant-card-empty">A IA optou por nao sugerir campos para esta linha.</p>`
        }
        <p class="assistant-card-reason">${escapeHtml(suggestion.reason || "Sem justificativa informada.")}</p>
        ${emptyStateMarkup}
        ${
          warningsMarkup
            ? `<ul class="assistant-card-warnings">${warningsMarkup}</ul>`
            : ""
        }
        ${
          supportingExamplesMarkup
            ? `<ul class="assistant-card-examples">${supportingExamplesMarkup}</ul>`
            : ""
        }
      </article>
    `);
  });

  const globalWarnings = state.ai.globalWarnings
    .filter((warning) => !isBlank(warning))
    .join(" ");
  state.controls.aiSummary.textContent = `${state.ai.suggestions.length} linha(s) analisada(s). ${applicableRows} com sugestoes aplicaveis.${
    globalWarnings ? ` ${globalWarnings}` : ""
  }`;
  state.controls.aiResults.innerHTML = cards.join("");
  state.controls.aiApply.disabled = applicableRows === 0;
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

function buildListEditorParams(values) {
  return {
    values,
    autocomplete: true,
    allowEmpty: true,
    listOnEmpty: true,
    filterDelay: 0,
    sort: "asc",
    freetext: false,
    verticalNavigation: "editor",
  };
}

function normalizeLookupSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function filterLookupOptionsForEditor(options, term) {
  const normalizedTerm = normalizeLookupSearch(term);
  const maxItems = 140;

  if (!normalizedTerm) {
    return options.slice(0, maxItems);
  }

  return options
    .filter((option) => {
      const labelMatch = normalizeLookupSearch(option.label).includes(normalizedTerm);
      const valueMatch = normalizeLookupSearch(option.value).includes(normalizedTerm);
      return labelMatch || valueMatch;
    })
    .slice(0, maxItems);
}

function findExactLookupOption(options, typedValue) {
  const normalizedTypedValue = normalizeLookupSearch(typedValue);
  if (!normalizedTypedValue) {
    return null;
  }

  return (
    options.find((option) => normalizeLookupSearch(option.label) === normalizedTypedValue) ||
    options.find((option) => normalizeLookupSearch(option.value) === normalizedTypedValue) ||
    null
  );
}

function lookupComboboxEditor(cell, onRendered, success, cancel, editorParams = {}) {
  const baseOptions = Array.isArray(editorParams.values) ? editorParams.values : [];
  const sortedOptions = [...baseOptions].sort((a, b) =>
    String(a.label || "").localeCompare(String(b.label || ""), "pt-BR")
  );

  const container = document.createElement("div");
  container.className = "lookup-editor";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "lookup-editor-input";
  input.autocomplete = "off";

  const list = document.createElement("div");
  list.className = "lookup-editor-list";

  container.appendChild(input);
  container.appendChild(list);

  const currentValue = Number(cell.getValue());
  const currentOption = sortedOptions.find((option) => Number(option.value) === currentValue);

  if (currentOption) {
    input.value = currentOption.label;
  }

  let filteredOptions = filterLookupOptionsForEditor(sortedOptions, input.value);
  let activeIndex = filteredOptions.length > 0 ? 0 : -1;
  let finalized = false;

  function commitOption(option) {
    if (finalized) {
      return;
    }

    finalized = true;
    if (!option) {
      success("");
      return;
    }

    success(option.value);
  }

  function cancelEditor() {
    if (finalized) {
      return;
    }

    finalized = true;
    cancel();
  }

  function renderList() {
    list.innerHTML = "";

    if (filteredOptions.length === 0) {
      const emptyState = document.createElement("div");
      emptyState.className = "lookup-editor-empty";
      emptyState.textContent = "Sem resultados";
      list.appendChild(emptyState);
      return;
    }

    filteredOptions.forEach((option, index) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "lookup-editor-item";
      item.textContent = option.label;

      if (index === activeIndex) {
        item.classList.add("is-active");
      }

      item.addEventListener("mouseenter", () => {
        activeIndex = index;
        renderList();
      });

      item.addEventListener("mousedown", (event) => {
        event.preventDefault();
        commitOption(option);
      });

      list.appendChild(item);
    });
  }

  function refreshFilter(resetActive = true) {
    filteredOptions = filterLookupOptionsForEditor(sortedOptions, input.value);

    if (filteredOptions.length === 0) {
      activeIndex = -1;
    } else if (resetActive || activeIndex < 0 || activeIndex >= filteredOptions.length) {
      activeIndex = 0;
    }

    renderList();
  }

  function moveActive(step) {
    if (filteredOptions.length === 0) {
      return;
    }

    activeIndex = (activeIndex + step + filteredOptions.length) % filteredOptions.length;
    renderList();
  }

  function getCandidateOption() {
    if (filteredOptions.length > 0 && activeIndex >= 0 && activeIndex < filteredOptions.length) {
      return filteredOptions[activeIndex];
    }

    if (filteredOptions.length > 0) {
      return filteredOptions[0];
    }

    return findExactLookupOption(sortedOptions, input.value);
  }

  input.addEventListener("input", () => {
    refreshFilter(true);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      moveActive(1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      moveActive(-1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      const option = getCandidateOption();
      if (option) {
        commitOption(option);
      } else if (isBlank(input.value)) {
        commitOption(null);
      } else {
        cancelEditor();
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancelEditor();
    }
  });

  input.addEventListener("blur", () => {
    window.setTimeout(() => {
      if (finalized) {
        return;
      }

      if (isBlank(input.value)) {
        commitOption(null);
        return;
      }

      const option = findExactLookupOption(sortedOptions, input.value);
      if (option) {
        commitOption(option);
        return;
      }

      cancelEditor();
    }, 120);
  });

  onRendered(() => {
    input.focus();
    input.select();
    refreshFilter(true);
  });

  return container;
}

function bindComboboxNavigation(cell) {
  if (!COMBOBOX_FIELDS.has(cell.getField())) {
    return;
  }

  window.requestAnimationFrame(() => {
    const editorInput = cell.getElement()?.querySelector("input");
    if (!editorInput || editorInput.dataset.comboNavBound === "1") {
      return;
    }

    editorInput.dataset.comboNavBound = "1";
    editorInput.addEventListener("keydown", (event) => {
      if (COMBOBOX_NAV_KEYS.has(event.key)) {
        event.stopPropagation();
      }
    });
  });
}

function activateComboboxEditor(event, cell) {
  if (state.busy) {
    return;
  }

  cell.edit(true);
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
    isBlank(row.aux_extrato_dc) &&
    isBlank(row.aux_extrato_fitid)
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
    aux_extrato_fitid: row.aux_extrato_fitid ?? "",
  };
}

function normalizeExtractFitId(value) {
  return String(value || "").trim();
}

function buildImportedFitIdSet(rowsData = null) {
  const sourceRows = Array.isArray(rowsData) ? rowsData : state.table?.getData() || [];

  return new Set(
    sourceRows
      .map((row) => normalizeExtractFitId(row.aux_extrato_fitid))
      .filter((fitId) => fitId)
  );
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

  window.requestAnimationFrame(() => {
    clearSelectionOutsideActiveRows();
  });
}

function getActiveRowComponents() {
  return state.table?.getRows("active") || [];
}

function getActiveSelectedRows() {
  return getActiveRowComponents().filter((rowComponent) => rowComponent.isSelected());
}

function clearSelectionOutsideActiveRows() {
  if (!state.table) {
    return;
  }

  const activeRows = new Set(getActiveRowComponents());
  state.table.getSelectedRows().forEach((rowComponent) => {
    if (!activeRows.has(rowComponent)) {
      rowComponent.deselect();
    }
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
    keybindings: {
      navUp: false,
      navDown: false,
    },
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
    cellEditing: bindComboboxNavigation,
    rowFormatter: applySavedRowClass,
    rowUpdated: applySavedRowClass,
    rowHeader: {
      formatter: "rowSelection",
      titleFormatter: "rowSelection",
      titleFormatterParams: {
        rowRange: "active",
      },
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
        download: false,
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
        editor: lookupComboboxEditor,
        editorParams: (cell) => ({
          values: memberOptions,
        }),
        cellClick: activateComboboxEditor,
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
        title: "aux_extrato_fitid",
        field: "aux_extrato_fitid",
        width: 190,
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

          return buildListEditorParams(
            getOperationOptionsForRow(operationOptionGroups, debitCreditCode)
          );
        },
        cellClick: activateComboboxEditor,
        formatter: lookupFormatter(operationMap),
        headerFilter: "input",
      },
      {
        title: "lan_idmin",
        field: "lan_idmin",
        width: 250,
        editor: lookupComboboxEditor,
        editorParams: (cell) => ({
          values: ministryOptions,
        }),
        cellClick: activateComboboxEditor,
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
  const importedFitIds = buildImportedFitIdSet();
  const newRows = [];
  let skippedImportedCount = 0;

  transactionMatches.forEach((match) => {
    const transactionBlock = match[1];
    const amount = parseOfxAmount(extractTagValue(transactionBlock, "TRNAMT"));
    const trnType = extractTagValue(transactionBlock, "TRNTYPE");
    const postedDate = extractTagValue(transactionBlock, "DTPOSTED");
    const userDate = extractTagValue(transactionBlock, "DTUSER");
    const date = parseOfxDate(postedDate || userDate);
    const description = buildOfxDescription(transactionBlock);
    const fitId = normalizeExtractFitId(extractTagValue(transactionBlock, "FITID"));

    if (!Number.isFinite(amount) || amount === 0) {
      return;
    }

    if (fitId) {
      if (importedFitIds.has(fitId)) {
        skippedImportedCount += 1;
        return;
      }

      importedFitIds.add(fitId);
    }

    newRows.push(
      markRowAsUnsavedInCadlan2({
        lan_idmem: "",
        lan_deslan: "",
        lan_valor: Number(Math.abs(amount).toFixed(2)),
        lan_datlan: date,
        lan_lanope: "",
        lan_idmin: "",
        aux_extrato_desc: description,
        aux_extrato_dc: deriveDebitCredit(trnType, amount),
        aux_extrato_fitid: fitId,
      })
    );
  });

  return {
    rows: newRows,
    skippedImportedCount,
  };
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
  const auxExtractFitId = normalizeExtractFitId(row.aux_extrato_fitid);
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

  if (auxExtractFitId.length > 120) {
    errors.push(`${lineLabel}: aux_extrato_fitid excede 120 caracteres.`);
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
      aux_extrato_fitid: auxExtractFitId,
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
  const [lookupsResult, cadlan2Result, aiStatusResult] = await Promise.allSettled([
    requestJson("/lookups"),
    requestJson("/cadlan2"),
    requestJson("/cadlan2/ai/status"),
  ]);

  if (lookupsResult.status !== "fulfilled") {
    throw lookupsResult.reason;
  }

  if (cadlan2Result.status !== "fulfilled") {
    throw cadlan2Result.reason;
  }

  const lookups = lookupsResult.value;
  const cadlan2Data = cadlan2Result.value;

  state.lookups = lookups;
  setAiAvailability(aiStatusResult.status === "fulfilled" ? aiStatusResult.value : null);
  resetAiSuggestions();

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
      aux_extrato_fitid: "",
    }),
    true
  );
  persistUnsavedRowsToLocalStorage();
}

function handleDeleteRows() {
  const selectedRows = getActiveSelectedRows();
  if (selectedRows.length === 0) {
    setStatus("Selecione ao menos uma linha para exclusao.");
    return;
  }

  selectedRows.forEach((row) => row.delete());
  persistUnsavedRowsToLocalStorage();
  setStatus(`${selectedRows.length} linha(s) removida(s) da grade.`);
}

function getSelectedSavedCadlan2RowIds() {
  const selectedRows = getActiveSelectedRows();

  const selectedSavedRowIds = selectedRows
    .map((rowComponent) => rowComponent.getData())
    .filter((rowData) => isSavedCadlan2Row(rowData))
    .map((rowData) => getPersistedRowId(rowData))
    .filter((id) => id !== null);

  return [...new Set(selectedSavedRowIds)];
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
  const selectedRows = getActiveSelectedRows();
  if (selectedRows.length === 0) {
    setStatus("Selecione ao menos uma linha para enviar para a cadlan.");
    return;
  }

  const selectedSavedRowIds = getSelectedSavedCadlan2RowIds();
  if (selectedSavedRowIds.length === 0) {
    setStatus("Selecione ao menos uma linha ja salva na cadlan2 para enviar.");
    return;
  }

  const ignoredUnsavedRowsCount = selectedRows.length - selectedSavedRowIds.length;
  const shouldCommit = window.confirm(
    ignoredUnsavedRowsCount > 0
      ? `Confirma o envio de ${selectedSavedRowIds.length} registro(s) selecionado(s) e salvo(s) na cadlan2 para a cadlan? ${ignoredUnsavedRowsCount} linha(s) selecionada(s) ainda nao estao salvas na cadlan2 e nao serao enviadas. Os registros permanecerao na cadlan2.`
      : `Confirma o envio de ${selectedSavedRowIds.length} registro(s) selecionado(s) da cadlan2 para a cadlan? Os registros permanecerao na cadlan2.`
  );

  if (!shouldCommit) {
    return;
  }

  setBusy(true);
  setStatus(`Confirmando ${selectedSavedRowIds.length} registro(s) selecionado(s) para cadlan...`);

  try {
    const payload = await requestJson("/cadlan2/commit", {
      method: "POST",
      body: JSON.stringify({
        selectedIds: selectedSavedRowIds,
      }),
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

function handleExportExcel() {
  if (!state.table) {
    setStatus("Grade ainda nao inicializada.", "error");
    return;
  }

  if (typeof window.XLSX === "undefined") {
    setStatus("Biblioteca de exportacao Excel nao carregada.", "error");
    return;
  }

  const dateStamp = new Date().toISOString().slice(0, 10);
  const fileName = `cadlan2_${dateStamp}.xlsx`;

  state.table.download(
    "xlsx",
    fileName,
    {
      sheetName: "cadlan2",
    },
    "active"
  );

  setStatus(`Download do arquivo ${fileName} iniciado.`, "success");
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
    const { rows: importedRows, skippedImportedCount } = parseOfxTransactions(fileText);

    if (importedRows.length === 0) {
      if (skippedImportedCount > 0) {
        setStatus(
          `Nenhum novo lancamento foi importado. ${skippedImportedCount} transacao(oes) ja existente(s) na grade/cadlan2 foram ignorada(s).`,
          "success"
        );
        return;
      }

      throw new Error("Nenhum lancamento valido foi encontrado no OFX.");
    }

    await state.table.addData(importedRows, false);
    persistUnsavedRowsToLocalStorage();
    applyGridFilters();
    setStatus(
      `${importedRows.length} lancamento(s) importado(s).${
        skippedImportedCount > 0
          ? ` ${skippedImportedCount} transacao(oes) ja existente(s) na grade/cadlan2 foram ignorada(s).`
          : ""
      } Preencha lan_deslan e demais campos obrigatorios antes de salvar.`,
      "success"
    );
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
    event.target.value = "";
  }
}

function handleAiPanelToggle() {
  if (!state.ai.enabled) {
    return;
  }

  setAiPanelVisible(state.controls.aiPanel.hidden);
}

function handleAiPanelClose() {
  setAiPanelVisible(false);
}

async function handleAiGenerateSuggestions() {
  if (!state.ai.enabled) {
    return;
  }

  let aiRequest;
  try {
    aiRequest = collectRowsForAiSuggestion();
  } catch (error) {
    setStatus(error.message, "error");
    return;
  }

  setBusy(true);
  setStatus(`Gerando sugestoes de IA para ${aiRequest.rows.length} linha(s)...`);

  try {
    const payload = await requestJson("/cadlan2/ai/suggest", {
      method: "POST",
      body: JSON.stringify({
        prompt: aiRequest.prompt,
        scope: aiRequest.scope,
        overwrite: aiRequest.overwrite,
        rows: aiRequest.rows,
      }),
    });

    state.ai.suggestions = Array.isArray(payload.suggestions) ? payload.suggestions : [];
    state.ai.globalWarnings = Array.isArray(payload.globalWarnings) ? payload.globalWarnings : [];
    state.ai.rowMap = aiRequest.rowMap;
    state.ai.overwrite = aiRequest.overwrite;
    renderAiSuggestions();
    setAiPanelVisible(true);
    setStatus(
      `${payload.message || "Sugestoes de IA geradas."} ${state.ai.suggestions.length} linha(s) analisada(s).`,
      "success"
    );
  } catch (error) {
    resetAiSuggestions();
    setStatus(error.message, "error");
  } finally {
    setBusy(false);
  }
}

async function handleAiApplySuggestions() {
  if (state.ai.suggestions.length === 0) {
    setStatus("Nao ha sugestoes de IA prontas para aplicar.");
    return;
  }

  let updatedRows = 0;
  let updatedFields = 0;

  for (const suggestion of state.ai.suggestions) {
    const rowReference = state.ai.rowMap.get(suggestion.clientRowId);
    if (!rowReference?.rowComponent) {
      continue;
    }

    const rowComponent = rowReference.rowComponent;
    const rowData = rowComponent.getData();
    const updates = buildAiFieldUpdates(rowData, suggestion.suggestedFields, state.ai.overwrite);

    if (Object.keys(updates).length === 0) {
      continue;
    }

    await rowComponent.update(updates);
    rowComponent.reformat();
    updatedRows += 1;
    updatedFields += Object.keys(updates).length;
  }

  persistUnsavedRowsToLocalStorage();
  applyGridFilters();
  renderAiSuggestions();

  if (updatedRows === 0) {
    setStatus("A IA nao trouxe alteracoes aplicaveis para o modo selecionado.");
    return;
  }

  setStatus(
    `${updatedRows} linha(s) atualizada(s) com ${updatedFields} campo(s) sugerido(s) pela IA. Revise e salve a grade quando concluir.`,
    "success"
  );
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
  state.controls.exportExcel = document.getElementById("exportExcelButton");
  state.controls.import = document.getElementById("importButton");
  state.controls.aiSuggest = document.getElementById("aiSuggestButton");
  state.controls.aiPanel = document.getElementById("aiAssistantPanel");
  state.controls.aiClose = document.getElementById("aiCloseButton");
  state.controls.aiScope = document.getElementById("aiScopeSelect");
  state.controls.aiOverwrite = document.getElementById("aiOverwriteCheckbox");
  state.controls.aiPrompt = document.getElementById("aiPromptInput");
  state.controls.aiRun = document.getElementById("aiRunButton");
  state.controls.aiApply = document.getElementById("aiApplyButton");
  state.controls.aiSummary = document.getElementById("aiSummary");
  state.controls.aiResults = document.getElementById("aiResults");
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
  state.controls.exportExcel.addEventListener("click", handleExportExcel);
  state.controls.import.addEventListener("click", handleImportClick);
  state.controls.aiSuggest.addEventListener("click", handleAiPanelToggle);
  state.controls.aiClose.addEventListener("click", handleAiPanelClose);
  state.controls.aiRun.addEventListener("click", handleAiGenerateSuggestions);
  state.controls.aiApply.addEventListener("click", handleAiApplySuggestions);
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
