const CODEC_MAGIC = Buffer.from("AIB1", "ascii");

const enum ValueTag {
  Null = 0,
  False = 1,
  True = 2,
  UnsignedInteger = 3,
  SignedInteger = 4,
  Float64 = 5,
  String = 6,
  Array = 7,
  Object = 8,
  Undefined = 9,
}

const MAX_DECODE_DEPTH = 1_024;
const MAX_DECODE_VALUES = 50_000_000;
const MAX_STRING_COUNT = 5_000_000;
const MAX_COLLECTION_ENTRIES = 10_000_000;
const MAX_OBJECT_PROPERTIES = 100_000;

export function encodeBinaryCacheValue(value: unknown): Buffer {
  const strings: string[] = [];
  const stringIds = new Map<string, number>();
  collectStrings(value, strings, stringIds, new WeakSet());

  const writer = new BinaryWriter();
  writer.writeBytes(CODEC_MAGIC);
  writer.writeVarint(strings.length);
  for (const item of strings) {
    const bytes = Buffer.from(item, "utf8");
    writer.writeVarint(bytes.length);
    writer.writeBytes(bytes);
  }
  encodeValue(writer, value, stringIds, new WeakSet());
  return writer.finish();
}

export function decodeBinaryCacheValue(buffer: Buffer): unknown {
  const reader = new BinaryReader(buffer);
  if (!reader.readBytes(CODEC_MAGIC.length).equals(CODEC_MAGIC)) {
    throw new Error("Invalid binary cache payload magic");
  }
  const stringCount = reader.readVarint();
  if (stringCount > MAX_STRING_COUNT) throw new Error("Binary cache string table is too large");
  const strings: string[] = [];
  for (let index = 0; index < stringCount; index += 1) {
    const length = reader.readVarint();
    strings.push(reader.readBytes(length).toString("utf8"));
  }
  const state = { values: 0 };
  const value = decodeValue(reader, strings, state, 0);
  if (!reader.finished()) throw new Error("Binary cache payload has trailing data");
  return value;
}

function collectStrings(
  value: unknown,
  strings: string[],
  ids: Map<string, number>,
  ancestors: WeakSet<object>,
): void {
  if (typeof value === "string") {
    intern(value, strings, ids);
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (ancestors.has(value)) throw new Error("Binary cache value contains a cycle");
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, strings, ids, ancestors);
  } else {
    requirePlainObject(value);
    for (const [key, item] of Object.entries(value)) {
      intern(key, strings, ids);
      collectStrings(item, strings, ids, ancestors);
    }
  }
  ancestors.delete(value);
}

function intern(value: string, strings: string[], ids: Map<string, number>): number {
  const existing = ids.get(value);
  if (existing !== undefined) return existing;
  const id = strings.length;
  strings.push(value);
  ids.set(value, id);
  return id;
}

function encodeValue(
  writer: BinaryWriter,
  value: unknown,
  strings: ReadonlyMap<string, number>,
  ancestors: WeakSet<object>,
): void {
  if (value === null) {
    writer.writeByte(ValueTag.Null);
    return;
  }
  if (value === undefined) {
    writer.writeByte(ValueTag.Undefined);
    return;
  }
  if (value === false || value === true) {
    writer.writeByte(value ? ValueTag.True : ValueTag.False);
    return;
  }
  if (typeof value === "string") {
    writer.writeByte(ValueTag.String);
    writer.writeVarint(requiredStringId(value, strings));
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Binary cache cannot encode a non-finite number");
    if (Number.isSafeInteger(value)) {
      writer.writeByte(value >= 0 ? ValueTag.UnsignedInteger : ValueTag.SignedInteger);
      writer.writeVarint(value >= 0 ? value : -value - 1);
    } else {
      writer.writeByte(ValueTag.Float64);
      writer.writeFloat64(value);
    }
    return;
  }
  if (typeof value !== "object") throw new Error(`Binary cache cannot encode ${typeof value}`);
  if (ancestors.has(value)) throw new Error("Binary cache value contains a cycle");
  ancestors.add(value);
  if (Array.isArray(value)) {
    writer.writeByte(ValueTag.Array);
    writer.writeVarint(value.length);
    for (const item of value) encodeValue(writer, item, strings, ancestors);
  } else {
    requirePlainObject(value);
    const entries = Object.entries(value);
    writer.writeByte(ValueTag.Object);
    writer.writeVarint(entries.length);
    for (const [key, item] of entries) {
      writer.writeVarint(requiredStringId(key, strings));
      encodeValue(writer, item, strings, ancestors);
    }
  }
  ancestors.delete(value);
}

function requiredStringId(value: string, strings: ReadonlyMap<string, number>): number {
  const id = strings.get(value);
  if (id === undefined) throw new Error("Binary cache string was not interned");
  return id;
}

