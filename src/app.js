const express = require("express");
const path = require("path");
const { router } = require("./routes");
const { AppError } = require("./modules/shared/errors");

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));
app.use("/api", router);

app.use((req, res) => {
  res.status(404).json({ message: "Rota nao encontrada." });
});

app.use((error, req, res, next) => {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      message: error.message,
      details: error.details,
    });
  }

  console.error(error);
  return res.status(500).json({
    message: "Erro interno no servidor.",
  });
});

module.exports = { app };
