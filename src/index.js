'use strict';

//moved to src and amended to work in visual studio project separately

const fs              = require('fs');
const path            = require('path');
const { readCsvFile } = require('./csvParser');
const DatabaseManager = require('./databaseManager');

// ─── Configuration ────────────────────────────────────────────────────────────

const POSTCODES_DIR   = path.resolve(process.cwd(), '../Postcodes');
const DB_DIR = process.cwd();
const BATCH_SIZE      = 5_000;   // rows buffered before a single DB transaction

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCsvFiles(dir) {
  if (!fs.existsSync(dir)) {
    throw new Error(`Postcodes directory not found: ${dir}`);
  }
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.csv'))
    .map((f) => path.join(dir, f))
    .sort();
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = (ms / 1000).toFixed(1);
  return `${s}s`;
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

async function run() {
  const startTotal = Date.now();

  console.log('═══════════════════════════════════════════════');
  console.log(' UK Postcode CSV → SQLite Loader');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Postcodes dir : ${POSTCODES_DIR}`);
  console.log(`  Database      : ${path.join(DB_DIR, 'mySQLLiteDB.db')}`);
  console.log();

  // ── 1. Collect CSV files ──────────────────────────────────────────────────
  const csvFiles = getCsvFiles(POSTCODES_DIR);
  if (csvFiles.length === 0) {
    console.warn('No CSV files found in the Postcodes directory. Exiting.');
    return;
  }
  console.log(`Found ${csvFiles.length} CSV file(s) to process.\n`);

  // ── 2. Open database ──────────────────────────────────────────────────────
  const dbManager = new DatabaseManager(DB_DIR);
  dbManager.open();

  // ── 3. Process each CSV file ──────────────────────────────────────────────
  let totalRows   = 0;
  let totalErrors = 0;

  for (let i = 0; i < csvFiles.length; i++) {
    const filePath  = csvFiles[i];
    const filename  = path.basename(filePath);
    const fileStart = Date.now();

    process.stdout.write(`[${i + 1}/${csvFiles.length}] ${filename} … `);

    let batch = [];

    const flush = () => {
      if (batch.length > 0) {
        dbManager.insertPostcodes(batch);
        batch = [];
      }
    };

    const result = await readCsvFile(filePath, (row) => {
      batch.push(row);
      if (batch.length >= BATCH_SIZE) flush();
    });

    flush(); // insert any remaining rows

    const elapsed = formatDuration(Date.now() - fileStart);
    console.log(`${result.rowCount.toLocaleString()} rows (${elapsed})`);

    totalRows   += result.rowCount;
    totalErrors += result.errorCount;
  }

  console.log();
  console.log(`── CSV loading complete ──────────────────────`);
  console.log(`   Total rows inserted : ${totalRows.toLocaleString()}`);
  console.log(`   Parse errors skipped: ${totalErrors.toLocaleString()}`);
  console.log();

  // ── 4. Build derived tables ───────────────────────────────────────────────
  console.log('── Building derived tables ───────────────────');
  const derivedStart = Date.now();

  dbManager.createDerivedTables();
  dbManager.buildDerivedTables();

  console.log(`   Derived tables built in ${formatDuration(Date.now() - derivedStart)}`);
  console.log();

  // ── 5. Summary ────────────────────────────────────────────────────────────
  const summary = dbManager.summary();
  console.log('── Final row counts ──────────────────────────');
  for (const [table, count] of Object.entries(summary)) {
    const label = table.padEnd(20);
    const value = typeof count === 'number' ? count.toLocaleString() : count;
    console.log(`   ${label}: ${value}`);
  }
  console.log();
  console.log(`Total time: ${formatDuration(Date.now() - startTotal)}`);
  console.log('═══════════════════════════════════════════════');

  // ── 6. Tidy up ────────────────────────────────────────────────────────────
  dbManager.close();
}

// ─── Entry point ─────────────────────────────────────────────────────────────

run().catch((err) => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
