const crypto = require("crypto");
const { env } = require("../../config/env");
const { AppError } = require("./errors");

function readOperationPassword(payload) {
  if (typeof payload === "string") {
    return payload;
  }

  return String(payload?.operationPassword || "");
}

function isSamePassword(receivedPassword, expectedPassword) {
  const receivedBuffer = Buffer.from(receivedPassword, "utf8");
  const expectedBuffer = Buffer.from(expectedPassword, "utf8");

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

function assertOperationPassword(payload) {
  const expectedPassword = env.operationConfirmationPassword;
  if (!expectedPassword) {
    throw new AppError("Senha de confirmacao nao configurada no servidor.", 500);
  }

  const receivedPassword = readOperationPassword(payload);
  if (!receivedPassword) {
    throw new AppError("Senha de confirmacao obrigatoria.", 401);
  }

  if (!isSamePassword(receivedPassword, expectedPassword)) {
    throw new AppError("Senha de confirmacao invalida.", 403);
  }
}

module.exports = {
  assertOperationPassword,
};
