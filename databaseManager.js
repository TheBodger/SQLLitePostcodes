'use strict';

const Database = require('better-sqlite3');
const path     = require('path');
const { parsePostcode, hasValidCoords } = require('./postcodeUtils');

const DB_FILENAME = 'mySQLLiteDB.db';

/**
 * DatabaseManager
 *
 * Wraps all SQLite interactions:
 *   - Opens / creates the database file
 *   - Creates the `postcodes` table
 *   - Provides a fast batched insert via a prepared statement
 *   - Builds Postcode_Area, District_Code and Sector tables from postcodes
 */
class DatabaseManager {
  /**
   * @param {string} [dbDir]  Directory where the .db file will be created.
   *                          Defaults to the current working directory.
   */
  constructor(dbDir = process.cwd()) {
    this.dbPath = path.join(dbDir, DB_FILENAME);
    this.db     = null;
  }

  // ─────────────────────────────────────────────
  //  Lifecycle
  // ─────────────────────────────────────────────

  /** Open the database and create core tables. */
  open() {
    this.db = new Database(this.dbPath);

    // Enable WAL for much faster bulk inserts
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous  = NORMAL');

    this._createPostcodesTable();
    return this;
  }

  /** Close the database connection. */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // ─────────────────────────────────────────────
  //  Table creation
  // ─────────────────────────────────────────────

  _createPostcodesTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS postcodes (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        postcode TEXT    NOT NULL UNIQUE,
        easting  INTEGER,
        northing INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_postcodes_postcode ON postcodes(postcode);
    `);
  }

  /**
   * Create the three derived tables.
   * Called after all CSV files have been loaded.
   */
  createDerivedTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS Postcode_Area (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        area     TEXT    NOT NULL UNIQUE,
        easting  INTEGER,
        northing INTEGER
      );

      CREATE TABLE IF NOT EXISTS District_Code (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        district TEXT    NOT NULL UNIQUE,
        easting  INTEGER,
        northing INTEGER
      );

      CREATE TABLE IF NOT EXISTS Sector (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        sector   TEXT    NOT NULL UNIQUE,
        easting  INTEGER,
        northing INTEGER
      );
    `);
  }

  // ─────────────────────────────────────────────
  //  Postcode inserts
  // ─────────────────────────────────────────────

  /**
   * Insert an array of postcode rows in a single transaction.
   * Each item: { postcode, easting, northing }
   *
   * Duplicate postcodes are silently ignored (INSERT OR IGNORE).
   *
   * @param {Array<{postcode:string, easting:number|null, northing:number|null}>} rows
   */
  insertPostcodes(rows) {
    if (!rows || rows.length === 0) return;

    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO postcodes (postcode, easting, northing)
      VALUES (@postcode, @easting, @northing)
    `);

    const insertMany = this.db.transaction((items) => {
      for (const item of items) {
        stmt.run(item);
      }
    });

    insertMany(rows);
  }

  // ─────────────────────────────────────────────
  //  Derived table population
  // ─────────────────────────────────────────────

  /**
   * Populate Postcode_Area, District_Code and Sector by iterating the
   * postcodes table, grouping by parsed components, and computing the
   * mean easting / northing (excluding zero / null values).
   */
  buildDerivedTables() {
    console.log('  Building derived tables from postcodes…');

    // Accumulators: Map<code, { sumE, sumN, count }>
    const areas     = new Map();
    const districts = new Map();
    const sectors   = new Map();

    const allRows = this.db
      .prepare('SELECT postcode, easting, northing FROM postcodes')
      .all();

    console.log(`  Processing ${allRows.length.toLocaleString()} postcode rows…`);

    for (const row of allRows) {
      const parsed = parsePostcode(row.postcode);
      if (!parsed) continue;

      const validCoords = hasValidCoords(row.easting, row.northing);

      const accumulate = (map, key) => {
        if (!map.has(key)) map.set(key, { sumE: 0, sumN: 0, count: 0 });
        if (validCoords) {
          const acc = map.get(key);
          acc.sumE  += row.easting;
          acc.sumN  += row.northing;
          acc.count += 1;
        }
      };

      accumulate(areas,     parsed.area);
      accumulate(districts, parsed.district);
      accumulate(sectors,   parsed.sector);
    }

    const mean = (acc) => ({
      easting:  acc.count > 0 ? Math.round(acc.sumE / acc.count) : null,
      northing: acc.count > 0 ? Math.round(acc.sumN / acc.count) : null,
    });

    // ── Postcode_Area ──────────────────────────
    {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO Postcode_Area (area, easting, northing)
        VALUES (@area, @easting, @northing)
      `);
      const insert = this.db.transaction((entries) => {
        for (const [area, acc] of entries) {
          const { easting, northing } = mean(acc);
          stmt.run({ area, easting, northing });
        }
      });
      insert([...areas.entries()]);
      console.log(`  Postcode_Area  : ${areas.size.toLocaleString()} rows inserted`);
    }

    // ── District_Code ──────────────────────────
    {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO District_Code (district, easting, northing)
        VALUES (@district, @easting, @northing)
      `);
      const insert = this.db.transaction((entries) => {
        for (const [district, acc] of entries) {
          const { easting, northing } = mean(acc);
          stmt.run({ district, easting, northing });
        }
      });
      insert([...districts.entries()]);
      console.log(`  District_Code  : ${districts.size.toLocaleString()} rows inserted`);
    }

    // ── Sector ─────────────────────────────────
    {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO Sector (sector, easting, northing)
        VALUES (@sector, @easting, @northing)
      `);
      const insert = this.db.transaction((entries) => {
        for (const [sector, acc] of entries) {
          const { easting, northing } = mean(acc);
          stmt.run({ sector, easting, northing });
        }
      });
      insert([...sectors.entries()]);
      console.log(`  Sector         : ${sectors.size.toLocaleString()} rows inserted`);
    }
  }

  // ─────────────────────────────────────────────
  //  Helpers
  // ─────────────────────────────────────────────

  /** Return a quick summary of row counts for all tables. */
  summary() {
    const tables = ['postcodes', 'Postcode_Area', 'District_Code', 'Sector'];
    const result = {};
    for (const t of tables) {
      try {
        result[t] = this.db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n;
      } catch {
        result[t] = 'N/A';
      }
    }
    return result;
  }
}

module.exports = DatabaseManager;
