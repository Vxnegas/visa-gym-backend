require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./db');

async function run() {
  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    console.log(`Aplicando migración: ${file}`);
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await db.query(sql);
  }

  console.log('Migraciones completadas.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Error aplicando migraciones:', err);
  process.exit(1);
});
