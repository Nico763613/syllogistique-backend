'use strict';
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function makePool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL manquant');
  const local = /localhost|127\.0\.0\.1|\/tmp\//.test(url);
  return new Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false }, max: 5 });
}
async function migrate(pool) {
  await pool.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
}
module.exports = { makePool, migrate };
