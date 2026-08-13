const REGULAR_SPACE_CODE_POINTS = new Set([0x00a0, 0x2007, 0x202f]);

function isInvisibleFormatCharacter(codePoint: number) {
  return (
    codePoint === 0x00ad ||
    codePoint === 0x034f ||
    codePoint === 0x061c ||
    codePoint === 0x115f ||
    codePoint === 0x1160 ||
    (codePoint >= 0x17b4 && codePoint <= 0x17b5) ||
    codePoint === 0x180e ||
    (codePoint >= 0x200b && codePoint <= 0x200f) ||
    (codePoint >= 0x202a && codePoint <= 0x202e) ||
    (codePoint >= 0x2060 && codePoint <= 0x206f) ||
    codePoint === 0x3164 ||
    codePoint === 0xfeff ||
    codePoint === 0xffa0 ||
    (codePoint >= 0xfff9 && codePoint <= 0xfffb) ||
    (codePoint >= 0xe0000 && codePoint <= 0xe007f)
  );
}

export function sanitizeNoteText(value: string) {
  let result = "";
  for (const character of value.replace(/\r\n?/g, "\n")) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (REGULAR_SPACE_CODE_POINTS.has(codePoint)) {
      result += " ";
      continue;
    }
    if (
      (codePoint < 0x20 && codePoint !== 0x09 && codePoint !== 0x0a) ||
      (codePoint >= 0x7f && codePoint <= 0x9f) ||
      isInvisibleFormatCharacter(codePoint)
    ) {
      continue;
    }
    result += character;
  }
  return result;
}
