'use strict';

/**
 * UK Postcode structure utilities.
 *
 * A full postcode has the form:  <Outward> <Inward>
 *   Outward = Area + District          e.g.  SW1A   (Area=SW, District=SW1A)
 *   Inward  = Sector digit + Unit      e.g.  2AA    (Sector digit = 2)
 *
 * Definitions used here:
 *   Area        – leading alpha characters of the outward code   e.g. "SW", "E", "EC"
 *   District    – full outward code                              e.g. "SW1A", "E1", "EC2"
 *   Sector      – outward code + space + first digit of inward   e.g. "SW1A 2", "E1 6"
 *
 * Sub_District is intentionally omitted per project requirements.
 *
 * Regex reference (Royal Mail PAF standard):
 *   AN   – e.g. E1
 *   ANN  – e.g. W1A (note: last char may be alpha)
 *   AAN  – e.g. SE1
 *   AANN – e.g. SW1A (note: last char may be alpha or digit)
 */

// Matches a valid full postcode (with or without space)
const POSTCODE_REGEX = /^([A-Z]{1,2})(\d{1,2}[A-Z]?)[\s]?(\d)([A-Z]{2})$/i;

/**
 * Parse a normalised (uppercase, trimmed) postcode string into its components.
 *
 * @param {string} postcode   e.g. "SW1A 2AA"
 * @returns {{ area, district, sector } | null}
 */
function parsePostcode(postcode) {
  if (!postcode || typeof postcode !== 'string') return null;

  // Normalise: uppercase, collapse whitespace
  const pc = postcode.toUpperCase().replace(/\s+/g, ' ').trim();

  const match = pc.match(POSTCODE_REGEX);
  if (!match) return null;

  // match[1] = area letters  e.g. "SW"
  // match[2] = district suffix e.g. "1A"
  // match[3] = sector digit   e.g. "2"
  // match[4] = unit           e.g. "AA"

  const area     = match[1];                                // "SW"
  const district = `${match[1]}${match[2]}`;               // "SW1A"
  const sector   = `${match[1]}${match[2]} ${match[3]}`;   // "SW1A 2"

  return { area, district, sector };
}

/**
 * Returns true when both easting and northing are valid non-zero numbers.
 */
function hasValidCoords(easting, northing) {
  return (
    easting  !== null && easting  !== undefined && easting  !== 0 &&
    northing !== null && northing !== undefined && northing !== 0 &&
    !isNaN(easting) && !isNaN(northing)
  );
}

module.exports = { parsePostcode, hasValidCoords };
