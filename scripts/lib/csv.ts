/**
 * CSV reader for GTFS files.
 *
 * GTFS is RFC 4180 CSV: comma-separated, with double quotes around fields that
 * contain commas, quotes or newlines, and a doubled quote as the escape. Stop
 * names in the Transjakarta feed do contain commas, so a naive `split(',')`
 * silently shifts every later column — which is why this exists rather than
 * one-lining it.
 */

/** Parse a CSV document into rows of raw cell strings. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  // Strip a UTF-8 BOM, which GTFS feeds frequently carry and which would
  // otherwise become part of the first column's name.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  // Flush a trailing record with no final newline.
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/**
 * Parse a GTFS file into records keyed by its header row.
 *
 * Returns a plain array of objects; GTFS files here are at most a few hundred
 * thousand rows, which is comfortable in memory for a build-time script.
 */
export function parseGtfsTable(text: string): Record<string, string>[] {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return [];

  const header = rows[0].map((name) => name.trim());
  const records: Record<string, string>[] = [];

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    // Skip blank trailing lines.
    if (row.length === 1 && row[0].trim() === '') continue;

    const record: Record<string, string> = {};
    for (let column = 0; column < header.length; column += 1) {
      record[header[column]] = row[column] ?? '';
    }
    records.push(record);
  }

  return records;
}

/** Parse a GTFS `HH:MM:SS` duration into seconds. Hours may exceed 24. */
export function parseGtfsTime(value: string): number | null {
  const match = /^(\d+):(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;

  return (
    Number.parseInt(match[1], 10) * 3600 +
    Number.parseInt(match[2], 10) * 60 +
    Number.parseInt(match[3], 10)
  );
}
