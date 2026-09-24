/** Digit normalisation shared by the date and time input parsers. */

const DECIMAL_DIGIT_PATTERN = /\p{Nd}/u;

const DECIMAL_DIGIT_GLOBAL_PATTERN = /\p{Nd}/gu;

const isDecimalDigit = (code: number): boolean =>
  code >= 0 && DECIMAL_DIGIT_PATTERN.test(String.fromCodePoint(code));

export const toAsciiDigits = (text: string): string =>
  text.replaceAll(DECIMAL_DIGIT_GLOBAL_PATTERN, (digit) => {
    const code = digit.codePointAt(0) ?? 0;
    let zero = code;

    for (let step = 0; step < 9 && isDecimalDigit(zero - 1); step += 1) {
      zero -= 1;
    }

    return String(code - zero);
  });
