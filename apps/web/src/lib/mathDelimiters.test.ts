import assert from "node:assert/strict";
import test from "node:test";

import {
  DELIMITED_MATH_PATTERN,
  DISPLAY_MATH_BLOCK_PATTERN,
  MIXED_MATH_LINE_PATTERN,
  unescapeTextMathDelimiters,
} from "./mathDelimiters.ts";

function tokens(pattern: RegExp, source: string) {
  return Array.from(source.matchAll(new RegExp(pattern))).map((match) => match[0]);
}

test("inline math delimiters ignore escaped currency dollars", () => {
  const source = String.raw`Amy borrows \$8500 at a rate of $5.7\%$ p.a., compounding annually.`;

  assert.deepEqual(tokens(DELIMITED_MATH_PATTERN, source), [String.raw`$5.7\%$`]);
  assert.deepEqual(tokens(MIXED_MATH_LINE_PATTERN, source), [String.raw`$5.7\%$`]);
  assert.equal(unescapeTextMathDelimiters(String.raw`Amy borrows \$8500`), "Amy borrows $8500");
});

test("display math delimiters ignore escaped dollars before the block", () => {
  const source = String.raw`Cost is \$20 before $$x^2 + 1$$ is shown.`;

  assert.deepEqual(tokens(DISPLAY_MATH_BLOCK_PATTERN, source), [String.raw`$$x^2 + 1$$`]);
});
