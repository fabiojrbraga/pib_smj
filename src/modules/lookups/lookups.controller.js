const service = require("./lookups.service");

async function getLookups(req, res, next) {
  try {
    const lookups = await service.getAllLookups();
    res.json(lookups);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getLookups,
};
