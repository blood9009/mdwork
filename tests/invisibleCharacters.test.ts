import { describe, expect, it } from 'vitest';
import { findInvisibleCharacters, hexadecimalCharacterLabel } from '../src/editor/invisibleCharacters';

describe('invisible character labels', () => {
  it('represents ASCII and C1 controls with hexadecimal code points', () => {
    const characters = findInvisibleCharacters('A\x00\x01\x07\x1B\x7F\x9F');
    expect(characters.map(({ label }) => label)).toEqual([
      '[0x00]', '[0x01]', '[0x07]', '[0x1B]', '[0x7F]', '[0x9F]',
    ]);
    expect(characters[0]).toMatchObject({ index: 1, length: 1 });
  });

  it('leaves printable characters, regular spaces, Tabs and valid emoji unchanged', () => {
    expect(findInvisibleCharacters('ASCII 中文\t😀')).toEqual([]);
  });

  it('labels zero-width characters, non-standard spaces and BOM', () => {
    expect(findInvisibleCharacters('​‍﻿  ').map(({ label }) => label)).toEqual([
      '[0x200B]', '[0x200D]', '[0xFEFF]', '[0xA0]', '[0x202F]',
    ]);
  });

  it('labels unpaired surrogates and supplementary noncharacters', () => {
    expect(findInvisibleCharacters('\uD800x\uDC00\u{1FFFE}').map(({ label }) => label)).toEqual([
      '[0xD800]', '[0xDC00]', '[0x1FFFE]',
    ]);
  });

  it('scans only the requested visible UTF-16 range', () => {
    expect(findInvisibleCharacters('\x00A\x01B\x02', 1, 4).map(({ label }) => label)).toEqual(['[0x01]']);
  });

  it('uses uppercase hexadecimal with a stable minimum width', () => {
    expect(hexadecimalCharacterLabel(0x0A)).toBe('[0x0A]');
    expect(hexadecimalCharacterLabel(0x200B)).toBe('[0x200B]');
    expect(hexadecimalCharacterLabel(0x10FFFF)).toBe('[0x10FFFF]');
  });
});
