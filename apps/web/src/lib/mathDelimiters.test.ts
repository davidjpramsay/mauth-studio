import assert from "node:assert/strict";
import test from "node:test";

import {
  DELIMITED_MATH_PATTERN,
  DISPLAY_MATH_BLOCK_PATTERN,
  MIXED_MATH_LINE_PATTERN,
  unescapeTextMathDelimiters,
} from "./mathDelimiters.ts";
import { plainTextForSimpleInlineLatex } from "./latex.ts";

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

test("simple inline numeric latex can render as normal prose text", () => {
  assert.equal(plainTextForSimpleInlineLatex(String.raw`5.7\%`), "5.7%");
  assert.equal(plainTextForSimpleInlineLatex(String.raw`\textstyle 7\%`), "7%");
  assert.equal(plainTextForSimpleInlineLatex("15"), "15");
  assert.equal(plainTextForSimpleInlineLatex(String.raw`x=1`), null);
  assert.equal(plainTextForSimpleInlineLatex(String.raw`\frac{1}{2}`), null);
});
