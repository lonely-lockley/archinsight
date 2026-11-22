import assert from "node:assert/strict";
import {
  decodeBinaryCacheValue,
  encodeBinaryCacheValue,
} from "../build/cache-contract-entry.js";

const unusual = Object.create(null);
Object.defineProperty(unusual, "__proto__", { value: "data", enumerable: true });
unusual.empty = undefined;
const value = {
  nullValue: null,
  booleans: [false, true],
  integers: [0, 127, 128, -1, -129, Number.MAX_SAFE_INTEGER],
  float: 1.25,
  strings: ["repeated", "repeated", ""],
  unusual,
};
const encoded = encodeBinaryCacheValue(value);
const decoded = decodeBinaryCacheValue(encoded);
assert.deepEqual(normalize(decoded), normalize(value));
assert.equal(Object.getPrototypeOf(decoded.unusual), null);
assert.equal(decoded.unusual.__proto__, "data");

assert.throws(() => encodeBinaryCacheValue(Number.POSITIVE_INFINITY), /non-finite/);
assert.throws(() => encodeBinaryCacheValue(1n), /cannot encode bigint/);
assert.throws(() => encodeBinaryCacheValue(new Date()), /plain objects/);
const cyclic = {};
cyclic.self = cyclic;
assert.throws(() => encodeBinaryCacheValue(cyclic), /cycle/);

assert.throws(() => decodeBinaryCacheValue(Buffer.from("bad")), /truncated|magic/);
assert.throws(() => decodeBinaryCacheValue(Buffer.concat([encoded, Buffer.from([0])])), /trailing/);
const invalidTag = Buffer.from(encodeBinaryCacheValue(null));
invalidTag[invalidTag.length - 1] = 255;
assert.throws(() => decodeBinaryCacheValue(invalidTag), /Unknown binary cache value tag/);
for (const boundary of [0, 1, 3, 4, 5, Math.floor(encoded.length / 2), encoded.length - 1]) {
  assert.throws(() => decodeBinaryCacheValue(encoded.subarray(0, boundary)));
}

console.log("CLI binary cache codec contracts passed");

function normalize(input) {
  if (Array.isArray(input)) return input.map(normalize);
  if (input !== null && typeof input === "object") {
    return Object.fromEntries(Object.entries(input).map(([key, item]) => [key, normalize(item)]));
  }
  return input;
}
