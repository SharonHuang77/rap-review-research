import { test } from "node:test";
import assert from "node:assert/strict";

import { ResponseCleaner } from "../../src/validation/response-cleaner.ts";
import { JSONExtractor } from "../../src/validation/json-extractor.ts";
import { JSONExtractionError } from "../../src/validation/validation-errors.ts";

test("ResponseCleaner removes markdown fences and trims", () => {
  const { text, actions } = new ResponseCleaner().clean(
    '```json\n{"a":1}\n```',
  );
  assert.equal(text, '{"a":1}');
  assert.ok(actions.includes("removed markdown code fences"));
  assert.ok(actions.includes("trimmed surrounding whitespace"));
});

test("ResponseCleaner leaves clean JSON untouched (no actions)", () => {
  const { text, actions } = new ResponseCleaner().clean('{"a":1}');
  assert.equal(text, '{"a":1}');
  assert.deepEqual(actions, []);
});

test("JSONExtractor extracts the first object amid commentary", () => {
  const { json, actions } = new JSONExtractor().extract(
    'Here is the review.\n{"summary":"s","findings":[]}\nThanks.',
  );
  assert.equal(json, '{"summary":"s","findings":[]}');
  assert.ok(actions.includes("extracted JSON object from surrounding text"));
});

test("JSONExtractor is string- and escape-aware (braces inside strings)", () => {
  const { json } = new JSONExtractor().extract('{"s":"has } brace \\" here"}');
  assert.equal(json, '{"s":"has } brace \\" here"}');
});

test("JSONExtractor handles nested objects", () => {
  const { json, actions } = new JSONExtractor().extract('{"a":{"b":2}}');
  assert.equal(json, '{"a":{"b":2}}');
  assert.deepEqual(actions, []); // no surrounding text
});

test("JSONExtractor throws when no object is present", () => {
  assert.throws(() => new JSONExtractor().extract("no json here"), JSONExtractionError);
});
