const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { Database, normalizeLegacyApiKeyRow } = require('../src/storage/db');

const dataDir = path.resolve(process.argv[2] || process.env.DATA_DIR || 'data');
const sqlitePath = path.join(dataDir, 'mqttapi.db');
const configPath = path.join(dataDir, 'config.json');

if (!fs.existsSync(sqlitePath)) throw new Error(`SQLite database not found: ${sqlitePath}`);

function readAll(db, sql) {
  return new Promise((resolve, reject) => db.all(sql, (error, rows) => error ? reject(error) : resolve(rows)));
}

function close(db) {
  return new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve()));
}

async function main() {
  const source = new sqlite3.Database(sqlitePath, sqlite3.OPEN_READONLY);
  const target = new Database();
  try {
    await target.initialize();
    const mappings = [
      ['devices', 'devices', ['id']],
      ['sensor_data', 'sensor_data', ['id']],
      ['relay_logs', 'relay_logs', ['id']],
      ['api_keys', 'api_keys', ['key_id', 'id']]
    ];
    for (const [table, collection, candidates] of mappings) {
      let rows = await readAll(source, `SELECT * FROM ${table}`);
      if (rows.length === 0) continue;
      if (table === 'api_keys') rows = rows.map(normalizeLegacyApiKeyRow);
      await target.db.collection(collection).bulkWrite(rows.map((row) => {
        const key = candidates.find((candidate) => row[candidate] != null);
        if (!key) throw new Error(`${table} row is missing a stable migration key.`);
        return {
          updateOne: {
            filter: { [key]: row[key] },
            update: { $setOnInsert: row },
            upsert: true
          }
        };
      }));
      console.log(`${table}: considered ${rows.length} legacy rows (existing MongoDB rows preserved)`);
    }
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));
      await target.db.collection('settings').updateOne(
        { key: 'runtime' },
        { $setOnInsert: { key: 'runtime', value: config, updated_at: Date.now() } },
        { upsert: true }
      );
      console.log('settings: considered 1 legacy document (existing MongoDB settings preserved)');
    }
  } finally {
    await close(source);
    await target.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