function decodeValue(
  reader: BinaryReader,
  strings: readonly string[],
  state: { values: number },
  depth: number,
): unknown {
  state.values += 1;
  if (state.values > MAX_DECODE_VALUES) throw new Error("Binary cache contains too many values");
  if (depth > MAX_DECODE_DEPTH) throw new Error("Binary cache nesting is too deep");
  const tag = reader.readByte();
  switch (tag) {
    case ValueTag.Null:
      return null;
    case ValueTag.False:
      return false;
    case ValueTag.True:
      return true;
    case ValueTag.Undefined:
      return undefined;
    case ValueTag.UnsignedInteger:
      return reader.readVarint();
    case ValueTag.SignedInteger:
      return -reader.readVarint() - 1;
    case ValueTag.Float64:
      return reader.readFloat64();
    case ValueTag.String:
      return readStringReference(reader, strings);
    case ValueTag.Array: {
      const length = reader.readVarint();
      if (length > MAX_COLLECTION_ENTRIES || length > reader.remaining()) {
        throw new Error("Binary cache array is too large");
      }
      const result: unknown[] = [];
      for (let index = 0; index < length; index += 1) {
        result.push(decodeValue(reader, strings, state, depth + 1));
      }
      return result;
    }
    case ValueTag.Object: {
      const length = reader.readVarint();
      if (length > MAX_OBJECT_PROPERTIES || length > reader.remaining()) {
        throw new Error("Binary cache object is too large");
      }
      const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      for (let index = 0; index < length; index += 1) {
        const key = readStringReference(reader, strings);
        if (Object.hasOwn(result, key)) throw new Error("Binary cache object contains a duplicate key");
        Object.defineProperty(result, key, {
          value: decodeValue(reader, strings, state, depth + 1),
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
      return result;
    }
    default:
      throw new Error(`Unknown binary cache value tag ${tag}`);
  }
}

function readStringReference(reader: BinaryReader, strings: readonly string[]): string {
  const id = reader.readVarint();
  const value = strings[id];
  if (value === undefined) throw new Error("Binary cache contains an invalid string reference");
  return value;
}

function requirePlainObject(value: object): void {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error("Binary cache supports only arrays and plain objects");
  }
}

class BinaryWriter {
  private buffer = Buffer.allocUnsafe(1_024 * 1_024);
  private offset = 0;

  writeByte(value: number): void {
    this.ensure(1);
    this.buffer[this.offset] = value;
    this.offset += 1;
  }

  writeVarint(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid binary cache varint");
    let remaining = value;
    do {
      const byte = remaining % 128;
      remaining = Math.floor(remaining / 128);
      this.writeByte(byte + (remaining === 0 ? 0 : 128));
    } while (remaining !== 0);
  }

  writeFloat64(value: number): void {
    this.ensure(8);
    this.buffer.writeDoubleLE(value, this.offset);
    this.offset += 8;
  }

  writeBytes(value: Uint8Array): void {
    this.ensure(value.length);
    this.buffer.set(value, this.offset);
    this.offset += value.length;
  }

  finish(): Buffer {
    return this.buffer.subarray(0, this.offset);
  }

  private ensure(length: number): void {
    const required = this.offset + length;
    if (required <= this.buffer.length) return;
    let capacity = this.buffer.length;
    while (capacity < required) capacity *= 2;
    const next = Buffer.allocUnsafe(capacity);
    this.buffer.copy(next, 0, 0, this.offset);
    this.buffer = next;
  }
}

class BinaryReader {
  private offset = 0;

  constructor(private readonly buffer: Buffer) {}

  readByte(): number {
    this.require(1);
    return this.buffer[this.offset++]!;
  }

  readVarint(): number {
    let result = 0;
    let multiplier = 1;
    for (let index = 0; index < 8; index += 1) {
      const byte = this.readByte();
      result += (byte & 0x7f) * multiplier;
      if (!Number.isSafeInteger(result)) throw new Error("Binary cache varint exceeds safe integer range");
      if ((byte & 0x80) === 0) return result;
      multiplier *= 128;
    }
    throw new Error("Binary cache varint is too long");
  }

  readFloat64(): number {
    this.require(8);
    const value = this.buffer.readDoubleLE(this.offset);
    this.offset += 8;
    if (!Number.isFinite(value)) throw new Error("Binary cache contains a non-finite number");
    return value;
  }

  readBytes(length: number): Buffer {
    if (!Number.isSafeInteger(length) || length < 0) throw new Error("Invalid binary cache byte length");
    this.require(length);
    const value = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  remaining(): number {
    return this.buffer.length - this.offset;
  }

  finished(): boolean {
    return this.offset === this.buffer.length;
  }

  private require(length: number): void {
    if (length > this.remaining()) throw new Error("Binary cache payload is truncated");
  }
}
