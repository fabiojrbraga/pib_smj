const { assertOperationPassword } = require("./operationPassword");

function verifyOperationPassword(req, res, next) {
  try {
    assertOperationPassword(req.body);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  verifyOperationPassword,
};
