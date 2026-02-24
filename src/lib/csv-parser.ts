/**
 * Minimal CSV parser — handles BOM, CRLF, quoted fields, escaped quotes.
 * No external dependencies.
 */

const BOM = "\uFEFF";

/** Parse CSV text into rows of string arrays. Handles CRLF, LF, quoted fields. */
export function parseCsv(text: string): string[][] {
  const input = text.startsWith(BOM) ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < input.length) {
    const ch = input[i]!;

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          // Escaped quote
          field += '"';
          i += 2;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ",") {
        row.push(field);
        field = "";
        i++;
      } else if (ch === "\r") {
        // CRLF or bare CR
        row.push(field);
        field = "";
        if (row.some((c) => c.trim() !== "")) {
          rows.push(row);
        }
        row = [];
        i += input[i + 1] === "\n" ? 2 : 1;
      } else if (ch === "\n") {
        row.push(field);
        field = "";
        if (row.some((c) => c.trim() !== "")) {
          rows.push(row);
        }
        row = [];
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  // Last field/row
  row.push(field);
  if (row.some((c) => c.trim() !== "")) {
    rows.push(row);
  }

  return rows;
}
