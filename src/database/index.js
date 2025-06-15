const { Pool } = require("pg");

const pool = new Pool({
	user: "postgres",
	host: "localhost",
	database: "qdb",
	port: 5432,
});

module.exports = pool;
