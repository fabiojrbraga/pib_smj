const { env } = require("../../config/env");

function getClientConfig(req, res) {
  res.json({
    ofxDescriptionsToIgnore: env.ofxDescriptionsToIgnore,
  });
}

module.exports = {
  getClientConfig,
};
