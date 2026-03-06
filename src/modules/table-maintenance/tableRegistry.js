const tableRegistry = Object.freeze({
  cadlan2: {
    tableName: "cadlan2",
    targetTable: "cadlan",
    label: "Lancamentos temporarios",
    columns: [
      "lan_idmem",
      "lan_deslan",
      "lan_valor",
      "lan_datlan",
      "lan_lanope",
      "lan_idmin",
      "aux_extrato_desc",
      "aux_extrato_dc",
    ],
  },
});

function getTableConfig(tableKey) {
  return tableRegistry[tableKey] || null;
}

module.exports = {
  tableRegistry,
  getTableConfig,
};
