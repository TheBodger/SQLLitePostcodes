'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

/**
 * Column indices in the raw CSV (zero-based, no header row).
 * Only the columns we care about are named here.
 *
 * Full layout (0-indexed):
 *  0  Mnemonic
 *  1  Description
 *  2  Data type
 *  3  Size
 *  4-7 N/A columns
 *  8  PC  – Postcode
 *  9  PQ  – Positional_quality_indicator
 *  10 EA  – Eastings
 *  11 NO  – Northings
 *  12 CY  – Country_code
 *  13 RH  – NHS_regional_HA_code
 *  14 LH  – NHS_HA_code
 *  15 CC  – Admin_county_code
 *  16 DC  – Admin_district_code
 *  17 WC  – Admin_ward_code
 */
const COL = {
    POSTCODE: 0,   // PC
    ignore: 1,   // Description (not needed)
  EASTING:  2,   // EA  (after stripping the header/meta rows the real data cols shift)
  NORTHING: 3,   // NO
};

/**
 * Parse a single line into an array of fields, respecting quoted commas.
 */
function parseLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Extract the three fields we need from a raw CSV row.
 * The CSV has NO header.  The actual data columns are:
 *   col 0  → Postcode   (PC)
 *   col 2  → Easting    (EA)
 *   col 3  → Northing   (NO)
 *
 * Returns null if the row looks invalid.
 */
function extractRow(fields) {
  if (!fields || fields.length < 3) return null;

  const postcode = fields[COL.POSTCODE].replace(/\s+/g, ' ').trim().toUpperCase();
  if (!postcode) return null;

  const easting  = parseInt(fields[COL.EASTING],  10);
  const northing = parseInt(fields[COL.NORTHING], 10);

  return {
    postcode,
    easting:  isNaN(easting)  ? null : easting,
    northing: isNaN(northing) ? null : northing,
  };
}

/**
 * Stream-read a CSV file and call `onRow(rowObject)` for every valid data row.
 * Returns a Promise that resolves with { file, rowCount, errorCount }.
 */
function readCsvFile(filePath, onRow) {
  return new Promise((resolve, reject) => {
    const filename  = path.basename(filePath);
    let rowCount    = 0;
    let errorCount  = 0;

    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl     = readline.createInterface({ input: stream, crlfDelay: Infinity });

    rl.on('line', (line) => {
      if (!line.trim()) return; // skip blank lines
      try {
        const fields = parseLine(line);
        const row    = extractRow(fields);
        if (row) {
          onRow(row);
          rowCount++;
        }
      } catch (err) {
        errorCount++;
      }
    });

    rl.on('close', () => resolve({ file: filename, rowCount, errorCount }));
    rl.on('error', reject);
    stream.on('error', reject);
  });
}

module.exports = { readCsvFile, parseLine, extractRow };
