const express = require("express");
const lookupsController = require("./modules/lookups/lookups.controller");
const tableMaintenanceController = require("./modules/table-maintenance/tableMaintenance.controller");
const cadlan2Controller = require("./modules/table-maintenance/cadlan2/cadlan2.controller");
const cadlan2AiController = require("./modules/table-maintenance/cadlan2/cadlan2.ai.controller");

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({ ok: true });
});

router.get("/maintenance/catalog", tableMaintenanceController.getMaintenanceCatalog);
router.get("/lookups", lookupsController.getLookups);

router.get("/cadlan2", cadlan2Controller.listRows);
router.put("/cadlan2/batch", cadlan2Controller.saveBatch);
router.put("/cadlan2/row", cadlan2Controller.saveRow);
router.post("/cadlan2/commit", cadlan2Controller.commitBatch);
router.get("/cadlan2/ai/status", cadlan2AiController.getStatus);
router.post("/cadlan2/ai/suggest", cadlan2AiController.suggestRows);

module.exports = { router };
