const { tableRegistry } = require("./tableRegistry");

function getMaintenanceCatalog(req, res) {
  const tables = Object.entries(tableRegistry).map(([key, value]) => ({
    key,
    label: value.label,
    columns: value.columns,
  }));

  res.json({ tables });
}

module.exports = {
  getMaintenanceCatalog,
};
