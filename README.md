# Postcode CSV → SQLite Loader

Reads Royal Mail-style postcode CSV files from a `Postcodes/` folder and loads
them into a local SQLite database (`mySQLLiteDB.db`), then builds derived
geographic summary tables.

---

## Project structure

```
postcodeLoader/
├── package.json
├── README.md
└── src/
    ├── index.js            ← entry point / orchestrator
    ├── csvParser.js        ← stream CSV reader & row extractor
    ├── postcodeUtils.js    ← postcode component parser (Area / District / Sector)
    ├── databaseManager.js  ← SQLite wrapper (better-sqlite3)
    └── tests/
        └── postcodeUtils.test.js
```

---

## Prerequisites

- Node.js ≥ 16
- `better-sqlite3` (native module, requires a C++ build toolchain)

On Windows you may need the Visual Studio Build Tools:
```
npm install --global windows-build-tools
```

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Place your CSV files into a folder called Postcodes
#    (relative to where you run the script from)
mkdir Postcodes
cp /path/to/your/*.csv Postcodes/

# 3. Run
npm start
```

The database file `mySQLLiteDB.db` will be created in the current working
directory alongside the `Postcodes/` folder.

---

## CSV format

No header row. Columns used (zero-indexed):

| Index | Field    | Notes                     |
|-------|----------|---------------------------|
| 0     | Postcode | e.g. `SW1A 2AA`           |
| 1     | Easting  | OS National Grid eastings |
| 2     | Northing | OS National Grid northings|

Any row with a blank postcode is silently skipped.

---

## Database tables

### `postcodes`

| Column   | Type    | Notes                        |
|----------|---------|------------------------------|
| id       | INTEGER | Auto-increment primary key   |
| postcode | TEXT    | Unique, normalised uppercase |
| easting  | INTEGER | NULL if not available        |
| northing | INTEGER | NULL if not available        |

### `Postcode_Area`

Mean centre of all postcodes sharing the same Area code (e.g. `SW`, `E`).

| Column  | Type    |
|---------|---------|
| id      | INTEGER |
| area    | TEXT    |
| easting | INTEGER |
| northing| INTEGER |

### `District_Code`

Mean centre of all postcodes sharing the same District (e.g. `SW1A`, `E1`).

| Column   | Type    |
|----------|---------|
| id       | INTEGER |
| district | TEXT    |
| easting  | INTEGER |
| northing | INTEGER |

### `Sector`

Mean centre of all postcodes in the same Sector (e.g. `SW1A 2`, `E1 6`).

| Column  | Type    |
|---------|---------|
| id      | INTEGER |
| sector  | TEXT    |
| easting | INTEGER |
| northing| INTEGER |

> **Centre calculation**: the mean of all valid eastings / northings.
> Rows with easting = 0, northing = 0, or NULL values are excluded.

---

## Running the tests

```bash
npm test
```

---

## Performance notes

- CSV files are streamed line-by-line (constant memory regardless of file size).
- Inserts are batched in transactions of 5,000 rows for maximum SQLite throughput.
- WAL journal mode is enabled for better concurrent read performance.
- A full load of ~1.8 million UK postcodes typically completes in under 60 seconds
  on a modern laptop with an SSD.
