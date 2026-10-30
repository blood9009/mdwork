export interface InvisibleCharacter {
  index: number;
  length: number;
  label: string;
}

function isHighSurrogate(value: number): boolean {
  return value >= 0xD800 && value <= 0xDBFF;
}

function isLowSurrogate(value: number): boolean {
  return value >= 0xDC00 && value <= 0xDFFF;
}

function isNoncharacter(codePoint: number): boolean {
  return codePoint >= 0xFDD0 && codePoint <= 0xFDEF
    || codePoint <= 0x10FFFF && (codePoint & 0xFFFF) >= 0xFFFE;
}

function isInvisibleCodePoint(codePoint: number): boolean {
  if (codePoint !== 0x09 && (codePoint < 0x20 || codePoint >= 0x7F && codePoint <= 0x9F)) return true;
  if (codePoint === 0x00A0 || codePoint === 0x00AD || codePoint === 0x061C || codePoint === 0x1680
    || codePoint === 0x2028 || codePoint === 0x2029 || codePoint === 0x202F
    || codePoint === 0x205F || codePoint === 0x3000 || codePoint === 0xFEFF) return true;
  if (codePoint >= 0x2000 && codePoint <= 0x200F
    || codePoint >= 0x202A && codePoint <= 0x202E
    || codePoint >= 0x2060 && codePoint <= 0x206F) return true;
  return isNoncharacter(codePoint);
}

export function hexadecimalCharacterLabel(codePoint: number): string {
  const width = codePoint <= 0xFF ? 2 : 4;
  return `[0x${codePoint.toString(16).toUpperCase().padStart(width, '0')}]`;
}

export function findInvisibleCharacters(line: string, start = 0, end = line.length): InvisibleCharacter[] {
  const result: InvisibleCharacter[] = [];
  for (let index = Math.max(0, start); index < Math.min(line.length, end);) {
    const first = line.charCodeAt(index);
    let codePoint = first;
    let length = 1;
    if (isHighSurrogate(first) && index + 1 < line.length && isLowSurrogate(line.charCodeAt(index + 1))) {
      codePoint = line.codePointAt(index)!;
      length = 2;
    } else if (isLowSurrogate(first) && index > 0 && isHighSurrogate(line.charCodeAt(index - 1))) {
      index += 1;
      continue;
    }
    if (isInvisibleCodePoint(codePoint) || isHighSurrogate(first) && length === 1 || isLowSurrogate(first)) {
      result.push({ index, length, label: hexadecimalCharacterLabel(codePoint) });
    }
    index += length;
  }
  return result;
}
