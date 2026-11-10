'use strict';
// SIMULATION POUR LES TESTS LOCAUX UNIQUEMENT : remplace le paquet « pg » (non installable ici) en passant par psql.
const { execFileSync } = require('child_process');
const lit = (v) => v === null || v === undefined ? 'null' : v instanceof Date ? `'${v.toISOString()}'` : typeof v === 'number' || typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
class Pool {
  constructor(o) { this.o = o; }
  async query(sql, params = []) {
    let q = sql.replace(/\$(\d+)/g, (_, n) => lit(params[Number(n) - 1]));
    const ddl = /^\s*(--[^\n]*\n\s*)*(create|alter|drop|do|begin|commit)/i.test(q);
    if (!ddl) q = `with q as (${q}) select coalesce(json_agg(q),'[]'::json) from q`;
    const bin = '/usr/lib/postgresql/16/bin/psql';
    const out = execFileSync(bin, ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-h', process.env.PGHOST_TEST, '-p', process.env.PGPORT_TEST, '-U', 'postgres', '-d', process.env.PGDB_TEST, '-c', q], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const rows = ddl ? [] : JSON.parse(out.trim() || '[]');
    return { rows, rowCount: rows.length };
  }
}
module.exports = { Pool };
