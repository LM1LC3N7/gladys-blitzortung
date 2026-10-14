// -----------------------------------------------------------------------------
// The frames of the Blitzortung live feed are JSON compressed with an LZW
// string coding, decoded in the browser by map.blitzortung.org. Pure.
//
// The map's decoder (de-obfuscated), which this function reproduces:
//   first char literal; a dictionary starting at code 256; for each next
//   char c: entry = c < 256 ? char : dict[c] ?? (prev + prev[0]);
//   dict[next++] = prev + entry[0]; prev = entry.
// The same algorithm is ported in the open-source Rust crate `blitzortung`.
// It works on UTF-16 code units (`charCodeAt`), like the map does.
// -----------------------------------------------------------------------------

/** Decode one frame into its JSON text. */
export function decode(frame) {
  const text = String(frame ?? '');
  if (text.length === 0) {
    return '';
  }
  const dictionary = [];
  let previous = text[0];
  const out = [previous];
  for (let i = 1; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    let entry;
    if (code < 256) {
      entry = text[i];
    } else if (code - 256 < dictionary.length) {
      entry = dictionary[code - 256];
    } else {
      // The code the encoder is defining right now (the "KwKwK" case).
      entry = previous + previous[0];
    }
    out.push(entry);
    dictionary.push(previous + entry[0]);
    previous = entry;
  }
  return out.join('');
}

/** Decode and parse a frame; undefined when it is not valid JSON. */
export function parseFrame(frame) {
  try {
    const value = JSON.parse(decode(frame));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
