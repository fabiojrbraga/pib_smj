const mysql = require("mysql2/promise");
const { env } = require("../config/env");

const pool = mysql.createPool(env.dbConfig);

module.exports = { pool };
