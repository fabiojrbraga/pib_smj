const repository = require("./lookups.repository");

async function getAllLookups() {
  const [members, operations, ministries] = await Promise.all([
    repository.listMembers(),
    repository.listOperations(),
    repository.listMinistries(),
  ]);

  return {
    members: members.map((item) => ({
      id: item.id,
      label: item.cad_nome,
    })),
    operations: operations.map((item) => ({
      id: item.id,
      label: `${item.cad_nomeoperacao} (${item.cad_credeb})`,
      type: item.cad_credeb,
    })),
    ministries: ministries.map((item) => ({
      id: item.id,
      label: item.cad_nommin,
    })),
  };
}

module.exports = {
  getAllLookups,
};
