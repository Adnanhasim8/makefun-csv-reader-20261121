// Fast drop-in for csv-reader 1.0.0: run(input) returns {columns, rows, errors},
// the same answer csv-reader gives for the same {text, header}, but read with
// slices instead of one character at a time.
//
// How it reads (the spec, in my own words): the text is walked once, left to
// right. A U+FEFF at the very start is dropped. A record ends at LF or CRLF;
// a line left with no characters is no record. Outside quotes a CR not
// followed by LF is dropped (stray_cr). A field that opens with a quote runs
// to the next quote that is not doubled ("" inside it is one quote, and each
// CRLF or lone CR inside it is read as LF); what follows its closing quote,
// up to the next comma or line break, is appended as it stands (quote_junk
// when the field ends); a quote that never closes is a literal character and
// the text after it is read again as unquoted (unterminated_quote). A quote
// inside an unquoted field is a literal character. Fields stay strings, never
// trimmed or converted. columns is the first record when header is true, else
// null; rows holds the records after it, each padded with empty strings
// (short_row, with fields: its field count) or cut (long_row, with extra: the
// cut fields) to the first record's width. Each error is {code, line, row},
// in the order met, a record's short_row or long_row when it ends: line the
// 1-based line its record starts on, counting every LF, CRLF and lone CR
// inside quotes, row its record's index in rows, null for the header.
//
// Speed: an unquoted field is found by a tight charCodeAt scan that only
// stops at a comma, a line break or a stray CR, and the field is then cut out
// with one slice; a quoted field's closing quote is found with indexOf, its
// content cut out with one slice, and its line breaks counted with indexOf
// too. The only per-character work is the unquoted scan and the rare paths
// (stray CRs, CRs inside quotes, junk after a closing quote).

const COMMA = 0;
const BREAK = 1;
const END = 2;

// Reads unquoted characters from `start`, appending them to `value`, up to
// the next comma or line break. A CR not followed by LF is dropped and
// reported as stray_cr. Used for the rare paths only (junk after a closing
// quote, and the re-read after a quote that never closes); the hot unquoted
// scan lives inline in run() so it keeps pos and line as plain locals.
// Returns {value, ended, added, pos, line}; ended is COMMA, BREAK or END,
// added counts the characters kept after the starting value.
function readUnquoted(text, start, line, value, recordLine, recordRow, errors) {
  const len = text.length;
  let added = 0;
  let pos = start;
  let seg = start;
  let parts = null;
  let i = start;
  let ended;
  let crlf = false;
  while (true) {
    if (i >= len) {
      ended = END;
      break;
    }
    const c = text.charCodeAt(i);
    if (c === 44) {
      ended = COMMA;
      break;
    }
    if (c === 10) {
      ended = BREAK;
      break;
    }
    if (c === 13) {
      if (text.charCodeAt(i + 1) === 10) {
        ended = BREAK;
        crlf = true;
        break;
      }
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      if (parts === null) parts = [];
      if (i > seg) parts.push(text.slice(seg, i));
      i += 1;
      seg = i;
      continue;
    }
    i += 1;
  }
  let tail;
  if (parts === null) {
    tail = text.slice(seg, i);
  } else {
    if (i > seg) parts.push(text.slice(seg, i));
    tail = parts.join('');
  }
  added = tail.length;
  if (tail !== '') value += tail;
  if (ended === COMMA) pos = i + 1;
  else if (ended === BREAK) {
    pos = i + (crlf ? 2 : 1);
    line += 1;
  } else {
    pos = i;
  }
  return { value, ended, added, pos, line };
}

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0;
  let line = 1;
  if (len > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    const recordLine = line;
    const recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let lastQuoted = false;
    let ended = COMMA;

    do {
      if (text.charCodeAt(pos) === 34) {
        // A field that opens with a quote.
        lastQuoted = true;
        const open = pos;
        let segStart = pos + 1;
        let q = pos + 1;
        let parts = null;
        let closedAt = -1;
        while (true) {
          const qi = text.indexOf('"', q);
          if (qi === -1) break;
          if (text.charCodeAt(qi + 1) === 34) {
            // A doubled quote: one literal quote, keep scanning.
            if (parts === null) parts = [];
            parts.push(text.slice(segStart, qi));
            q = qi + 2;
            segStart = q;
            continue;
          }
          closedAt = qi;
          break;
        }
        if (closedAt === -1) {
          // The quote never closes: it is a literal character, and the
          // text after it is read again as an unquoted field.
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          const r = readUnquoted(text, open + 1, line, '"', recordLine, recordRow, errors);
          fields.push(r.value);
          ended = r.ended;
          pos = r.pos;
          line = r.line;
          continue;
        }
        let value;
        if (parts === null) {
          value = text.slice(segStart, closedAt);
        } else {
          parts.push(text.slice(segStart, closedAt));
          value = parts.join('"');
        }
        // Every CRLF or lone CR inside the quotes is one LF, and every
        // line break inside them counts toward the line number.
        if (value.indexOf('\r') === -1) {
          let p = value.indexOf('\n');
          while (p !== -1) {
            line += 1;
            p = value.indexOf('\n', p + 1);
          }
        } else {
          let out = '';
          let s = 0;
          for (let i = 0; i < value.length; i++) {
            const ch = value.charCodeAt(i);
            if (ch === 13) {
              out += value.slice(s, i);
              out += '\n';
              line += 1;
              if (value.charCodeAt(i + 1) === 10) i += 1;
              s = i + 1;
            } else if (ch === 10) {
              line += 1;
            }
          }
          out += value.slice(s);
          value = out;
        }
        pos = closedAt + 1;
        if (pos >= len) {
          ended = END;
        } else {
          const c = text.charCodeAt(pos);
          if (c === 44) {
            pos += 1;
            ended = COMMA;
          } else if (c === 10) {
            pos += 1;
            line += 1;
            ended = BREAK;
          } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
            pos += 2;
            line += 1;
            ended = BREAK;
          } else {
            // What follows the closing quote is appended as it stands,
            // up to the next comma or line break.
            const r = readUnquoted(text, pos, line, value, recordLine, recordRow, errors);
            if (r.added > 0) {
              errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
            }
            value = r.value;
            ended = r.ended;
            pos = r.pos;
            line = r.line;
          }
        }
        fields.push(value);
      } else {
        // An unquoted field: scan to the next comma or line break and cut
        // the field out with one slice.
        lastQuoted = false;
        let seg = pos;
        let parts = null;
        let i = pos;
        let crlf = false;
        while (true) {
          if (i >= len) {
            ended = END;
            break;
          }
          const c = text.charCodeAt(i);
          if (c === 44) {
            ended = COMMA;
            break;
          }
          if (c === 10) {
            ended = BREAK;
            break;
          }
          if (c === 13) {
            if (text.charCodeAt(i + 1) === 10) {
              ended = BREAK;
              crlf = true;
              break;
            }
            // A CR not followed by LF is dropped (stray_cr).
            errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
            if (parts === null) parts = [];
            if (i > seg) parts.push(text.slice(seg, i));
            i += 1;
            seg = i;
            continue;
          }
          i += 1;
        }
        let value;
        if (parts === null) {
          value = text.slice(seg, i);
        } else {
          if (i > seg) parts.push(text.slice(seg, i));
          value = parts.join('');
        }
        if (ended === COMMA) {
          pos = i + 1;
        } else if (ended === BREAK) {
          pos = i + (crlf ? 2 : 1);
          line += 1;
        } else {
          pos = i;
        }
        fields.push(value);
      }
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
