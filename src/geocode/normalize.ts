/** How place names are compared: case, accents, punctuation and common abbreviations ignored. */
export function normalizeName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\bst\b/g, 'saint')
    .replace(/\bste\b/g, 'sainte')
    .replace(/\bmt\b/g, 'mount')
    .trim();
}

/** The comma-separated parts of a place as written, most specific first, normalized. */
export function placeParts(text: string): string[] {
  return text
    .split(',')
    .map(normalizeName)
    .filter((part) => part !== '');
}

/**
 * The identity of a place string. Two spellings that differ only in case, accents or
 * spacing are the same place, so they share one result, one pin and one cache entry.
 */
export function placeKey(text: string): string {
  return placeParts(text).join(', ');
}

const PREFIXES = /^(isle|island|county|city|parish|township|town|village|municipality) of /;
const SUFFIXES = / (county|parish|township|district|island|municipality)$/;

/** Other names an entry answers to: "Bruce County" is also "Bruce", "Isle of Lewis" also "Lewis". */
export function nameVariants(normalized: string): string[] {
  const variants = [normalized];
  const bare = normalized.replace(PREFIXES, '').replace(SUFFIXES, '');
  if (bare !== normalized && bare !== '') variants.push(bare);
  return variants;
}
