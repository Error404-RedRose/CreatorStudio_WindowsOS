"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  ComponentDefinitionBuilder: () => ComponentDefinitionBuilder,
  METRES_TO_INCHES: () => METRES_TO_INCHES,
  PROGRESS_INTERVAL: () => PROGRESS_INTERVAL,
  SkpBuilder: () => SkpBuilder,
  SkpFile: () => SkpFile,
  SkpParseError: () => SkpParseError,
  SkpWriteError: () => SkpWriteError,
  buildInstancedScene: () => buildInstancedScene,
  buildModelFromParsed: () => buildModelFromParsed,
  buildScene: () => buildScene,
  buildSceneFromParsed: () => buildSceneFromParsed,
  classifyElement: () => classifyElement,
  computeFaceUv: () => computeFaceUv,
  create: () => create,
  emitLog: () => emitLog,
  emitProgress: () => emitProgress,
  exportDXF: () => exportDXF,
  exportIFC: () => exportIFC,
  exportOBJ: () => exportOBJ,
  exportPLY: () => exportPLY,
  exportSTL: () => exportSTL,
  extractThumbnail: () => extractThumbnail,
  faceUvBasis: () => faceUvBasis,
  fromFragments: () => fromFragments,
  generateIFCGUID: () => generateIFCGUID,
  isDrawableEdge: () => isDrawableEdge,
  openExisting: () => openExisting,
  parseSkp: () => parseSkp,
  resolveMaterialFromMaps: () => resolveMaterialFromMaps,
  sniffImageMime: () => sniffImageMime,
  toDXF: () => toDXF,
  toFragments: () => toFragments,
  toGLB: () => toGLB,
  toIFC: () => toIFC,
  toInstancedGLB: () => toInstancedGLB,
  toJSON: () => toJSON,
  toMTL: () => toMTL,
  toOBJ: () => toOBJ,
  toPLYAscii: () => toPLYAscii,
  toPLYBinary: () => toPLYBinary,
  toSTLAscii: () => toSTLAscii,
  toSTLBinary: () => toSTLBinary,
  toTypeScriptCode: () => toTypeScriptCode
});
module.exports = __toCommonJS(index_exports);

// src/vff.ts
var import_fflate = require("fflate");

// src/observability.ts
var PROGRESS_INTERVAL = 500;
function emitLog(options, level, message) {
  options?.onLog?.(level, message);
}
function emitProgress(options, stage, current, total) {
  options?.onProgress?.({ stage, current, total });
}

// src/vff.ts
var VFF_MAGIC = [255, 254, 255, 14];
var ZIP_LOCAL_HEADER = [80, 75, 3, 4];
function findSequence(data, sequence, startOffset = 0) {
  const seqLen = sequence.length;
  if (seqLen === 0) return -1;
  const limit = data.length - seqLen;
  for (let i = startOffset; i <= limit; i++) {
    let match = true;
    for (let j = 0; j < seqLen; j++) {
      if (data[i + j] !== sequence[j]) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
}
function decodeEntryName(entry) {
  if (!/[\u0080-\u00ff]/.test(entry)) return entry;
  const bytes = new Uint8Array(entry.length);
  for (let i = 0; i < entry.length; i++) {
    const code = entry.charCodeAt(i);
    if (code > 255) return entry;
    bytes[i] = code;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return entry;
  }
}
function validateHeader(data) {
  if (data.length < 4) return false;
  return data[0] === VFF_MAGIC[0] && data[1] === VFF_MAGIC[1] && data[2] === VFF_MAGIC[2] && data[3] === VFF_MAGIC[3];
}
function readVersion(data, options) {
  if (data.length < 16) return "unknown";
  const secondMarker = findSequence(data, [255, 254, 255], 4);
  if (secondMarker > 0) {
    const verStart = secondMarker + 4;
    const verBytes = data.subarray(verStart, Math.min(verStart + 200, data.length));
    try {
      const decoder = new TextDecoder("utf-16le");
      const verText = decoder.decode(verBytes);
      const braceStart = verText.indexOf("{");
      if (braceStart >= 0) {
        const braceEnd = verText.indexOf("}", braceStart);
        if (braceEnd > braceStart) {
          return verText.slice(braceStart, braceEnd + 1);
        }
      }
    } catch (e) {
      emitLog(options, "debug", `Failed to decode version string: ${e.message}`);
    }
  }
  return "unknown";
}
function findZipOffset(data) {
  const offset = findSequence(data, ZIP_LOCAL_HEADER);
  if (offset < 0) {
    throw new Error("No embedded ZIP archive found in the file");
  }
  return offset;
}
var META_WRAPPER_TAG = [100, 0];
var META_UNITS_TAG = [109, 0];
function readMetaUnits(metaBytes) {
  const view = new DataView(metaBytes.buffer, metaBytes.byteOffset, metaBytes.byteLength);
  let pos = 0;
  while (pos + 6 <= metaBytes.length) {
    const tag = [metaBytes[pos], metaBytes[pos + 1]];
    const size = view.getUint32(pos + 2, true);
    if (pos + 6 + size > metaBytes.length) break;
    if (tag[0] === META_WRAPPER_TAG[0] && tag[1] === META_WRAPPER_TAG[1]) {
      return readMetaUnits(metaBytes.subarray(pos + 6, pos + 6 + size));
    }
    if (tag[0] === META_UNITS_TAG[0] && tag[1] === META_UNITS_TAG[1]) {
      return new TextDecoder("utf-8").decode(metaBytes.subarray(pos + 6, pos + 6 + size));
    }
    pos += 6 + size;
  }
  return null;
}
var MAX_UNCOMPRESSED_ENTRY_BYTES = 16 * 1024 * 1024 * 1024;
var MAX_COMPRESSION_RATIO = 1e3;
var RATIO_CHECK_THRESHOLD_BYTES = 1024 * 1024;
function validateEntrySize(file) {
  const declared = file.originalSize;
  if (declared <= 0) return;
  if (declared > MAX_UNCOMPRESSED_ENTRY_BYTES) {
    throw new Error(
      `ZIP entry '${file.name}' declares ${declared} bytes uncompressed, exceeding the ${MAX_UNCOMPRESSED_ENTRY_BYTES}-byte safety ceiling`
    );
  }
  if (declared >= RATIO_CHECK_THRESHOLD_BYTES) {
    const compressed = file.size;
    if (compressed <= 0 || declared / compressed > MAX_COMPRESSION_RATIO) {
      throw new Error(
        `ZIP entry '${file.name}' declares an implausible compression ratio (${declared} bytes from ${compressed} bytes compressed) - likely a decompression bomb`
      );
    }
  }
}
function extractSkpContents(data, options) {
  if (!validateHeader(data)) {
    const zipInHeader = findSequence(data.subarray(0, Math.min(64, data.length)), ZIP_LOCAL_HEADER) >= 0;
    if (!zipInHeader) {
      throw new Error("Not a valid SketchUp (.skp) file");
    }
  }
  const version = readVersion(data, options);
  const zipOffset = findZipOffset(data);
  const zipBytes = data.subarray(zipOffset);
  const wanted = (file) => {
    const lower = file.name.toLowerCase();
    const isWanted = lower === "model.dat" || lower.endsWith("/model.dat") || lower === "meta/meta.dat" || lower.endsWith(".xml") || lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.includes("material");
    if (isWanted) validateEntrySize(file);
    return isWanted;
  };
  let unzipped;
  try {
    unzipped = (0, import_fflate.unzipSync)(zipBytes, { filter: wanted });
  } catch (e) {
    const wrapped = new Error("Failed to decompress ZIP archive: " + e.message);
    wrapped.cause = e;
    throw wrapped;
  }
  let modelData = null;
  let metaData = null;
  const materialFiles = {};
  for (const rawEntry of Object.keys(unzipped)) {
    const entry = decodeEntryName(rawEntry);
    const lower = entry.toLowerCase();
    if (lower === "model.dat" || lower.endsWith("/model.dat")) {
      modelData = unzipped[rawEntry];
    } else if (lower === "meta/meta.dat") {
      metaData = unzipped[rawEntry];
    } else if (lower.endsWith(".xml") || lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.includes("material")) {
      materialFiles[entry] = unzipped[rawEntry];
    }
  }
  if (!modelData) {
    throw new Error("ZIP archive found but does not contain a model.dat entry");
  }
  return {
    version,
    modelData,
    materialFiles,
    metaData
  };
}

// src/parser.ts
var CONTAINER_TAGS = /* @__PURE__ */ new Set([
  "F401",
  "F701",
  "D430",
  "D530",
  "C832",
  "7C15",
  "8813",
  "8913",
  "8A13",
  "8B13",
  "8C13",
  "8D13",
  "4C1D",
  "6419",
  "F901",
  "7017",
  "7117",
  "D007",
  "C409",
  "9411",
  "9511",
  "0F01",
  "384A",
  "B80B",
  "9713",
  "2C4C",
  "AC0D",
  "AE0D",
  "F601",
  "F801",
  "983A",
  "993A",
  "8C3C",
  "8D3C",
  // Image-entity placement: an Image placed in the model wraps a standard
  // 6419 instance node inside 9013 -> 401F. Without these two containers,
  // that inner instance stays buried in an opaque payload and the image
  // definition looks "never placed".
  "9013",
  "401F",
  // VFF per-definition guide lines/points and their entity/drawbase wrappers.
  "9113",
  "9213",
  "6942",
  "6C42",
  "6842"
]);
function readU32(data, offset) {
  if (offset + 4 > data.length) {
    throw new Error("Out of bounds readU32");
  }
  const view = new DataView(data.buffer, data.byteOffset + offset, 4);
  return view.getUint32(0, true);
}
function readF64(data, offset) {
  if (offset + 8 > data.length) {
    throw new Error("Out of bounds readF64");
  }
  const view = new DataView(data.buffer, data.byteOffset + offset, 8);
  return view.getFloat64(0, true);
}
function readI32(data, offset) {
  if (offset + 4 > data.length) {
    throw new Error("Out of bounds readI32");
  }
  const view = new DataView(data.buffer, data.byteOffset + offset, 4);
  return view.getInt32(0, true);
}
function parseVarInt(data, offset, length) {
  let val = 0;
  for (let i = 0; i < length; i++) {
    val += data[offset + i] * Math.pow(256, i);
  }
  return val;
}
function parseTlvRecursive(data, start, end, containerTags = CONTAINER_TAGS, depth = 0) {
  let pos = start;
  const elements = [];
  while (pos <= end - 6) {
    const tagBytes = data.subarray(pos, pos + 2);
    const size = readU32(data, pos + 2);
    if (pos + 6 + size > end) {
      break;
    }
    let tagHex = "";
    for (let i = 0; i < 2; i++) {
      const hex = tagBytes[i].toString(16).toUpperCase();
      tagHex += hex.length === 1 ? "0" + hex : hex;
    }
    let children = [];
    const isContainer = containerTags.has(tagHex);
    if (isContainer && size > 0) {
      children = parseTlvRecursive(
        data,
        pos + 6,
        pos + 6 + size,
        containerTags,
        depth + 1
      );
    }
    const payload = children.length > 0 ? new Uint8Array(0) : data.subarray(pos + 6, pos + 6 + size);
    elements.push({
      offset: pos,
      tag: tagHex,
      size,
      children,
      payload
    });
    pos += 6 + size;
  }
  return elements;
}
function flatHeaders(data, start, end) {
  const headers = [];
  let pos = start;
  while (pos <= end - 6) {
    const tagBytes = data.subarray(pos, pos + 2);
    const size = readU32(data, pos + 2);
    if (pos + 6 + size > end) break;
    let tagHex = "";
    for (let i = 0; i < 2; i++) {
      const hex = tagBytes[i].toString(16).toUpperCase();
      tagHex += hex.length === 1 ? "0" + hex : hex;
    }
    headers.push([tagHex, pos, size]);
    pos += 6 + size;
  }
  return headers;
}
var PASS_THROUGH_WRAPPERS = /* @__PURE__ */ new Set(["F901", "7017", "7117"]);
function expandWrappers(data, headers, containerTags) {
  const out = [];
  for (const header of headers) {
    const [tag, offset, size] = header;
    if (PASS_THROUGH_WRAPPERS.has(tag) && containerTags.has(tag)) {
      out.push(...expandWrappers(data, flatHeaders(data, offset + 6, offset + 6 + size), containerTags));
    } else {
      out.push(header);
    }
  }
  return out;
}
function* iterTopLevelLazy(data, start, end, containerTags = CONTAINER_TAGS) {
  let headers = flatHeaders(data, start, end);
  if (headers.length === 1 && headers[0][0] === "F401") {
    const [, f401Offset, f401Size] = headers[0];
    headers = flatHeaders(data, f401Offset + 6, f401Offset + 6 + f401Size);
  }
  headers = expandWrappers(data, headers, containerTags);
  const total = headers.length;
  let index = 0;
  for (const [, offset, size] of headers) {
    const recordEnd = offset + 6 + size;
    const nodes = parseTlvRecursive(data, offset, recordEnd, containerTags);
    if (nodes.length > 0) {
      yield { index, total, node: nodes[0] };
    }
    index++;
  }
}

// src/errors.ts
var SkpParseError = class _SkpParseError extends Error {
  constructor(message, context = {}) {
    const parts = [message];
    if (context.stage !== void 0) parts.push(`stage=${context.stage}`);
    if (context.recordIndex !== void 0 && context.totalRecords !== void 0) {
      parts.push(`record=${context.recordIndex}/${context.totalRecords}`);
    }
    if (context.tag !== void 0) parts.push(`tag=${context.tag}`);
    if (context.offset !== void 0) parts.push(`offset=0x${context.offset.toString(16).toUpperCase()}`);
    if (context.definitionId !== void 0) parts.push(`definitionId=${context.definitionId}`);
    super(parts.join(" | "));
    this.name = "SkpParseError";
    this.stage = context.stage;
    this.recordIndex = context.recordIndex;
    this.totalRecords = context.totalRecords;
    this.tag = context.tag;
    this.offset = context.offset;
    this.definitionId = context.definitionId;
    this.cause = context.cause;
    Object.setPrototypeOf(this, _SkpParseError.prototype);
  }
};

// src/edge-flags.ts
var EdgeFlagStore = class {
  constructor() {
    /** Flag byte per slot; index is `id - baseId`. */
    this.flags = new Uint8Array(0);
    /** One bit per slot recording whether that id was ever written. */
    this.present = new Uint8Array(0);
    /** Id that maps to slot 0. Set on first write. */
    this.baseId = 0;
    this.initialized = false;
    this.count = 0;
    /** Highest slot ever handed out; slots above it hold nothing. */
    this.highSlot = 0;
  }
  /** Number of ids actually stored. */
  get size() {
    return this.count;
  }
  slotFor(id) {
    return id - this.baseId;
  }
  /** Grow (and, for an id below `baseId`, shift) so `id` has a slot. */
  ensureSlot(id) {
    if (!this.initialized) {
      this.baseId = id;
      this.flags = new Uint8Array(64);
      this.present = new Uint8Array(8);
      this.initialized = true;
      return 0;
    }
    if (id < this.baseId) {
      const used = this.highSlot + 1;
      const gap = this.baseId - id;
      const headroom = Math.max(64, used);
      const shift = gap + headroom;
      const nextLength = shift + used;
      const nextFlags = new Uint8Array(nextLength);
      nextFlags.set(this.flags.subarray(0, used), shift);
      const nextPresent = new Uint8Array(Math.ceil(nextLength / 8));
      for (let slot2 = 0; slot2 < used; slot2++) {
        if ((this.present[slot2 >> 3] & 1 << (slot2 & 7)) !== 0) {
          const moved = slot2 + shift;
          nextPresent[moved >> 3] |= 1 << (moved & 7);
        }
      }
      this.flags = nextFlags;
      this.present = nextPresent;
      this.baseId -= shift;
      this.highSlot += shift;
      return headroom;
    }
    const slot = this.slotFor(id);
    if (slot >= this.flags.length) {
      const nextLength = Math.max(slot + 1, this.flags.length * 2);
      const nextFlags = new Uint8Array(nextLength);
      nextFlags.set(this.flags);
      this.flags = nextFlags;
      const nextPresent = new Uint8Array(Math.ceil(nextLength / 8));
      nextPresent.set(this.present);
      this.present = nextPresent;
    }
    if (slot > this.highSlot) this.highSlot = slot;
    return slot;
  }
  set(id, flags) {
    const slot = this.ensureSlot(id);
    if ((this.present[slot >> 3] & 1 << (slot & 7)) === 0) {
      this.present[slot >> 3] |= 1 << (slot & 7);
      this.count++;
    }
    this.flags[slot] = flags & 255;
  }
  /** The stored byte, or `undefined` when the id was never written -
   * matching `Map.prototype.get`, so callers' `?? 0` fallbacks behave
   * exactly as before. */
  get(id) {
    if (!this.initialized) return void 0;
    const slot = this.slotFor(id);
    if (slot < 0 || slot >= this.flags.length) return void 0;
    if ((this.present[slot >> 3] & 1 << (slot & 7)) === 0) return void 0;
    return this.flags[slot];
  }
  has(id) {
    return this.get(id) !== void 0;
  }
};

// src/vertex-store.ts
var INITIAL_CAPACITY = 256;
var BaseVertexStore = class {
  constructor() {
    this.coords = new Float64Array(INITIAL_CAPACITY * 3);
    /** Ids in insertion order; `idList[i]` owns slot `i`. */
    this.idList = new Uint32Array(INITIAL_CAPACITY);
    this.count = 0;
  }
  get size() {
    return this.count;
  }
  grow() {
    if (this.count < this.idList.length) return;
    const nextCapacity = this.idList.length * 2;
    const nextCoords = new Float64Array(nextCapacity * 3);
    nextCoords.set(this.coords);
    this.coords = nextCoords;
    const nextIds = new Uint32Array(nextCapacity);
    nextIds.set(this.idList);
    this.idList = nextIds;
  }
  set(id, xyz) {
    const existing = this.slotOf(id);
    const slot = existing >= 0 ? existing : this.count;
    if (existing < 0) {
      this.grow();
      this.idList[slot] = id;
      this.count++;
      this.remember(id, slot);
    }
    this.coords[slot * 3] = xyz[0];
    this.coords[slot * 3 + 1] = xyz[1];
    this.coords[slot * 3 + 2] = xyz[2];
  }
  get(id) {
    const slot = this.slotOf(id);
    if (slot < 0) return void 0;
    return [this.coords[slot * 3], this.coords[slot * 3 + 1], this.coords[slot * 3 + 2]];
  }
  has(id) {
    return this.slotOf(id) >= 0;
  }
  *entries() {
    for (let i = 0; i < this.count; i++) {
      yield [
        this.idList[i],
        [this.coords[i * 3], this.coords[i * 3 + 1], this.coords[i * 3 + 2]]
      ];
    }
  }
  *ids() {
    for (let i = 0; i < this.count; i++) yield this.idList[i];
  }
};
var MapVertexStore = class extends BaseVertexStore {
  constructor() {
    super(...arguments);
    this.index = /* @__PURE__ */ new Map();
  }
  slotOf(id) {
    const slot = this.index.get(id);
    return slot === void 0 ? -1 : slot;
  }
  remember(id, slot) {
    this.index.set(id, slot);
  }
};
var DefaultVertexStore = MapVertexStore;

// src/edge-store.ts
var INITIAL_CAPACITY2 = 256;
var NULL_END = 4294967295;
var SIDE_END = 4294967294;
function fits(v) {
  return Number.isInteger(v) && v >= 0 && v < SIDE_END;
}
function checkId(id) {
  if (!Number.isInteger(id) || id < 0 || id > 4294967295) {
    throw new RangeError(`edge id ${id} is not a u32`);
  }
}
var BaseEdgeStore = class {
  constructor() {
    /** `[v1, v2]` per slot, in insertion order. */
    this.ends = new Uint32Array(INITIAL_CAPACITY2 * 2);
    /** Ids in insertion order; `idList[i]` owns slot `i`. */
    this.idList = new Uint32Array(INITIAL_CAPACITY2);
    this.count = 0;
    /** Endpoints that are not a u32 vertex id or `null`, keyed by
     * `slot * 2 + end`. Empty on every real file measured. */
    this.side = null;
  }
  get size() {
    return this.count;
  }
  grow() {
    if (this.count < this.idList.length) return;
    const nextCapacity = this.idList.length * 2;
    const nextEnds = new Uint32Array(nextCapacity * 2);
    nextEnds.set(this.ends);
    this.ends = nextEnds;
    const nextIds = new Uint32Array(nextCapacity);
    nextIds.set(this.idList);
    this.idList = nextIds;
  }
  write(at, v) {
    if (v === null) {
      this.ends[at] = NULL_END;
    } else if (fits(v)) {
      this.ends[at] = v;
    } else {
      this.ends[at] = SIDE_END;
      (this.side ?? (this.side = /* @__PURE__ */ new Map())).set(at, v);
      return;
    }
    this.side?.delete(at);
  }
  read(at) {
    const v = this.ends[at];
    if (v === NULL_END) return null;
    if (v === SIDE_END) return this.side.get(at);
    return v;
  }
  set(id, ends) {
    checkId(id);
    const existing = this.slotOf(id);
    const slot = existing >= 0 ? existing : this.count;
    if (existing < 0) {
      this.grow();
      this.idList[slot] = id;
      this.count++;
      this.remember(id, slot);
    }
    this.write(slot * 2, ends[0]);
    this.write(slot * 2 + 1, ends[1]);
  }
  get(id) {
    const slot = this.slotOf(id);
    if (slot < 0) return void 0;
    return [this.read(slot * 2), this.read(slot * 2 + 1)];
  }
  has(id) {
    return this.slotOf(id) >= 0;
  }
  v1(id) {
    const slot = this.slotOf(id);
    return slot < 0 ? void 0 : this.read(slot * 2);
  }
  v2(id) {
    const slot = this.slotOf(id);
    return slot < 0 ? void 0 : this.read(slot * 2 + 1);
  }
  *entries() {
    for (let i = 0; i < this.count; i++) {
      yield [this.idList[i], [this.read(i * 2), this.read(i * 2 + 1)]];
    }
  }
};
var DENSE_MIN_SPAN = 1 << 16;
var DENSE_MAX_SPAN_PER_EDGE = 8;
var DenseEdgeStore = class extends BaseEdgeStore {
  constructor() {
    super(...arguments);
    this.dense = null;
    this.baseId = 0;
    /** Highest offset in use in `dense`. */
    this.high = -1;
    this.fallback = null;
  }
  slotOf(id) {
    if (this.fallback) {
      const slot = this.fallback.get(id);
      return slot === void 0 ? -1 : slot;
    }
    if (!this.dense) return -1;
    const at = id - this.baseId;
    return at >= 0 && at < this.dense.length ? this.dense[at] : -1;
  }
  tooSparse(span) {
    return span > DENSE_MIN_SPAN && span > (this.count + 1) * DENSE_MAX_SPAN_PER_EDGE;
  }
  toMap() {
    const m = /* @__PURE__ */ new Map();
    for (let slot = 0; slot < this.count - 1; slot++) m.set(this.idList[slot], slot);
    this.fallback = m;
    this.dense = null;
  }
  remember(id, slot) {
    if (this.fallback) {
      this.fallback.set(id, slot);
      return;
    }
    if (!this.dense) {
      this.dense = new Int32Array(INITIAL_CAPACITY2).fill(-1);
      this.baseId = id;
    }
    let at = id - this.baseId;
    if (at < 0) {
      const used = this.high + 1;
      const shift = -at + Math.max(INITIAL_CAPACITY2, used);
      if (this.tooSparse(shift + used)) {
        this.toMap();
        this.fallback.set(id, slot);
        return;
      }
      const next = new Int32Array(shift + used).fill(-1);
      next.set(this.dense.subarray(0, used), shift);
      this.dense = next;
      this.baseId -= shift;
      this.high += shift;
      at += shift;
    } else if (at >= this.dense.length) {
      if (this.tooSparse(at + 1)) {
        this.toMap();
        this.fallback.set(id, slot);
        return;
      }
      const next = new Int32Array(Math.max(at + 1, this.dense.length * 2)).fill(-1);
      next.set(this.dense);
      this.dense = next;
    }
    this.dense[at] = slot;
    if (at > this.high) this.high = at;
  }
};
var DefaultEdgeStore = DenseEdgeStore;

// src/geometry.ts
var GeometryBuilder = class {
  constructor() {
    /** id -> [x, y, z]. Backed by a flat Float64Array rather than a Map of
     * boxed arrays: see vertex-store.ts for the memory rationale. */
    this.vertices = new DefaultVertexStore();
    /** id -> [v1, v2]. Backed by flat typed arrays rather than a Map of
     * boxed pairs: see edge-store.ts for the memory rationale. */
    this.edges = new DefaultEdgeStore();
    /** Edge id -> display flag byte (D307). Backed by a Uint8Array rather
     * than a Map: the value is one byte, and a Map entry costs ~30. */
    this.edgeFlags = new EdgeFlagStore();
    /** Edge id -> the entity id of the Curve the edge belongs to (SketchUp's
     * `Edge#curve`). Absent means the edge belongs to no curve. */
    this.edgeCurves = /* @__PURE__ */ new Map();
    /** Curve id -> its analytic arc, for the curves that are arcs. */
    this.arcCurves = /* @__PURE__ */ new Map();
    this.faces = /* @__PURE__ */ new Map();
    // id -> face data
    this.instances = [];
    this.sectionPlanes = [];
    this.texts = [];
    this.dimensions = [];
    this.constructionLines = [];
    this.constructionPoints = [];
  }
};
function findChildTag(nodes, target) {
  for (const n of nodes) {
    if (n.tag === target) {
      return n;
    }
    const res = findChildTag(n.children, target);
    if (res) return res;
  }
  return null;
}
function findAllNodesRec(nodes, targetTag, results) {
  for (const n of nodes) {
    if (n.tag === targetTag) {
      results.push(n);
    }
    findAllNodesRec(n.children, targetTag, results);
  }
}
function extractEntityId(node) {
  for (const child of node.children) {
    if (child.tag === "DE05") {
      return parseVarInt(child.payload, 0, child.payload.length);
    }
    if (child.tag === "DC05") {
      const payload = child.payload;
      if (payload.length >= 6 && payload[0] === 222 && payload[1] === 5) {
        const de05Len = readU32(payload, 2);
        return parseVarInt(payload, 6, de05Len);
      } else {
        return parseVarInt(payload, 0, payload.length);
      }
    }
  }
  for (const child of node.children) {
    const res = extractEntityId(child);
    if (res !== null) return res;
  }
  return null;
}
function tlvFlat(payload) {
  let pos = 0;
  const out = [];
  while (pos <= payload.length - 6) {
    const tagBytes = payload.subarray(pos, pos + 2);
    let tagHex = "";
    for (let i = 0; i < 2; i++) {
      const h = tagBytes[i].toString(16).toUpperCase();
      tagHex += h.length === 1 ? "0" + h : h;
    }
    const size = readU32(payload, pos + 2);
    if (pos + 6 + size > payload.length) break;
    out.push([tagHex, payload.subarray(pos + 6, pos + 6 + size)]);
    pos += 6 + size;
  }
  return out;
}
function findFlat(seq, tag) {
  for (const [t, body] of seq) {
    if (t === tag) return body;
  }
  return null;
}
function extractUvTransforms(dc05Payload) {
  const dd05 = findFlat(tlvFlat(dc05Payload), "DD05");
  if (dd05 === null) return [null, null];
  const b136 = findFlat(tlvFlat(dd05), "B136");
  if (b136 === null) return [null, null];
  const b236 = findFlat(tlvFlat(b136), "B236");
  if (b236 === null) return [null, null];
  const t1027 = findFlat(tlvFlat(b236), "1027");
  if (t1027 === null) return [null, null];
  const sides = tlvFlat(t1027);
  const result = [];
  for (const sideTag of ["1127", "1227"]) {
    const side = findFlat(sides, sideTag);
    let mat = null;
    if (side !== null) {
      const t1327 = findFlat(tlvFlat(side), "1327");
      if (t1327 !== null) {
        const t1527 = findFlat(tlvFlat(t1327), "1527");
        if (t1527 !== null && t1527.length === 72) {
          mat = [];
          for (let i = 0; i < 9; i++) {
            mat.push(readF64(t1527, i * 8));
          }
        }
      }
    }
    result.push(mat);
  }
  return [result[0], result[1]];
}
function extractGeometryFromNodes(elements, builder, options) {
  for (const el of elements) {
    const tag = el.tag;
    if (tag === "C409") {
      const vId = extractEntityId(el);
      const c509 = findChildTag(el.children, "C509");
      if (vId !== null && c509 && c509.payload.length >= 24) {
        const x = readF64(c509.payload, 0);
        const y = readF64(c509.payload, 8);
        const z = readF64(c509.payload, 16);
        builder.vertices.set(vId, [x, y, z]);
      }
    } else if (tag === "B80B") {
      const eId = extractEntityId(el);
      if (eId !== null) {
        const v1Node = findChildTag(el.children, "B90B");
        const v2Node = findChildTag(el.children, "BA0B");
        const v1 = v1Node ? parseVarInt(v1Node.payload, 0, v1Node.payload.length) : null;
        const v2 = v2Node ? parseVarInt(v2Node.payload, 0, v2Node.payload.length) : null;
        builder.edges.set(eId, [v1, v2]);
        const d007 = el.children.find((c) => c.tag === "D007");
        if (d007) {
          const d307 = d007.children.find((c) => c.tag === "D307");
          if (d307 && d307.payload.length > 0) {
            builder.edgeFlags.set(eId, d307.payload[0]);
          }
        }
        const bb0b = findChildTag(el.children, "BB0B");
        if (bb0b && bb0b.payload.length > 0) {
          const curveId = parseVarInt(bb0b.payload, 0, bb0b.payload.length);
          if (curveId) builder.edgeCurves.set(eId, curveId);
        }
      }
    } else if (tag === "2C4C") {
      const curve = findChildTag(el.children, "384A");
      const arc = findChildTag(el.children, "2D4C");
      if (curve && arc && arc.payload.length === 128) {
        const curveId = extractEntityId(curve);
        if (curveId !== null) {
          const f = (i) => readF64(arc.payload, i * 8);
          builder.arcCurves.set(curveId, {
            center: [f(0), f(1), f(2)],
            normal: [f(3), f(4), f(5)],
            xAxis: [f(7), f(8), f(9)],
            yAxis: [f(10), f(11), f(12)],
            startAngle: f(14),
            endAngle: f(15)
          });
        }
      }
    } else if (tag === "AC0D") {
      const fId = extractEntityId(el);
      if (fId !== null) {
        let normal = [0, 0, 1];
        const ad0d = findChildTag(el.children, "AD0D");
        if (ad0d && ad0d.payload.length >= 24) {
          const nx = readF64(ad0d.payload, 0);
          const ny = readF64(ad0d.payload, 8);
          const nz = readF64(ad0d.payload, 16);
          normal = [nx, ny, nz];
        }
        const ae0d = findChildTag(el.children, "AE0D");
        const loops = [];
        if (ae0d) {
          const loopNodes = [];
          findAllNodesRec(ae0d.children, "9411", loopNodes);
          for (const ln of loopNodes) {
            const coEdges = [];
            const coNodes = [];
            findAllNodesRec(ln.children, "A00F", coNodes);
            for (const cn of coNodes) {
              const payload = cn.payload;
              let edgeId = null;
              let orient = null;
              let subPos = 0;
              while (subPos < payload.length - 6) {
                const subSize = readU32(payload, subPos + 2);
                if (subPos + 6 + subSize <= payload.length) {
                  const val = parseVarInt(payload, subPos + 6, subSize);
                  if (payload[subPos] === 161 && payload[subPos + 1] === 15) {
                    edgeId = val;
                  } else if (payload[subPos] === 162 && payload[subPos + 1] === 15) {
                    orient = val;
                  }
                }
                subPos += 6 + subSize;
              }
              if (edgeId !== null && orient !== null) {
                coEdges.push({ edgeId, orientation: orient === 0 ? 1 : -1 });
              }
            }
            if (coEdges.length > 0) {
              loops.push(coEdges);
            }
          }
        }
        let faceMatId = null;
        let uvFront = null;
        let uvBack = null;
        let faceHidden = false;
        const d007 = el.children.find((c) => c.tag === "D007");
        if (d007) {
          const d107 = d007.children.find((c) => c.tag === "D107");
          if (d107) {
            faceMatId = parseVarInt(d107.payload, 0, d107.payload.length);
          }
          const dc05 = d007.children.find((c) => c.tag === "DC05");
          if (dc05) {
            [uvFront, uvBack] = extractUvTransforms(dc05.payload);
          }
          const d307 = d007.children.find((c) => c.tag === "D307");
          if (d307 && d307.payload.length > 0) {
            faceHidden = (d307.payload[0] & 1) !== 0;
          }
        }
        let backMatId = null;
        const af0d = el.children.find((c) => c.tag === "AF0D");
        if (af0d && af0d.payload.length > 0) {
          backMatId = parseVarInt(af0d.payload, 0, af0d.payload.length);
        }
        builder.faces.set(fId, {
          loops,
          normal,
          materialId: faceMatId,
          backMaterialId: backMatId,
          uvTransform: uvFront,
          uvTransformBack: uvBack,
          hidden: faceHidden
        });
      }
    } else if (tag === "6419") {
      const nodesToSearch = el.children.length > 0 ? el.children : [el];
      let guid = null;
      let defIdx = null;
      let name = null;
      const matrix = [];
      const guidNode = findChildTag(nodesToSearch, "6819");
      if (guidNode && guidNode.payload.length === 16) {
        let hex = "";
        for (let i = 0; i < 16; i++) {
          const h = guidNode.payload[i].toString(16).toUpperCase();
          hex += h.length === 1 ? "0" + h : h;
        }
        guid = hex;
      }
      const defIdxNode = findChildTag(nodesToSearch, "6719");
      if (defIdxNode) {
        defIdx = parseVarInt(defIdxNode.payload, 0, defIdxNode.payload.length);
      }
      const nameNode = findChildTag(nodesToSearch, "6519");
      if (nameNode) {
        try {
          const decoder = new TextDecoder("utf-8");
          name = decoder.decode(nameNode.payload).replace(/\0/g, "").trim();
        } catch (e) {
          name = "";
          emitLog(options, "debug", `Failed to decode instance name: ${e.message}`);
        }
      }
      const matNode = findChildTag(nodesToSearch, "6619");
      if (matNode && matNode.payload.length >= 104) {
        for (let idx = 0; idx < 13; idx++) {
          matrix.push(readF64(matNode.payload, idx * 8));
        }
      }
      let instMatId = null;
      let instLayerId = null;
      let instHidden = false;
      const d007 = el.children.find((c) => c.tag === "D007");
      if (d007) {
        const d107 = d007.children.find((c) => c.tag === "D107");
        if (d107) {
          instMatId = parseVarInt(d107.payload, 0, d107.payload.length);
        }
        const d207 = d007.children.find((c) => c.tag === "D207");
        if (d207 && d207.payload.length > 0) {
          const p = d207.payload;
          instLayerId = p.length === 1 ? p[0] : parseVarInt(p, 0, p.length);
        }
        const d307 = d007.children.find((c) => c.tag === "D307");
        if (d307 && d307.payload.length > 0) {
          instHidden = (d307.payload[0] & 1) !== 0;
        }
      }
      builder.instances.push({
        offset: el.offset,
        refGuid: guid || "",
        refIdx: defIdx !== null ? defIdx : -1,
        name: name || "",
        matrix,
        materialId: instMatId,
        layerId: instLayerId,
        hidden: instHidden,
        children: el.children
      });
    } else if (tag === "6942") {
      const body = findChildTag(el.children, "6A42");
      if (body && body.payload.length >= 64) {
        const p = body.payload;
        const point = [readF64(p, 0), readF64(p, 8), readF64(p, 16)];
        const direction = [readF64(p, 24), readF64(p, 32), readF64(p, 40)];
        const endpoint = (distance) => Math.abs(distance) < 1e20 ? [
          point[0] + direction[0] * distance,
          point[1] + direction[1] * distance,
          point[2] + direction[2] * distance
        ] : null;
        builder.constructionLines.push({
          point,
          direction,
          start: endpoint(readF64(p, 48)),
          end: endpoint(readF64(p, 56))
        });
      }
    } else if (tag === "6C42") {
      const pos = findChildTag(el.children, "6D42");
      if (pos && pos.payload.length >= 24) {
        builder.constructionPoints.push({
          position: [readF64(pos.payload, 0), readF64(pos.payload, 8), readF64(pos.payload, 16)]
        });
      }
    } else if (el.children && el.children.length > 0) {
      extractGeometryFromNodes(el.children, builder, options);
    }
  }
}
function collectLayers(nodes, layerIdToName = /* @__PURE__ */ new Map(), options, layerHidden) {
  for (const el of nodes) {
    if (el.tag === "993A") {
      for (const child of el.children) {
        if (child.tag === "8C3C") {
          const dc05 = findChildTag(child.children, "DC05");
          const nameNode = findChildTag(child.children, "8D3C");
          if (dc05 && nameNode) {
            const payload = dc05.payload;
            let lId;
            if (payload.length >= 6 && payload[0] === 222 && payload[1] === 5) {
              const de05Len = readU32(payload, 2);
              lId = parseVarInt(payload, 6, de05Len);
            } else {
              lId = parseVarInt(payload, 0, payload.length);
            }
            let lName = "";
            try {
              const decoder = new TextDecoder("utf-8");
              lName = decoder.decode(nameNode.payload).replace(/\0/g, "").trim();
            } catch (e) {
              emitLog(options, "debug", `Failed to decode layer name for id ${lId}: ${e.message}`);
            }
            layerIdToName.set(lId, lName);
            if (layerHidden) {
              const hiddenNode = findChildTag(child.children, "8E3C");
              if (hiddenNode && hiddenNode.payload.length > 0) {
                layerHidden.set(lName, hiddenNode.payload[0] === 1);
              }
            }
          }
        }
      }
    }
    if (el.children && el.children.length > 0) {
      collectLayers(el.children, layerIdToName, options, layerHidden);
    }
  }
  return layerIdToName;
}
function collectDefs(nodes, defsDict = /* @__PURE__ */ new Map(), options) {
  for (const el of nodes) {
    if (el.tag === "7C15") {
      let guid = null;
      let name = null;
      let isImage = false;
      let isGroup = false;
      let facesCamera = false;
      let shadowsFaceSun = false;
      for (const child of el.children) {
        if (child.tag === "7D15" && child.payload.length === 16) {
          let hex = "";
          for (let i = 0; i < 16; i++) {
            const h = child.payload[i].toString(16).toUpperCase();
            hex += h.length === 1 ? "0" + h : h;
          }
          guid = hex;
        } else if (child.tag === "7E15") {
          try {
            const decoder = new TextDecoder("utf-8");
            name = decoder.decode(child.payload).replace(/\0/g, "").trim();
          } catch (e) {
            name = "";
            emitLog(options, "debug", `Failed to decode definition name: ${e.message}`);
          }
        } else if (child.tag === "8315" && child.payload.length > 0) {
          const kind = parseVarInt(child.payload, 0, child.payload.length);
          isImage = kind === 2;
          isGroup = kind === 1;
        } else if (child.tag === "581B") {
          let pos = 0;
          const pl = child.payload;
          while (pos <= pl.length - 6) {
            const subSize = readU32(pl, pos + 2);
            if (pos + 6 + subSize > pl.length) break;
            if (pl[pos] === 93 && pl[pos + 1] === 27 && subSize >= 1) {
              facesCamera = parseVarInt(pl, pos + 6, subSize) === 1;
            } else if (pl[pos] === 94 && pl[pos + 1] === 27 && subSize >= 1) {
              shadowsFaceSun = parseVarInt(pl, pos + 6, subSize) === 1;
            }
            pos += 6 + subSize;
          }
        }
      }
      const entId = extractEntityId(el);
      if (entId !== null) {
        const builder = new GeometryBuilder();
        extractGeometryFromNodes(el.children, builder, options);
        defsDict.set(entId, {
          guid: guid || "",
          name: name || "",
          isImage,
          isGroup,
          alwaysFacesCamera: facesCamera,
          shadowsFaceSun,
          builder
        });
      }
    }
    if (el.children && el.children.length > 0) {
      collectDefs(el.children, defsDict, options);
    }
  }
  return defsDict;
}
function extractDynamicProperties(d007, options) {
  const dc05 = d007.children.find((c) => c.tag === "DC05");
  if (!dc05) {
    return {};
  }
  const propContainerTags = /* @__PURE__ */ new Set([
    "DD05",
    "B536",
    "B136",
    "B236",
    "B336",
    "B036",
    "A438"
  ]);
  const propElements = parseTlvRecursive(
    dc05.payload,
    0,
    dc05.payload.length,
    propContainerTags
  );
  const properties = {};
  let currentKey = null;
  function extractProps(nodes) {
    for (const n of nodes) {
      const tag = n.tag;
      if (tag === "B636") {
        try {
          const decoder = new TextDecoder("utf-8");
          currentKey = decoder.decode(n.payload).replace(/\0/g, "").trim();
        } catch (e) {
          currentKey = null;
          emitLog(options, "debug", `Failed to decode dynamic property key: ${e.message}`);
        }
      } else if (tag === "AD38" && currentKey) {
        try {
          const decoder = new TextDecoder("utf-8");
          const val = decoder.decode(n.payload).replace(/\0/g, "").trim();
          properties[currentKey] = val;
        } catch (e) {
          emitLog(
            options,
            "debug",
            `Failed to decode dynamic property value for key ${currentKey}: ${e.message}`
          );
        }
        currentKey = null;
      }
      if (n.children && n.children.length > 0) {
        extractProps(n.children);
      }
    }
  }
  extractProps(propElements);
  return properties;
}
var VFF_ATTR_DOUBLE_TAGS = /* @__PURE__ */ new Set(["AF38", "A938"]);
function decodeVffAttrValue(a438Node) {
  if (!a438Node.children || a438Node.children.length === 0) return null;
  const child = a438Node.children[0];
  const tag = child.tag;
  const payload = child.payload;
  if (tag === "AD38") {
    try {
      return new TextDecoder("utf-8").decode(payload).replace(/\0/g, "").trim();
    } catch {
      return null;
    }
  }
  if (VFF_ATTR_DOUBLE_TAGS.has(tag) && payload.length === 8) return readF64(payload, 0);
  if (tag === "A738" && payload.length === 4) return readI32(payload, 0);
  if ((tag === "B438" || tag === "B538") && payload.length === 24) {
    return [readF64(payload, 0), readF64(payload, 8), readF64(payload, 16)];
  }
  if (tag === "AE38") {
    return (child.children ?? []).map(decodeVffAttrValue);
  }
  return null;
}
function stringifyVffAttrValue(value) {
  if (value === null || value === void 0) return "";
  if (Array.isArray(value)) {
    return value.map((v) => stringifyVffAttrValue(v)).join(",");
  }
  return String(value);
}
function extractAttributeDictionaries(d007, options) {
  const dictionaries = {};
  const dc05 = d007.children.find((c) => c.tag === "DC05");
  if (!dc05) {
    return dictionaries;
  }
  const propContainerTags = /* @__PURE__ */ new Set([
    "DD05",
    "B536",
    "B136",
    "B236",
    "B336",
    "B036",
    "A438",
    "AE38"
  ]);
  const propElements = parseTlvRecursive(dc05.payload, 0, dc05.payload.length, propContainerTags);
  let currentKey = null;
  function extractEntries(nodes, entries) {
    for (const n of nodes) {
      const tag = n.tag;
      if (tag === "B636") {
        try {
          const decoder = new TextDecoder("utf-8");
          currentKey = decoder.decode(n.payload).replace(/\0/g, "").trim();
        } catch (e) {
          currentKey = null;
          emitLog(options, "debug", `Failed to decode attribute dictionary key: ${e.message}`);
        }
      } else if (tag === "A438" && currentKey) {
        entries[currentKey] = decodeVffAttrValue(n);
        currentKey = null;
      } else if (n.children && n.children.length > 0) {
        extractEntries(n.children, entries);
      }
    }
  }
  function walk2(nodes) {
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].tag === "B436") {
        let name = "";
        try {
          const decoder = new TextDecoder("utf-8");
          name = decoder.decode(nodes[i].payload).replace(/\0/g, "").trim();
        } catch (e) {
          emitLog(options, "debug", `Failed to decode attribute dictionary name: ${e.message}`);
        }
        const entries = {};
        currentKey = null;
        if (i + 1 < nodes.length && nodes[i + 1].children) {
          extractEntries(nodes[i + 1].children, entries);
        }
        dictionaries[name] = entries;
      } else if (nodes[i].children && nodes[i].children.length > 0) {
        walk2(nodes[i].children);
      }
    }
  }
  walk2(propElements);
  return dictionaries;
}
var GENERIC_DEFINITION_NAME_PATTERN = /^(?:Group|Component)\d*#\d+$/;
function isGenericDefinitionName(name) {
  return GENERIC_DEFINITION_NAME_PATTERN.test(name);
}
var NAME_OVERRIDE_KEYS = ["name", "label", "code"];
function findNameOverride(attributeDicts) {
  if (!attributeDicts) return null;
  for (const dictName of Object.keys(attributeDicts)) {
    if (dictName === "dynamic_attributes" || dictName === "SU_InstanceSet") continue;
    const entries = attributeDicts[dictName];
    for (const key of NAME_OVERRIDE_KEYS) {
      if (!(key in entries)) continue;
      const val = stringifyVffAttrValue(entries[key]);
      if (val) return val;
    }
  }
  return null;
}
function reconstructLoopVertices(loop, edges) {
  const loopVerts = [];
  const pushStart = (vStart) => {
    if (vStart !== null) {
      if (loopVerts.length === 0 || loopVerts[loopVerts.length - 1] !== vStart) {
        loopVerts.push(vStart);
      }
    }
  };
  if (edges instanceof Map) {
    for (const { edgeId, orientation } of loop) {
      const edge = edges.get(edgeId);
      if (edge) pushStart(orientation === 1 ? edge[0] : edge[1]);
    }
  } else {
    for (const { edgeId, orientation } of loop) {
      const vStart = orientation === 1 ? edges.v1(edgeId) : edges.v2(edgeId);
      if (vStart !== void 0) pushStart(vStart);
    }
  }
  if (loopVerts.length > 1 && loopVerts[0] === loopVerts[loopVerts.length - 1]) {
    loopVerts.pop();
  }
  return loopVerts;
}
function decodeXmlEntities(value) {
  return value.replace(/&(lt|gt|amp|apos|quot|#\d+|#x[0-9a-fA-F]+);/g, (whole, entity) => {
    switch (entity) {
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "amp":
        return "&";
      case "apos":
        return "'";
      case "quot":
        return '"';
      default:
        if (entity[0] === "#") {
          const codePoint = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
          return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : whole;
        }
        return whole;
    }
  });
}
function parseMaterialXml(xmlText) {
  const match = xmlText.match(/<(?:[a-zA-Z0-9_]+:)?material\b([^>]*)\/?>/);
  if (!match) return null;
  const attrsString = match[1];
  const getAttr = (name2) => {
    const attrRegex = new RegExp(`\\b${name2}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`);
    const m = attrsString.match(attrRegex);
    const raw = m ? m[1] !== void 0 ? m[1] : m[2] : null;
    return raw === null ? null : decodeXmlEntities(raw);
  };
  const name = getAttr("name") || "unknown";
  const colorRed = parseInt(getAttr("colorRed") || "128", 10);
  const colorGreen = parseInt(getAttr("colorGreen") || "128", 10);
  const colorBlue = parseInt(getAttr("colorBlue") || "128", 10);
  let trans;
  if (getAttr("useTrans") === "1") {
    const rawTrans = parseFloat(getAttr("trans") || "0");
    trans = Math.min(Math.max(1 - rawTrans, 0), 1);
  } else {
    trans = 1;
  }
  const colorized = getAttr("type") === "2";
  const colorizeTypeRaw = parseInt(getAttr("colorizeType") || "0", 10);
  const colorizeType = Number.isNaN(colorizeTypeRaw) ? 0 : colorizeTypeRaw;
  const textureMatch = xmlText.match(/<(?:[a-zA-Z0-9_]+:)?texture\b([^>]*)\/?>/);
  let hasTexture = false;
  let textureFilename = "";
  let xScale = 0;
  let yScale = 0;
  if (textureMatch) {
    hasTexture = true;
    const texAttrs = textureMatch[1];
    const getTexAttr = (n) => {
      const r = new RegExp(`\\b${n}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`);
      const m = texAttrs.match(r);
      const raw = m ? m[1] !== void 0 ? m[1] : m[2] : null;
      return raw === null ? null : decodeXmlEntities(raw);
    };
    textureFilename = getTexAttr("textureFilename") || "";
    const xs = parseFloat(getTexAttr("xScale") || "0");
    xScale = Number.isNaN(xs) ? 0 : xs;
    const ys = parseFloat(getTexAttr("yScale") || "0");
    yScale = Number.isNaN(ys) ? 0 : ys;
  }
  const imageMatch = xmlText.match(
    /<(?:[a-zA-Z0-9_]+:)?image\b[^>]*\bpath\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*\/?>/
  );
  const imagePath = imageMatch ? decodeXmlEntities(imageMatch[1] !== void 0 ? imageMatch[1] : imageMatch[2]) : "";
  return {
    name,
    r: colorRed,
    g: colorGreen,
    b: colorBlue,
    trans,
    colorized,
    colorizeType,
    hasTexture,
    textureFilename,
    xScale,
    yScale,
    imagePath
  };
}
function parseStyleXml(xmlText) {
  const styleMatch = xmlText.match(/<(?:[a-zA-Z0-9_]+:)?style\b([^>]*)>/);
  if (!styleMatch) return null;
  const attrsString = styleMatch[1];
  const nameMatch = attrsString.match(/\bname\s*=\s*(?:"([^"]*)"|'([^']*)')/);
  const name = nameMatch ? nameMatch[1] !== void 0 ? nameMatch[1] : nameMatch[2] : "";
  const colors = {};
  const itemRegex = /<(?:[a-zA-Z0-9_]+:)?item\s+id\s*=\s*(?:"(\d+)"|'(\d+)')[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?item>/g;
  let m;
  while ((m = itemRegex.exec(xmlText)) !== null) {
    const id = m[1] !== void 0 ? m[1] : m[2];
    if (id !== "2002" && id !== "2003") continue;
    const inner = m[3];
    const variantMatch = inner.match(/<(?:[a-zA-Z0-9_]+:)?variant\b[^>]*>(-?\d+)<\/(?:[a-zA-Z0-9_]+:)?variant>/);
    if (!variantMatch) continue;
    const raw = parseInt(variantMatch[1], 10);
    if (Number.isNaN(raw)) continue;
    const v = raw >>> 0;
    colors[id] = [v & 255, v >> 8 & 255, v >> 16 & 255];
  }
  return {
    name,
    frontColor: colors["2002"] ?? null,
    backColor: colors["2003"] ?? null
  };
}
function lstripChars(s, chars) {
  let i = 0;
  while (i < s.length && chars.includes(s[i])) i++;
  return s.slice(i);
}
function resolveTextureBytes(materialFiles, xmlName, filename, imagePath) {
  const names = Object.keys(materialFiles);
  const slashIdx = xmlName.lastIndexOf("/");
  const folder = slashIdx >= 0 ? xmlName.slice(0, slashIdx) : "";
  let data = null;
  let resolvedFilename = filename;
  const candidate = filename ? `${folder}/${filename}` : null;
  if (candidate && names.includes(candidate)) {
    data = materialFiles[candidate];
  } else {
    for (const entry of names) {
      if (entry.startsWith(folder + "/") && entry !== xmlName && !entry.toLowerCase().endsWith(".xml")) {
        data = materialFiles[entry];
        if (!resolvedFilename) {
          resolvedFilename = entry.split("/").pop() || "";
        }
        break;
      }
    }
  }
  if (data === null) {
    const imgPath = lstripChars(imagePath, "./");
    const candidates = [imgPath, folder ? `${folder}/${imgPath}` : imgPath];
    for (const cand of candidates) {
      if (cand && names.includes(cand)) {
        data = materialFiles[cand];
        if (!resolvedFilename) {
          resolvedFilename = cand.split("/").pop() || "";
        }
        break;
      }
    }
  }
  return { data, filename: resolvedFilename };
}

// src/transforms.ts
function foldScale(m) {
  if (m.length < 13 || m.length >= 16 || m[12] === 1) return m;
  const s = m[12];
  const out = m.slice(0, 12).map((v) => v * s);
  out.push(1);
  return out;
}
function transformPoint(matrix, point) {
  if (!matrix || matrix.length < 12) {
    return point;
  }
  const [x, y, z] = point;
  if (matrix.length === 16) {
    const tx = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
    const ty = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
    const tz = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
    return [tx, ty, tz];
  } else {
    const m = foldScale(matrix);
    const tx = m[0] * x + m[1] * y + m[2] * z + m[9];
    const ty = m[3] * x + m[4] * y + m[5] * z + m[10];
    const tz = m[6] * x + m[7] * y + m[8] * z + m[11];
    return [tx, ty, tz];
  }
}
function multiplyMatrices(a, b) {
  if (!a || a.length === 0) return b && b.length === 13 ? foldScale(b) : b;
  if (!b || b.length === 0) return a.length === 13 ? foldScale(a) : a;
  if (a.length === 16 && b.length === 16) {
    const result = new Array(16).fill(0);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        let s = 0;
        for (let k = 0; k < 4; k++) {
          s += a[k * 4 + row] * b[col * 4 + k];
        }
        result[col * 4 + row] = s;
      }
    }
    return result;
  } else {
    const aRaw = a.length < 13 ? [...a, ...new Array(13 - a.length).fill(0)] : a;
    const bRaw = b.length < 13 ? [...b, ...new Array(13 - b.length).fill(0)] : b;
    if (a.length < 13 && aRaw[12] === 0) aRaw[12] = 1;
    if (b.length < 13 && bRaw[12] === 0) bRaw[12] = 1;
    const aPad = foldScale(aRaw);
    const bPad = foldScale(bRaw);
    const p_r0 = [aPad[0], aPad[1], aPad[2], aPad[9]];
    const p_r1 = [aPad[3], aPad[4], aPad[5], aPad[10]];
    const p_r2 = [aPad[6], aPad[7], aPad[8], aPad[11]];
    const c_c0 = [bPad[0], bPad[3], bPad[6], 0];
    const c_c1 = [bPad[1], bPad[4], bPad[7], 0];
    const c_c2 = [bPad[2], bPad[5], bPad[8], 0];
    const c_c3 = [bPad[9], bPad[10], bPad[11], 1];
    const dot = (row, col) => {
      return row[0] * col[0] + row[1] * col[1] + row[2] * col[2] + row[3] * col[3];
    };
    const out = new Array(13).fill(0);
    out[0] = dot(p_r0, c_c0);
    out[1] = dot(p_r0, c_c1);
    out[2] = dot(p_r0, c_c2);
    out[3] = dot(p_r1, c_c0);
    out[4] = dot(p_r1, c_c1);
    out[5] = dot(p_r1, c_c2);
    out[6] = dot(p_r2, c_c0);
    out[7] = dot(p_r2, c_c1);
    out[8] = dot(p_r2, c_c2);
    out[9] = dot(p_r0, c_c3);
    out[10] = dot(p_r1, c_c3);
    out[11] = dot(p_r2, c_c3);
    out[12] = 1;
    return out;
  }
}

// src/triangulator.ts
var import_earcut = __toESM(require("earcut"));
function triangulateFace3D(vertices3D, loops, normal) {
  if (loops.length === 0) return [];
  if (loops.length === 1 && loops[0].length === 3) {
    return [loops[0]];
  }
  if (loops.length === 1 && loops[0].length === 4) {
    const v = loops[0];
    return [
      [v[0], v[1], v[2]],
      [v[0], v[2], v[3]]
    ];
  }
  let nx = normal[0];
  let ny = normal[1];
  let nz = normal[2];
  const normVal = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (normVal > 1e-6) {
    nx /= normVal;
    ny /= normVal;
    nz /= normVal;
  } else {
    nx = 0;
    ny = 0;
    nz = 1;
  }
  let u_axis;
  if (Math.abs(nx) < 0.9) {
    u_axis = [1, 0, 0];
  } else {
    u_axis = [0, 1, 0];
  }
  let ux = ny * u_axis[2] - nz * u_axis[1];
  let uy = nz * u_axis[0] - nx * u_axis[2];
  let uz = nx * u_axis[1] - ny * u_axis[0];
  const uLen = Math.sqrt(ux * ux + uy * uy + uz * uz);
  if (uLen < 1e-12) {
    ux = 1;
    uy = 0;
    uz = 0;
  } else {
    ux /= uLen;
    uy /= uLen;
    uz /= uLen;
  }
  let vx = ny * uz - nz * uy;
  let vy = nz * ux - nx * uz;
  let vz = nx * uy - ny * ux;
  const vLen = Math.sqrt(vx * vx + vy * vy + vz * vz);
  if (vLen > 1e-12) {
    vx /= vLen;
    vy /= vLen;
    vz /= vLen;
  }
  const getVertex = (id) => {
    let pt;
    if (typeof vertices3D.get === "function") {
      pt = vertices3D.get(id);
    } else {
      pt = vertices3D[id];
    }
    if (!pt) return null;
    if (Array.isArray(pt)) {
      return { x: pt[0], y: pt[1], z: pt[2] };
    }
    return pt;
  };
  const loops2d = [];
  for (const loop of loops) {
    const pts = [];
    for (const vId of loop) {
      const pt = getVertex(vId);
      if (!pt) {
        return [];
      }
      pts.push({ u: pt.x * ux + pt.y * uy + pt.z * uz, v: pt.x * vx + pt.y * vy + pt.z * vz });
    }
    loops2d.push(pts);
  }
  if (loops.length > 2 && holesOverlap(loops2d)) {
    return triangulateByFilteringHoles(loops, loops2d);
  }
  const allVIds = [];
  const holeIndices = [];
  let currentOffset = 0;
  for (let l = 0; l < loops.length; l++) {
    if (l > 0) {
      holeIndices.push(currentOffset);
    }
    const loop = loops[l];
    for (const vId of loop) {
      allVIds.push(vId);
    }
    currentOffset += loop.length;
  }
  const flatCoords = [];
  for (const pts of loops2d) {
    for (const { u, v } of pts) {
      flatCoords.push(u, v);
    }
  }
  let triIndices;
  try {
    triIndices = (0, import_earcut.default)(flatCoords, holeIndices, 2);
  } catch {
    const outerLoop = loops[0];
    const fallback = [];
    for (let i = 1; i < outerLoop.length - 1; i++) {
      fallback.push([outerLoop[0], outerLoop[i], outerLoop[i + 1]]);
    }
    return fallback;
  }
  const result = [];
  for (let i = 0; i < triIndices.length; i += 3) {
    const idx0 = triIndices[i];
    const idx1 = triIndices[i + 1];
    const idx2 = triIndices[i + 2];
    result.push([
      allVIds[idx0],
      allVIds[idx1],
      allVIds[idx2]
    ]);
  }
  return result;
}
function holesOverlap(loops2d) {
  for (let i = 1; i < loops2d.length; i++) {
    for (let j = i + 1; j < loops2d.length; j++) {
      if (anyVertexInside(loops2d[i], loops2d[j]) || anyVertexInside(loops2d[j], loops2d[i])) {
        return true;
      }
    }
  }
  return false;
}
function anyVertexInside(points, polygon) {
  for (const p of points) {
    if (pointInPolygon(p.u, p.v, polygon)) return true;
  }
  return false;
}
function pointInPolygon(u, v, polygon) {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const ui = polygon[i].u, vi = polygon[i].v;
    const uj = polygon[j].u, vj = polygon[j].v;
    const intersects = vi > v !== vj > v && u < (uj - ui) * (v - vi) / (vj - vi) + ui;
    if (intersects) inside = !inside;
  }
  return inside;
}
function triangulateByFilteringHoles(loops, loops2d) {
  const outerLoop = loops[0];
  const outer2d = loops2d[0];
  const flatOuter = [];
  for (const { u, v } of outer2d) {
    flatOuter.push(u, v);
  }
  let triIndices;
  try {
    triIndices = (0, import_earcut.default)(flatOuter, [], 2);
  } catch {
    const fallback = [];
    for (let i = 1; i < outerLoop.length - 1; i++) {
      fallback.push([outerLoop[0], outerLoop[i], outerLoop[i + 1]]);
    }
    return fallback;
  }
  const result = [];
  for (let i = 0; i < triIndices.length; i += 3) {
    const ia = triIndices[i], ib = triIndices[i + 1], ic = triIndices[i + 2];
    const cu = (outer2d[ia].u + outer2d[ib].u + outer2d[ic].u) / 3;
    const cv = (outer2d[ia].v + outer2d[ib].v + outer2d[ic].v) / 3;
    let insideAnyHole = false;
    for (let h = 1; h < loops2d.length; h++) {
      if (pointInPolygon(cu, cv, loops2d[h])) {
        insideAnyHole = true;
        break;
      }
    }
    if (insideAnyHole) continue;
    result.push([outerLoop[ia], outerLoop[ib], outerLoop[ic]]);
  }
  return result;
}

// src/face-groups.ts
var SMOOTH_EDGE = 16;
function smoothCornerNormals(builder, ctx) {
  const edgeFaces = /* @__PURE__ */ new Map();
  for (const [fId, face] of builder.faces.entries()) {
    if (ctx.respectVisibility && face.hidden) continue;
    for (const loop of face.loops) {
      for (const { edgeId } of loop) {
        if (((builder.edgeFlags.get(edgeId) ?? 0) & SMOOTH_EDGE) === 0) continue;
        let faces = edgeFaces.get(edgeId);
        if (!faces) edgeFaces.set(edgeId, faces = []);
        if (!faces.includes(fId)) faces.push(fId);
      }
    }
  }
  if (edgeFaces.size === 0) return null;
  const parent = /* @__PURE__ */ new Map();
  const touch = (key) => {
    if (!parent.has(key)) parent.set(key, key);
    return key;
  };
  const find = (key) => {
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(key) !== root) {
      const next = parent.get(key);
      parent.set(key, root);
      key = next;
    }
    return root;
  };
  for (const [edgeId, faces] of edgeFaces) {
    if (faces.length !== 2) continue;
    const ends = builder.edges.get(edgeId);
    if (!ends) continue;
    const a = builder.faces.get(faces[0]).normal;
    const b = builder.faces.get(faces[1]).normal;
    if (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] <= 0) continue;
    for (const vId of ends) {
      if (vId === null) continue;
      const left = find(touch(`${vId}:${faces[0]}`));
      const right = find(touch(`${vId}:${faces[1]}`));
      if (left !== right) parent.set(left, right);
    }
  }
  const sums = /* @__PURE__ */ new Map();
  for (const key of parent.keys()) {
    const normal = builder.faces.get(Number(key.slice(key.indexOf(":") + 1))).normal;
    const root = find(key);
    const sum = sums.get(root);
    if (sum) {
      sum[0] += normal[0];
      sum[1] += normal[1];
      sum[2] += normal[2];
    } else {
      sums.set(root, [normal[0], normal[1], normal[2]]);
    }
  }
  return (vId, fId) => {
    const key = `${vId}:${fId}`;
    if (!parent.has(key)) return null;
    const root = find(key);
    const sum = sums.get(root);
    const length = Math.hypot(sum[0], sum[1], sum[2]) || 1;
    return { root, n: [sum[0] / length, sum[1] / length, sum[2] / length] };
  };
}
function buildLocalFaceGroups(builder, ctx) {
  const faceGroups = /* @__PURE__ */ new Map();
  const smoothCorner = smoothCornerNormals(builder, ctx);
  const addSide = (triangles, fn, color, doubleSided, reverse, mat, uvTransform, xr, yr, fId) => {
    const texIndex = ctx.textureIndexFor(mat?.texture);
    const colorAlpha = color.a !== void 0 ? color.a / 255 : 1;
    const transparency = colorAlpha * (mat?.transparency ?? 1);
    const colorKey = `${color.r},${color.g},${color.b},${doubleSided},${texIndex ?? -1},${transparency}`;
    let group = faceGroups.get(colorKey);
    if (!group) {
      group = {
        color,
        transparency,
        doubleSided,
        textureIndex: texIndex,
        localVerts: [],
        localUvs: [],
        normalsAccum: [],
        localFaces: [],
        localVMap: /* @__PURE__ */ new Map()
      };
      faceGroups.set(colorKey, group);
    }
    const tex = mat?.texture;
    const tileW = tex && tex.width > 1e-9 ? tex.width : 1;
    const tileH = tex && tex.height > 1e-9 ? tex.height : 1;
    const sideNormal = reverse ? [-fn[0], -fn[1], -fn[2]] : fn;
    const faceLocalMap = /* @__PURE__ */ new Map();
    for (const tri of triangles) {
      const triIds = reverse ? [tri[0], tri[2], tri[1]] : tri;
      const faceIndices = [];
      for (const vId of triIds) {
        if (!builder.vertices.has(vId)) continue;
        let idx = faceLocalMap.get(vId);
        if (idx === void 0) {
          const p = builder.vertices.get(vId);
          const [u, v] = computeFaceUv(p, xr, yr, uvTransform, tileW, tileH);
          const smooth = smoothCorner?.(vId, fId) ?? null;
          const normal = smooth ? reverse ? [-smooth.n[0], -smooth.n[1], -smooth.n[2]] : smooth.n : sideNormal;
          const key = smooth ? `${vId},${u},${v},${smooth.root}` : `${vId},${u},${v}`;
          idx = group.localVMap.get(key);
          if (idx === void 0) {
            group.localVerts.push(p);
            group.localUvs.push([u, v]);
            group.normalsAccum.push([normal[0], normal[1], normal[2]]);
            idx = group.localVerts.length - 1;
            group.localVMap.set(key, idx);
          } else {
            const accum = group.normalsAccum[idx];
            accum[0] += normal[0];
            accum[1] += normal[1];
            accum[2] += normal[2];
          }
          faceLocalMap.set(vId, idx);
        }
        faceIndices.push(idx);
      }
      if (faceIndices.length === 3) {
        group.localFaces.push(faceIndices);
      }
    }
  };
  for (const [fId, fData] of builder.faces.entries()) {
    if (ctx.respectVisibility && fData.hidden) continue;
    const fallbackColor = ctx.inheritedMaterial?.color ?? ctx.fallbackLayerColor;
    const frontMat = ctx.resolveMaterial(fData.materialId) ?? ctx.inheritedMaterial;
    const backMat = ctx.resolveMaterial(fData.backMaterialId) ?? ctx.inheritedMaterial;
    const frontColor = frontMat?.color ?? fallbackColor;
    const backColor = backMat?.color ?? fallbackColor;
    const loops = [];
    for (const loop of fData.loops) {
      const loopVerts = reconstructLoopVertices(loop, builder.edges);
      if (loopVerts.length > 0) {
        loops.push(loopVerts);
      }
    }
    if (loops.length === 0) continue;
    let triangles;
    try {
      triangles = triangulateFace3D(builder.vertices, loops, fData.normal);
    } catch (e) {
      throw new SkpParseError(`Failed to triangulate face: ${e.message}`, {
        stage: "build_scene",
        definitionId: ctx.definitionId,
        cause: e
      });
    }
    const fn = fData.normal;
    const { xr, yr } = faceUvBasis(fn);
    const uvTransform = fData.uvTransform;
    const uvTransformBack = fData.uvTransformBack;
    const sameColor = frontColor.r === backColor.r && frontColor.g === backColor.g && frontColor.b === backColor.b;
    if (sameColor || ctx.frontSideOnly) {
      addSide(triangles, fn, frontColor, true, false, frontMat, uvTransform, xr, yr, fId);
    } else {
      addSide(triangles, fn, frontColor, false, false, frontMat, uvTransform, xr, yr, fId);
      addSide(triangles, fn, backColor, false, true, backMat, uvTransformBack, xr, yr, fId);
    }
  }
  return faceGroups;
}

// src/model.ts
function isDrawableEdge(edge) {
  return !edge.soft && !edge.smooth && !edge.hidden;
}
function sniffImageMime(data) {
  if (data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255) {
    return "image/jpeg";
  }
  if (data.length >= 8 && data[0] === 137 && data[1] === 80 && data[2] === 78 && data[3] === 71 && data[4] === 13 && data[5] === 10 && data[6] === 26 && data[7] === 10) {
    return "image/png";
  }
  return null;
}
function buildModelFromParsed(parsed) {
  const {
    version,
    units,
    layerColors,
    layerHidden,
    layerIdToName,
    pages,
    dimensions,
    materialIdToName,
    materialsMap,
    materialsByFolder,
    styles,
    defsDict
  } = parsed;
  const materialsById = /* @__PURE__ */ new Map();
  for (const [mId, mName] of materialIdToName.entries()) {
    const mat = materialsMap.get(mName) || materialsByFolder.get(mName);
    if (!mat) continue;
    if (mat.id === null) {
      mat.id = mId;
    }
    materialsById.set(mId, mat);
  }
  const finalLayersList = Array.from(layerColors.entries()).map(([name, c]) => ({
    name,
    color: { r: c[0], g: c[1], b: c[2] },
    hidden: layerHidden.get(name) ?? false
  }));
  const finalMaterialsList = Array.from(materialsMap.values());
  const finalPagesList = pages.map((pg) => ({
    name: pg.name,
    eye: pg.eye,
    target: pg.target,
    up: pg.up,
    fov: pg.fov,
    parallel: pg.parallel,
    orthoHeight: pg.orthoHeight,
    hiddenLayers: pg.hiddenLayerIds.map((id) => layerIdToName.get(id)).filter((name) => name !== void 0)
  }));
  const finalDimensionsList = dimensions.map((dm) => ({
    a: dm.a,
    b: dm.b,
    offset: dm.offset,
    planeX: dm.planeX,
    normal: dm.normal,
    text: dm.text,
    hidden: false
  }));
  const finalDefinitions = /* @__PURE__ */ new Map();
  let rootDefinition = null;
  for (const [id, d] of defsDict.entries()) {
    const defn = buildDefinition(typeof id === "number" ? id : 0, d, layerIdToName);
    if (typeof id === "number") {
      finalDefinitions.set(id, defn);
    } else {
      rootDefinition = defn;
    }
  }
  return {
    version,
    definitions: finalDefinitions,
    // The implicit top-level model definition: its instances are the
    // entities placed directly in the model (not inside any component/
    // group). Kept out of `definitions` (which is numeric-ID-only, one
    // entry per real component/group definition) and exposed here instead,
    // matching the .NET and Dart ports' `Root`/`root` field.
    root: rootDefinition ?? { id: 0, guid: "ROOT", name: "ROOT_MODEL", vertices: [], edges: [], faces: [], instances: [], sectionPlanes: [], texts: [], dimensions: [], constructionLines: [], constructionPoints: [], arcs: /* @__PURE__ */ new Map(), isImage: false, isGroup: false, alwaysFacesCamera: false, shadowsFaceSun: false },
    layers: finalLayersList,
    pages: finalPagesList,
    dimensions: finalDimensionsList,
    materials: finalMaterialsList,
    materialsById,
    styles,
    units
  };
}
function buildDefinition(id, d, layerIdToName) {
  const vertices = Array.from(d.builder.vertices.entries()).map(([vId, [x, y, z]]) => ({
    id: vId,
    x,
    y,
    z
  }));
  const edges = Array.from(d.builder.edges.entries()).map(([eId, [v1, v2]]) => {
    const flags = d.builder.edgeFlags.get(eId) ?? 0;
    return {
      id: eId,
      v1Id: v1 ?? 0,
      v2Id: v2 ?? 0,
      soft: (flags & 8) !== 0,
      smooth: (flags & 16) !== 0,
      hidden: (flags & 1) !== 0,
      curveId: d.builder.edgeCurves?.get(eId) ?? null
    };
  });
  const arcs = /* @__PURE__ */ new Map();
  for (const [curveId, f] of d.builder.arcCurves ?? []) {
    const radius = Math.hypot(f.xAxis[0], f.xAxis[1], f.xAxis[2]);
    const sweep = ((f.endAngle - f.startAngle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    arcs.set(curveId, {
      center: [...f.center],
      normal: [...f.normal],
      xAxis: [...f.xAxis],
      yAxis: [...f.yAxis],
      startAngle: f.startAngle,
      endAngle: f.endAngle,
      radius,
      isFullCircle: Math.min(sweep, 2 * Math.PI - sweep) < 1e-9
    });
  }
  const faces = Array.from(d.builder.faces.entries()).map(([fId, fData]) => ({
    id: fId,
    loops: fData.loops,
    normal: fData.normal,
    materialId: fData.materialId ?? null,
    backMaterialId: fData.backMaterialId ?? null,
    uvTransform: fData.uvTransform ?? null,
    uvTransformBack: fData.uvTransformBack ?? null,
    uvProjected: fData.uvProjected ?? false,
    uvProjectedBack: fData.uvProjectedBack ?? false,
    hidden: fData.hidden ?? false
  }));
  const instances = d.builder.instances.map((inst) => ({
    name: inst.name,
    refIdx: inst.refIdx,
    guid: inst.refGuid,
    matrix: inst.matrix,
    materialId: inst.materialId,
    hidden: inst.hidden ?? false,
    layer: (inst.layerId != null ? layerIdToName?.get(inst.layerId) : void 0) ?? "",
    properties: inst.properties ?? {}
  }));
  const sectionPlanes = (d.builder.sectionPlanes || []).map((sp) => ({
    plane: sp.plane || [0, 0, 1, 0],
    name: sp.name || "",
    label: sp.label || "",
    hidden: sp.hidden || false
  }));
  const texts = (d.builder.texts || []).map((txt) => ({
    text: txt.text || "",
    hidden: txt.hidden || false
  }));
  const dimensions = (d.builder.dimensions || []).map((dim) => ({
    text: dim.text || "",
    hidden: dim.hidden || false,
    a: null,
    b: null,
    offset: 0,
    planeX: null,
    normal: null
  }));
  const constructionLines = (d.builder.constructionLines || []).map((cl) => ({
    point: cl.point,
    direction: cl.direction,
    start: cl.start,
    end: cl.end
  }));
  const constructionPoints = (d.builder.constructionPoints || []).map((cp) => ({
    position: cp.position
  }));
  return {
    id,
    guid: d.guid,
    name: d.name,
    vertices,
    edges,
    faces,
    instances,
    sectionPlanes,
    texts,
    dimensions,
    constructionLines,
    constructionPoints,
    arcs,
    isImage: d.isImage,
    isGroup: d.isGroup || false,
    alwaysFacesCamera: d.alwaysFacesCamera,
    shadowsFaceSun: d.shadowsFaceSun || false
  };
}
function invertMatrix3x3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-12) {
    return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  }
  const invDet = 1 / det;
  return [
    (e * i - f * h) * invDet,
    (c * h - b * i) * invDet,
    (b * f - c * e) * invDet,
    (f * g - d * i) * invDet,
    (a * i - c * g) * invDet,
    (c * d - a * f) * invDet,
    (d * h - e * g) * invDet,
    (b * g - a * h) * invDet,
    (a * e - b * d) * invDet
  ];
}
function faceUvBasis(n) {
  const [nx, ny, nz] = n;
  const cx = -ny;
  const cy = nx;
  const clen = Math.sqrt(cx * cx + cy * cy);
  let xr;
  let yr;
  if (clen < 1e-9) {
    xr = [1, 0, 0];
    yr = [0, nz >= 0 ? 1 : -1, 0];
  } else {
    xr = [cx / clen, cy / clen, 0];
    yr = [ny * xr[2] - nz * xr[1], nz * xr[0] - nx * xr[2], nx * xr[1] - ny * xr[0]];
  }
  return { xr, yr };
}
function computeFaceUv(p, xr, yr, uvTransform, tileW, tileH) {
  const px = p[0] * xr[0] + p[1] * xr[1] + p[2] * xr[2];
  const py = p[0] * yr[0] + p[1] * yr[1] + p[2] * yr[2];
  if (!uvTransform) {
    return [px / tileW, py / tileH];
  }
  const inv = invertMatrix3x3(uvTransform);
  const u = px * inv[0] + py * inv[3] + inv[6];
  const v = px * inv[1] + py * inv[4] + inv[7];
  let q = px * inv[2] + py * inv[5] + inv[8];
  if (Math.abs(q) < 1e-12) q = 1;
  return [u / q / tileW, v / q / tileH];
}
function buildSceneFromParsed(parsed, options) {
  const t0 = Date.now();
  const { layerColors, layerIdToName, materialIdToName, materialsMap, materialsByFolder, defsDict } = parsed;
  emitLog(options, "info", `Building scene: ${defsDict.size} definitions available`);
  const instanceCounter = { count: 0 };
  const meshCounter = { count: 0 };
  const meshIndex = {};
  const glbPrimitives = [];
  const pathUpdates = /* @__PURE__ */ new Map();
  const getLayerColor = (name) => {
    const c = layerColors.get(name) || [136, 136, 136];
    return { r: c[0], g: c[1], b: c[2] };
  };
  const textures = [];
  const textureIndexByKey = /* @__PURE__ */ new Map();
  function textureIndexFor(tex) {
    if (!tex || !tex.data || tex.data.length === 0) return null;
    const mimeType = sniffImageMime(tex.data);
    if (mimeType === null) return null;
    const head = Array.from(tex.data.subarray(0, 16)).join(",");
    const key = `${tex.data.length}:${head}`;
    const hit = textureIndexByKey.get(key);
    if (hit !== void 0) return hit;
    const idx = textures.length;
    textures.push({ data: tex.data, mimeType, filename: tex.filename });
    textureIndexByKey.set(key, idx);
    return idx;
  }
  const colorToMaterialIndex = /* @__PURE__ */ new Map();
  const gltfMaterials = [];
  const boundsMin = [Infinity, Infinity, Infinity];
  const boundsMax = [-Infinity, -Infinity, -Infinity];
  const activeDefinitions = /* @__PURE__ */ new Set();
  function getMaterialIndex(color, doubleSided, textureIndex, transparency = 1) {
    const key = `${color.r},${color.g},${color.b},${doubleSided},${textureIndex ?? -1},${transparency}`;
    if (colorToMaterialIndex.has(key)) {
      return colorToMaterialIndex.get(key);
    }
    const idx = gltfMaterials.length;
    const pbr = {
      baseColorFactor: [color.r / 255, color.g / 255, color.b / 255, transparency],
      metallicFactor: 0,
      roughnessFactor: 0.8
    };
    if (textureIndex !== null) {
      pbr.baseColorTexture = { index: textureIndex };
    }
    const material = { pbrMetallicRoughness: pbr };
    if (doubleSided) material.doubleSided = true;
    if (transparency < 1) {
      material.alphaMode = "BLEND";
    } else if (textureIndex !== null) {
      material.alphaMode = "MASK";
    }
    gltfMaterials.push(material);
    colorToMaterialIndex.set(key, idx);
    return idx;
  }
  function instantiate(defId, currentMatrix, parentLayer = "Layer0", pathName = "ROOT", inheritedMaterial) {
    const d = defsDict.get(defId);
    if (!d) return [];
    const builder = d.builder;
    if (builder.faces.size > 0) {
      const faceGroups = buildLocalFaceGroups(builder, {
        resolveMaterial: (matId) => resolveMaterialFromMaps(matId, materialIdToName, materialsMap, materialsByFolder),
        textureIndexFor,
        inheritedMaterial,
        fallbackLayerColor: getLayerColor(parentLayer),
        definitionId: defId,
        respectVisibility: options?.respectEdgeVisibility,
        frontSideOnly: options?.frontSideOnly
      });
      for (const group of faceGroups.values()) {
        if (group.localFaces.length === 0) continue;
        const isRoot = pathName === "ROOT";
        const tx = isRoot ? 0 : (currentMatrix[9] ?? 0) * 25.4;
        const ty = isRoot ? 0 : (currentMatrix[10] ?? 0) * 25.4;
        const tz = isRoot ? 0 : (currentMatrix[11] ?? 0) * 25.4;
        let safePath = pathName.replace(/ \/ /g, "__").replace(/ /g, "_");
        if (safePath.length > 80) safePath = safePath.slice(0, 80);
        const colorSuffix = faceGroups.size > 1 ? `_${group.color.r}_${group.color.g}_${group.color.b}_${group.doubleSided ? "ds" : "ss"}` : "";
        const geomName = `mesh_${meshCounter.count}_${safePath}_${parentLayer}${colorSuffix}`;
        meshCounter.count++;
        meshIndex[geomName] = {
          name: isRoot ? "ROOT" : pathName.split(" / ").pop() || "",
          definitionName: d.name || "",
          layer: parentLayer,
          positionMm: [Math.round(tx * 100) / 100, Math.round(ty * 100) / 100, Math.round(tz * 100) / 100],
          properties: {},
          attributeDictionaries: {},
          path: pathName
        };
        const scale = 0.0254;
        const positions = new Float32Array(group.localVerts.length * 3);
        const normals = new Float32Array(group.localVerts.length * 3);
        const uvs = new Float32Array(group.localVerts.length * 2);
        const vertexNormalsAccum = group.normalsAccum;
        for (let i = 0; i < group.localVerts.length; i++) {
          const v = group.localVerts[i];
          const pt = transformPoint(currentMatrix, v);
          positions[i * 3] = pt[0] * scale;
          positions[i * 3 + 1] = pt[2] * scale;
          positions[i * 3 + 2] = -pt[1] * scale;
          const wx = positions[i * 3];
          const wy = positions[i * 3 + 1];
          const wz = positions[i * 3 + 2];
          if (wx < boundsMin[0]) boundsMin[0] = wx;
          if (wy < boundsMin[1]) boundsMin[1] = wy;
          if (wz < boundsMin[2]) boundsMin[2] = wz;
          if (wx > boundsMax[0]) boundsMax[0] = wx;
          if (wy > boundsMax[1]) boundsMax[1] = wy;
          if (wz > boundsMax[2]) boundsMax[2] = wz;
          uvs[i * 2] = group.localUvs[i][0];
          uvs[i * 2 + 1] = group.localUvs[i][1];
          const rawNorm = vertexNormalsAccum[i];
          const normLen = Math.sqrt(rawNorm[0] ** 2 + rawNorm[1] ** 2 + rawNorm[2] ** 2);
          const n = normLen > 1e-6 ? [rawNorm[0] / normLen, rawNorm[1] / normLen, rawNorm[2] / normLen] : [0, 0, 1];
          const nx = currentMatrix[0] * n[0] + currentMatrix[1] * n[1] + currentMatrix[2] * n[2];
          const ny = currentMatrix[3] * n[0] + currentMatrix[4] * n[1] + currentMatrix[5] * n[2];
          const nz = currentMatrix[6] * n[0] + currentMatrix[7] * n[1] + currentMatrix[8] * n[2];
          const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
          if (l > 1e-6) {
            normals[i * 3] = nx / l;
            normals[i * 3 + 1] = nz / l;
            normals[i * 3 + 2] = -ny / l;
          } else {
            normals[i * 3] = 0;
            normals[i * 3 + 1] = 1;
            normals[i * 3 + 2] = 0;
          }
        }
        const indices = new Uint32Array(group.localFaces.length * 3);
        for (let i = 0; i < group.localFaces.length; i++) {
          indices[i * 3] = group.localFaces[i][0];
          indices[i * 3 + 1] = group.localFaces[i][1];
          indices[i * 3 + 2] = group.localFaces[i][2];
        }
        const materialIndex = getMaterialIndex(group.color, group.doubleSided, group.textureIndex, group.transparency);
        glbPrimitives.push({
          positions,
          normals,
          uvs,
          indices,
          materialIndex,
          geomName
        });
      }
    }
    const childInstancesInfo = [];
    for (const inst of builder.instances) {
      const refIdx = inst.refIdx;
      const instMatrix = inst.matrix;
      const newMatrix = multiplyMatrices(currentMatrix, instMatrix);
      let lName = parentLayer;
      let instMaterial = inheritedMaterial;
      let properties = { ...inst.properties || {} };
      if (inst.layerId !== null && inst.layerId !== void 0) {
        lName = layerIdToName.get(inst.layerId) || parentLayer;
      }
      if (inst.materialId !== null && inst.materialId !== void 0) {
        const matName = materialIdToName.get(inst.materialId);
        if (matName) {
          const mat = materialsMap.get(matName) || materialsByFolder.get(matName);
          if (mat) {
            instMaterial = mat;
          }
        }
      }
      const d007 = inst.children.find((c) => c.tag === "D007");
      let attributeDicts = null;
      if (d007) {
        try {
          properties = extractDynamicProperties(d007, options);
          attributeDicts = extractAttributeDictionaries(d007, options);
        } catch (e) {
          emitLog(
            options,
            "debug",
            `Failed to extract dynamic properties for instance ${inst.name ?? ""} (refIdx=${refIdx}): ${e.message}`
          );
        }
      }
      const instName = inst.name || `Component_${refIdx}`;
      const fullPathName = `${pathName} / ${instName}`;
      instanceCounter.count++;
      if (instanceCounter.count % PROGRESS_INTERVAL === 0) {
        emitProgress(options, "build_scene", instanceCounter.count, instanceCounter.count);
        emitLog(options, "debug", `Processed ${instanceCounter.count} placed instances`);
      }
      if (activeDefinitions.has(refIdx)) {
        throw new SkpParseError("Recursive component definition", {
          stage: "build_scene",
          definitionId: refIdx
        });
      }
      activeDefinitions.add(refIdx);
      const childNodes = instantiate(refIdx, newMatrix, lName, fullPathName, instMaterial);
      activeDefinitions.delete(refIdx);
      const tx = (newMatrix[9] ?? 0) * 25.4;
      const ty = (newMatrix[10] ?? 0) * 25.4;
      const tz = (newMatrix[11] ?? 0) * 25.4;
      const childDefName = defsDict.get(refIdx)?.name || "";
      const defNameIsReal = !!childDefName && !isGenericDefinitionName(childDefName);
      const nameOverride = findNameOverride(attributeDicts);
      const instNameNonEmpty = !!inst.name;
      const fallbackName = instNameNonEmpty ? inst.name : defNameIsReal ? childDefName : `Component_${refIdx}`;
      const displayName = nameOverride ?? fallbackName;
      const nameIsGenerated = nameOverride === null && !instNameNonEmpty && !defNameIsReal;
      const attributeDictionaries = {};
      if (attributeDicts) {
        for (const dictName of Object.keys(attributeDicts)) {
          if (dictName === "dynamic_attributes" || dictName === "SU_InstanceSet") continue;
          const entries = attributeDicts[dictName];
          const stringified = {};
          for (const key of Object.keys(entries)) stringified[key] = stringifyVffAttrValue(entries[key]);
          attributeDictionaries[dictName] = stringified;
        }
      }
      const instInfo = {
        name: displayName,
        nameIsGenerated,
        definitionName: childDefName,
        layer: lName,
        positionMm: [
          Math.round(tx * 100) / 100,
          Math.round(ty * 100) / 100,
          Math.round(tz * 100) / 100
        ],
        properties,
        attributeDictionaries,
        guid: inst.refGuid || "",
        children: childNodes
      };
      childInstancesInfo.push(instInfo);
      pathUpdates.set(fullPathName, { properties, name: inst.name || "", attributeDictionaries });
    }
    return childInstancesInfo;
  }
  const identityMat = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
  const rootChildren = instantiate("ROOT", identityMat);
  for (const geomName of Object.keys(meshIndex)) {
    const existing = meshIndex[geomName];
    const update = existing ? pathUpdates.get(existing.path) : void 0;
    if (existing && update) {
      existing.properties = update.properties;
      existing.name = update.name;
      existing.attributeDictionaries = update.attributeDictionaries;
    }
  }
  for (const geomName of Object.keys(meshIndex)) {
    const existing = meshIndex[geomName];
    if (existing && existing.path === "ROOT") {
      existing.name = "ROOT";
      existing.definitionName = "ROOT_MODEL";
      existing.layer = "Layer0";
      existing.positionMm = [0, 0, 0];
      existing.properties = {};
      existing.attributeDictionaries = {};
    }
  }
  const sceneHierarchy = {
    name: "ROOT",
    nameIsGenerated: false,
    definitionName: "ROOT_MODEL",
    layer: "Layer0",
    positionMm: [0, 0, 0],
    properties: {},
    attributeDictionaries: {},
    guid: "",
    children: rootChildren
  };
  emitLog(
    options,
    "info",
    `Scene build complete: ${instanceCounter.count} instances, ${Object.keys(meshIndex).length} meshes, ${glbPrimitives.length} primitives (${((Date.now() - t0) / 1e3).toFixed(2)}s)`
  );
  const bounds = Number.isFinite(boundsMin[0]) ? {
    min: [boundsMin[0], boundsMin[1], boundsMin[2]],
    max: [boundsMax[0], boundsMax[1], boundsMax[2]],
    size: [
      boundsMax[0] - boundsMin[0],
      boundsMax[1] - boundsMin[1],
      boundsMax[2] - boundsMin[2]
    ],
    center: [
      (boundsMin[0] + boundsMax[0]) / 2,
      (boundsMin[1] + boundsMax[1]) / 2,
      (boundsMin[2] + boundsMax[2]) / 2
    ]
  } : null;
  return { sceneHierarchy, meshIndex, glbPrimitives, gltfMaterials, textures, bounds };
}
function resolveMaterialFromMaps(matId, materialIdToName, materialsMap, materialsByFolder) {
  if (matId === void 0 || matId === null) return void 0;
  const matName = materialIdToName.get(matId);
  if (!matName) return void 0;
  return materialsMap.get(matName) || materialsByFolder.get(matName);
}

// src/legacy.ts
var LegacyParseError = class extends Error {
};
var STR_MARKER = new Uint8Array([255, 254, 255]);
var MAX_V20_FILLER_PAD = 29;
function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function findCountAfterV20Filler(data, countPos, limit, ar) {
  let markerAt = -1;
  for (let i = countPos; i < countPos + 12 && i + 4 <= data.length; i++) {
    if (data[i] === 255 && data[i + 1] === 254 && data[i + 2] === 255) {
      markerAt = i;
      break;
    }
  }
  if (markerAt < 0) return null;
  if (data[markerAt + 3] !== 0) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let pad = 1; pad <= MAX_V20_FILLER_PAD; pad += 4) {
    const at = markerAt + 4 + pad;
    if (at + 4 > data.length) break;
    const count = view.getUint32(at, true);
    if (count > 0 && count <= limit && (ar === void 0 || plausibleListTag(ar, data, at + 4))) {
      return { count, next: at + 4 };
    }
  }
  return null;
}
function retryCountAfterV20Filler(r, countPos, limit, ar) {
  const hit = findCountAfterV20Filler(r.data, countPos, limit, ar);
  if (hit === null) return null;
  r.pos = hit.next;
  return hit.count;
}
function findEmptyRootAfterV20Filler(data, countPos) {
  let markerAt = -1;
  for (let i = countPos; i < countPos + 12 && i + 4 <= data.length; i++) {
    if (data[i] === 255 && data[i + 1] === 254 && data[i + 2] === 255) {
      markerAt = i;
      break;
    }
  }
  if (markerAt < 0 || data[markerAt + 3] !== 0) return null;
  const rootCountAt = markerAt + 4 + 13;
  if (rootCountAt + 4 > data.length) return null;
  for (let i = markerAt + 3; i < rootCountAt + 4; i++) if (data[i] !== 0) return null;
  return rootCountAt;
}
function plausibleListTag(ar, data, at) {
  if (at + 2 > data.length) return false;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const t = view.getUint16(at, true);
  if (t === 0 || t === 32767 || t === 65535) return true;
  if (t & 32768) {
    const ent = ar.slots.get(t & 32767);
    return ent !== void 0 && ent[0] === "class";
  }
  return t < ar.nextSlot;
}
function findBytes(data, needle, start = 0, end = data.length) {
  const nlen = needle.length;
  const limit = end - nlen;
  outer: for (let i = start; i <= limit; i++) {
    for (let j = 0; j < nlen; j++) {
      if (data[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}
function findPattern(data, pattern, start = 0, end = data.length) {
  const patLen = pattern.length;
  const limit = end - patLen;
  outer: for (let i = start; i <= limit; i++) {
    for (let j = 0; j < patLen; j++) {
      const want = pattern[j];
      if (want !== null && data[i + j] !== want) continue outer;
    }
    return i;
  }
  return -1;
}
function asciiBytes(s) {
  return s.split("").map((c) => c.charCodeAt(0));
}
function matchesAscii(data, offset, str) {
  if (offset + str.length > data.length) return false;
  for (let i = 0; i < str.length; i++) {
    if (data[offset + i] !== str.charCodeAt(i)) return false;
  }
  return true;
}
function toHex(data) {
  let s = "";
  for (let i = 0; i < data.length; i++) {
    const h = data[i].toString(16).toUpperCase();
    s += h.length === 1 ? "0" + h : h;
  }
  return s;
}
function isClassRef(data, p, slot) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (slot <= 32767) {
    return p + 2 <= data.length && view.getUint16(p, true) === (32768 | slot);
  }
  return p + 6 <= data.length && view.getUint16(p, true) === 32767 && view.getUint32(p + 2, true) === (2147483648 | slot) >>> 0;
}
var R = class {
  constructor(data, pos = 0) {
    this.data = data;
    this.pos = pos;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }
  u8() {
    const v = this.data[this.pos];
    this.pos += 1;
    return v;
  }
  u16() {
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }
  u32() {
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }
  i32() {
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }
  f64() {
    const v = this.view.getFloat64(this.pos, true);
    this.pos += 8;
    return v;
  }
  f64s(n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(this.f64());
    return out;
  }
  raw(n) {
    const v = this.data.subarray(this.pos, this.pos + n);
    this.pos += n;
    return v;
  }
  peek(n) {
    return this.data.subarray(this.pos, this.pos + n);
  }
  peekU16() {
    return this.view.getUint16(this.pos, true);
  }
  utf16() {
    if (!bytesEqual(this.peek(3), STR_MARKER)) {
      throw new LegacyParseError(`expected a string record ${this.ctx()}`);
    }
    this.pos += 3;
    let n = this.u8();
    if (n === 255) {
      n = this.u16();
      if (n === 65535) {
        n = this.u32();
      }
    }
    const bytes = this.raw(2 * n);
    return new TextDecoder("utf-16le").decode(bytes);
  }
  ctx(back = 16, fwd = 32) {
    const p = this.pos;
    const before = toHex(this.data.subarray(Math.max(0, p - back), p));
    const after = toHex(this.data.subarray(p, p + fwd));
    return `@0x${p.toString(16)}: ...${before} | ${after}...`;
  }
};
var Archive = class {
  constructor(data, ver) {
    this.slots = /* @__PURE__ */ new Map();
    this.classSlot = /* @__PURE__ */ new Map();
    this.classSchema = /* @__PURE__ */ new Map();
    this.currentClass = null;
    this.currentObjSlot = null;
    this.nextSlot = 0;
    this.walkBase = 0;
    this.readers = {};
    this.currentLoop = null;
    this.inEntityList = false;
    // Burned store-map indices (see readEdgeUse): the writer maps an
    // annotation's connection points into the store map WITHOUT writing
    // bytes, so file back-references beyond each burn run ahead of the
    // walker's numbering. Registrations always stay at WALKER indices - no
    // captured slot ever goes stale - and backref translates file
    // references through the burn bands instead. `burns` holds
    // [fileBandStart, width] per event; `cumDelta` their total;
    // `annotWatermark` the walker slot right after the last annotation
    // record - the only place a band can start.
    this.burns = [];
    this.cumDelta = 0;
    this.annotWatermark = null;
    this.burnStack = [];
    // per-entity-list burned-item credits
    // per-entity-list instances an annotation's path wrote in full (see
    // pathRef) that the list has not listed yet, in order
    this.inlineStack = [];
    // Called as each CComponentDefinition record completes. walkModel uses it
    // to build that definition's geometry right away and release its entity
    // objects, so the walk never holds the whole model's entity graph (see
    // releaseDefinitionEntities). Probe archives leave it null.
    this.onDefinitionDone = null;
    this.prebuilt = /* @__PURE__ */ new Map();
    // [first, end) slot range of each built definition's own records.
    this.releasedSpans = [];
    this.clineTail = null;
    this.data = data;
    this.ver = ver;
    this.hasPid = ver >= 17;
    this.r = new R(data);
  }
  alloc(entry) {
    const s = this.nextSlot;
    this.slots.set(s, entry);
    this.nextSlot += 1;
    return s;
  }
  readObject(r, expect = null) {
    const tag = r.u16();
    if (tag === 0) {
      return [null, null, null];
    }
    if (tag === 32767) {
      const big = r.u32();
      if (big & 2147483648) {
        return this.newOfClass(r, big & 2147483647, expect);
      }
      return this.backref(big, r);
    }
    if (tag === 65535) {
      const schema = r.u16();
      const namelen = r.u16();
      if (namelen > 40) {
        throw new LegacyParseError(`implausible class name length ${r.ctx()}`);
      }
      const nameBytes = r.raw(namelen);
      const name = new TextDecoder("utf-8").decode(nameBytes);
      this.alloc(["class", name, schema]);
      this.classSlot.set(name, this.nextSlot - 1);
      this.classSchema.set(name, schema);
      return this.newObj(r, name);
    }
    if (tag & 32768) {
      return this.newOfClass(r, tag & 32767, expect);
    }
    return this.backref(tag, r);
  }
  newOfClass(r, cslot, expect) {
    let ent = this.slots.get(cslot);
    if (ent === void 0) {
      if (expect === null) {
        throw new LegacyParseError(`class-ref to unknown slot ${cslot} ${r.ctx()}`);
      }
      const newEnt = ["class", expect, null];
      this.slots.set(cslot, newEnt);
      this.classSlot.set(expect, cslot);
      ent = newEnt;
    }
    if (ent[0] !== "class") {
      throw new LegacyParseError(`class-ref to non-class slot ${cslot} (${ent[1]}) ${r.ctx()}`);
    }
    return this.newObj(r, ent[1]);
  }
  newObj(r, name) {
    this.inEntityList = false;
    const slot = this.alloc(["obj", name, null]);
    const reader = this.readers[name];
    if (reader === void 0) {
      throw new LegacyParseError(`no reader for class ${name} ${r.ctx()}`);
    }
    const prevClass = this.currentClass;
    const prevSlot = this.currentObjSlot;
    this.currentClass = name;
    this.currentObjSlot = slot;
    let value;
    try {
      value = reader(this, r);
    } finally {
      this.currentClass = prevClass;
      this.currentObjSlot = prevSlot;
    }
    this.slots.set(slot, ["obj", name, value]);
    if (name === "CComponentDefinition" && value && this.onDefinitionDone) {
      this.onDefinitionDone(slot, value);
    }
    if (name === "CDimensionLinear" || name === "CText") {
      this.annotWatermark = this.nextSlot;
    }
    return [slot, name, value];
  }
  // 0xffff CLayer, a class-ref to a CLayer already in classSlot, or —
  // when `unmatchedClassRef` — any short 0x8000 class-ref. The last form
  // is only for the throwaway slot-base probe, which numbers from 1<<20 so
  // the file's 0x8000|real_slot will not match classSlot.
  clayerRecordAt(at, unmatchedClassRef = false) {
    if (at + 2 > this.data.length) return false;
    const tag = this.data[at] | this.data[at + 1] << 8;
    if (tag === 65535 && at + 12 <= this.data.length && (this.data[at + 4] | this.data[at + 5] << 8) === 6 && matchesAscii(this.data, at + 6, "CLayer")) {
      return true;
    }
    const layCs = this.classSlot.get("CLayer");
    if (layCs !== void 0 && isClassRef(this.data, at, layCs)) return true;
    return unmatchedClassRef && (tag & 32768) !== 0 && tag !== 65535;
  }
  // Colour CLayer ends in a 21-byte tail. Some v18 zero-material files
  // (custom tag listed first, then Layer0) write 12 zero bytes + u32 after
  // that, then another CLayer. Skip those 16 bytes only when they precede
  // a CLayer; leave a definition-list back-ref alone.
  skipClayerColourExt() {
    const pad = 12;
    const ext = 16;
    if (this.r.pos + ext + 2 > this.data.length) return;
    for (let i = 0; i < pad; i++) {
      if (this.data[this.r.pos + i] !== 0) return;
    }
    if (this.clayerRecordAt(this.r.pos + ext, true)) this.r.pos += ext;
  }
  // v18 template Layer0 after a custom tag: <parent u16><active u16><dc u32>.
  // Consume parent only when both u16s are already CLayer objects. A lone
  // back-ref then a definition count (usual layout) stays put.
  skipClayerParentRef(selfSlot) {
    if (this.r.pos + 4 > this.data.length || selfSlot === null) return;
    const a = this.data[this.r.pos] | this.data[this.r.pos + 1] << 8;
    const b = this.data[this.r.pos + 2] | this.data[this.r.pos + 3] << 8;
    if (!a || a & 32768 || a === 32767 || a === selfSlot) return;
    if (!b || b & 32768 || b === 32767) return;
    const ea = this.slots.get(a);
    const eb = this.slots.get(b);
    if (ea === void 0 || eb === void 0) return;
    if (ea[0] === "class" || eb[0] === "class") return;
    if (ea[1] !== "CLayer" || eb[1] !== "CLayer") return;
    this.r.pos += 2;
  }
  // Extra CLayer records past declared layerCount (v18: count=1 custom
  // tag, then Layer0). Skip null separators; stop at the definition-list
  // anchor. `unmatchedClassRef` only on the throwaway probe.
  collectTrailingLayers(slotsOut, layersOut, unmatchedClassRef = false) {
    while (this.r.pos + 2 <= this.data.length) {
      const tag = this.r.peekU16();
      if (tag === 0) {
        this.r.pos += 2;
        continue;
      }
      if (!this.clayerRecordAt(this.r.pos, unmatchedClassRef)) break;
      const [s, , v] = this.readObject(this.r, "CLayer");
      if (v != null) {
        if (slotsOut) slotsOut.push(s);
        if (layersOut) layersOut.push([s, v]);
      }
    }
  }
  /** Map a FILE store-map index to the walker's numbering through the burn
   * bands. Returns the walker slot, or `null` when the reference points
   * INTO a band (a phantom, never-serialized connection point). */
  translateRef(slot) {
    let offset = 0;
    for (const [start, width] of this.burns) {
      if (slot < start) break;
      if (slot < start + width) return null;
      offset += width;
    }
    return slot - offset;
  }
  /** The walker slot of the back-reference at the cursor, without moving
   * it; `null` when the next tag is anything else. */
  peekBackref(r) {
    if (r.pos + 2 > r.data.length) return null;
    const view = new DataView(r.data.buffer, r.data.byteOffset, r.data.byteLength);
    const tag = view.getUint16(r.pos, true);
    let slot;
    if (tag === 32767) {
      if (r.pos + 6 > r.data.length) return null;
      slot = view.getUint32(r.pos + 2, true);
      if (slot & 2147483648) return null;
    } else if (tag === 0 || tag & 32768) {
      return null;
    } else {
      slot = tag;
    }
    if (this.burns.length > 0 && slot >= this.burns[0][0]) {
      return this.translateRef(slot);
    }
    return slot;
  }
  backref(slot, r) {
    if (this.burns.length > 0 && slot >= this.burns[0][0]) {
      const walker = this.translateRef(slot);
      if (walker === null) {
        return [slot, "reserved", null];
      }
      slot = walker;
    }
    const ent = this.slots.get(slot);
    if (ent === void 0) {
      if (slot < this.walkBase) {
        return [slot, "premodel", null];
      }
      throw new LegacyParseError(`back-ref to unwalked slot ${slot} ${r.ctx()}`);
    }
    if (ent[0] === "class") {
      throw new LegacyParseError(`back-ref to class slot ${slot} ${r.ctx()}`);
    }
    return [slot, ent[1], ent[2]];
  }
};
function preamble(ar, r) {
  const [attrsSlot, , attrs] = ar.readObject(r, "CAttributeContainer");
  let pid = 0;
  if (ar.hasPid) {
    const mask = r.u8();
    for (let bit = 0; bit < 8; bit++) {
      if (mask & 1 << bit) {
        pid |= r.u8() << 8 * bit;
      }
    }
  }
  return { attrs, pid, attrsSlot };
}
var FIRST_V4 = 4;
var FIRST_DIB_OBJECT = 6;
var FIRST_NAMED_INSTANCE = 5;
function earlyPreamble(ar, r) {
  if (ar.ver < FIRST_V4) return { attrs: null, pid: 0, attrsSlot: null };
  return preamble(ar, r);
}
function drawbase(ar, r) {
  const b = r.raw(ar.ver < FIRST_V4 ? 5 : ar.ver < 5 ? 7 : 8);
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const layCls = ar.classSlot.get("CLayer");
  const tag = r.peekU16();
  let layer;
  if (layCls !== void 0 && tag === (32768 | layCls)) {
    ar.readObject(r, "CLayer");
    layer = 0;
  } else if (tag === 32767) {
    r.u16();
    const big = r.u32();
    if (big & 2147483648) {
      throw new LegacyParseError(`drawbase layer: unexpected class ${r.ctx()}`);
    }
    layer = 0;
  } else {
    layer = r.u16();
  }
  if (ar.ver < FIRST_V4) {
    return { mat: 0, hidden: 0, soft: 0, smooth: 0, layer };
  }
  return {
    mat: view.getUint16(0, true),
    hidden: b[2],
    soft: b[5],
    smooth: b[6],
    layer
  };
}
function readVertex(ar, r) {
  earlyPreamble(ar, r);
  return { k: "vertex", xyz: r.f64s(3) };
}
function readEdge(ar, r) {
  preamble(ar, r);
  const db = drawbase(ar, r);
  const [s1] = ar.readObject(r, "CVertex");
  const [s2] = ar.readObject(r, "CVertex");
  const [cs, cn, cv] = ar.readObject(r);
  if (cn !== null && cn !== "CCurve" && cn !== "CArcCurve") {
    throw new LegacyParseError(`edge curve pointer resolved to ${cn} ${r.ctx()}`);
  }
  return { k: "edge", db, curve: cs, curve_value: cv, v1: s1, v2: s2 };
}
function readCurve(ar, r) {
  preamble(ar, r);
  r.u8();
  const n = r.u32();
  return { k: "curve", n };
}
function readArcCurve(ar, r) {
  preamble(ar, r);
  r.raw(5);
  const v = r.f64s(14);
  return {
    k: "arccurve",
    params: {
      center: [v[0], v[1], v[2]],
      normal: [v[3], v[4], v[5]],
      xAxis: [v[6], v[7], v[8]],
      startAngle: v[9],
      endAngle: v[10],
      yAxis: [v[11], v[12], v[13]]
    }
  };
}
function registerBurn(ar, delta) {
  ar.burns.push([ar.annotWatermark + ar.cumDelta, delta]);
  ar.cumDelta += delta;
  ar.annotWatermark = null;
  if (ar.burnStack.length > 0) {
    ar.burnStack[ar.burnStack.length - 1] += 1;
  }
}
function readEdgeUse(ar, r) {
  earlyPreamble(ar, r);
  const [es] = ar.readObject(r, "CEdge");
  const sense = r.u8();
  const p0 = r.pos;
  const tag = r.u16();
  let ps;
  if (tag === 32767) {
    const big = r.u32();
    if (big & 2147483648) {
      throw new LegacyParseError(`edge-use parent is a new object ${r.ctx()}`);
    }
    ps = big;
  } else if (tag === 65535 || tag & 32768) {
    throw new LegacyParseError(`edge-use parent is a new object ${r.ctx()}`);
  } else {
    ps = tag !== 0 ? tag : null;
  }
  const expected = ar.currentLoop !== null ? ar.currentLoop + ar.cumDelta : null;
  if (ps !== expected) {
    const delta = typeof ps === "number" && expected !== null ? ps - expected : 0;
    if (delta > 0 && delta <= 4096 && ar.annotWatermark !== null) {
      registerBurn(ar, delta);
    } else {
      r.pos = p0;
      throw new LegacyParseError(`edge-use parent slot ${ps} != current loop ${expected} ${r.ctx()}`);
    }
  }
  return { k: "edgeuse", edge: es, sense };
}
function readLoop(ar, r) {
  const mySlot = ar.nextSlot - 1;
  const prev = ar.currentLoop;
  ar.currentLoop = mySlot;
  earlyPreamble(ar, r);
  r.raw(2);
  const uses = [];
  while (true) {
    if (r.peekU16() === 0) {
      r.pos += 2;
      break;
    }
    const [, , v] = ar.readObject(r, "CEdgeUse");
    uses.push(v);
  }
  ar.currentLoop = prev;
  return { k: "loop", uses };
}
function readFace(ar, r) {
  const pre = preamble(ar, r);
  const db = drawbase(ar, r);
  let attrs = pre.attrs;
  if (ar.ver < FIRST_V4 && attrs && typeof attrs === "object" && attrs.k === "material") {
    db.mat = pre.attrsSlot;
    attrs = null;
  }
  const plane = r.f64s(4);
  const nloops = r.u32();
  if (nloops > 1e4) {
    throw new LegacyParseError(`implausible loop count ${nloops} ${r.ctx()}`);
  }
  const loops = [];
  for (let i = 0; i < nloops; i++) {
    const [, , v] = ar.readObject(r, "CLoop");
    loops.push(v);
  }
  const backMat = r.u16();
  return { k: "face", db, plane, loops, back_mat: backMat, attrs };
}
function readAttrContainer(ar, r) {
  preamble(ar, r);
  const children = [];
  while (true) {
    if (r.peekU16() === 0) {
      r.pos += 2;
      break;
    }
    const [, n, v] = ar.readObject(r, "CAttributeNamed");
    children.push([n, v]);
  }
  return { k: "attrs", children };
}
function readAttrNamed(ar, r) {
  preamble(ar, r);
  r.raw(4);
  const dictname = r.utf16();
  function readTyped(t) {
    if (t === 0) return null;
    if (t === 4) return r.i32();
    if (t === 6) return r.f64();
    if (t === 7) return r.u8();
    if (t === 9) return r.u32();
    if (t === 10) return r.utf16();
    if (t === 12) return r.f64();
    if (t === 11) {
      const n = r.u32();
      if (n > 1e5) {
        throw new LegacyParseError(`implausible attr array count ${r.ctx()}`);
      }
      const arr = [];
      for (let i = 0; i < n; i++) arr.push(readTyped(r.u8()));
      return arr;
    }
    if (t === 17) return r.f64s(3);
    if (t === 18) return r.f64s(3);
    throw new LegacyParseError(`unknown attribute value type 0x${t.toString(16)} ${r.ctx()}`);
  }
  const entries = {};
  while (true) {
    const key = r.utf16();
    if (key === "") break;
    entries[key] = readTyped(r.u8());
  }
  if (ar.ver >= 7) r.u32();
  return { k: "dict", name: dictname, entries };
}
var DYNAMIC_ATTRIBUTES_DICT_NAME = "dynamic_attributes";
function stringifyAttrValue(value) {
  if (value === null || value === void 0) return "";
  if (Array.isArray(value)) return value.map(stringifyAttrValue).join(",");
  return String(value);
}
function extractLegacyDynamicProperties(attrs) {
  if (!attrs || typeof attrs !== "object") return {};
  for (const [, value] of attrs.children || []) {
    if (value && typeof value === "object" && value.name === DYNAMIC_ATTRIBUTES_DICT_NAME) {
      const entries = value.entries || {};
      const properties = {};
      for (const key of Object.keys(entries)) {
        properties[key] = stringifyAttrValue(entries[key]);
      }
      return properties;
    }
  }
  return {};
}
function readLayer(ar, r) {
  earlyPreamble(ar, r);
  const name = r.utf16();
  const mid = [];
  while (mid.length < 8 && !bytesEqual(r.peek(3), STR_MARKER)) {
    mid.push(r.raw(1)[0]);
  }
  r.utf16();
  const flags = r.u16();
  if (flags & 255) {
    const tex = textureBlock(ar, r);
    r.raw(4);
    return { k: "layer", name, hidden: mid.length ? mid[0] : 0, rgba: tex.rgba };
  }
  const rgba = r.raw(4);
  r.utf16();
  r.raw(ar.ver < FIRST_V4 ? 17 : 21);
  ar.skipClayerColourExt();
  ar.skipClayerParentRef(ar.currentObjSlot);
  return { k: "layer", name, hidden: mid.length ? mid[0] : 0, rgba: Array.from(rgba) };
}
function textureBlock(ar, r) {
  let s;
  let dib;
  if (ar.ver < FIRST_DIB_OBJECT) {
    s = null;
    dib = readDib(ar, r);
  } else {
    r.pos -= 1;
    preamble(ar, r);
    [s, , dib] = ar.readObject(r, "CDib");
    if (!(dib && typeof dib === "object" && dib.k === "dib")) {
      throw new LegacyParseError(`texture object is not a dib ${r.ctx()}`);
    }
  }
  const marker = findBytes(r.data, STR_MARKER, r.pos, r.pos + 28);
  if (marker - r.pos === 20) {
    r.u32();
  } else if (marker - r.pos !== 16) {
    throw new LegacyParseError(`texture size block misaligned ${r.ctx()}`);
  }
  const w = r.f64();
  const h = r.f64();
  const fname = r.utf16();
  const avg = r.raw(9);
  r.utf16();
  const blob = r.raw(8);
  const opacity = r.f64();
  const useOp = r.u8();
  const colorized = blob[0] === 2;
  return {
    rgba: [avg[5], avg[6], avg[7], 255],
    opacity,
    use_opacity: useOp,
    tex_dib: s,
    tex_data: s === null ? dib.data : null,
    tex_w: w,
    tex_h: h,
    tex_file: fname,
    colorized,
    colorize_type: blob[4] === 1 ? 1 : 0
  };
}
function readMaterial(ar, r) {
  earlyPreamble(ar, r);
  const name = r.utf16();
  const texflag = r.u16();
  const out = { k: "material", name };
  if (texflag === 0) {
    const rgba = r.raw(4);
    r.utf16();
    r.raw(8);
    const opacity = r.f64();
    const useOp = r.u8();
    out.rgba = Array.from(rgba);
    out.opacity = opacity;
    out.use_opacity = useOp;
  } else {
    const tex = textureBlock(ar, r);
    out.rgba = tex.rgba;
    out.opacity = tex.opacity;
    out.use_opacity = tex.use_opacity;
    out.tex_dib = tex.tex_dib;
    out.tex_data = tex.tex_data;
    out.tex_w = tex.tex_w;
    out.tex_h = tex.tex_h;
    out.tex_file = tex.tex_file;
    out.colorized = tex.colorized;
    out.colorize_type = tex.colorize_type;
  }
  return out;
}
function readDib(ar, r) {
  const subtype = r.u32();
  const length = r.u32();
  if (length > r.data.length) {
    throw new LegacyParseError(`implausible dib length ${length} ${r.ctx()}`);
  }
  const data = r.raw(length);
  return { k: "dib", subtype, data };
}
function readFtc(ar, r) {
  preamble(ar, r);
  r.u32();
  const ks = r.f64s(24);
  const frontPinsCount = r.u32();
  const frontPins = [];
  for (let i = 0; i < frontPinsCount; i++) frontPins.push(r.f64s(4));
  const backPinsCount = r.u32();
  const backPins = [];
  for (let i = 0; i < backPinsCount; i++) backPins.push(r.f64s(4));
  const fflags = r.u32();
  const bflags = r.u32();
  return {
    k: "ftc",
    front: ks.slice(0, 9),
    back: ks.slice(12, 21),
    front_pins: frontPins,
    back_pins: backPins,
    front_projected: Boolean(fflags & 2),
    back_projected: Boolean(bflags & 2)
  };
}
function readCamera(ar, r) {
  r.raw(137);
  r.u16();
  r.utf16();
  r.raw(ar.ver >= 6 ? 33 : 10);
  return { k: "camera" };
}
function readThumbnail(ar, r) {
  preamble(ar, r);
  if (ar.ver < FIRST_V4) {
    r.raw(129);
    return { k: "thumbnail", dib: null };
  }
  ar.readObject(r, "CCamera");
  if (ar.ver < 6) {
    return { k: "thumbnail", dib: null };
  }
  const [, , dib] = ar.readObject(r, "CDib");
  return { k: "thumbnail", dib };
}
function readImage(ar, r) {
  preamble(ar, r);
  const db = drawbase(ar, r);
  const [ds] = ar.readObject(r);
  const xform = r.f64s(12);
  r.f64();
  r.utf16();
  const guid = r.raw(16);
  return { k: "image", db, def: ds, xform, guid: toHex(guid) };
}
function entityRef(ar, r) {
  const tag = r.u16();
  if (tag === 0) return null;
  if (tag === 32767) {
    const big = r.u32();
    if (big & 2147483648) {
      throw new LegacyParseError(`entity ref is a new object ${r.ctx()}`);
    }
    return big;
  }
  if (tag === 65535 || tag & 32768) {
    throw new LegacyParseError(`entity ref is a new object ${r.ctx()}`);
  }
  return tag;
}
function connectionPaths(ar, r) {
  const extra = entityRef(ar, r);
  const lists = [];
  for (let k = 0; k < 2; k++) {
    const count = r.u32();
    if (count > 1e3) {
      throw new LegacyParseError(`implausible dimension path length ${r.ctx()}`);
    }
    const refs = [];
    for (let i = 0; i < count; i++) refs.push(pathRef(ar, r, i === 0));
    lists.push(refs);
  }
  return [extra, lists[0], lists[1]];
}
function pathRef(ar, r, member = false) {
  const tag = r.peekU16();
  let isNew = tag === 65535 || tag !== 32767 && (tag & 32768) !== 0;
  if (tag === 32767) {
    const view = new DataView(r.data.buffer, r.data.byteOffset, r.data.byteLength);
    isNew = (view.getUint32(r.pos + 2, true) & 2147483648) !== 0;
  }
  if (isNew) {
    const [slot] = ar.readObject(r);
    const inline = ar.inlineStack;
    if (member && inline && inline.length > 0) {
      inline[inline.length - 1].add(slot);
    }
    return slot;
  }
  return entityRef(ar, r);
}
function readRelationship(ar, r) {
  preamble(ar, r);
  const a = entityRef(ar, r);
  const b = entityRef(ar, r);
  return { k: "relationship", refs: [a, b] };
}
function strictNextTag(ar, data, at, allowNull = true) {
  if (at + 2 > data.length) return false;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const t = view.getUint16(at, true);
  if (t === 0) return allowNull;
  if (t === 32767 || t === 65535) return true;
  if (t & 32768) {
    const ent = ar.slots.get(t & 32767);
    return ent !== void 0 && ent[0] === "class";
  }
  return false;
}
function readConstructionLine(ar, r) {
  preamble(ar, r);
  drawbase(ar, r);
  const point = r.f64s(3);
  const direction = r.f64s(3);
  const [startParam, endParam] = r.f64s(2);
  let k = ar.clineTail;
  if (k === null) {
    const dflt = ar.ver === 17 ? 7 : 4;
    const order = [dflt, ...[0, 4, 7].filter((c) => c !== dflt)];
    outer: for (const allowNull of [false, true]) {
      for (const cand of order) {
        if (strictNextTag(ar, r.data, r.pos + cand, allowNull)) {
          k = cand;
          break outer;
        }
      }
    }
    if (k === null) k = dflt;
    ar.clineTail = k;
  }
  r.raw(k);
  const huge = 1e20;
  const start = Math.abs(startParam) >= huge ? null : [point[0] + direction[0] * startParam, point[1] + direction[1] * startParam, point[2] + direction[2] * startParam];
  const end = Math.abs(endParam) >= huge ? null : [point[0] + direction[0] * endParam, point[1] + direction[1] * endParam, point[2] + direction[2] * endParam];
  return { k: "cline", point: [point[0], point[1], point[2]], direction: [direction[0], direction[1], direction[2]], start, end };
}
function readConstructionPoint(ar, r) {
  preamble(ar, r);
  const db = drawbase(ar, r);
  const pos = r.f64s(3);
  r.f64s(3);
  r.u8();
  return { k: "cpoint", db, pos };
}
function readSectionPlane(ar, r) {
  preamble(ar, r);
  const db = drawbase(ar, r);
  const view = new DataView(r.data.buffer, r.data.byteOffset, r.data.byteLength);
  const first = view.getFloat64(r.pos, true);
  if (!(Math.abs(first) <= 1.0001)) {
    ar.readObject(r);
  }
  const plane = r.f64s(4);
  let name = "";
  let label = "";
  if (bytesEqual(r.peek(3), STR_MARKER)) {
    name = r.utf16();
    label = r.utf16();
  }
  return { k: "sectionplane", plane, name, label, db };
}
function readSkFont(ar, r) {
  ar.readObject(r, "CAttributeContainer");
  if (ar.hasPid) {
    const mask = r.u8();
    let n = 0;
    for (let bit = 0; bit < 8; bit++) if (mask & 1 << bit) n++;
    r.raw(n);
  }
  r.utf16();
  r.raw(15);
  return { k: "font" };
}
function readDimLinear(ar, r) {
  preamble(ar, r);
  const db = drawbase(ar, r);
  const text = r.utf16();
  if (ar.ver >= 6) ar.readObject(r, "CSkFont");
  r.raw(ar.ver >= 6 ? 37 : 32);
  const c1 = pathRef(ar, r);
  const path1 = connectionPaths(ar, r);
  r.raw(32);
  const c2 = pathRef(ar, r);
  const path2 = connectionPaths(ar, r);
  r.raw(ar.ver >= 6 ? 72 : 68);
  return { k: "dimension", db, text, connect: [c1, c2], paths: [path1, path2] };
}
function textDelimiter(r) {
  let p = r.pos;
  while (true) {
    const idx = findBytes(r.data, STR_MARKER, p, r.pos + 512);
    if (idx < 0) {
      throw new LegacyParseError(`text delimiter not found ${r.ctx()}`);
    }
    const blk = r.data.subarray(idx - 11, idx);
    if (blk[0] === 1 && blk[1] === 0 && blk[2] === 0 && blk[3] === 0 && blk[6] <= 8 && blk[7] === 0 && blk[8] === 0 && blk[9] === 0 && blk[10] === 1) {
      return idx;
    }
    p = idx + 3;
  }
}
function anchoredConnection(data, pos) {
  if (pos + 24 > data.length) return false;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.getUint32(pos + 20, true) !== 4) return false;
  const kind = view.getUint32(pos + 16, true);
  return kind >= 2 && kind <= 15;
}
function readText(ar, r) {
  preamble(ar, r);
  const db = drawbase(ar, r);
  ar.readObject(r, "CSkFont");
  let connect = null;
  let paths = null;
  if (anchoredConnection(r.data, r.pos)) {
    r.raw(16 + 32);
    connect = entityRef(ar, r);
    paths = connectionPaths(ar, r);
  }
  const idx = textDelimiter(r);
  r.raw(idx - r.pos);
  const text = r.utf16();
  r.raw(5);
  const attach = [];
  while (true) {
    const head = r.peek(2);
    if (!(head.length === 2 && head[0] === 255 && head[1] === 127)) break;
    const full = r.peek(6);
    if (full.length < 6) break;
    const dv = new DataView(full.buffer, full.byteOffset, full.byteLength);
    const val = dv.getUint32(2, true);
    if (val & 2147483648) break;
    r.raw(6);
    attach.push(val);
  }
  return { k: "text", text, db, attach, connect, paths };
}
function readEntityList(ar, r, count, owner) {
  const ents = [];
  ar.burnStack.push(0);
  ar.inlineStack.push(/* @__PURE__ */ new Set());
  try {
    readEntityListInner(ar, r, count, owner, ents);
    for (const slot of ar.inlineStack[ar.inlineStack.length - 1]) {
      if (ents.length >= count) break;
      const ent = ar.slots.get(slot);
      ents.push([slot, ent ? ent[1] : null, ent ? ent[2] : null]);
    }
    return ents;
  } finally {
    ar.burnStack.pop();
    ar.inlineStack.pop();
  }
}
function readEntityListInner(ar, r, count, owner, ents) {
  const view = new DataView(r.data.buffer, r.data.byteOffset, r.data.byteLength);
  while (ents.length < count) {
    const p = r.pos;
    const inline = ar.inlineStack.length > 0 ? ar.inlineStack[ar.inlineStack.length - 1] : null;
    if (inline && inline.size > 0 && ents.length + inline.size >= count) {
      const next = ar.peekBackref(r);
      if (next === null || !inline.has(next)) {
        break;
      }
    }
    const hasBurnCredit = owner === "def" && ar.burnStack.length > 0 && ar.burnStack[ar.burnStack.length - 1] > 0;
    if (hasBurnCredit && p + 25 <= r.data.length && view.getUint32(p, true) === 0 && bytesEqual(r.data.subarray(p + 22, p + 25), STR_MARKER)) {
      break;
    }
    const prevFlag = ar.inEntityList;
    ar.inEntityList = true;
    try {
      const [s, n, v] = ar.readObject(r);
      ar.inEntityList = prevFlag;
      inline?.delete(s);
      ents.push([s, n, v]);
    } catch (e) {
      ar.inEntityList = prevFlag;
      if (!(e instanceof LegacyParseError)) {
        throw e;
      }
      if (owner === "root") {
        r.pos = p;
        break;
      }
      if (hasBurnCredit) {
        r.pos = p;
        break;
      }
      throw e;
    }
  }
  return ents;
}
function readDefinition(ar, r) {
  preamble(ar, r);
  r.raw(ar.ver >= 17 ? 22 : ar.ver >= 5 ? 20 : ar.ver >= FIRST_V4 ? 19 : 13);
  const nlayers = r.u32();
  if (nlayers > 1e4) {
    throw new LegacyParseError(`implausible def layer count ${r.ctx()}`);
  }
  let got = 0;
  while (got < nlayers) {
    if (r.peekU16() === 0) {
      r.pos += 2;
      continue;
    }
    ar.readObject(r, "CLayer");
    got += 1;
  }
  if (ar.ver === 19 && nlayers > 0 && r.peekU16() === 0) {
    r.pos += 2;
  }
  const decl = r.u16();
  if (decl === 32767) {
    r.u32();
  }
  let count = null;
  if (ar.ver >= 20) {
    count = retryCountAfterV20Filler(r, r.pos, 5e6, ar);
  }
  if (count === null) {
    r.u32();
    count = r.u32();
  }
  if (count > 5e6 || count === 0) {
    const retry = retryCountAfterV20Filler(r, r.pos - 4, 5e6, ar);
    if (retry !== null) count = retry;
  }
  if (count > 5e6) {
    throw new LegacyParseError(`implausible def entity count ${r.ctx()}`);
  }
  const ents = readEntityList(ar, r, count, "def");
  let nrel = r.u32();
  if (nrel > 1e5) {
    const retry = retryCountAfterV20Filler(r, r.pos - 4, 1e5, ar);
    if (retry !== null) nrel = retry;
  }
  if (nrel > 1e5) {
    throw new LegacyParseError(`definition list misaligned ${r.ctx()}`);
  }
  for (let i = 0; i < nrel; i++) {
    ar.readObject(r, "CRelationship");
  }
  r.u16();
  if (!bytesEqual(r.peek(19).subarray(16, 19), STR_MARKER)) {
    for (let skip = 1; skip <= 4; skip++) {
      const at = r.pos + skip;
      if (bytesEqual(r.data.subarray(at + 16, at + 19), STR_MARKER)) {
        r.pos = at;
        break;
      }
    }
  }
  const guid = r.raw(16);
  const name = r.utf16();
  r.utf16();
  r.utf16();
  r.u32();
  let tpos = null;
  const thumbSlot = ar.classSlot.get("CThumbnail");
  for (let off = 0; off < 96; off++) {
    const p = r.pos + off;
    if (r.data[p] === 255 && r.data[p + 1] === 255 && r.data[p + 4] === 10 && r.data[p + 5] === 0 && matchesAscii(r.data, p + 6, "CThumbnail")) {
      tpos = p;
      break;
    }
    if (thumbSlot !== void 0 && isClassRef(r.data, p, thumbSlot)) {
      tpos = p;
      break;
    }
  }
  if (tpos === null) {
    throw new LegacyParseError(`definition tail: thumbnail not found ${r.ctx()}`);
  }
  const gap = r.raw(tpos - r.pos);
  const behavior = gap.length >= 9 ? gap[gap.length - 9] : 0;
  const isGroup = gap.length >= 4 && (gap[gap.length - 4] | gap[gap.length - 3] << 8 | gap[gap.length - 2] << 16 | gap[gap.length - 1] << 24) === 1;
  ar.readObject(r, "CThumbnail");
  return {
    k: "definition",
    name,
    guid: toHex(guid),
    ents,
    faces_camera: Boolean(behavior & 1),
    shadows_face_sun: Boolean(behavior & 2),
    is_group: isGroup
  };
}
function readInstance(ar, r) {
  const pre = preamble(ar, r);
  const db = drawbase(ar, r);
  const [ds, dn] = ar.readObject(r, "CComponentDefinition");
  if (dn !== "CComponentDefinition") {
    throw new LegacyParseError(`instance definition ref is ${dn} ${r.ctx()}`);
  }
  const xf = r.f64s(13);
  const name = ar.ver >= FIRST_NAMED_INSTANCE || bytesEqual(r.peek(3), STR_MARKER) ? r.utf16() : "";
  const guid = ar.ver >= 14 ? r.raw(16) : new Uint8Array(0);
  return { k: "instance", db, def: ds, xf, name, guid: toHex(guid), attrs: pre.attrs };
}
var READERS = {
  CVertex: readVertex,
  CEdge: readEdge,
  CCurve: readCurve,
  CArcCurve: readArcCurve,
  CEdgeUse: readEdgeUse,
  CLoop: readLoop,
  CFace: readFace,
  CLayer: readLayer,
  CMaterial: readMaterial,
  CDib: readDib,
  CAttributeContainer: readAttrContainer,
  CAttributeNamed: readAttrNamed,
  CCamera: readCamera,
  CThumbnail: readThumbnail,
  CRelationship: readRelationship,
  CComponentDefinition: readDefinition,
  CImage: readImage,
  CComponentInstance: readInstance,
  CGroup: readInstance,
  CFaceTextureCoords: readFtc,
  CConstructionLine: readConstructionLine,
  CConstructionPoint: readConstructionPoint,
  CSectionPlane: readSectionPlane,
  CSkFont: readSkFont,
  CDimensionLinear: readDimLinear,
  CText: readText
};
function isLegacy(data) {
  if (!(data.length >= 4 && data[0] === 255 && data[1] === 254 && data[2] === 255 && data[3] === 14)) {
    return false;
  }
  const head100 = data.subarray(0, Math.min(256, data.length));
  if (findBytes(head100, new Uint8Array([80, 75, 3, 4])) >= 0) {
    return false;
  }
  const head200 = data.subarray(0, Math.min(512, data.length));
  return findBytes(head200, new Uint8Array(asciiBytes("CVersionMap"))) >= 0;
}
var CMATERIAL_PATTERN = [
  255,
  255,
  null,
  null,
  9,
  0,
  ...asciiBytes("CMaterial")
];
var CLAYER_PATTERN = [
  255,
  255,
  null,
  null,
  6,
  0,
  ...asciiBytes("CLayer")
];
function findVersionMajor(data) {
  const head = data.subarray(0, Math.min(96, data.length));
  const stripped = [];
  for (let i = 0; i < head.length; i++) {
    if (head[i] !== 0) stripped.push(head[i]);
  }
  const text = new TextDecoder("latin1").decode(new Uint8Array(stripped));
  const m = text.match(/\{(\d+)\./);
  if (!m) return null;
  return parseInt(m[1], 10);
}
function bootstrapTwoMaterials(data, ver, matHdr) {
  const boot = new Archive(data, ver);
  Object.assign(boot.readers, READERS);
  boot.nextSlot = 1 << 20;
  boot.walkBase = 1 << 20;
  boot.r.pos = matHdr;
  boot.readObject(boot.r, "CMaterial");
  const tag = boot.r.peekU16();
  if (tag === 65535 || !(tag & 32768)) {
    throw new LegacyParseError("cannot bootstrap the slot base");
  }
  return tag & 32767;
}
function probeLayerAnchorBases(data, ver, start, matCount) {
  const boot = new Archive(data, ver);
  Object.assign(boot.readers, READERS);
  const b0 = 1 << 20;
  boot.nextSlot = b0;
  boot.walkBase = b0;
  boot.r.pos = start;
  for (let i = 0; i < matCount; i++) {
    boot.readObject(boot.r, "CMaterial");
  }
  boot.r.u32();
  if (ver >= 17) {
    boot.r.u8();
  }
  let layerCount = 0;
  if (ver >= FIRST_V4) {
    layerCount = boot.r.u32();
    if (!(layerCount >= 1 && layerCount <= 1e5)) {
      throw new LegacyParseError("implausible layer count in base probe");
    }
  }
  const layerSlots = [];
  for (let i = 0; i < layerCount; i++) {
    const [s2] = boot.readObject(boot.r, "CLayer");
    layerSlots.push(s2);
  }
  boot.collectTrailingLayers(layerSlots, null, true);
  const [s, n] = boot.readObject(boot.r);
  if (n !== "premodel") {
    throw new LegacyParseError(`base probe: anchor resolved to ${n}`);
  }
  return layerSlots.map((rel) => s - (rel - b0)).filter((cand) => cand > 0 && cand < b0);
}
function walk(data) {
  const ver = findVersionMajor(data);
  if (ver === null) {
    throw new LegacyParseError("no version string in header");
  }
  const headerView = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const matHdr = findPattern(data, CMATERIAL_PATTERN);
  let start;
  let matCount;
  if (matHdr >= 0) {
    start = matHdr;
    matCount = headerView.getUint32(matHdr - 4, true);
    if (matCount > 1e5) {
      throw new LegacyParseError("implausible material count");
    }
  } else {
    const layerHdr = findPattern(data, CLAYER_PATTERN);
    if (layerHdr < 0) {
      throw new LegacyParseError("no CMaterial or CLayer class record found");
    }
    matCount = 0;
    start = layerHdr - (ver >= 17 ? 9 : 8);
  }
  const bases = matCount >= 2 ? [bootstrapTwoMaterials(data, ver, start)] : probeLayerAnchorBases(data, ver, start, matCount);
  let bestExc = null;
  let bestAt = -1;
  for (const base of bases) {
    try {
      return walkModel(data, ver, start, matCount, base);
    } catch (exc) {
      if (!(exc instanceof LegacyParseError)) throw exc;
      const m = /@0x([0-9a-f]+)/.exec(exc.message);
      const at = m ? parseInt(m[1], 16) : -1;
      if (bestExc === null || at > bestAt) {
        bestExc = exc;
        bestAt = at;
      }
    }
  }
  if (bestExc !== null) throw bestExc;
  throw new LegacyParseError("no viable slot base candidate");
}
var RELEASED_ENTITIES = new Map(
  ["CVertex", "CEdge", "CEdgeUse", "CLoop", "CFace"].map((name) => [name, ["obj", name, null]])
);
function buildAndReleaseDefinition(ar, slot, def) {
  const builder = new LegacyBuilder();
  try {
    fillBuilder(builder, def.ents, ar.slots);
  } catch (e) {
    throw new SkpParseError(`Failed while building component definitions: ${e.message}`, {
      stage: "legacy_defs",
      definitionId: slot,
      cause: e
    });
  }
  ar.prebuilt.set(slot, builder);
  def.ents = [];
  ar.releasedSpans.push([slot + 1, ar.nextSlot]);
  for (let k = slot + 1; k < ar.nextSlot; k++) {
    const ent = ar.slots.get(k);
    if (ent === void 0 || ent[0] !== "obj" || ent[2] === null || ent[1] === null) continue;
    const placeholder = RELEASED_ENTITIES.get(ent[1]);
    if (placeholder !== void 0) ar.slots.set(k, placeholder);
  }
}
function definitionStartsAt(ar, data, at) {
  if (data[at] === 255 && data[at + 1] === 255 && matchesAscii(data.subarray(at, at + 26), 6, "CComponentDefinition")) {
    return true;
  }
  const defCls = ar.classSlot.get("CComponentDefinition");
  return defCls !== void 0 && isClassRef(data, at, defCls);
}
function walkModel(data, ver, start, matCount, base) {
  const ar = new Archive(data, ver);
  Object.assign(ar.readers, READERS);
  ar.nextSlot = base;
  ar.walkBase = base;
  ar.onDefinitionDone = (slot, def) => buildAndReleaseDefinition(ar, slot, def);
  const r = ar.r;
  r.pos = start;
  const materials = [];
  for (let i = 0; i < matCount; i++) {
    const [s, , v] = ar.readObject(r, "CMaterial");
    materials.push([s, v]);
  }
  r.u32();
  if (ver >= 17) {
    r.u8();
  }
  const layerCount = ver < FIRST_V4 ? 2 ** 30 : r.u32();
  if (layerCount > 1e5 && ver >= FIRST_V4) {
    throw new LegacyParseError("implausible layer count");
  }
  const layers = [];
  while (layers.length < layerCount) {
    const tag = r.peekU16();
    if (tag === 0) {
      r.pos += 2;
      continue;
    }
    if (tag !== 65535 && !(tag & 32768)) {
      break;
    }
    const [s, , v] = ar.readObject(r, "CLayer");
    if (v === null) continue;
    layers.push([s, v]);
  }
  ar.collectTrailingLayers(null, layers);
  const [, dn] = ar.readObject(r);
  if (dn !== "CLayer") {
    throw new LegacyParseError(`definition-list anchor is ${dn}, not a layer`);
  }
  let defCount = r.u32();
  if (defCount > 1e6) {
    const retry = retryCountAfterV20Filler(r, r.pos - 4, 1e6, ar);
    if (retry !== null) {
      defCount = retry;
      if (!definitionStartsAt(ar, r.data, r.pos)) {
        defCount = 0;
        r.pos -= 4;
      }
    } else {
      const rootCountAt = findEmptyRootAfterV20Filler(r.data, r.pos - 4);
      if (rootCountAt !== null) {
        defCount = 0;
        r.pos = rootCountAt;
      }
    }
  }
  if (defCount > 1e6) {
    throw new LegacyParseError("implausible definition count");
  }
  for (let i = 0; i < defCount; i++) {
    ar.readObject(r, "CComponentDefinition");
  }
  const defCls = ar.classSlot.get("CComponentDefinition");
  while (true) {
    const tag = r.peekU16();
    let isDef = defCls !== void 0 && tag === (32768 | defCls);
    if (!isDef && tag === 65535 && matchesAscii(r.peek(26), 6, "CComponentDefinition")) {
      isDef = true;
    }
    if (!isDef) break;
    ar.readObject(r);
  }
  let rootCount = r.u32();
  if (rootCount > 5e6) {
    const retry = retryCountAfterV20Filler(r, r.pos - 4, 5e6, ar);
    if (retry !== null) rootCount = retry;
  }
  if (rootCount > 5e6) {
    throw new LegacyParseError("implausible root entity count");
  }
  const root = readEntityList(ar, r, rootCount, "root");
  return { ar, root, layers, materials };
}
var PAGE_DECL_RE = [255, 255, null, 0, 9, 0, 67, 86, 105, 101, 119, 80, 97, 103, 101];
var PAGE_KNOWN_FLAGS = 511;
var RENDERING_OPTIONS_LEN = { 14: 206, 15: 206, 16: 206, 17: 206, 18: 211, 19: 212, 20: 213 };
var PAGE_AXES_LEN = 110;
var PAGE_TRAILER_LEN = 22;
var SHADOW_INFO_FIXED_LEN = 60;
var STYLE_VALUE_SIZES = { 1: 1, 3: 2, 4: 4, 5: 4, 6: 4, 7: 8 };
function findPageDecl(data, from) {
  const n = PAGE_DECL_RE.length;
  for (let i = from; i + n <= data.length; i++) {
    let ok = true;
    for (let j = 0; j < n; j++) {
      const want = PAGE_DECL_RE[j];
      if (want === null) {
        const v = data[i + j];
        if (v !== 12 && v !== 13 && v !== 15) {
          ok = false;
          break;
        }
      } else if (data[i + j] !== want) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}
function readTag(r) {
  const v = r.u16();
  if (v === 0) return ["null", 0];
  if (v === 65535) return ["decl", 0];
  if (v === 32767) {
    const w = r.u32();
    return (w & 2147483648) !== 0 ? ["class", w & 2147483647] : ["obj", w];
  }
  return (v & 32768) !== 0 ? ["class", v & 32767] : ["obj", v];
}
function popcount8(mask) {
  let n = 0;
  for (let bit = 0; bit < 8; bit++) if (mask & 1 << bit) n++;
  return n;
}
function skipPid(r) {
  r.raw(popcount8(r.u8()));
}
var PageClasses = class {
  constructor() {
    // CCamera and CDib are declared in the document prefix; the scene records only refer to them, at
    // the schemas every v6+ file uses.
    this.schema = /* @__PURE__ */ new Map([
      ["CCamera", 5],
      ["CDib", 3]
    ]);
    this.slot = /* @__PURE__ */ new Map();
  }
  /** After a 'decl' or 'class' tag: the declaration's header (if any); returns the schema the
   * object was written with. */
  object(r, kind, slot, name) {
    if (kind === "decl") {
      const schema2 = r.u16();
      const n = r.u16();
      const got = new TextDecoder("ascii").decode(r.raw(n));
      if (n !== name.length || got !== name) {
        throw new LegacyParseError(`expected a ${name} declaration ${r.ctx()}`);
      }
      this.schema.set(name, schema2);
    } else {
      const have = this.slot.get(name);
      if (have === void 0) this.slot.set(name, slot);
      else if (have !== slot) throw new LegacyParseError(`${name} class-ref to another slot ${r.ctx()}`);
    }
    const schema = this.schema.get(name);
    if (schema === void 0) throw new LegacyParseError(`${name} object of an unknown schema ${r.ctx()}`);
    return schema;
  }
};
function readPageCamera(r) {
  const eye = r.f64s(3);
  const target = r.f64s(3);
  const up = r.f64s(3);
  r.f64s(2);
  const perspective = r.u8();
  const fov = r.f64();
  const orthoHeight = r.f64();
  r.raw(137 - 105);
  r.u16();
  r.utf16();
  r.raw(33);
  return { eye, target, up, fov, parallel: perspective === 0, orthoHeight };
}
function skipPageStyle(r, schema) {
  if (r.u16() !== 0) throw new LegacyParseError(`style with attributes ${r.ctx()}`);
  if (schema >= 2) skipPid(r);
  r.raw(16);
  r.utf16();
  r.u32();
  r.utf16();
  r.utf16();
  const n = r.u32();
  for (let i = 0; i < n; i++) {
    r.u32();
    const m = r.u32();
    for (let j = 0; j < m; j++) {
      const size = STYLE_VALUE_SIZES[r.u32()];
      if (size === void 0) throw new LegacyParseError(`unknown style value type ${r.ctx()}`);
      r.raw(size);
    }
  }
}
function readPageRefs(r, n) {
  if (n > Math.floor((r.data.length - r.pos) / 2)) {
    throw new LegacyParseError(`implausible ref count ${n} ${r.ctx()}`);
  }
  const refs = [];
  for (let i = 0; i < n; i++) {
    const [kind, v] = readTag(r);
    if (kind !== "obj") throw new LegacyParseError(`expected a back-ref ${r.ctx()}`);
    refs.push(v);
  }
  return refs;
}
function readPageRecord(ar, r, classes) {
  let [kind, slot] = readTag(r);
  if (kind !== "decl" && kind !== "class") throw new LegacyParseError(`expected a CViewPage record ${r.ctx()}`);
  const schema = classes.object(r, kind, slot, "CViewPage");
  if (r.u16() !== 0) throw new LegacyParseError(`scene with attributes ${r.ctx()}`);
  if (schema >= 13) skipPid(r);
  const page = {
    name: r.utf16(),
    eye: null,
    target: null,
    up: null,
    fov: 35,
    parallel: false,
    orthoHeight: 0,
    hiddenLayerIds: []
  };
  r.utf16();
  const flags = r.u32();
  if (flags & ~PAGE_KNOWN_FLAGS) throw new LegacyParseError(`scene capture flags 0x${flags.toString(16)} ${r.ctx()}`);
  const takeCamera = () => {
    [kind, slot] = readTag(r);
    if (kind === "decl" || kind === "class") {
      classes.object(r, kind, slot, "CCamera");
      const c = readPageCamera(r);
      page.eye = c.eye;
      page.target = c.target;
      page.up = c.up;
      page.fov = c.fov;
      page.parallel = c.parallel;
      page.orthoHeight = c.orthoHeight;
    }
  };
  if (schema >= 15) {
    if (flags & 1) {
      [kind, slot] = readTag(r);
      if (kind !== "decl" && kind !== "class") throw new LegacyParseError(`expected a camera ${r.ctx()}`);
      classes.object(r, kind, slot, "CCamera");
      const c = readPageCamera(r);
      page.eye = c.eye;
      page.target = c.target;
      page.up = c.up;
      page.fov = c.fov;
      page.parallel = c.parallel;
      page.orthoHeight = c.orthoHeight;
    }
  } else {
    takeCamera();
    [kind, slot] = readTag(r);
    if (kind === "decl" || kind === "class") {
      classes.object(r, kind, slot, "CDib");
      readDib(ar, r);
    }
    if (schema >= 13) r.u8();
  }
  if (flags & 2) {
    const base = RENDERING_OPTIONS_LEN[ar.ver];
    if (base === void 0) throw new LegacyParseError(`rendering options of a v${ar.ver} scene`);
    r.raw(base + (schema >= 15 ? 3 : 0));
    [kind, slot] = readTag(r);
    if (kind === "decl" || kind === "class") skipPageStyle(r, classes.object(r, kind, slot, "CSkpStyle"));
  }
  if (flags & 4) {
    r.raw(schema >= 13 ? 3 : 2);
    r.u32();
    r.u8();
    r.utf16();
    r.utf16();
    r.raw(SHADOW_INFO_FIXED_LEN);
  }
  if (flags & 8) r.raw(PAGE_AXES_LEN + (schema >= 13 ? 1 : 0));
  if (flags & 16) {
    r.u8();
    readPageRefs(r, r.u32());
  }
  if (flags & 32) page.hiddenLayerIds = readPageRefs(r, r.u32());
  if (flags & 64) readPageRefs(r, r.u32());
  if (schema >= 15) {
    r.raw(PAGE_TRAILER_LEN - 1);
    return page;
  }
  r.raw(PAGE_TRAILER_LEN);
  const png = r.u32();
  if (png > r.data.length - r.pos) throw new LegacyParseError(`implausible thumbnail length ${png} ${r.ctx()}`);
  r.raw(png);
  return page;
}
function readPageList(data, ar) {
  const start = findPageDecl(data, ar.r.pos);
  if (start < 0) {
    return findBytes(data, new TextEncoder().encode("CViewPage"), ar.r.pos, data.length) >= 0 ? null : [];
  }
  try {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const count = view.getUint32(start - 4, true);
    if (count < 1 || count > 1e4) throw new LegacyParseError(`implausible scene count ${count}`);
    const r = new R(data, start);
    const classes = new PageClasses();
    const pages = [];
    for (let i = 0; i < count; i++) pages.push(readPageRecord(ar, r, classes));
    const [kind] = readTag(r);
    if (kind !== "obj" && kind !== "null") {
      throw new LegacyParseError(`no selected-scene ref after the scenes ${r.ctx()}`);
    }
    for (const page of pages) {
      page.hiddenLayerIds = page.hiddenLayerIds.filter((id) => {
        const ent = ar.slots.get(id);
        return ent !== void 0 && ent[0] === "obj" && ent[1] === "CLayer";
      });
    }
    return pages;
  } catch (e) {
    if (e instanceof LegacyParseError || e instanceof RangeError) return null;
    throw e;
  }
}
var LegacyBuilder = class {
  constructor() {
    this.vertices = new DefaultVertexStore();
    this.edges = new DefaultEdgeStore();
    this.edgeFlags = new EdgeFlagStore();
    this.faces = /* @__PURE__ */ new Map();
    this.instances = [];
    this.sectionPlanes = [];
    this.texts = [];
    this.dimensions = [];
    this.constructionLines = [];
    this.constructionPoints = [];
    this.edgeCurves = /* @__PURE__ */ new Map();
    this.arcCurves = /* @__PURE__ */ new Map();
  }
};
function addEdge(builder, slot, e, slots) {
  if (builder.edges.has(slot)) return;
  const v1 = e.v1;
  const v2 = e.v2;
  for (const vs of [v1, v2]) {
    if (vs === null || vs === void 0) continue;
    const ent = slots.get(vs);
    if (ent !== void 0 && ent[2] !== null && !builder.vertices.has(vs)) {
      const xyz = ent[2].xyz;
      builder.vertices.set(vs, [xyz[0], xyz[1], xyz[2]]);
    }
  }
  builder.edges.set(slot, [v1, v2]);
  const db = e.db || {};
  const flags = (db.soft ? 8 : 0) | (db.smooth ? 16 : 0) | (db.hidden ? 1 : 0);
  if (flags) {
    builder.edgeFlags.set(slot, flags);
  }
  if (e.curve !== null && e.curve !== void 0) {
    builder.edgeCurves.set(slot, e.curve);
    const cv = e.curve_value;
    if (cv && typeof cv === "object" && cv.k === "arccurve") {
      builder.arcCurves.set(e.curve, cv.params);
    }
  }
}
function fillBuilder(builder, ents, slots) {
  for (const [s, , v] of ents) {
    if (v === null || typeof v !== "object") continue;
    const k = v.k;
    if (k === "edge") {
      addEdge(builder, s, v, slots);
    } else if (k === "arccurve") {
      builder.arcCurves.set(s, v.params);
    } else if (k === "face") {
      const loops = [];
      for (const lp of v.loops) {
        const loop = [];
        for (const u of lp.uses) {
          const es = u.edge;
          const ent = slots.get(es);
          if (ent === void 0 || ent[2] === null) continue;
          addEdge(builder, es, ent[2], slots);
          loop.push({ edgeId: es, orientation: u.sense ? -1 : 1 });
        }
        loops.push(loop);
      }
      const face = {
        loops,
        normal: [v.plane[0], v.plane[1], v.plane[2]],
        materialId: v.db.mat || null,
        backMaterialId: v.back_mat || null,
        uvTransform: null,
        uvTransformBack: null,
        uvProjected: false,
        uvProjectedBack: false,
        hidden: Boolean(v.db.hidden)
      };
      const attrs = v.attrs;
      if (attrs && typeof attrs === "object") {
        for (const [, cv] of attrs.children || []) {
          if (cv && typeof cv === "object" && cv.k === "ftc") {
            face.uvTransform = [...cv.front];
            face.uvTransformBack = [...cv.back];
            face.uvProjected = cv.front_projected;
            face.uvProjectedBack = cv.back_projected;
          }
        }
      }
      builder.faces.set(s, face);
    } else if (k === "instance") {
      builder.instances.push({
        offset: 0,
        name: v.name,
        refIdx: v.def,
        refGuid: "",
        matrix: [...v.xf],
        materialId: v.db.mat || null,
        layerId: v.db.layer || null,
        hidden: Boolean(v.db.hidden),
        children: [],
        properties: extractLegacyDynamicProperties(v.attrs)
      });
    } else if (k === "image") {
      builder.instances.push({
        offset: 0,
        name: "",
        refIdx: v.def,
        refGuid: v.guid || "",
        matrix: [...v.xform],
        materialId: v.db.mat || null,
        layerId: v.db.layer || null,
        hidden: Boolean(v.db.hidden),
        children: [],
        properties: {}
      });
    } else if (k === "sectionplane") {
      builder.sectionPlanes.push({
        plane: v.plane || [0, 0, 1, 0],
        name: v.name || "",
        label: v.label || "",
        hidden: Boolean(v.db && v.db.hidden)
      });
    } else if (k === "text") {
      builder.texts.push({
        text: v.text || "",
        hidden: Boolean(v.db && v.db.hidden)
      });
    } else if (k === "dimension") {
      builder.dimensions.push({
        text: v.text || "",
        hidden: Boolean(v.db && v.db.hidden)
      });
    } else if (k === "cline") {
      builder.constructionLines.push({
        point: v.point,
        direction: v.direction,
        start: v.start,
        end: v.end
      });
    } else if (k === "cpoint") {
      builder.constructionPoints.push({
        position: [v.pos[0], v.pos[1], v.pos[2]]
      });
    }
  }
}
function parseLegacyToRaw(data, options) {
  const t0 = Date.now();
  emitLog(options, "info", `Parsing legacy buffer (${data.length} bytes)`);
  let version = "unknown";
  const second = findBytes(data, STR_MARKER, 4);
  if (second > 0) {
    const textBytes = data.subarray(second + 4, Math.min(second + 100, data.length));
    const text = new TextDecoder("utf-16le", { fatal: false }).decode(textBytes);
    const braceStart = text.indexOf("{");
    const braceEnd = text.indexOf("}");
    if (braceStart >= 0 && braceEnd >= 0) {
      version = text.slice(braceStart, braceEnd + 1);
    }
  }
  emitLog(options, "debug", `Detected legacy version ${version}`);
  let walkResult;
  try {
    walkResult = walk(data);
  } catch (e) {
    if (e instanceof LegacyParseError || e instanceof RangeError) {
      throw new SkpParseError(`legacy .skp parse failed: ${e.message}`, {
        stage: "legacy_walk",
        cause: e
      });
    }
    throw e;
  }
  const { ar, root, layers, materials } = walkResult;
  const slots = ar.slots;
  emitLog(options, "debug", `Legacy walk complete: ${materials.length} materials, ${layers.length} layers`);
  const imageDefIds = /* @__PURE__ */ new Set();
  for (const ent of slots.values()) {
    if (ent[0] === "obj" && ent[1] === "CImage" && ent[2]) {
      imageDefIds.add(ent[2].def);
    }
  }
  const materialsMap = /* @__PURE__ */ new Map();
  const materialIdToName = /* @__PURE__ */ new Map();
  for (const [s, v] of materials) {
    const rgba = v.rgba || [128, 128, 128, 255];
    let trans;
    if (v.use_opacity) {
      trans = Math.min(Math.max(1 - v.opacity, 0), 1);
    } else {
      trans = 1;
    }
    const colorized = v.colorized || false;
    let texture = null;
    if ("tex_dib" in v) {
      const dib = v.tex_dib !== null ? slots.get(v.tex_dib) : void 0;
      const texData = dib && dib[2] ? dib[2].data : v.tex_data ?? null;
      const isPng = texData && texData.length >= 4 && texData[0] === 137 && texData[1] === 80 && texData[2] === 78 && texData[3] === 71;
      const ext = isPng ? ".png" : ".jpg";
      const fname = v.tex_file || `${v.name}${ext}`;
      texture = { filename: fname, width: v.tex_w, height: v.tex_h, data: texData };
    }
    const matObj = {
      name: v.name,
      color: { r: rgba[0], g: rgba[1], b: rgba[2], a: rgba[3] },
      transparency: trans,
      id: null,
      texture,
      colorized,
      colorizeType: v.colorize_type ?? 0
    };
    materialsMap.set(v.name, matObj);
    materialIdToName.set(s, v.name);
  }
  const layerColors = /* @__PURE__ */ new Map();
  const layerHidden = /* @__PURE__ */ new Map();
  const layerIdToName = /* @__PURE__ */ new Map();
  for (const [s, v] of layers) {
    const rgba = v.rgba || [136, 136, 136, 255];
    layerColors.set(v.name, [rgba[0], rgba[1], rgba[2]]);
    layerHidden.set(v.name, Boolean(v.hidden));
    layerIdToName.set(s, v.name);
  }
  if (!layerColors.has("Layer0")) {
    layerColors.set("Layer0", [136, 136, 136]);
  }
  if (!layerHidden.has("Layer0")) {
    layerHidden.set("Layer0", false);
  }
  const defsDict = /* @__PURE__ */ new Map();
  let processed = 0;
  let lastSlot;
  try {
    for (const [s, ent] of slots.entries()) {
      lastSlot = s;
      if (ent[0] === "obj" && ent[1] === "CComponentDefinition" && ent[2]) {
        const d = ent[2];
        let b = ar.prebuilt.get(s);
        if (b === void 0) {
          b = new LegacyBuilder();
          fillBuilder(b, d.ents, slots);
        }
        defsDict.set(s, {
          guid: d.guid,
          name: d.name,
          isImage: imageDefIds.has(s),
          isGroup: d.is_group || false,
          alwaysFacesCamera: d.faces_camera || false,
          shadowsFaceSun: d.shadows_face_sun || false,
          builder: b
        });
        processed++;
        if (processed % PROGRESS_INTERVAL === 0) {
          emitProgress(options, "legacy_defs", processed, processed);
          emitLog(options, "debug", `Processed ${processed} component definitions`);
        }
      }
    }
  } catch (e) {
    throw new SkpParseError(`Failed while building component definitions: ${e.message}`, {
      stage: "legacy_defs",
      definitionId: lastSlot,
      cause: e
    });
  }
  const rootBuilder = new LegacyBuilder();
  fillBuilder(rootBuilder, root, slots);
  defsDict.set("ROOT", {
    guid: "ROOT",
    name: "ROOT_MODEL",
    isImage: false,
    isGroup: false,
    alwaysFacesCamera: false,
    shadowsFaceSun: false,
    builder: rootBuilder
  });
  const pages = readPageList(data, ar) ?? [];
  emitLog(
    options,
    "info",
    `Parse complete: ${defsDict.size} defs (${((Date.now() - t0) / 1e3).toFixed(2)}s)`
  );
  return {
    version,
    // Legacy (pre-2021 MFC) files carry no meta/meta.dat container -
    // that's a VFF/ZIP-only construct - so there is no known source for
    // the model's unit-system string here.
    units: null,
    layerColors,
    layerHidden,
    layerIdToName,
    // Scenes come from the scene list in the document tail (see readPageList).
    // Classic files carry no model-level linear dimensions - they surface as
    // text-only dimensions per definition, via each entity list's own
    // CDimensionLinear reads.
    pages,
    dimensions: [],
    materialIdToName,
    materialsMap,
    materialsByFolder: /* @__PURE__ */ new Map(),
    styles: [],
    defsDict
  };
}

// src/pages-dimensions.ts
function tlvItemsInt(buf) {
  if (buf === null) return null;
  const items = [];
  let off = 0;
  const n = buf.length;
  while (off < n) {
    if (off + 6 > n) return null;
    const tag = buf[off] | buf[off + 1] << 8;
    const ln = readU32(buf, off + 2);
    if (tag === 0 || off + 6 + ln > n) return null;
    items.push({ tag, payload: buf.subarray(off + 6, off + 6 + ln) });
    off += 6 + ln;
  }
  return items;
}
function tlvFindInt(items, tag) {
  if (items === null) return null;
  for (const it of items) {
    if (it.tag === tag) return it.payload;
  }
  return null;
}
function toHex2(data) {
  let s = "";
  for (let i = 0; i < data.length; i++) {
    const h = data[i].toString(16).toUpperCase();
    s += h.length === 1 ? "0" + h : h;
  }
  return s;
}
function stripDe05(p) {
  if (p.length >= 2 && p[0] === 222 && p[1] === 5) {
    const idlen = readU32(p, 2);
    return p.subarray(6, 6 + idlen);
  }
  return p;
}
function findBytes2(data, needle, start = 0) {
  const nlen = needle.length;
  const limit = data.length - nlen;
  outer: for (let i = start; i <= limit; i++) {
    for (let j = 0; j < nlen; j++) {
      if (data[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}
function scanVertexPositions(top, id2pos) {
  function walk2(nodes) {
    for (const el of nodes) {
      if (el.tag === "C409") {
        const dc05 = findChildTag(el.children, "DC05");
        const c509 = findChildTag(el.children, "C509");
        if (dc05 && c509 && c509.payload.length === 24) {
          const idb = stripDe05(dc05.payload);
          id2pos.set(toHex2(idb), [
            readF64(c509.payload, 0),
            readF64(c509.payload, 8),
            readF64(c509.payload, 16)
          ]);
        }
      }
      if (el.children.length > 0) walk2(el.children);
    }
  }
  walk2([top]);
}
function scanInstanceTransforms(top, world) {
  function walk2(nodes, parent) {
    for (const el of nodes) {
      if (el.tag === "6419") {
        const d007 = findChildTag(el.children, "D007");
        const dc05 = d007 ? findChildTag(d007.children, "DC05") : null;
        const iid = dc05 ? toHex2(stripDe05(dc05.payload)) : null;
        const m = findChildTag(el.children, "6619");
        let mat = null;
        if (m && m.payload.length === 104) {
          mat = [];
          for (let i = 0; i < 13; i++) mat.push(readF64(m.payload, i * 8));
        }
        const here = mat !== null ? multiplyMatrices(parent, mat) : parent;
        if (iid !== null) world.set(iid, here);
        walk2(el.children, here);
      } else if (el.children.length > 0) {
        walk2(el.children, parent);
      }
    }
  }
  walk2([top], null);
}
function parseDimensions(modelData, id2pos, instWorld) {
  const dims = [];
  const needle = new Uint8Array([204, 91]);
  let i = 0;
  const n = modelData.length;
  function point(blockPayload) {
    if (blockPayload === null) return null;
    const blk = tlvFindInt(tlvItemsInt(blockPayload), 21e3);
    if (blk === null) return null;
    const sub = tlvItemsInt(blk);
    const typB = tlvFindInt(sub, 21001);
    const typ = typB !== null && typB.length === 4 ? readU32(typB, 0) : null;
    if (typ === 1) {
      const pos = tlvFindInt(sub, 21002);
      if (pos === null || pos.length !== 24) return null;
      return [readF64(pos, 0), readF64(pos, 8), readF64(pos, 16)];
    }
    const refB = tlvFindInt(sub, 21003);
    const f53fc = refB !== null ? tlvFindInt(tlvItemsInt(refB), 21500) : null;
    const fi = f53fc !== null ? tlvItemsInt(f53fc) : null;
    const vid = tlvFindInt(fi, 21501);
    const iid = tlvFindInt(fi, 21502);
    if (vid === null) return null;
    const local = id2pos.get(toHex2(vid));
    if (local === void 0) return null;
    if (iid !== null && iid.length >= 1 && iid[0] > 0 && 1 + iid[0] <= iid.length) {
      const idBytes = iid.subarray(1, 1 + iid[0]);
      const w = instWorld.get(toHex2(idBytes));
      if (w) {
        return transformPoint(w, local);
      }
    }
    return local;
  }
  while (true) {
    const j = findBytes2(modelData, needle, i);
    if (j < 0) break;
    i = j + 1;
    if (j + 6 > n) continue;
    const ln = readU32(modelData, j + 2);
    if (ln < 40 || j + 6 + ln > n) continue;
    const bodyBytes = modelData.subarray(j + 6, j + 6 + ln);
    const body = tlvItemsInt(bodyBytes);
    if (body === null) continue;
    let has5Bcd = false;
    let has5Bce = false;
    for (const it of body) {
      if (it.tag === 23501) has5Bcd = true;
      if (it.tag === 23502) has5Bce = true;
    }
    if (!has5Bcd || !has5Bce) continue;
    const a = point(tlvFindInt(body, 23501));
    const b = point(tlvFindInt(body, 23502));
    if (a === null || b === null) continue;
    const xaxisB = tlvFindInt(body, 23503);
    const normalB = tlvFindInt(body, 23504);
    const offB = tlvFindInt(body, 23506);
    dims.push({
      a,
      b,
      planeX: xaxisB !== null && xaxisB.length === 24 ? [readF64(xaxisB, 0), readF64(xaxisB, 8), readF64(xaxisB, 16)] : null,
      normal: normalB !== null && normalB.length === 24 ? [readF64(normalB, 0), readF64(normalB, 8), readF64(normalB, 16)] : null,
      offset: offB !== null && offB.length === 8 ? readF64(offB, 0) : 0,
      text: ""
    });
  }
  return dims;
}
function findPageNode(top) {
  return findChildTag([top], "0702");
}
function parsePages(node) {
  const pages = [];
  if (node === null) return pages;
  function vec3(p) {
    return p !== null && p.length === 24 ? [readF64(p, 0), readF64(p, 8), readF64(p, 16)] : null;
  }
  const t60Items = tlvItemsInt(node.payload);
  if (t60Items === null) return pages;
  for (const it60 of t60Items) {
    if (it60.tag !== 28e3) continue;
    const t61Items = tlvItemsInt(it60.payload);
    if (t61Items === null) continue;
    for (const it61 of t61Items) {
      if (it61.tag !== 28001) continue;
      const t48Items = tlvItemsInt(it61.payload);
      if (t48Items === null) continue;
      for (const it48 of t48Items) {
        if (it48.tag !== 29e3) continue;
        const items = tlvItemsInt(it48.payload);
        if (items === null) continue;
        const page = {
          name: "",
          eye: null,
          target: null,
          up: null,
          fov: 35,
          parallel: false,
          orthoHeight: 0,
          hiddenLayerIds: []
        };
        const head = tlvItemsInt(tlvFindInt(items, 28500));
        const name = tlvFindInt(head, 28501);
        if (name !== null && name.length > 0) {
          page.name = new TextDecoder("utf-8").decode(name);
        }
        const camWrap = tlvItemsInt(tlvFindInt(items, 29002));
        const cam = camWrap !== null ? tlvItemsInt(tlvFindInt(camWrap, 13500)) : null;
        if (cam !== null) {
          page.eye = vec3(tlvFindInt(cam, 13501));
          page.target = vec3(tlvFindInt(cam, 13502));
          page.up = vec3(tlvFindInt(cam, 13503));
          const fov = tlvFindInt(cam, 13508);
          if (fov !== null && fov.length === 8) page.fov = readF64(fov, 0);
          const flag = tlvFindInt(cam, 13506);
          page.parallel = flag !== null && flag.length > 0 && flag[0] === 0;
          const height = tlvFindInt(cam, 13507);
          if (height !== null && height.length === 8) page.orthoHeight = readF64(height, 0);
        }
        const hidden = tlvFindInt(items, 29008);
        let off = 0;
        while (hidden !== null && off + 1 <= hidden.length) {
          const ln = hidden[off];
          if (ln === 0 || off + 1 + ln > hidden.length) break;
          page.hiddenLayerIds.push(parseVarInt(hidden, off + 1, ln));
          off += 1 + ln;
        }
        pages.push(page);
      }
    }
  }
  return pages;
}

// src/gltf-indices.ts
var UINT16_INDEX_LIMIT = 65535;
var COMPONENT_TYPE_UNSIGNED_SHORT = 5123;
var COMPONENT_TYPE_UNSIGNED_INT = 5125;
function encodeIndices(indices) {
  let max = 0;
  for (let i = 0; i < indices.length; i++) {
    if (indices[i] > max) max = indices[i];
  }
  if (max <= UINT16_INDEX_LIMIT) {
    const narrowed = new Uint16Array(indices.length);
    narrowed.set(indices);
    return {
      componentType: COMPONENT_TYPE_UNSIGNED_SHORT,
      data: narrowed,
      bytesPerIndex: 2
    };
  }
  return {
    componentType: COMPONENT_TYPE_UNSIGNED_INT,
    data: indices,
    bytesPerIndex: 4
  };
}

// src/instanced.ts
function buildInstancedSceneFromParsed(parsed, options) {
  const t0 = Date.now();
  const { layerColors, layerIdToName, materialIdToName, materialsMap, materialsByFolder, defsDict, layerHidden } = parsed;
  emitLog(options, "info", `Building instanced scene: ${defsDict.size} definitions available`);
  const instanceCounter = { count: 0 };
  const getLayerColor = (name) => {
    const c = layerColors.get(name) || [136, 136, 136];
    return { r: c[0], g: c[1], b: c[2] };
  };
  const textures = [];
  const textureIndexByKey = /* @__PURE__ */ new Map();
  function textureIndexFor(tex) {
    if (!tex || !tex.data || tex.data.length === 0) return null;
    const mimeType = sniffImageMime(tex.data);
    if (mimeType === null) return null;
    const head = Array.from(tex.data.subarray(0, 16)).join(",");
    const key = `${tex.data.length}:${head}`;
    const hit = textureIndexByKey.get(key);
    if (hit !== void 0) return hit;
    const idx = textures.length;
    textures.push({ data: tex.data, mimeType, filename: tex.filename });
    textureIndexByKey.set(key, idx);
    return idx;
  }
  const colorToMaterialIndex = /* @__PURE__ */ new Map();
  const gltfMaterials = [];
  function getMaterialIndex(color, doubleSided, textureIndex, transparency = 1) {
    const key = `${color.r},${color.g},${color.b},${doubleSided},${textureIndex ?? -1},${transparency}`;
    if (colorToMaterialIndex.has(key)) {
      return colorToMaterialIndex.get(key);
    }
    const idx = gltfMaterials.length;
    const pbr = {
      baseColorFactor: [color.r / 255, color.g / 255, color.b / 255, transparency],
      metallicFactor: 0,
      roughnessFactor: 0.8
    };
    if (textureIndex !== null) {
      pbr.baseColorTexture = { index: textureIndex };
    }
    const material = { pbrMetallicRoughness: pbr };
    if (doubleSided) material.doubleSided = true;
    if (transparency < 1) {
      material.alphaMode = "BLEND";
    } else if (textureIndex !== null) {
      material.alphaMode = "MASK";
    }
    gltfMaterials.push(material);
    colorToMaterialIndex.set(key, idx);
    return idx;
  }
  const meshResources = [];
  const resourceIdByKey = /* @__PURE__ */ new Map();
  function resourceVariantKey(defId, inheritedMaterial, layer) {
    const tex = inheritedMaterial?.texture;
    const texKey = tex && tex.data && tex.data.length > 0 ? `${tex.data.length}:${Array.from(tex.data.subarray(0, 16)).join(",")}:${tex.width}x${tex.height}` : "-";
    const matKey = inheritedMaterial ? `${inheritedMaterial.name}|${inheritedMaterial.color.r},${inheritedMaterial.color.g},${inheritedMaterial.color.b}|${texKey}` : "-";
    const lc = getLayerColor(layer);
    return `${String(defId)}|${matKey}|${lc.r},${lc.g},${lc.b}`;
  }
  function meshResourceFor(defId, inheritedMaterial, layer) {
    const d = defsDict.get(defId);
    if (!d || d.builder.faces.size === 0) return void 0;
    const key = resourceVariantKey(defId, inheritedMaterial, layer);
    const hit = resourceIdByKey.get(key);
    if (hit !== void 0) return hit;
    const faceGroups = buildLocalFaceGroups(d.builder, {
      resolveMaterial: (matId) => resolveMaterialFromMaps(matId, materialIdToName, materialsMap, materialsByFolder),
      textureIndexFor,
      inheritedMaterial,
      fallbackLayerColor: getLayerColor(layer),
      definitionId: defId,
      respectVisibility: options?.respectEdgeVisibility,
      frontSideOnly: options?.frontSideOnly
    });
    const primitives = [];
    const scale = 0.0254;
    for (const group of faceGroups.values()) {
      if (group.localFaces.length === 0) continue;
      const positions = new Float32Array(group.localVerts.length * 3);
      const normals = new Float32Array(group.localVerts.length * 3);
      const uvs = new Float32Array(group.localVerts.length * 2);
      for (let i = 0; i < group.localVerts.length; i++) {
        const v = group.localVerts[i];
        positions[i * 3] = v[0] * scale;
        positions[i * 3 + 1] = v[2] * scale;
        positions[i * 3 + 2] = -v[1] * scale;
        uvs[i * 2] = group.localUvs[i][0];
        uvs[i * 2 + 1] = group.localUvs[i][1];
        const rawNorm = group.normalsAccum[i];
        const normLen = Math.sqrt(rawNorm[0] ** 2 + rawNorm[1] ** 2 + rawNorm[2] ** 2);
        const n = normLen > 1e-6 ? [rawNorm[0] / normLen, rawNorm[1] / normLen, rawNorm[2] / normLen] : [0, 0, 1];
        normals[i * 3] = n[0];
        normals[i * 3 + 1] = n[2];
        normals[i * 3 + 2] = -n[1];
      }
      const indices = new Uint32Array(group.localFaces.length * 3);
      for (let i = 0; i < group.localFaces.length; i++) {
        indices[i * 3] = group.localFaces[i][0];
        indices[i * 3 + 1] = group.localFaces[i][1];
        indices[i * 3 + 2] = group.localFaces[i][2];
      }
      primitives.push({
        positions,
        normals,
        uvs,
        indices,
        materialIndex: getMaterialIndex(group.color, group.doubleSided, group.textureIndex, group.transparency)
      });
    }
    if (primitives.length === 0) return void 0;
    const id = `mesh_${meshResources.length}`;
    meshResources.push({
      id,
      definitionId: defId,
      definitionName: d.name || "",
      variantKey: key,
      primitives
    });
    resourceIdByKey.set(key, id);
    return id;
  }
  const activeDefinitions = /* @__PURE__ */ new Set();
  function toGltfMatrix(raw) {
    const scale = 0.0254;
    const m = foldScale(raw);
    const a = m[0], b = m[1], c = m[2];
    const d = m[3], e = m[4], f = m[5];
    const g = m[6], h = m[7], i = m[8];
    const tx = m[9] ?? 0, ty = m[10] ?? 0, tz = m[11] ?? 0;
    const r00 = a, r01 = c, r02 = -b;
    const r10 = g, r11 = i, r12 = -h;
    const r20 = -d, r21 = -f, r22 = e;
    return [
      r00,
      r10,
      r20,
      0,
      r01,
      r11,
      r21,
      0,
      r02,
      r12,
      r22,
      0,
      tx * scale,
      tz * scale,
      -ty * scale,
      1
    ];
  }
  const IDENTITY_GLTF = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  function walk2(defId, currentMatrix, parentLayer, inheritedMaterial) {
    const d = defsDict.get(defId);
    if (!d) return [];
    const nodes = [];
    for (const inst of d.builder.instances) {
      const refIdx = inst.refIdx;
      const newMatrix = multiplyMatrices(currentMatrix, inst.matrix);
      let lName = parentLayer;
      let ownLayer;
      let instMaterial = inheritedMaterial;
      let properties = { ...inst.properties || {} };
      if (inst.layerId !== null && inst.layerId !== void 0) {
        ownLayer = layerIdToName.get(inst.layerId);
        lName = ownLayer || parentLayer;
      }
      if (inst.materialId !== null && inst.materialId !== void 0) {
        const matName = materialIdToName.get(inst.materialId);
        if (matName) {
          const mat = materialsMap.get(matName) || materialsByFolder.get(matName);
          if (mat) {
            instMaterial = mat;
          }
        }
      }
      const d007 = inst.children.find((c) => c.tag === "D007");
      let attributeDicts = null;
      if (d007) {
        try {
          properties = extractDynamicProperties(d007, options);
          attributeDicts = extractAttributeDictionaries(d007, options);
        } catch (e) {
          emitLog(
            options,
            "debug",
            `Failed to extract dynamic properties for instance ${inst.name ?? ""} (refIdx=${refIdx}): ${e.message}`
          );
        }
      }
      instanceCounter.count++;
      if (instanceCounter.count % PROGRESS_INTERVAL === 0) {
        emitProgress(options, "build_scene", instanceCounter.count, instanceCounter.count);
        emitLog(options, "debug", `Processed ${instanceCounter.count} placed instances`);
      }
      if (activeDefinitions.has(refIdx)) {
        throw new SkpParseError("Recursive component definition", {
          stage: "build_scene",
          definitionId: refIdx
        });
      }
      activeDefinitions.add(refIdx);
      const children = walk2(refIdx, newMatrix, lName, instMaterial);
      activeDefinitions.delete(refIdx);
      const tx = (newMatrix[9] ?? 0) * 25.4;
      const ty = (newMatrix[10] ?? 0) * 25.4;
      const tz = (newMatrix[11] ?? 0) * 25.4;
      const childDefName = defsDict.get(refIdx)?.name || "";
      const defNameIsReal = !!childDefName && !isGenericDefinitionName(childDefName);
      const nameOverride = findNameOverride(attributeDicts);
      const instNameNonEmpty = !!inst.name;
      const fallbackName = instNameNonEmpty ? inst.name : defNameIsReal ? childDefName : `Component_${refIdx}`;
      const displayName = nameOverride ?? fallbackName;
      const nameIsGenerated = nameOverride === null && !instNameNonEmpty && !defNameIsReal;
      const attributeDictionaries = {};
      if (attributeDicts) {
        for (const dictName of Object.keys(attributeDicts)) {
          if (dictName === "dynamic_attributes" || dictName === "SU_InstanceSet") continue;
          const entries = attributeDicts[dictName];
          const stringified = {};
          for (const key of Object.keys(entries)) stringified[key] = stringifyVffAttrValue(entries[key]);
          attributeDictionaries[dictName] = stringified;
        }
      }
      nodes.push({
        name: displayName,
        nameIsGenerated,
        definitionName: childDefName,
        layer: lName,
        ...ownLayer ? { ownLayer } : {},
        matrix: toGltfMatrix(inst.matrix),
        positionMm: [
          Math.round(tx * 100) / 100,
          Math.round(ty * 100) / 100,
          Math.round(tz * 100) / 100
        ],
        properties,
        attributeDictionaries,
        guid: inst.refGuid || "",
        meshResourceId: meshResourceFor(refIdx, instMaterial, lName),
        children
      });
    }
    return nodes;
  }
  const identityMat = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
  const rootChildren = walk2("ROOT", identityMat, "Layer0", void 0);
  const rootMeshResourceId = meshResourceFor("ROOT", void 0, "Layer0");
  const sceneHierarchy = {
    name: "ROOT",
    nameIsGenerated: false,
    definitionName: "ROOT_MODEL",
    layer: "Layer0",
    matrix: [...IDENTITY_GLTF],
    positionMm: [0, 0, 0],
    properties: {},
    attributeDictionaries: {},
    guid: "",
    meshResourceId: rootMeshResourceId,
    children: rootChildren
  };
  const bMin = [Infinity, Infinity, Infinity];
  const bMax = [-Infinity, -Infinity, -Infinity];
  const resourceById = new Map(meshResources.map((r) => [r.id, r]));
  const localBoxCache = /* @__PURE__ */ new Map();
  const localBox = (id) => {
    const cached = localBoxCache.get(id);
    if (cached !== void 0) return cached;
    const res = resourceById.get(id);
    let box = null;
    if (res) {
      const lo = [Infinity, Infinity, Infinity];
      const hi = [-Infinity, -Infinity, -Infinity];
      for (const prim of res.primitives) {
        for (let i = 0; i < prim.positions.length; i += 3) {
          for (let k = 0; k < 3; k++) {
            const v = prim.positions[i + k];
            if (v < lo[k]) lo[k] = v;
            if (v > hi[k]) hi[k] = v;
          }
        }
      }
      if (Number.isFinite(lo[0])) box = { min: lo, max: hi };
    }
    localBoxCache.set(id, box);
    return box;
  };
  const mul4 = (a, b) => {
    const out = new Array(16).fill(0);
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 4; row++) {
        let acc = 0;
        for (let k = 0; k < 4; k++) acc += a[k * 4 + row] * b[col * 4 + k];
        out[col * 4 + row] = acc;
      }
    }
    return out;
  };
  const accumulate = (node, parent) => {
    const world = mul4(parent, node.matrix);
    if (node.meshResourceId !== void 0) {
      const box = localBox(node.meshResourceId);
      if (box) {
        for (let c = 0; c < 8; c++) {
          const x = c & 1 ? box.max[0] : box.min[0];
          const y = c & 2 ? box.max[1] : box.min[1];
          const z = c & 4 ? box.max[2] : box.min[2];
          const wx = world[0] * x + world[4] * y + world[8] * z + world[12];
          const wy = world[1] * x + world[5] * y + world[9] * z + world[13];
          const wz = world[2] * x + world[6] * y + world[10] * z + world[14];
          if (wx < bMin[0]) bMin[0] = wx;
          if (wy < bMin[1]) bMin[1] = wy;
          if (wz < bMin[2]) bMin[2] = wz;
          if (wx > bMax[0]) bMax[0] = wx;
          if (wy > bMax[1]) bMax[1] = wy;
          if (wz > bMax[2]) bMax[2] = wz;
        }
      }
    }
    for (const child of node.children) accumulate(child, world);
  };
  accumulate(sceneHierarchy, [...IDENTITY_GLTF]);
  const bounds = Number.isFinite(bMin[0]) ? {
    min: [bMin[0], bMin[1], bMin[2]],
    max: [bMax[0], bMax[1], bMax[2]],
    size: [bMax[0] - bMin[0], bMax[1] - bMin[1], bMax[2] - bMin[2]],
    center: [(bMin[0] + bMax[0]) / 2, (bMin[1] + bMax[1]) / 2, (bMin[2] + bMax[2]) / 2]
  } : null;
  emitLog(
    options,
    "info",
    `Instanced scene build complete: ${instanceCounter.count} instances, ${meshResources.length} mesh resources (${((Date.now() - t0) / 1e3).toFixed(2)}s)`
  );
  return { sceneHierarchy, meshResources, gltfMaterials, textures, bounds, layerHidden: Object.fromEntries(layerHidden), layerColors: Object.fromEntries(layerColors) };
}

// src/thumbnail.ts
var THUMBNAIL_ENTRIES = [
  { name: "meta/model_thumbnail.png", source: "model" },
  { name: "meta/preview_thumbnail.png", source: "preview" }
];
function readPngSize(data) {
  if (data.length < 24) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width === 0 || height === 0) return null;
  return { width, height };
}
function extractThumbnail(buffer, options) {
  const data = new Uint8Array(buffer);
  if (!(data.length >= 4 && data[0] === 255 && data[1] === 254 && data[2] === 255 && data[3] === 14)) {
    throw new SkpParseError("Not a valid SketchUp file (bad header magic)", { stage: "header" });
  }
  if (isLegacy(data)) {
    emitLog(options, "debug", "Legacy container: no named thumbnail entry available");
    return null;
  }
  let contents;
  try {
    contents = extractSkpContents(data, options);
  } catch (e) {
    throw new SkpParseError(`Failed to extract SKP contents: ${e.message}`, {
      stage: "zip_extract",
      cause: e
    });
  }
  for (const { name, source } of THUMBNAIL_ENTRIES) {
    const bytes = contents.materialFiles[name];
    if (!bytes || bytes.length === 0) continue;
    const mimeType = sniffImageMime(bytes);
    if (mimeType === null) {
      emitLog(options, "debug", `${name} is not a PNG or JPEG; skipping`);
      continue;
    }
    const size = mimeType === "image/png" ? readPngSize(bytes) : null;
    if (!size) {
      emitLog(options, "debug", `${name} has no readable image header; skipping`);
      continue;
    }
    return { data: bytes, mimeType, width: size.width, height: size.height, source };
  }
  emitLog(options, "debug", "No thumbnail entry found in container");
  return null;
}

// src/fragments.ts
var flatbuffers15 = __toESM(require("flatbuffers"));
var fflate = __toESM(require("fflate"));

// src/_fragments_fb/openskp/fragments-fb/attribute.ts
var flatbuffers = __toESM(require("flatbuffers"));
var Attribute = class _Attribute {
  constructor() {
    this.bb = null;
    this.bb_pos = 0;
  }
  __init(i, bb) {
    this.bb_pos = i;
    this.bb = bb;
    return this;
  }
  static getRootAsAttribute(bb, obj) {
    return (obj || new _Attribute()).__init(bb.readInt32(bb.position()) + bb.position(), bb);
  }
  static getSizePrefixedRootAsAttribute(bb, obj) {
    bb.setPosition(bb.position() + flatbuffers.SIZE_PREFIX_LENGTH);
    return (obj || new _Attribute()).__init(bb.readInt32(bb.position()) + bb.position(), bb);
  }
  data(index, optionalEncoding) {
    const offset = this.bb.__offset(this.bb_pos, 4);
    return offset ? this.bb.__string(this.bb.__vector(this.bb_pos + offset) + index * 4, optionalEncoding) : null;
  }
  dataLength() {
    const offset = this.bb.__offset(this.bb_pos, 4);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  static startAttribute(builder) {
    builder.startObject(1);
  }
  static addData(builder, dataOffset) {
    builder.addFieldOffset(0, dataOffset, 0);
  }
  static createDataVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addOffset(data[i]);
    }
    return builder.endVector();
  }
  static startDataVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static endAttribute(builder) {
    const offset = builder.endObject();
    builder.requiredField(offset, 4);
    return offset;
  }
  static createAttribute(builder, dataOffset) {
    _Attribute.startAttribute(builder);
    _Attribute.addData(builder, dataOffset);
    return _Attribute.endAttribute(builder);
  }
};

// src/_fragments_fb/openskp/fragments-fb/axis.ts
var flatbuffers3 = __toESM(require("flatbuffers"));

// src/_fragments_fb/openskp/fragments-fb/float-vector.ts
var FloatVector = class {
  constructor() {
    this.bb = null;
    this.bb_pos = 0;
  }
  __init(i, bb) {
    this.bb_pos = i;
    this.bb = bb;
    return this;
  }
  x() {
    return this.bb.readFloat32(this.bb_pos);
  }
  y() {
    return this.bb.readFloat32(this.bb_pos + 4);
  }
  z() {
    return this.bb.readFloat32(this.bb_pos + 8);
  }
  static sizeOf() {
    return 12;
  }
  static createFloatVector(builder, x, y, z) {
    builder.prep(4, 12);
    builder.writeFloat32(z);
    builder.writeFloat32(y);
    builder.writeFloat32(x);
    return builder.offset();
  }
};

// src/_fragments_fb/openskp/fragments-fb/circle-curve.ts
var CircleCurve = class {
  constructor() {
    this.bb = null;
    this.bb_pos = 0;
  }
  __init(i, bb) {
    this.bb_pos = i;
    this.bb = bb;
    return this;
  }
  aperture() {
    return this.bb.readFloat32(this.bb_pos);
  }
  position(obj) {
    return (obj || new FloatVector()).__init(this.bb_pos + 4, this.bb);
  }
  radius() {
    return this.bb.readFloat32(this.bb_pos + 16);
  }
  xDirection(obj) {
    return (obj || new FloatVector()).__init(this.bb_pos + 20, this.bb);
  }
  yDirection(obj) {
    return (obj || new FloatVector()).__init(this.bb_pos + 32, this.bb);
  }
  static sizeOf() {
    return 44;
  }
  static createCircleCurve(builder, aperture, position_x, position_y, position_z, radius, x_direction_x, x_direction_y, x_direction_z, y_direction_x, y_direction_y, y_direction_z) {
    builder.prep(4, 44);
    builder.prep(4, 12);
    builder.writeFloat32(y_direction_z);
    builder.writeFloat32(y_direction_y);
    builder.writeFloat32(y_direction_x);
    builder.prep(4, 12);
    builder.writeFloat32(x_direction_z);
    builder.writeFloat32(x_direction_y);
    builder.writeFloat32(x_direction_x);
    builder.writeFloat32(radius);
    builder.prep(4, 12);
    builder.writeFloat32(position_z);
    builder.writeFloat32(position_y);
    builder.writeFloat32(position_x);
    builder.writeFloat32(aperture);
    return builder.offset();
  }
};

// src/_fragments_fb/openskp/fragments-fb/wire.ts
var Wire = class {
  constructor() {
    this.bb = null;
    this.bb_pos = 0;
  }
  __init(i, bb) {
    this.bb_pos = i;
    this.bb = bb;
    return this;
  }
  p1(obj) {
    return (obj || new FloatVector()).__init(this.bb_pos, this.bb);
  }
  p2(obj) {
    return (obj || new FloatVector()).__init(this.bb_pos + 12, this.bb);
  }
  static sizeOf() {
    return 24;
  }
  static createWire(builder, p1_x, p1_y, p1_z, p2_x, p2_y, p2_z) {
    builder.prep(4, 24);
    builder.prep(4, 12);
    builder.writeFloat32(p2_z);
    builder.writeFloat32(p2_y);
    builder.writeFloat32(p2_x);
    builder.prep(4, 12);
    builder.writeFloat32(p1_z);
    builder.writeFloat32(p1_y);
    builder.writeFloat32(p1_x);
    return builder.offset();
  }
};

// src/_fragments_fb/openskp/fragments-fb/wire-set.ts
var flatbuffers2 = __toESM(require("flatbuffers"));
var WireSet = class _WireSet {
  constructor() {
    this.bb = null;
    this.bb_pos = 0;
  }
  __init(i, bb) {
    this.bb_pos = i;
    this.bb = bb;
    return this;
  }
  static getRootAsWireSet(bb, obj) {
    return (obj || new _WireSet()).__init(bb.readInt32(bb.position()) + bb.position(), bb);
  }
  static getSizePrefixedRootAsWireSet(bb, obj) {
    bb.setPosition(bb.position() + flatbuffers2.SIZE_PREFIX_LENGTH);
    return (obj || new _WireSet()).__init(bb.readInt32(bb.position()) + bb.position(), bb);
  }
  ps(index, obj) {
    const offset = this.bb.__offset(this.bb_pos, 4);
    return offset ? (obj || new FloatVector()).__init(this.bb.__vector(this.bb_pos + offset) + index * 12, this.bb) : null;
  }
  psLength() {
    const offset = this.bb.__offset(this.bb_pos, 4);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  static startWireSet(builder) {
    builder.startObject(1);
  }
  static addPs(builder, psOffset) {
    builder.addFieldOffset(0, psOffset, 0);
  }
  static startPsVector(builder, numElems) {
    builder.startVector(12, numElems, 4);
  }
  static endWireSet(builder) {
    const offset = builder.endObject();
    return offset;
  }
  static createWireSet(builder, psOffset) {
    _WireSet.startWireSet(builder);
    _WireSet.addPs(builder, psOffset);
    return _WireSet.endWireSet(builder);
  }
};

// src/_fragments_fb/openskp/fragments-fb/axis.ts
var Axis = class _Axis {
  constructor() {
    this.bb = null;
    this.bb_pos = 0;
  }
  __init(i, bb) {
    this.bb_pos = i;
    this.bb = bb;
    return this;
  }
  static getRootAsAxis(bb, obj) {
    return (obj || new _Axis()).__init(bb.readInt32(bb.position()) + bb.position(), bb);
  }
  static getSizePrefixedRootAsAxis(bb, obj) {
    bb.setPosition(bb.position() + flatbuffers3.SIZE_PREFIX_LENGTH);
    return (obj || new _Axis()).__init(bb.readInt32(bb.position()) + bb.position(), bb);
  }
  wires(index, obj) {
    const offset = this.bb.__offset(this.bb_pos, 4);
    return offset ? (obj || new Wire()).__init(this.bb.__vector(this.bb_pos + offset) + index * 24, this.bb) : null;
  }
  wiresLength() {
    const offset = this.bb.__offset(this.bb_pos, 4);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  order(index) {
    const offset = this.bb.__offset(this.bb_pos, 6);
    return offset ? this.bb.readUint32(this.bb.__vector(this.bb_pos + offset) + index * 4) : 0;
  }
  orderLength() {
    const offset = this.bb.__offset(this.bb_pos, 6);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  orderArray() {
    const offset = this.bb.__offset(this.bb_pos, 6);
    return offset ? new Uint32Array(this.bb.bytes().buffer, this.bb.bytes().byteOffset + this.bb.__vector(this.bb_pos + offset), this.bb.__vector_len(this.bb_pos + offset)) : null;
  }
  parts(index) {
    const offset = this.bb.__offset(this.bb_pos, 8);
    return offset ? this.bb.readInt8(this.bb.__vector(this.bb_pos + offset) + index) : null;
  }
  partsLength() {
    const offset = this.bb.__offset(this.bb_pos, 8);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  partsArray() {
    const offset = this.bb.__offset(this.bb_pos, 8);
    return offset ? new Int8Array(this.bb.bytes().buffer, this.bb.bytes().byteOffset + this.bb.__vector(this.bb_pos + offset), this.bb.__vector_len(this.bb_pos + offset)) : null;
  }
  wireSets(index, obj) {
    const offset = this.bb.__offset(this.bb_pos, 10);
    return offset ? (obj || new WireSet()).__init(this.bb.__indirect(this.bb.__vector(this.bb_pos + offset) + index * 4), this.bb) : null;
  }
  wireSetsLength() {
    const offset = this.bb.__offset(this.bb_pos, 10);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  circleCurves(index, obj) {
    const offset = this.bb.__offset(this.bb_pos, 12);
    return offset ? (obj || new CircleCurve()).__init(this.bb.__vector(this.bb_pos + offset) + index * 44, this.bb) : null;
  }
  circleCurvesLength() {
    const offset = this.bb.__offset(this.bb_pos, 12);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  static startAxis(builder) {
    builder.startObject(5);
  }
  static addWires(builder, wiresOffset) {
    builder.addFieldOffset(0, wiresOffset, 0);
  }
  static startWiresVector(builder, numElems) {
    builder.startVector(24, numElems, 4);
  }
  static addOrder(builder, orderOffset) {
    builder.addFieldOffset(1, orderOffset, 0);
  }
  static createOrderVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addInt32(data[i]);
    }
    return builder.endVector();
  }
  static startOrderVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static addParts(builder, partsOffset) {
    builder.addFieldOffset(2, partsOffset, 0);
  }
  static createPartsVector(builder, data) {
    builder.startVector(1, data.length, 1);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addInt8(data[i]);
    }
    return builder.endVector();
  }
  static startPartsVector(builder, numElems) {
    builder.startVector(1, numElems, 1);
  }
  static addWireSets(builder, wireSetsOffset) {
    builder.addFieldOffset(3, wireSetsOffset, 0);
  }
  static createWireSetsVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addOffset(data[i]);
    }
    return builder.endVector();
  }
  static startWireSetsVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static addCircleCurves(builder, circleCurvesOffset) {
    builder.addFieldOffset(4, circleCurvesOffset, 0);
  }
  static startCircleCurvesVector(builder, numElems) {
    builder.startVector(44, numElems, 4);
  }
  static endAxis(builder) {
    const offset = builder.endObject();
    builder.requiredField(offset, 4);
    builder.requiredField(offset, 6);
    builder.requiredField(offset, 8);
    builder.requiredField(offset, 10);
    builder.requiredField(offset, 12);
    return offset;
  }
  static createAxis(builder, wiresOffset, orderOffset, partsOffset, wireSetsOffset, circleCurvesOffset) {
    _Axis.startAxis(builder);
    _Axis.addWires(builder, wiresOffset);
    _Axis.addOrder(builder, orderOffset);
    _Axis.addParts(builder, partsOffset);
    _Axis.addWireSets(builder, wireSetsOffset);
    _Axis.addCircleCurves(builder, circleCurvesOffset);
    return _Axis.endAxis(builder);
  }
};

// src/_fragments_fb/openskp/fragments-fb/big-shell-hole.ts
var flatbuffers4 = __toESM(require("flatbuffers"));
var BigShellHole = class _BigShellHole {
  constructor() {
    this.bb = null;
    this.bb_pos = 0;
  }
  __init(i, bb) {
    this.bb_pos = i;
    this.bb = bb;
    return this;
  }
  static getRootAsBigShellHole(bb, obj) {
    return (obj || new _BigShellHole()).__init(bb.readInt32(bb.position()) + bb.position(), bb);
  }
  static getSizePrefixedRootAsBigShellHole(bb, obj) {
    bb.setPosition(bb.position() + flatbuffers4.SIZE_PREFIX_LENGTH);
    return (obj || new _BigShellHole()).__init(bb.readInt32(bb.position()) + bb.position(), bb);
  }
  indices(index) {
    const offset = this.bb.__offset(this.bb_pos, 4);
    return offset ? this.bb.readUint32(this.bb.__vector(this.bb_pos + offset) + index * 4) : 0;
  }
  indicesLength() {
    const offset = this.bb.__offset(this.bb_pos, 4);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  indicesArray() {
    const offset = this.bb.__offset(this.bb_pos, 4);
    return offset ? new Uint32Array(this.bb.bytes().buffer, this.bb.bytes().byteOffset + this.bb.__vector(this.bb_pos + offset), this.bb.__vector_len(this.bb_pos + offset)) : null;
  }
  profileId() {
    const offset = this.bb.__offset(this.bb_pos, 6);
    return offset ? this.bb.readUint16(this.bb_pos + offset) : 0;
  }
  static startBigShellHole(builder) {
    builder.startObject(2);
  }
  static addIndices(builder, indicesOffset) {
    builder.addFieldOffset(0, indicesOffset, 0);
  }
  static createIndicesVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addInt32(data[i]);
    }
    return builder.endVector();
  }
  static startIndicesVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static addProfileId(builder, profileId) {
    builder.addFieldInt16(1, profileId, 0);
  }
  static endBigShellHole(builder) {
    const offset = builder.endObject();
    builder.requiredField(offset, 4);
    return offset;
  }
  static createBigShellHole(builder, indicesOffset, profileId) {
    _BigShellHole.startBigShellHole(builder);
    _BigShellHole.addIndices(builder, indicesOffset);
    _BigShellHole.addProfileId(builder, profileId);
    return _BigShellHole.endBigShellHole(builder);
  }
};

// src/_fragments_fb/openskp/fragments-fb/big-shell-profile.ts
var flatbuffers5 = __toESM(require("flatbuffers"));
var BigShellProfile = class _BigShellProfile {
  constructor() {
    this.bb = null;
    this.bb_pos = 0;
  }
  __init(i, bb) {
    this.bb_pos = i;
    this.bb = bb;
    return this;
  }
  static getRootAsBigShellProfile(bb, obj) {
    return (obj || new _BigShellProfile()).__init(bb.readInt32(bb.position()) + bb.position(), bb);
  }
  static getSizePrefixedRootAsBigShellProfile(bb, obj) {
    bb.setPosition(bb.position() + flatbuffers5.SIZE_PREFIX_LENGTH);
    return (obj || new _BigShellProfile()).__init(bb.readInt32(bb.position()) + bb.position(), bb);
  }
  indices(index) {
    const offset = this.bb.__offset(this.bb_pos, 4);
    return offset ? this.bb.readUint32(this.bb.__vector(this.bb_pos + offset) + index * 4) : 0;
  }
  indicesLength() {
    const offset = this.bb.__offset(this.bb_pos, 4);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  indicesArray() {
    const offset = this.bb.__offset(this.bb_pos, 4);
    return offset ? new Uint32Array(this.bb.bytes().buffer, this.bb.bytes().byteOffset + this.bb.__vector(this.bb_pos + offset), this.bb.__vector_len(this.bb_pos + offset)) : null;
  }
  static startBigShellProfile(builder) {
    builder.startObject(1);
  }
  static addIndices(builder, indicesOffset) {
    builder.addFieldOffset(0, indicesOffset, 0);
  }
  static createIndicesVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addInt32(data[i]);
    }
    return builder.endVector();
  }
  static startIndicesVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static endBigShellProfile(builder) {
    const offset = builder.endObject();
    builder.requiredField(offset, 4);
    return offset;
  }
  static createBigShellProfile(builder, indicesOffset) {
    _BigShellProfile.startBigShellProfile(builder);
    _BigShellProfile.addIndices(builder, indicesOffset);
    return _BigShellProfile.endBigShellProfile(builder);
  }
};

// src/_fragments_fb/openskp/fragments-fb/bounding-box.ts
var BoundingBox = class {
  constructor() {
    this.bb = null;
    this.bb_pos = 0;
  }
  __init(i, bb) {
    this.bb_pos = i;
    this.bb = bb;
    return this;
  }
  min(obj) {
    return (obj || new FloatVector()).__init(this.bb_pos, this.bb);
  }
  max(obj) {
    return (obj || new FloatVector()).__init(this.bb_pos + 12, this.bb);
  }
  static sizeOf() {
    return 24;
  }
  static createBoundingBox(builder, min_x, min_y, min_z, max_x, max_y, max_z) {
    builder.prep(4, 24);
    builder.prep(4, 12);
    builder.writeFloat32(max_z);
    builder.writeFloat32(max_y);
    builder.writeFloat32(max_x);
    builder.prep(4, 12);
    builder.writeFloat32(min_z);
    builder.writeFloat32(min_y);
    builder.writeFloat32(min_x);
    return builder.offset();
  }
};

// src/_fragments_fb/openskp/fragments-fb/circle-extrusion.ts
var flatbuffers6 = __toESM(require("flatbuffers"));
var CircleExtrusion = class _CircleExtrusion {
  constructor() {
    this.bb = null;
    this.bb_pos = 0;
  }
  __init(i, bb) {
    this.bb_pos = i;
    this.bb = bb;
    return this;
  }
  static getRootAsCircleExtrusion(bb, obj) {
    return (obj || new _CircleExtrusion()).__init(bb.readInt32(bb.position()) + bb.position(), bb);
  }
  static getSizePrefixedRootAsCircleExtrusion(bb, obj) {
    bb.setPosition(bb.position() + flatbuffers6.SIZE_PREFIX_LENGTH);
    return (obj || new _CircleExtrusion()).__init(bb.readInt32(bb.position()) + bb.position(), bb);
  }
  radius(index) {
    const offset = this.bb.__offset(this.bb_pos, 4);
    return offset ? this.bb.readFloat64(this.bb.__vector(this.bb_pos + offset) + index * 8) : 0;
  }
  radiusLength() {
    const offset = this.bb.__offset(this.bb_pos, 4);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  radiusArray() {
    const offset = this.bb.__offset(this.bb_pos, 4);
    return offset ? new Float64Array(this.bb.bytes().buffer, this.bb.bytes().byteOffset + this.bb.__vector(this.bb_pos + offset), this.bb.__vector_len(this.bb_pos + offset)) : null;
  }
  axes(index, obj) {
    const offset = this.bb.__offset(this.bb_pos, 6);
    return offset ? (obj || new Axis()).__init(this.bb.__indirect(this.bb.__vector(this.bb_pos + offset) + index * 4), this.bb) : null;
  }
  axesLength() {
    const offset = this.bb.__offset(this.bb_pos, 6);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  static startCircleExtrusion(builder) {
    builder.startObject(2);
  }
  static addRadius(builder, radiusOffset) {
    builder.addFieldOffset(0, radiusOffset, 0);
  }
  static createRadiusVector(builder, data) {
    builder.startVector(8, data.length, 8);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addFloat64(data[i]);
    }
    return builder.endVector();
  }
  static startRadiusVector(builder, numElems) {
    builder.startVector(8, numElems, 8);
  }
  static addAxes(builder, axesOffset) {
    builder.addFieldOffset(1, axesOffset, 0);
  }
  static createAxesVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addOffset(data[i]);
    }
    return builder.endVector();
  }
  static startAxesVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static endCircleExtrusion(builder) {
    const offset = builder.endObject();
    builder.requiredField(offset, 4);
    builder.requiredField(offset, 6);
    return offset;
  }
  static createCircleExtrusion(builder, radiusOffset, axesOffset) {
    _CircleExtrusion.startCircleExtrusion(builder);
    _CircleExtrusion.addRadius(builder, radiusOffset);
    _CircleExtrusion.addAxes(builder, axesOffset);
    return _CircleExtrusion.endCircleExtrusion(builder);
  }
};

// src/_fragments_fb/openskp/fragments-fb/double-vector.ts
var DoubleVector = class {
  constructor() {
    this.bb = null;
    this.bb_pos = 0;
  }
  __init(i, bb) {
    this.bb_pos = i;
    this.bb = bb;
    return this;
  }
  x() {
    return this.bb.readFloat64(this.bb_pos);
  }
  y() {
    return this.bb.readFloat64(this.bb_pos + 8);
  }
  z() {
    return this.bb.readFloat64(this.bb_pos + 16);
  }
  static sizeOf() {
    return 24;
  }
  static createDoubleVector(builder, x, y, z) {
    builder.prep(8, 24);
    builder.writeFloat64(z);
    builder.writeFloat64(y);
    builder.writeFloat64(x);
    return builder.offset();
  }
};

// src/_fragments_fb/openskp/fragments-fb/material.ts
var Material2 = class {
  constructor() {
    this.bb = null;
    this.bb_pos = 0;
  }
  __init(i, bb) {
    this.bb_pos = i;
    this.bb = bb;
    return this;
  }
  r() {
    return this.bb.readUint8(this.bb_pos);
  }
  g() {
    return this.bb.readUint8(this.bb_pos + 1);
  }
  b() {
    return this.bb.readUint8(this.bb_pos + 2);
  }
  a() {
    return this.bb.readUint8(this.bb_pos + 3);
  }
  renderedFaces() {
    return this.bb.readInt8(this.bb_pos + 4);
  }
  stroke() {
    return this.bb.readInt8(this.bb_pos + 5);
  }
  static sizeOf() {
    return 6;
  }
  static createMaterial(builder, r, g, b, a, rendered_faces, stroke) {
    builder.prep(1, 6);
    builder.writeInt8(stroke);
    builder.writeInt8(rendered_faces);
    builder.writeInt8(a);
    builder.writeInt8(b);
    builder.writeInt8(g);
    builder.writeInt8(r);
    return builder.offset();
  }
};

// src/_fragments_fb/openskp/fragments-fb/meshes.ts
var flatbuffers10 = __toESM(require("flatbuffers"));

// src/_fragments_fb/openskp/fragments-fb/representation.ts
var Representation = class {
  constructor() {
    this.bb = null;
    this.bb_pos = 0;
  }
  __init(i, bb) {
    this.bb_pos = i;
    this.bb = bb;
    return this;
  }
  id() {
    return this.bb.readUint32(this.bb_pos);
  }
  bbox(obj) {
    return (obj || new BoundingBox()).__init(this.bb_pos + 4, this.bb);
  }
  representationClass() {
    return this.bb.readInt8(this.bb_pos + 28);
  }
  static sizeOf() {
    return 32;
  }
  static createRepresentation(builder, id, bbox_min_x, bbox_min_y, bbox_min_z, bbox_max_x, bbox_max_y, bbox_max_z, representation_class) {
    builder.prep(4, 32);
    builder.pad(3);
    builder.writeInt8(representation_class);
    builder.prep(4, 24);
    builder.prep(4, 12);
    builder.writeFloat32(bbox_max_z);
    builder.writeFloat32(bbox_max_y);
    builder.writeFloat32(bbox_max_x);
    builder.prep(4, 12);
    builder.writeFloat32(bbox_min_z);
    builder.writeFloat32(bbox_min_y);
    builder.writeFloat32(bbox_min_x);
    builder.writeInt32(id);
    return builder.offset();
  }
};

// src/_fragments_fb/openskp/fragments-fb/sample.ts
var Sample = class {
  constructor() {
    this.bb = null;
    this.bb_pos = 0;
  }
  __init(i, bb) {
    this.bb_pos = i;
    this.bb = bb;
    return this;
  }
  item() {
    return this.bb.readUint32(this.bb_pos);
  }
  material() {
    return this.bb.readUint32(this.bb_pos + 4);
  }
  representation() {
    return this.bb.readUint32(this.bb_pos + 8);
  }
  localTransform() {
    return this.bb.readUint32(this.bb_pos + 12);
  }
  static sizeOf() {
    return 16;
  }
  static createSample(builder, item, material, representation, local_transform) {
    builder.prep(4, 16);
    builder.writeInt32(local_transform);
    builder.writeInt32(representation);
    builder.writeInt32(material);
    builder.writeInt32(item);
    return builder.offset();
  }
};

// src/_fragments_fb/openskp/fragments-fb/shell.ts
var flatbuffers9 = __toESM(require("flatbuffers"));

// src/_fragments_fb/openskp/fragments-fb/shell-hole.ts
var flatbuffers7 = __toESM(require("flatbuffers"));
var ShellHole = class _ShellHole {
  constructor() {
    this.bb = null;
    this.bb_pos = 0;
  }
  __init(i, bb) {
    this.bb_pos = i;
    this.bb = bb;
    return this;
  }
  static getRootAsShellHole(bb, obj) {
    return (obj || new _ShellHole()).__init(bb.readInt32(bb.position()) + bb.position(), bb);
  }
  static getSizePrefixedRootAsShellHole(bb, obj) {
    bb.setPosition(bb.position() + flatbuffers7.SIZE_PREFIX_LENGTH);
    return (obj || new _ShellHole()).__init(bb.readInt32(bb.position()) + bb.position(), bb);
  }
  indices(index) {
    const offset = this.bb.__offset(this.bb_pos, 4);
    return offset ? this.bb.readUint16(this.bb.__vector(this.bb_pos + offset) + index * 2) : 0;
  }
  indicesLength() {
    const offset = this.bb.__offset(this.bb_pos, 4);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  indicesArray() {
    const offset = this.bb.__offset(this.bb_pos, 4);
    return offset ? new Uint16Array(this.bb.bytes().buffer, this.bb.bytes().byteOffset + this.bb.__vector(this.bb_pos + offset), this.bb.__vector_len(this.bb_pos + offset)) : null;
  }
  profileId() {
    const offset = this.bb.__offset(this.bb_pos, 6);
    return offset ? this.bb.readUint16(this.bb_pos + offset) : 0;
  }
  static startShellHole(builder) {
    builder.startObject(2);
  }
  static addIndices(builder, indicesOffset) {
    builder.addFieldOffset(0, indicesOffset, 0);
  }
  static createIndicesVector(builder, data) {
    builder.startVector(2, data.length, 2);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addInt16(data[i]);
    }
    return builder.endVector();
  }
  static startIndicesVector(builder, numElems) {
    builder.startVector(2, numElems, 2);
  }
  static addProfileId(builder, profileId) {
    builder.addFieldInt16(1, profileId, 0);
  }
  static endShellHole(builder) {
    const offset = builder.endObject();
    builder.requiredField(offset, 4);
    return offset;
  }
  static createShellHole(builder, indicesOffset, profileId) {
    _ShellHole.startShellHole(builder);
    _ShellHole.addIndices(builder, indicesOffset);
    _ShellHole.addProfileId(builder, profileId);
    return _ShellHole.endShellHole(builder);
  }
};

// src/_fragments_fb/openskp/fragments-fb/shell-profile.ts
var flatbuffers8 = __toESM(require("flatbuffers"));
var ShellProfile = class _ShellProfile {
  constructor() {
    this.bb = null;
    this.bb_pos = 0;
  }
  __init(i, bb) {
    this.bb_pos = i;
    this.bb = bb;
    return this;
  }
  static getRootAsShellProfile(bb, obj) {
    return (obj || new _ShellProfile()).__init(bb.readInt32(bb.position()) + bb.position(), bb);
  }
  static getSizePrefixedRootAsShellProfile(bb, obj) {
    bb.setPosition(bb.position() + flatbuffers8.SIZE_PREFIX_LENGTH);
    return (obj || new _ShellProfile()).__init(bb.readInt32(bb.position()) + bb.position(), bb);
  }
  indices(index) {
    const offset = this.bb.__offset(this.bb_pos, 4);
    return offset ? this.bb.readUint16(this.bb.__vector(this.bb_pos + offset) + index * 2) : 0;
  }
  indicesLength() {
    const offset = this.bb.__offset(this.bb_pos, 4);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  indicesArray() {
    const offset = this.bb.__offset(this.bb_pos, 4);
    return offset ? new Uint16Array(this.bb.bytes().buffer, this.bb.bytes().byteOffset + this.bb.__vector(this.bb_pos + offset), this.bb.__vector_len(this.bb_pos + offset)) : null;
  }
  static startShellProfile(builder) {
    builder.startObject(1);
  }
  static addIndices(builder, indicesOffset) {
    builder.addFieldOffset(0, indicesOffset, 0);
  }
  static createIndicesVector(builder, data) {
    builder.startVector(2, data.length, 2);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addInt16(data[i]);
    }
    return builder.endVector();
  }
  static startIndicesVector(builder, numElems) {
    builder.startVector(2, numElems, 2);
  }
  static endShellProfile(builder) {
    const offset = builder.endObject();
    builder.requiredField(offset, 4);
    return offset;
  }
  static createShellProfile(builder, indicesOffset) {
    _ShellProfile.startShellProfile(builder);
    _ShellProfile.addIndices(builder, indicesOffset);
    return _ShellProfile.endShellProfile(builder);
  }
};

// src/_fragments_fb/openskp/fragments-fb/shell.ts
var Shell = class _Shell {
  constructor() {
    this.bb = null;
    this.bb_pos = 0;
  }
  __init(i, bb) {
    this.bb_pos = i;
    this.bb = bb;
    return this;
  }
  static getRootAsShell(bb, obj) {
    return (obj || new _Shell()).__init(bb.readInt32(bb.position()) + bb.position(), bb);
  }
  static getSizePrefixedRootAsShell(bb, obj) {
    bb.setPosition(bb.position() + flatbuffers9.SIZE_PREFIX_LENGTH);
    return (obj || new _Shell()).__init(bb.readInt32(bb.position()) + bb.position(), bb);
  }
  profiles(index, obj) {
    const offset = this.bb.__offset(this.bb_pos, 4);
    return offset ? (obj || new ShellProfile()).__init(this.bb.__indirect(this.bb.__vector(this.bb_pos + offset) + index * 4), this.bb) : null;
  }
  profilesLength() {
    const offset = this.bb.__offset(this.bb_pos, 4);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  holes(index, obj) {
    const offset = this.bb.__offset(this.bb_pos, 6);
    return offset ? (obj || new ShellHole()).__init(this.bb.__indirect(this.bb.__vector(this.bb_pos + offset) + index * 4), this.bb) : null;
  }
  holesLength() {
    const offset = this.bb.__offset(this.bb_pos, 6);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  points(index, obj) {
    const offset = this.bb.__offset(this.bb_pos, 8);
    return offset ? (obj || new FloatVector()).__init(this.bb.__vector(this.bb_pos + offset) + index * 12, this.bb) : null;
  }
  pointsLength() {
    const offset = this.bb.__offset(this.bb_pos, 8);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  bigProfiles(index, obj) {
    const offset = this.bb.__offset(this.bb_pos, 10);
    return offset ? (obj || new BigShellProfile()).__init(this.bb.__indirect(this.bb.__vector(this.bb_pos + offset) + index * 4), this.bb) : null;
  }
  bigProfilesLength() {
    const offset = this.bb.__offset(this.bb_pos, 10);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  bigHoles(index, obj) {
    const offset = this.bb.__offset(this.bb_pos, 12);
    return offset ? (obj || new BigShellHole()).__init(this.bb.__indirect(this.bb.__vector(this.bb_pos + offset) + index * 4), this.bb) : null;
  }
  bigHolesLength() {
    const offset = this.bb.__offset(this.bb_pos, 12);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  type() {
    const offset = this.bb.__offset(this.bb_pos, 14);
    return offset ? this.bb.readInt8(this.bb_pos + offset) : 0 /* NONE */;
  }
  profilesFaceIds(index) {
    const offset = this.bb.__offset(this.bb_pos, 16);
    return offset ? this.bb.readUint16(this.bb.__vector(this.bb_pos + offset) + index * 2) : 0;
  }
  profilesFaceIdsLength() {
    const offset = this.bb.__offset(this.bb_pos, 16);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  profilesFaceIdsArray() {
    const offset = this.bb.__offset(this.bb_pos, 16);
    return offset ? new Uint16Array(this.bb.bytes().buffer, this.bb.bytes().byteOffset + this.bb.__vector(this.bb_pos + offset), this.bb.__vector_len(this.bb_pos + offset)) : null;
  }
  static startShell(builder) {
    builder.startObject(7);
  }
  static addProfiles(builder, profilesOffset) {
    builder.addFieldOffset(0, profilesOffset, 0);
  }
  static createProfilesVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addOffset(data[i]);
    }
    return builder.endVector();
  }
  static startProfilesVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static addHoles(builder, holesOffset) {
    builder.addFieldOffset(1, holesOffset, 0);
  }
  static createHolesVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addOffset(data[i]);
    }
    return builder.endVector();
  }
  static startHolesVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static addPoints(builder, pointsOffset) {
    builder.addFieldOffset(2, pointsOffset, 0);
  }
  static startPointsVector(builder, numElems) {
    builder.startVector(12, numElems, 4);
  }
  static addBigProfiles(builder, bigProfilesOffset) {
    builder.addFieldOffset(3, bigProfilesOffset, 0);
  }
  static createBigProfilesVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addOffset(data[i]);
    }
    return builder.endVector();
  }
  static startBigProfilesVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static addBigHoles(builder, bigHolesOffset) {
    builder.addFieldOffset(4, bigHolesOffset, 0);
  }
  static createBigHolesVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addOffset(data[i]);
    }
    return builder.endVector();
  }
  static startBigHolesVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static addType(builder, type) {
    builder.addFieldInt8(5, type, 0 /* NONE */);
  }
  static addProfilesFaceIds(builder, profilesFaceIdsOffset) {
    builder.addFieldOffset(6, profilesFaceIdsOffset, 0);
  }
  static createProfilesFaceIdsVector(builder, data) {
    builder.startVector(2, data.length, 2);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addInt16(data[i]);
    }
    return builder.endVector();
  }
  static startProfilesFaceIdsVector(builder, numElems) {
    builder.startVector(2, numElems, 2);
  }
  static endShell(builder) {
    const offset = builder.endObject();
    builder.requiredField(offset, 4);
    builder.requiredField(offset, 6);
    builder.requiredField(offset, 8);
    builder.requiredField(offset, 10);
    builder.requiredField(offset, 12);
    builder.requiredField(offset, 16);
    return offset;
  }
  static createShell(builder, profilesOffset, holesOffset, pointsOffset, bigProfilesOffset, bigHolesOffset, type, profilesFaceIdsOffset) {
    _Shell.startShell(builder);
    _Shell.addProfiles(builder, profilesOffset);
    _Shell.addHoles(builder, holesOffset);
    _Shell.addPoints(builder, pointsOffset);
    _Shell.addBigProfiles(builder, bigProfilesOffset);
    _Shell.addBigHoles(builder, bigHolesOffset);
    _Shell.addType(builder, type);
    _Shell.addProfilesFaceIds(builder, profilesFaceIdsOffset);
    return _Shell.endShell(builder);
  }
};

// src/_fragments_fb/openskp/fragments-fb/transform.ts
var Transform = class {
  constructor() {
    this.bb = null;
    this.bb_pos = 0;
  }
  __init(i, bb) {
    this.bb_pos = i;
    this.bb = bb;
    return this;
  }
  position(obj) {
    return (obj || new DoubleVector()).__init(this.bb_pos, this.bb);
  }
  xDirection(obj) {
    return (obj || new FloatVector()).__init(this.bb_pos + 24, this.bb);
  }
  yDirection(obj) {
    return (obj || new FloatVector()).__init(this.bb_pos + 36, this.bb);
  }
  static sizeOf() {
    return 48;
  }
  static createTransform(builder, position_x, position_y, position_z, x_direction_x, x_direction_y, x_direction_z, y_direction_x, y_direction_y, y_direction_z) {
    builder.prep(8, 48);
    builder.prep(4, 12);
    builder.writeFloat32(y_direction_z);
    builder.writeFloat32(y_direction_y);
    builder.writeFloat32(y_direction_x);
    builder.prep(4, 12);
    builder.writeFloat32(x_direction_z);
    builder.writeFloat32(x_direction_y);
    builder.writeFloat32(x_direction_x);
    builder.prep(8, 24);
    builder.writeFloat64(position_z);
    builder.writeFloat64(position_y);
    builder.writeFloat64(position_x);
    return builder.offset();
  }
};

// src/_fragments_fb/openskp/fragments-fb/meshes.ts
var Meshes = class _Meshes {
  constructor() {
    this.bb = null;
    this.bb_pos = 0;
  }
  __init(i, bb) {
    this.bb_pos = i;
    this.bb = bb;
    return this;
  }
  static getRootAsMeshes(bb, obj) {
    return (obj || new _Meshes()).__init(bb.readInt32(bb.position()) + bb.position(), bb);
  }
  static getSizePrefixedRootAsMeshes(bb, obj) {
    bb.setPosition(bb.position() + flatbuffers10.SIZE_PREFIX_LENGTH);
    return (obj || new _Meshes()).__init(bb.readInt32(bb.position()) + bb.position(), bb);
  }
  coordinates(obj) {
    const offset = this.bb.__offset(this.bb_pos, 4);
    return offset ? (obj || new Transform()).__init(this.bb_pos + offset, this.bb) : null;
  }
  meshesItems(index) {
    const offset = this.bb.__offset(this.bb_pos, 6);
    return offset ? this.bb.readUint32(this.bb.__vector(this.bb_pos + offset) + index * 4) : 0;
  }
  meshesItemsLength() {
    const offset = this.bb.__offset(this.bb_pos, 6);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  meshesItemsArray() {
    const offset = this.bb.__offset(this.bb_pos, 6);
    return offset ? new Uint32Array(this.bb.bytes().buffer, this.bb.bytes().byteOffset + this.bb.__vector(this.bb_pos + offset), this.bb.__vector_len(this.bb_pos + offset)) : null;
  }
  samples(index, obj) {
    const offset = this.bb.__offset(this.bb_pos, 8);
    return offset ? (obj || new Sample()).__init(this.bb.__vector(this.bb_pos + offset) + index * 16, this.bb) : null;
  }
  samplesLength() {
    const offset = this.bb.__offset(this.bb_pos, 8);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  representations(index, obj) {
    const offset = this.bb.__offset(this.bb_pos, 10);
    return offset ? (obj || new Representation()).__init(this.bb.__vector(this.bb_pos + offset) + index * 32, this.bb) : null;
  }
  representationsLength() {
    const offset = this.bb.__offset(this.bb_pos, 10);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  materials(index, obj) {
    const offset = this.bb.__offset(this.bb_pos, 12);
    return offset ? (obj || new Material2()).__init(this.bb.__vector(this.bb_pos + offset) + index * 6, this.bb) : null;
  }
  materialsLength() {
    const offset = this.bb.__offset(this.bb_pos, 12);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  circleExtrusions(index, obj) {
    const offset = this.bb.__offset(this.bb_pos, 14);
    return offset ? (obj || new CircleExtrusion()).__init(this.bb.__indirect(this.bb.__vector(this.bb_pos + offset) + index * 4), this.bb) : null;
  }
  circleExtrusionsLength() {
    const offset = this.bb.__offset(this.bb_pos, 14);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  shells(index, obj) {
    const offset = this.bb.__offset(this.bb_pos, 16);
    return offset ? (obj || new Shell()).__init(this.bb.__indirect(this.bb.__vector(this.bb_pos + offset) + index * 4), this.bb) : null;
  }
  shellsLength() {
    const offset = this.bb.__offset(this.bb_pos, 16);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  localTransforms(index, obj) {
    const offset = this.bb.__offset(this.bb_pos, 18);
    return offset ? (obj || new Transform()).__init(this.bb.__vector(this.bb_pos + offset) + index * 48, this.bb) : null;
  }
  localTransformsLength() {
    const offset = this.bb.__offset(this.bb_pos, 18);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  globalTransforms(index, obj) {
    const offset = this.bb.__offset(this.bb_pos, 20);
    return offset ? (obj || new Transform()).__init(this.bb.__vector(this.bb_pos + offset) + index * 48, this.bb) : null;
  }
  globalTransformsLength() {
    const offset = this.bb.__offset(this.bb_pos, 20);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  materialIds(index) {
    const offset = this.bb.__offset(this.bb_pos, 22);
    return offset ? this.bb.readUint32(this.bb.__vector(this.bb_pos + offset) + index * 4) : 0;
  }
  materialIdsLength() {
    const offset = this.bb.__offset(this.bb_pos, 22);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  materialIdsArray() {
    const offset = this.bb.__offset(this.bb_pos, 22);
    return offset ? new Uint32Array(this.bb.bytes().buffer, this.bb.bytes().byteOffset + this.bb.__vector(this.bb_pos + offset), this.bb.__vector_len(this.bb_pos + offset)) : null;
  }
  representationIds(index) {
    const offset = this.bb.__offset(this.bb_pos, 24);
    return offset ? this.bb.readUint32(this.bb.__vector(this.bb_pos + offset) + index * 4) : 0;
  }
  representationIdsLength() {
    const offset = this.bb.__offset(this.bb_pos, 24);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  representationIdsArray() {
    const offset = this.bb.__offset(this.bb_pos, 24);
    return offset ? new Uint32Array(this.bb.bytes().buffer, this.bb.bytes().byteOffset + this.bb.__vector(this.bb_pos + offset), this.bb.__vector_len(this.bb_pos + offset)) : null;
  }
  sampleIds(index) {
    const offset = this.bb.__offset(this.bb_pos, 26);
    return offset ? this.bb.readUint32(this.bb.__vector(this.bb_pos + offset) + index * 4) : 0;
  }
  sampleIdsLength() {
    const offset = this.bb.__offset(this.bb_pos, 26);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  sampleIdsArray() {
    const offset = this.bb.__offset(this.bb_pos, 26);
    return offset ? new Uint32Array(this.bb.bytes().buffer, this.bb.bytes().byteOffset + this.bb.__vector(this.bb_pos + offset), this.bb.__vector_len(this.bb_pos + offset)) : null;
  }
  localTransformIds(index) {
    const offset = this.bb.__offset(this.bb_pos, 28);
    return offset ? this.bb.readUint32(this.bb.__vector(this.bb_pos + offset) + index * 4) : 0;
  }
  localTransformIdsLength() {
    const offset = this.bb.__offset(this.bb_pos, 28);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  localTransformIdsArray() {
    const offset = this.bb.__offset(this.bb_pos, 28);
    return offset ? new Uint32Array(this.bb.bytes().buffer, this.bb.bytes().byteOffset + this.bb.__vector(this.bb_pos + offset), this.bb.__vector_len(this.bb_pos + offset)) : null;
  }
  globalTransformIds(index) {
    const offset = this.bb.__offset(this.bb_pos, 30);
    return offset ? this.bb.readUint32(this.bb.__vector(this.bb_pos + offset) + index * 4) : 0;
  }
  globalTransformIdsLength() {
    const offset = this.bb.__offset(this.bb_pos, 30);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  globalTransformIdsArray() {
    const offset = this.bb.__offset(this.bb_pos, 30);
    return offset ? new Uint32Array(this.bb.bytes().buffer, this.bb.bytes().byteOffset + this.bb.__vector(this.bb_pos + offset), this.bb.__vector_len(this.bb_pos + offset)) : null;
  }
  static startMeshes(builder) {
    builder.startObject(14);
  }
  static addCoordinates(builder, coordinatesOffset) {
    builder.addFieldStruct(0, coordinatesOffset, 0);
  }
  static addMeshesItems(builder, meshesItemsOffset) {
    builder.addFieldOffset(1, meshesItemsOffset, 0);
  }
  static createMeshesItemsVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addInt32(data[i]);
    }
    return builder.endVector();
  }
  static startMeshesItemsVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static addSamples(builder, samplesOffset) {
    builder.addFieldOffset(2, samplesOffset, 0);
  }
  static startSamplesVector(builder, numElems) {
    builder.startVector(16, numElems, 4);
  }
  static addRepresentations(builder, representationsOffset) {
    builder.addFieldOffset(3, representationsOffset, 0);
  }
  static startRepresentationsVector(builder, numElems) {
    builder.startVector(32, numElems, 4);
  }
  static addMaterials(builder, materialsOffset) {
    builder.addFieldOffset(4, materialsOffset, 0);
  }
  static startMaterialsVector(builder, numElems) {
    builder.startVector(6, numElems, 1);
  }
  static addCircleExtrusions(builder, circleExtrusionsOffset) {
    builder.addFieldOffset(5, circleExtrusionsOffset, 0);
  }
  static createCircleExtrusionsVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addOffset(data[i]);
    }
    return builder.endVector();
  }
  static startCircleExtrusionsVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static addShells(builder, shellsOffset) {
    builder.addFieldOffset(6, shellsOffset, 0);
  }
  static createShellsVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addOffset(data[i]);
    }
    return builder.endVector();
  }
  static startShellsVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static addLocalTransforms(builder, localTransformsOffset) {
    builder.addFieldOffset(7, localTransformsOffset, 0);
  }
  static startLocalTransformsVector(builder, numElems) {
    builder.startVector(48, numElems, 8);
  }
  static addGlobalTransforms(builder, globalTransformsOffset) {
    builder.addFieldOffset(8, globalTransformsOffset, 0);
  }
  static startGlobalTransformsVector(builder, numElems) {
    builder.startVector(48, numElems, 8);
  }
  static addMaterialIds(builder, materialIdsOffset) {
    builder.addFieldOffset(9, materialIdsOffset, 0);
  }
  static createMaterialIdsVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addInt32(data[i]);
    }
    return builder.endVector();
  }
  static startMaterialIdsVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static addRepresentationIds(builder, representationIdsOffset) {
    builder.addFieldOffset(10, representationIdsOffset, 0);
  }
  static createRepresentationIdsVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addInt32(data[i]);
    }
    return builder.endVector();
  }
  static startRepresentationIdsVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static addSampleIds(builder, sampleIdsOffset) {
    builder.addFieldOffset(11, sampleIdsOffset, 0);
  }
  static createSampleIdsVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addInt32(data[i]);
    }
    return builder.endVector();
  }
  static startSampleIdsVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static addLocalTransformIds(builder, localTransformIdsOffset) {
    builder.addFieldOffset(12, localTransformIdsOffset, 0);
  }
  static createLocalTransformIdsVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addInt32(data[i]);
    }
    return builder.endVector();
  }
  static startLocalTransformIdsVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static addGlobalTransformIds(builder, globalTransformIdsOffset) {
    builder.addFieldOffset(13, globalTransformIdsOffset, 0);
  }
  static createGlobalTransformIdsVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addInt32(data[i]);
    }
    return builder.endVector();
  }
  static startGlobalTransformIdsVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static endMeshes(builder) {
    const offset = builder.endObject();
    builder.requiredField(offset, 4);
    builder.requiredField(offset, 6);
    builder.requiredField(offset, 8);
    builder.requiredField(offset, 10);
    builder.requiredField(offset, 12);
    builder.requiredField(offset, 14);
    builder.requiredField(offset, 16);
    builder.requiredField(offset, 18);
    builder.requiredField(offset, 20);
    return offset;
  }
  static createMeshes(builder, coordinatesOffset, meshesItemsOffset, samplesOffset, representationsOffset, materialsOffset, circleExtrusionsOffset, shellsOffset, localTransformsOffset, globalTransformsOffset, materialIdsOffset, representationIdsOffset, sampleIdsOffset, localTransformIdsOffset, globalTransformIdsOffset) {
    _Meshes.startMeshes(builder);
    _Meshes.addCoordinates(builder, coordinatesOffset);
    _Meshes.addMeshesItems(builder, meshesItemsOffset);
    _Meshes.addSamples(builder, samplesOffset);
    _Meshes.addRepresentations(builder, representationsOffset);
    _Meshes.addMaterials(builder, materialsOffset);
    _Meshes.addCircleExtrusions(builder, circleExtrusionsOffset);
    _Meshes.addShells(builder, shellsOffset);
    _Meshes.addLocalTransforms(builder, localTransformsOffset);
    _Meshes.addGlobalTransforms(builder, globalTransformsOffset);
    _Meshes.addMaterialIds(builder, materialIdsOffset);
    _Meshes.addRepresentationIds(builder, representationIdsOffset);
    _Meshes.addSampleIds(builder, sampleIdsOffset);
    _Meshes.addLocalTransformIds(builder, localTransformIdsOffset);
    _Meshes.addGlobalTransformIds(builder, globalTransformIdsOffset);
    return _Meshes.endMeshes(builder);
  }
};

// src/_fragments_fb/openskp/fragments-fb/model.ts
var flatbuffers14 = __toESM(require("flatbuffers"));

// src/_fragments_fb/openskp/fragments-fb/model-index.ts
var flatbuffers11 = __toESM(require("flatbuffers"));
var ModelIndex = class _ModelIndex {
  constructor() {
    this.bb = null;
    this.bb_pos = 0;
  }
  __init(i, bb) {
    this.bb_pos = i;
    this.bb = bb;
    return this;
  }
  static getRootAsModelIndex(bb, obj) {
    return (obj || new _ModelIndex()).__init(bb.readInt32(bb.position()) + bb.position(), bb);
  }
  static getSizePrefixedRootAsModelIndex(bb, obj) {
    bb.setPosition(bb.position() + flatbuffers11.SIZE_PREFIX_LENGTH);
    return (obj || new _ModelIndex()).__init(bb.readInt32(bb.position()) + bb.position(), bb);
  }
  name(optionalEncoding) {
    const offset = this.bb.__offset(this.bb_pos, 4);
    return offset ? this.bb.__string(this.bb_pos + offset, optionalEncoding) : null;
  }
  stringKeys(index, optionalEncoding) {
    const offset = this.bb.__offset(this.bb_pos, 6);
    return offset ? this.bb.__string(this.bb.__vector(this.bb_pos + offset) + index * 4, optionalEncoding) : null;
  }
  stringKeysLength() {
    const offset = this.bb.__offset(this.bb_pos, 6);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  numberKeys(index) {
    const offset = this.bb.__offset(this.bb_pos, 8);
    return offset ? this.bb.readUint32(this.bb.__vector(this.bb_pos + offset) + index * 4) : 0;
  }
  numberKeysLength() {
    const offset = this.bb.__offset(this.bb_pos, 8);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  numberKeysArray() {
    const offset = this.bb.__offset(this.bb_pos, 8);
    return offset ? new Uint32Array(this.bb.bytes().buffer, this.bb.bytes().byteOffset + this.bb.__vector(this.bb_pos + offset), this.bb.__vector_len(this.bb_pos + offset)) : null;
  }
  stringValues(index, optionalEncoding) {
    const offset = this.bb.__offset(this.bb_pos, 10);
    return offset ? this.bb.__string(this.bb.__vector(this.bb_pos + offset) + index * 4, optionalEncoding) : null;
  }
  stringValuesLength() {
    const offset = this.bb.__offset(this.bb_pos, 10);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  numberValues(index) {
    const offset = this.bb.__offset(this.bb_pos, 12);
    return offset ? this.bb.readUint32(this.bb.__vector(this.bb_pos + offset) + index * 4) : 0;
  }
  numberValuesLength() {
    const offset = this.bb.__offset(this.bb_pos, 12);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  numberValuesArray() {
    const offset = this.bb.__offset(this.bb_pos, 12);
    return offset ? new Uint32Array(this.bb.bytes().buffer, this.bb.bytes().byteOffset + this.bb.__vector(this.bb_pos + offset), this.bb.__vector_len(this.bb_pos + offset)) : null;
  }
  end(index) {
    const offset = this.bb.__offset(this.bb_pos, 14);
    return offset ? this.bb.readUint32(this.bb.__vector(this.bb_pos + offset) + index * 4) : 0;
  }
  endLength() {
    const offset = this.bb.__offset(this.bb_pos, 14);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  endArray() {
    const offset = this.bb.__offset(this.bb_pos, 14);
    return offset ? new Uint32Array(this.bb.bytes().buffer, this.bb.bytes().byteOffset + this.bb.__vector(this.bb_pos + offset), this.bb.__vector_len(this.bb_pos + offset)) : null;
  }
  start(index) {
    const offset = this.bb.__offset(this.bb_pos, 16);
    return offset ? this.bb.readUint32(this.bb.__vector(this.bb_pos + offset) + index * 4) : 0;
  }
  startLength() {
    const offset = this.bb.__offset(this.bb_pos, 16);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  startArray() {
    const offset = this.bb.__offset(this.bb_pos, 16);
    return offset ? new Uint32Array(this.bb.bytes().buffer, this.bb.bytes().byteOffset + this.bb.__vector(this.bb_pos + offset), this.bb.__vector_len(this.bb_pos + offset)) : null;
  }
  static startModelIndex(builder) {
    builder.startObject(7);
  }
  static addName(builder, nameOffset) {
    builder.addFieldOffset(0, nameOffset, 0);
  }
  static addStringKeys(builder, stringKeysOffset) {
    builder.addFieldOffset(1, stringKeysOffset, 0);
  }
  static createStringKeysVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addOffset(data[i]);
    }
    return builder.endVector();
  }
  static startStringKeysVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static addNumberKeys(builder, numberKeysOffset) {
    builder.addFieldOffset(2, numberKeysOffset, 0);
  }
  static createNumberKeysVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addInt32(data[i]);
    }
    return builder.endVector();
  }
  static startNumberKeysVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static addStringValues(builder, stringValuesOffset) {
    builder.addFieldOffset(3, stringValuesOffset, 0);
  }
  static createStringValuesVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addOffset(data[i]);
    }
    return builder.endVector();
  }
  static startStringValuesVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static addNumberValues(builder, numberValuesOffset) {
    builder.addFieldOffset(4, numberValuesOffset, 0);
  }
  static createNumberValuesVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addInt32(data[i]);
    }
    return builder.endVector();
  }
  static startNumberValuesVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static addEnd(builder, endOffset) {
    builder.addFieldOffset(5, endOffset, 0);
  }
  static createEndVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addInt32(data[i]);
    }
    return builder.endVector();
  }
  static startEndVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static addStart(builder, startOffset) {
    builder.addFieldOffset(6, startOffset, 0);
  }
  static createStartVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addInt32(data[i]);
    }
    return builder.endVector();
  }
  static startStartVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static endModelIndex(builder) {
    const offset = builder.endObject();
    return offset;
  }
  static createModelIndex(builder, nameOffset, stringKeysOffset, numberKeysOffset, stringValuesOffset, numberValuesOffset, endOffset, startOffset) {
    _ModelIndex.startModelIndex(builder);
    _ModelIndex.addName(builder, nameOffset);
    _ModelIndex.addStringKeys(builder, stringKeysOffset);
    _ModelIndex.addNumberKeys(builder, numberKeysOffset);
    _ModelIndex.addStringValues(builder, stringValuesOffset);
    _ModelIndex.addNumberValues(builder, numberValuesOffset);
    _ModelIndex.addEnd(builder, endOffset);
    _ModelIndex.addStart(builder, startOffset);
    return _ModelIndex.endModelIndex(builder);
  }
};

// src/_fragments_fb/openskp/fragments-fb/relation.ts
var flatbuffers12 = __toESM(require("flatbuffers"));
var Relation = class _Relation {
  constructor() {
    this.bb = null;
    this.bb_pos = 0;
  }
  __init(i, bb) {
    this.bb_pos = i;
    this.bb = bb;
    return this;
  }
  static getRootAsRelation(bb, obj) {
    return (obj || new _Relation()).__init(bb.readInt32(bb.position()) + bb.position(), bb);
  }
  static getSizePrefixedRootAsRelation(bb, obj) {
    bb.setPosition(bb.position() + flatbuffers12.SIZE_PREFIX_LENGTH);
    return (obj || new _Relation()).__init(bb.readInt32(bb.position()) + bb.position(), bb);
  }
  data(index, optionalEncoding) {
    const offset = this.bb.__offset(this.bb_pos, 4);
    return offset ? this.bb.__string(this.bb.__vector(this.bb_pos + offset) + index * 4, optionalEncoding) : null;
  }
  dataLength() {
    const offset = this.bb.__offset(this.bb_pos, 4);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  static startRelation(builder) {
    builder.startObject(1);
  }
  static addData(builder, dataOffset) {
    builder.addFieldOffset(0, dataOffset, 0);
  }
  static createDataVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addOffset(data[i]);
    }
    return builder.endVector();
  }
  static startDataVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static endRelation(builder) {
    const offset = builder.endObject();
    builder.requiredField(offset, 4);
    return offset;
  }
  static createRelation(builder, dataOffset) {
    _Relation.startRelation(builder);
    _Relation.addData(builder, dataOffset);
    return _Relation.endRelation(builder);
  }
};

// src/_fragments_fb/openskp/fragments-fb/spatial-structure.ts
var flatbuffers13 = __toESM(require("flatbuffers"));
var SpatialStructure = class _SpatialStructure {
  constructor() {
    this.bb = null;
    this.bb_pos = 0;
  }
  __init(i, bb) {
    this.bb_pos = i;
    this.bb = bb;
    return this;
  }
  static getRootAsSpatialStructure(bb, obj) {
    return (obj || new _SpatialStructure()).__init(bb.readInt32(bb.position()) + bb.position(), bb);
  }
  static getSizePrefixedRootAsSpatialStructure(bb, obj) {
    bb.setPosition(bb.position() + flatbuffers13.SIZE_PREFIX_LENGTH);
    return (obj || new _SpatialStructure()).__init(bb.readInt32(bb.position()) + bb.position(), bb);
  }
  localId() {
    const offset = this.bb.__offset(this.bb_pos, 4);
    return offset ? this.bb.readUint32(this.bb_pos + offset) : null;
  }
  category(optionalEncoding) {
    const offset = this.bb.__offset(this.bb_pos, 6);
    return offset ? this.bb.__string(this.bb_pos + offset, optionalEncoding) : null;
  }
  children(index, obj) {
    const offset = this.bb.__offset(this.bb_pos, 8);
    return offset ? (obj || new _SpatialStructure()).__init(this.bb.__indirect(this.bb.__vector(this.bb_pos + offset) + index * 4), this.bb) : null;
  }
  childrenLength() {
    const offset = this.bb.__offset(this.bb_pos, 8);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  static startSpatialStructure(builder) {
    builder.startObject(3);
  }
  static addLocalId(builder, localId) {
    builder.addFieldInt32(0, localId, null);
  }
  static addCategory(builder, categoryOffset) {
    builder.addFieldOffset(1, categoryOffset, 0);
  }
  static addChildren(builder, childrenOffset) {
    builder.addFieldOffset(2, childrenOffset, 0);
  }
  static createChildrenVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addOffset(data[i]);
    }
    return builder.endVector();
  }
  static startChildrenVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static endSpatialStructure(builder) {
    const offset = builder.endObject();
    return offset;
  }
  static createSpatialStructure(builder, localId, categoryOffset, childrenOffset) {
    _SpatialStructure.startSpatialStructure(builder);
    if (localId !== null)
      _SpatialStructure.addLocalId(builder, localId);
    _SpatialStructure.addCategory(builder, categoryOffset);
    _SpatialStructure.addChildren(builder, childrenOffset);
    return _SpatialStructure.endSpatialStructure(builder);
  }
};

// src/_fragments_fb/openskp/fragments-fb/model.ts
var Model = class _Model {
  constructor() {
    this.bb = null;
    this.bb_pos = 0;
  }
  __init(i, bb) {
    this.bb_pos = i;
    this.bb = bb;
    return this;
  }
  static getRootAsModel(bb, obj) {
    return (obj || new _Model()).__init(bb.readInt32(bb.position()) + bb.position(), bb);
  }
  static getSizePrefixedRootAsModel(bb, obj) {
    bb.setPosition(bb.position() + flatbuffers14.SIZE_PREFIX_LENGTH);
    return (obj || new _Model()).__init(bb.readInt32(bb.position()) + bb.position(), bb);
  }
  static bufferHasIdentifier(bb) {
    return bb.__has_identifier("0001");
  }
  metadata(optionalEncoding) {
    const offset = this.bb.__offset(this.bb_pos, 4);
    return offset ? this.bb.__string(this.bb_pos + offset, optionalEncoding) : null;
  }
  guids(index, optionalEncoding) {
    const offset = this.bb.__offset(this.bb_pos, 6);
    return offset ? this.bb.__string(this.bb.__vector(this.bb_pos + offset) + index * 4, optionalEncoding) : null;
  }
  guidsLength() {
    const offset = this.bb.__offset(this.bb_pos, 6);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  guidsItems(index) {
    const offset = this.bb.__offset(this.bb_pos, 8);
    return offset ? this.bb.readUint32(this.bb.__vector(this.bb_pos + offset) + index * 4) : 0;
  }
  guidsItemsLength() {
    const offset = this.bb.__offset(this.bb_pos, 8);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  guidsItemsArray() {
    const offset = this.bb.__offset(this.bb_pos, 8);
    return offset ? new Uint32Array(this.bb.bytes().buffer, this.bb.bytes().byteOffset + this.bb.__vector(this.bb_pos + offset), this.bb.__vector_len(this.bb_pos + offset)) : null;
  }
  maxLocalId() {
    const offset = this.bb.__offset(this.bb_pos, 10);
    return offset ? this.bb.readUint32(this.bb_pos + offset) : 0;
  }
  localIds(index) {
    const offset = this.bb.__offset(this.bb_pos, 12);
    return offset ? this.bb.readUint32(this.bb.__vector(this.bb_pos + offset) + index * 4) : 0;
  }
  localIdsLength() {
    const offset = this.bb.__offset(this.bb_pos, 12);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  localIdsArray() {
    const offset = this.bb.__offset(this.bb_pos, 12);
    return offset ? new Uint32Array(this.bb.bytes().buffer, this.bb.bytes().byteOffset + this.bb.__vector(this.bb_pos + offset), this.bb.__vector_len(this.bb_pos + offset)) : null;
  }
  categories(index, optionalEncoding) {
    const offset = this.bb.__offset(this.bb_pos, 14);
    return offset ? this.bb.__string(this.bb.__vector(this.bb_pos + offset) + index * 4, optionalEncoding) : null;
  }
  categoriesLength() {
    const offset = this.bb.__offset(this.bb_pos, 14);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  meshes(obj) {
    const offset = this.bb.__offset(this.bb_pos, 16);
    return offset ? (obj || new Meshes()).__init(this.bb.__indirect(this.bb_pos + offset), this.bb) : null;
  }
  attributes(index, obj) {
    const offset = this.bb.__offset(this.bb_pos, 18);
    return offset ? (obj || new Attribute()).__init(this.bb.__indirect(this.bb.__vector(this.bb_pos + offset) + index * 4), this.bb) : null;
  }
  attributesLength() {
    const offset = this.bb.__offset(this.bb_pos, 18);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  relations(index, obj) {
    const offset = this.bb.__offset(this.bb_pos, 20);
    return offset ? (obj || new Relation()).__init(this.bb.__indirect(this.bb.__vector(this.bb_pos + offset) + index * 4), this.bb) : null;
  }
  relationsLength() {
    const offset = this.bb.__offset(this.bb_pos, 20);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  relationsItems(index) {
    const offset = this.bb.__offset(this.bb_pos, 22);
    return offset ? this.bb.readInt32(this.bb.__vector(this.bb_pos + offset) + index * 4) : 0;
  }
  relationsItemsLength() {
    const offset = this.bb.__offset(this.bb_pos, 22);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  relationsItemsArray() {
    const offset = this.bb.__offset(this.bb_pos, 22);
    return offset ? new Int32Array(this.bb.bytes().buffer, this.bb.bytes().byteOffset + this.bb.__vector(this.bb_pos + offset), this.bb.__vector_len(this.bb_pos + offset)) : null;
  }
  guid(optionalEncoding) {
    const offset = this.bb.__offset(this.bb_pos, 24);
    return offset ? this.bb.__string(this.bb_pos + offset, optionalEncoding) : null;
  }
  spatialStructure(obj) {
    const offset = this.bb.__offset(this.bb_pos, 26);
    return offset ? (obj || new SpatialStructure()).__init(this.bb.__indirect(this.bb_pos + offset), this.bb) : null;
  }
  uniqueAttributes(index, optionalEncoding) {
    const offset = this.bb.__offset(this.bb_pos, 28);
    return offset ? this.bb.__string(this.bb.__vector(this.bb_pos + offset) + index * 4, optionalEncoding) : null;
  }
  uniqueAttributesLength() {
    const offset = this.bb.__offset(this.bb_pos, 28);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  relationNames(index, optionalEncoding) {
    const offset = this.bb.__offset(this.bb_pos, 30);
    return offset ? this.bb.__string(this.bb.__vector(this.bb_pos + offset) + index * 4, optionalEncoding) : null;
  }
  relationNamesLength() {
    const offset = this.bb.__offset(this.bb_pos, 30);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  indexes(index, obj) {
    const offset = this.bb.__offset(this.bb_pos, 32);
    return offset ? (obj || new ModelIndex()).__init(this.bb.__indirect(this.bb.__vector(this.bb_pos + offset) + index * 4), this.bb) : null;
  }
  indexesLength() {
    const offset = this.bb.__offset(this.bb_pos, 32);
    return offset ? this.bb.__vector_len(this.bb_pos + offset) : 0;
  }
  static startModel(builder) {
    builder.startObject(15);
  }
  static addMetadata(builder, metadataOffset) {
    builder.addFieldOffset(0, metadataOffset, 0);
  }
  static addGuids(builder, guidsOffset) {
    builder.addFieldOffset(1, guidsOffset, 0);
  }
  static createGuidsVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addOffset(data[i]);
    }
    return builder.endVector();
  }
  static startGuidsVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static addGuidsItems(builder, guidsItemsOffset) {
    builder.addFieldOffset(2, guidsItemsOffset, 0);
  }
  static createGuidsItemsVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addInt32(data[i]);
    }
    return builder.endVector();
  }
  static startGuidsItemsVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static addMaxLocalId(builder, maxLocalId) {
    builder.addFieldInt32(3, maxLocalId, 0);
  }
  static addLocalIds(builder, localIdsOffset) {
    builder.addFieldOffset(4, localIdsOffset, 0);
  }
  static createLocalIdsVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addInt32(data[i]);
    }
    return builder.endVector();
  }
  static startLocalIdsVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static addCategories(builder, categoriesOffset) {
    builder.addFieldOffset(5, categoriesOffset, 0);
  }
  static createCategoriesVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addOffset(data[i]);
    }
    return builder.endVector();
  }
  static startCategoriesVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static addMeshes(builder, meshesOffset) {
    builder.addFieldOffset(6, meshesOffset, 0);
  }
  static addAttributes(builder, attributesOffset) {
    builder.addFieldOffset(7, attributesOffset, 0);
  }
  static createAttributesVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addOffset(data[i]);
    }
    return builder.endVector();
  }
  static startAttributesVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static addRelations(builder, relationsOffset) {
    builder.addFieldOffset(8, relationsOffset, 0);
  }
  static createRelationsVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addOffset(data[i]);
    }
    return builder.endVector();
  }
  static startRelationsVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static addRelationsItems(builder, relationsItemsOffset) {
    builder.addFieldOffset(9, relationsItemsOffset, 0);
  }
  static createRelationsItemsVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addInt32(data[i]);
    }
    return builder.endVector();
  }
  static startRelationsItemsVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static addGuid(builder, guidOffset) {
    builder.addFieldOffset(10, guidOffset, 0);
  }
  static addSpatialStructure(builder, spatialStructureOffset) {
    builder.addFieldOffset(11, spatialStructureOffset, 0);
  }
  static addUniqueAttributes(builder, uniqueAttributesOffset) {
    builder.addFieldOffset(12, uniqueAttributesOffset, 0);
  }
  static createUniqueAttributesVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addOffset(data[i]);
    }
    return builder.endVector();
  }
  static startUniqueAttributesVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static addRelationNames(builder, relationNamesOffset) {
    builder.addFieldOffset(13, relationNamesOffset, 0);
  }
  static createRelationNamesVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addOffset(data[i]);
    }
    return builder.endVector();
  }
  static startRelationNamesVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static addIndexes(builder, indexesOffset) {
    builder.addFieldOffset(14, indexesOffset, 0);
  }
  static createIndexesVector(builder, data) {
    builder.startVector(4, data.length, 4);
    for (let i = data.length - 1; i >= 0; i--) {
      builder.addOffset(data[i]);
    }
    return builder.endVector();
  }
  static startIndexesVector(builder, numElems) {
    builder.startVector(4, numElems, 4);
  }
  static endModel(builder) {
    const offset = builder.endObject();
    builder.requiredField(offset, 6);
    builder.requiredField(offset, 8);
    builder.requiredField(offset, 12);
    builder.requiredField(offset, 14);
    builder.requiredField(offset, 16);
    builder.requiredField(offset, 24);
    return offset;
  }
  static finishModelBuffer(builder, offset) {
    builder.finish(offset, "0001");
  }
  static finishSizePrefixedModelBuffer(builder, offset) {
    builder.finish(offset, "0001", true);
  }
};

// src/fragments.ts
var USHORT_MAX = 65535;
var SCALE_ROUND_NDIGITS = 4;
var IDENTITY_MATRIX = [
  1,
  0,
  0,
  0,
  0,
  1,
  0,
  0,
  0,
  0,
  1,
  0,
  0,
  0,
  0,
  1
];
function collectLeaves(node, root, parentMatrix, out) {
  const world = multiplyMatrices(parentMatrix, node.matrix);
  const isNamedWrapper = node !== root && !node.nameIsGenerated;
  if (node.meshResourceId !== void 0 || isNamedWrapper) {
    out.push({ node, world });
  }
  if (node.children) {
    for (const child of node.children) {
      collectLeaves(child, root, world, out);
    }
  }
}
function decomposeTrs(m) {
  const xAxis = [m[0], m[1], m[2]];
  const yAxis = [m[4], m[5], m[6]];
  const zAxis = [m[8], m[9], m[10]];
  const pos = [m[12], m[13], m[14]];
  const norm = (v) => {
    const s = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    return s > 0 ? s : 1;
  };
  const sx = norm(xAxis);
  const sy = norm(yAxis);
  const sz = norm(zAxis);
  const det = xAxis[0] * (yAxis[1] * zAxis[2] - yAxis[2] * zAxis[1]) - xAxis[1] * (yAxis[0] * zAxis[2] - yAxis[2] * zAxis[0]) + xAxis[2] * (yAxis[0] * zAxis[1] - yAxis[1] * zAxis[0]);
  const mirrored = det < 0;
  const cleanZero = (v) => v === 0 ? 0 : v;
  let xDir = [
    cleanZero(xAxis[0] / sx),
    cleanZero(xAxis[1] / sx),
    cleanZero(xAxis[2] / sx)
  ];
  if (mirrored) {
    xDir = [cleanZero(-xDir[0]), cleanZero(-xDir[1]), cleanZero(-xDir[2])];
  }
  const yDir = [
    cleanZero(yAxis[0] / sy),
    cleanZero(yAxis[1] / sy),
    cleanZero(yAxis[2] / sy)
  ];
  return {
    position: pos,
    xDir,
    yDir,
    scale: [sx, sy, sz],
    mirrored
  };
}
function bakePrimitive(prim, scale, mirrored) {
  const sx = mirrored ? -scale[0] : scale[0];
  const sy = scale[1];
  const sz = scale[2];
  const positions = prim.positions;
  const nVerts = Math.floor(positions.length / 3);
  const points = new Array(nVerts);
  for (let i = 0; i < nVerts; i++) {
    points[i] = [
      positions[i * 3] * sx,
      positions[i * 3 + 1] * sy,
      positions[i * 3 + 2] * sz
    ];
  }
  const indices = prim.indices;
  const nTris = Math.floor(indices.length / 3);
  const triangles = new Array(nTris);
  for (let i = 0; i < nTris; i++) {
    const a = indices[i * 3];
    const b = indices[i * 3 + 1];
    const c = indices[i * 3 + 2];
    triangles[i] = mirrored ? [a, c, b] : [a, b, c];
  }
  return { points, triangles };
}
function scaleCacheKey(mirrored, scale) {
  const mult = Math.pow(10, SCALE_ROUND_NDIGITS);
  const rnd = (v) => Math.round(v * mult) / mult;
  const sx = mirrored ? -scale[0] : scale[0];
  return `${rnd(sx)}_${rnd(scale[1])}_${rnd(scale[2])}`;
}
function toFragments(scene, options = {}) {
  const leaves = [];
  collectLeaves(scene.sceneHierarchy, scene.sceneHierarchy, IDENTITY_MATRIX, leaves);
  const resourceById = /* @__PURE__ */ new Map();
  for (const r of scene.meshResources) {
    resourceById.set(r.id, r);
  }
  const builder = new flatbuffers15.Builder(1024 * 64);
  const shellKeyToIndex = /* @__PURE__ */ new Map();
  const shellOffsets = [];
  const representationBounds = [];
  const materialKeyToIndex = /* @__PURE__ */ new Map();
  const materialRgba = [];
  const getMaterialIndex = (matIdx) => {
    if (materialKeyToIndex.has(matIdx)) {
      return materialKeyToIndex.get(matIdx);
    }
    let r = 255, g = 255, b = 255, a = 255;
    if (matIdx >= 0 && matIdx < scene.gltfMaterials.length) {
      const gltfMat = scene.gltfMaterials[matIdx];
      const pbr = gltfMat?.pbrMetallicRoughness;
      if (pbr?.baseColorFactor && Array.isArray(pbr.baseColorFactor)) {
        const c = pbr.baseColorFactor;
        r = Math.min(255, Math.max(0, Math.round((c[0] ?? 1) * 255)));
        g = Math.min(255, Math.max(0, Math.round((c[1] ?? 1) * 255)));
        b = Math.min(255, Math.max(0, Math.round((c[2] ?? 1) * 255)));
        a = Math.min(255, Math.max(0, Math.round((c[3] ?? 1) * 255)));
      }
    }
    const idx = materialRgba.length;
    materialRgba.push([r, g, b, a]);
    materialKeyToIndex.set(matIdx, idx);
    return idx;
  };
  const bakeOneShell = (points, triangles) => {
    const isBig = points.length > USHORT_MAX;
    const profileOffsets = [];
    const bigProfileOffsets = [];
    for (const tri of triangles) {
      if (isBig) {
        BigShellProfile.startIndicesVector(builder, 3);
        builder.addInt32(tri[2]);
        builder.addInt32(tri[1]);
        builder.addInt32(tri[0]);
        const indicesVec = builder.endVector();
        BigShellProfile.startBigShellProfile(builder);
        BigShellProfile.addIndices(builder, indicesVec);
        bigProfileOffsets.push(BigShellProfile.endBigShellProfile(builder));
      } else {
        ShellProfile.startIndicesVector(builder, 3);
        builder.addInt16(tri[2]);
        builder.addInt16(tri[1]);
        builder.addInt16(tri[0]);
        const indicesVec = builder.endVector();
        ShellProfile.startShellProfile(builder);
        ShellProfile.addIndices(builder, indicesVec);
        profileOffsets.push(ShellProfile.endShellProfile(builder));
      }
    }
    const profilesVec = Shell.createProfilesVector(builder, isBig ? [] : profileOffsets);
    const bigProfilesVec = Shell.createBigProfilesVector(builder, isBig ? bigProfileOffsets : []);
    Shell.startHolesVector(builder, 0);
    const holesVec = builder.endVector();
    Shell.startBigHolesVector(builder, 0);
    const bigHolesVec = builder.endVector();
    Shell.startPointsVector(builder, points.length);
    for (let i = points.length - 1; i >= 0; i--) {
      FloatVector.createFloatVector(builder, points[i][0], points[i][1], points[i][2]);
    }
    const pointsVec = builder.endVector();
    const faceIds = new Uint16Array(triangles.length);
    for (let i = 0; i < triangles.length; i++) {
      faceIds[i] = i;
    }
    const faceIdsVec = Shell.createProfilesFaceIdsVector(builder, faceIds);
    Shell.startShell(builder);
    Shell.addProfiles(builder, profilesVec);
    Shell.addBigProfiles(builder, bigProfilesVec);
    Shell.addHoles(builder, holesVec);
    Shell.addBigHoles(builder, bigHolesVec);
    Shell.addPoints(builder, pointsVec);
    Shell.addType(builder, isBig ? 1 /* BIG */ : 0 /* NONE */);
    Shell.addProfilesFaceIds(builder, faceIdsVec);
    const shellOff = Shell.endShell(builder);
    const index = shellOffsets.length;
    shellOffsets.push(shellOff);
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const p of points) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
      if (p[2] < minZ) minZ = p[2];
      if (p[2] > maxZ) maxZ = p[2];
    }
    if (minX === Infinity) {
      minX = minY = minZ = 0;
      maxX = maxY = maxZ = 0;
    }
    representationBounds.push({
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ]
    });
    return index;
  };
  const getOrBakeShell = (resourceId, primIdx, prim, scale, mirrored) => {
    const sk = scaleCacheKey(mirrored, scale);
    const key = `${resourceId}:${primIdx}:${sk}`;
    if (shellKeyToIndex.has(key)) {
      return shellKeyToIndex.get(key);
    }
    const baked = bakePrimitive(prim, scale, mirrored);
    let indices;
    if (baked.triangles.length > USHORT_MAX) {
      indices = [];
      for (let i = 0; i < baked.triangles.length; i += USHORT_MAX) {
        indices.push(bakeOneShell(baked.points, baked.triangles.slice(i, i + USHORT_MAX)));
      }
    } else {
      indices = [bakeOneShell(baked.points, baked.triangles)];
    }
    shellKeyToIndex.set(key, indices);
    return indices;
  };
  const localIds = [];
  const categories = [];
  const names = [];
  const guids = [];
  const generatedNameGuids = [];
  const sampleMaterial = [];
  const sampleRepresentation = [];
  const meshesItems = [];
  const globalTransformData = [];
  const itemIndexByNode = /* @__PURE__ */ new Map();
  const seenGuids = /* @__PURE__ */ new Set();
  for (let itemIndex = 0; itemIndex < leaves.length; itemIndex++) {
    const { node, world } = leaves[itemIndex];
    const resourceId = node.meshResourceId;
    const res = resourceId !== void 0 ? resourceById.get(resourceId) : void 0;
    if (resourceId !== void 0 && res === void 0) {
      continue;
    }
    localIds.push(itemIndex);
    categories.push(node.layer || "Layer0");
    names.push(node.name || "");
    const rawGuid = node.guid || "";
    const itemGuid = rawGuid && !seenGuids.has(rawGuid) ? rawGuid : `openskp-${itemIndex}`;
    seenGuids.add(itemGuid);
    guids.push(itemGuid);
    if (node.nameIsGenerated) generatedNameGuids.push(itemGuid);
    itemIndexByNode.set(node, itemIndex);
    if (res !== void 0) {
      const trs = decomposeTrs(world);
      for (let primIdx = 0; primIdx < res.primitives.length; primIdx++) {
        const prim = res.primitives[primIdx];
        const materialIndex = getMaterialIndex(prim.materialIndex);
        for (const shellIndex of getOrBakeShell(resourceId, primIdx, prim, trs.scale, trs.mirrored)) {
          sampleMaterial.push(materialIndex);
          sampleRepresentation.push(shellIndex);
          meshesItems.push(itemIndex);
          globalTransformData.push({
            pos: trs.position,
            xDir: trs.xDir,
            yDir: trs.yDir
          });
        }
      }
    }
  }
  const nSamples = sampleMaterial.length;
  Meshes.startShellsVector(builder, shellOffsets.length);
  for (let i = shellOffsets.length - 1; i >= 0; i--) {
    builder.addOffset(shellOffsets[i]);
  }
  const shellsVec = builder.endVector();
  const renderedFaces = options.doubleSided ?? false ? 1 /* TWO */ : 0 /* ONE */;
  Meshes.startMaterialsVector(builder, materialRgba.length);
  for (let i = materialRgba.length - 1; i >= 0; i--) {
    const rgba = materialRgba[i];
    Material2.createMaterial(
      builder,
      rgba[0],
      rgba[1],
      rgba[2],
      rgba[3],
      renderedFaces,
      0 /* DEFAULT */
    );
  }
  const materialsVec = builder.endVector();
  Meshes.startRepresentationsVector(builder, representationBounds.length);
  for (let i = representationBounds.length - 1; i >= 0; i--) {
    const { min, max } = representationBounds[i];
    Representation.createRepresentation(
      builder,
      i,
      min[0],
      min[1],
      min[2],
      max[0],
      max[1],
      max[2],
      1 /* SHELL */
    );
  }
  const representationsVec = builder.endVector();
  Meshes.startSamplesVector(builder, nSamples);
  for (let i = nSamples - 1; i >= 0; i--) {
    Sample.createSample(builder, i, sampleMaterial[i], sampleRepresentation[i], 0);
  }
  const samplesVec = builder.endVector();
  Meshes.startMeshesItemsVector(builder, nSamples);
  for (let i = nSamples - 1; i >= 0; i--) {
    builder.addInt32(meshesItems[i]);
  }
  const meshesItemsVec = builder.endVector();
  Meshes.startGlobalTransformsVector(builder, nSamples);
  for (let i = nSamples - 1; i >= 0; i--) {
    const gt = globalTransformData[i];
    Transform.createTransform(
      builder,
      gt.pos[0],
      gt.pos[1],
      gt.pos[2],
      gt.xDir[0],
      gt.xDir[1],
      gt.xDir[2],
      gt.yDir[0],
      gt.yDir[1],
      gt.yDir[2]
    );
  }
  const globalTransformsVec = builder.endVector();
  Meshes.startLocalTransformsVector(builder, 1);
  Transform.createTransform(builder, 0, 0, 0, 1, 0, 0, 0, 1, 0);
  const localTransformsVec = builder.endVector();
  Meshes.startCircleExtrusionsVector(builder, 0);
  const circleExtrusionsVec = builder.endVector();
  const coordsOffset = Transform.createTransform(builder, 0, 0, 0, 1, 0, 0, 0, 1, 0);
  Meshes.startMeshes(builder);
  Meshes.addCoordinates(builder, coordsOffset);
  Meshes.addMeshesItems(builder, meshesItemsVec);
  Meshes.addSamples(builder, samplesVec);
  Meshes.addRepresentations(builder, representationsVec);
  Meshes.addMaterials(builder, materialsVec);
  Meshes.addCircleExtrusions(builder, circleExtrusionsVec);
  Meshes.addShells(builder, shellsVec);
  Meshes.addLocalTransforms(builder, localTransformsVec);
  Meshes.addGlobalTransforms(builder, globalTransformsVec);
  const meshesOff = Meshes.endMeshes(builder);
  const catOffsets = categories.map((c) => builder.createString(c));
  const categoriesVec = Model.createCategoriesVector(builder, catOffsets);
  const localIdsVec = Model.createLocalIdsVector(builder, localIds);
  const guidStr = builder.createString(options.modelId || "00000000-0000-0000-0000-000000000000");
  const guidOffsets = guids.map((g) => builder.createString(g));
  const guidsVec = Model.createGuidsVector(builder, guidOffsets);
  const guidsItemsVec = Model.createGuidsItemsVector(builder, localIds);
  const attributeOffsets = [];
  for (const name of names) {
    const dataOffsets = [];
    if (name) {
      const entry = JSON.stringify(["Name", name, "STRING"]);
      dataOffsets.push(builder.createString(entry));
    }
    const dataVec = Attribute.createDataVector(builder, dataOffsets);
    Attribute.startAttribute(builder);
    Attribute.addData(builder, dataVec);
    attributeOffsets.push(Attribute.endAttribute(builder));
  }
  const attributesVec = Model.createAttributesVector(builder, attributeOffsets);
  const metadataOff = builder.createString(
    JSON.stringify({
      layer_hidden: scene.layerHidden || {},
      generated_name_guids: generatedNameGuids
    })
  );
  function buildSpatialNode(node) {
    const childOffsets = [];
    if (node.children) {
      for (const child of node.children) {
        childOffsets.push(buildSpatialNode(child));
      }
    }
    const childrenVec = SpatialStructure.createChildrenVector(builder, childOffsets);
    const categoryOffset = node.layer ? builder.createString(node.layer) : null;
    const itemIndex = itemIndexByNode.get(node);
    SpatialStructure.startSpatialStructure(builder);
    if (itemIndex !== void 0) {
      SpatialStructure.addLocalId(builder, itemIndex);
    }
    if (categoryOffset !== null) {
      SpatialStructure.addCategory(builder, categoryOffset);
    }
    SpatialStructure.addChildren(builder, childrenVec);
    return SpatialStructure.endSpatialStructure(builder);
  }
  const rootSpatial = buildSpatialNode(scene.sceneHierarchy);
  Model.startModel(builder);
  Model.addMeshes(builder, meshesOff);
  Model.addLocalIds(builder, localIdsVec);
  Model.addCategories(builder, categoriesVec);
  Model.addAttributes(builder, attributesVec);
  Model.addGuids(builder, guidsVec);
  Model.addGuidsItems(builder, guidsItemsVec);
  Model.addGuid(builder, guidStr);
  Model.addMaxLocalId(builder, localIds.length);
  Model.addSpatialStructure(builder, rootSpatial);
  Model.addMetadata(builder, metadataOff);
  const modelOff = Model.endModel(builder);
  Model.finishModelBuffer(builder, modelOff);
  const rawBytes = builder.asUint8Array();
  return options.raw ? rawBytes : fflate.zlibSync(rawBytes);
}
var SUPPORTED_REPRESENTATION_CLASSES = /* @__PURE__ */ new Set([1 /* SHELL */]);
function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}
function computeFlatNormals(points, triangles) {
  const normals = points.map(() => [0, 0, 1]);
  for (const [a, b, c] of triangles) {
    const pa = points[a];
    const pb = points[b];
    const pc = points[c];
    const u = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
    const v = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    let n = cross3(u, v);
    const length = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]);
    if (length > 1e-12) {
      n = [n[0] / length, n[1] / length, n[2] / length];
    }
    normals[a] = n;
    normals[b] = n;
    normals[c] = n;
  }
  return normals;
}
function transformToMatrix16(transform) {
  const pos = transform.position(new DoubleVector());
  const xDirS = transform.xDirection(new FloatVector());
  const yDirS = transform.yDirection(new FloatVector());
  const xDir = [xDirS.x(), xDirS.y(), xDirS.z()];
  const yDir = [yDirS.x(), yDirS.y(), yDirS.z()];
  const zDir = cross3(xDir, yDir);
  return [
    xDir[0],
    xDir[1],
    xDir[2],
    0,
    yDir[0],
    yDir[1],
    yDir[2],
    0,
    zDir[0],
    zDir[1],
    zDir[2],
    0,
    pos.x(),
    pos.y(),
    pos.z(),
    1
  ];
}
function extractNameAttribute(attribute) {
  if (attribute === null) return "";
  for (let i = 0; i < attribute.dataLength(); i++) {
    const raw = attribute.data(i);
    try {
      const triple = JSON.parse(raw);
      if (Array.isArray(triple) && triple.length >= 2 && triple[0] === "Name") {
        return String(triple[1]);
      }
    } catch {
      continue;
    }
  }
  return "";
}
function fromFragments(data) {
  let rawBytes;
  try {
    rawBytes = fflate.unzlibSync(data);
  } catch {
    rawBytes = data;
  }
  const bb = new flatbuffers15.ByteBuffer(rawBytes);
  const model = Model.getRootAsModel(bb);
  const meshes = model.meshes();
  const gltfMaterials = [];
  if (meshes !== null) {
    for (let i = 0; i < meshes.materialsLength(); i++) {
      const mat = meshes.materials(i);
      gltfMaterials.push({
        pbrMetallicRoughness: {
          baseColorFactor: [mat.r() / 255, mat.g() / 255, mat.b() / 255, mat.a() / 255],
          metallicFactor: 0,
          roughnessFactor: 1
        },
        doubleSided: mat.renderedFaces() !== 0 /* ONE */
      });
    }
  }
  if (gltfMaterials.length === 0) {
    gltfMaterials.push({
      pbrMetallicRoughness: { baseColorFactor: [0.8, 0.8, 0.8, 1], metallicFactor: 0, roughnessFactor: 1 }
    });
  }
  const nShells = meshes !== null ? meshes.shellsLength() : 0;
  const shellGeometry = new Array(nShells).fill(null);
  const shellTriangles = new Array(nShells).fill(null);
  function decodeShell(shellIdx) {
    if (shellGeometry[shellIdx] !== null) {
      return { points: shellGeometry[shellIdx], triangles: shellTriangles[shellIdx] };
    }
    const shell = meshes.shells(shellIdx);
    const nPoints = shell.pointsLength();
    const points = [];
    for (let j = 0; j < nPoints; j++) {
      const p = shell.points(j);
      points.push([p.x(), p.y(), p.z()]);
    }
    const isBig = shell.type() === 1 /* BIG */;
    const triangles = [];
    if (isBig) {
      for (let j = 0; j < shell.bigProfilesLength(); j++) {
        const profile = shell.bigProfiles(j);
        if (profile.indicesLength() >= 3) {
          triangles.push([profile.indices(0), profile.indices(1), profile.indices(2)]);
        }
      }
    } else {
      for (let j = 0; j < shell.profilesLength(); j++) {
        const profile = shell.profiles(j);
        if (profile.indicesLength() >= 3) {
          triangles.push([profile.indices(0), profile.indices(1), profile.indices(2)]);
        }
      }
    }
    shellGeometry[shellIdx] = points;
    shellTriangles[shellIdx] = triangles;
    return { points, triangles };
  }
  const nSamples = meshes !== null ? meshes.samplesLength() : 0;
  const samplesByItem = /* @__PURE__ */ new Map();
  for (let k = 0; k < nSamples; k++) {
    const itemIdx = meshes.meshesItems(k);
    if (!samplesByItem.has(itemIdx)) samplesByItem.set(itemIdx, []);
    samplesByItem.get(itemIdx).push(k);
  }
  const nItems = model.localIdsLength();
  const localIdToItemIndex = /* @__PURE__ */ new Map();
  for (let i = 0; i < nItems; i++) {
    localIdToItemIndex.set(model.localIds(i), i);
  }
  const guidByItem = /* @__PURE__ */ new Map();
  const nGuidItems = model.guidsItemsLength();
  for (let i = 0; i < nGuidItems; i++) {
    const lid = model.guidsItems(i);
    const itemIdx = localIdToItemIndex.get(lid);
    if (itemIdx !== void 0 && i < model.guidsLength()) {
      guidByItem.set(itemIdx, model.guids(i));
    }
  }
  let metadata = {};
  const metadataRaw = model.metadata();
  if (metadataRaw) {
    try {
      metadata = JSON.parse(metadataRaw);
    } catch {
      metadata = {};
    }
  }
  const layerHidden = { ...metadata.layer_hidden || {} };
  const generatedNameGuids = new Set(metadata.generated_name_guids || []);
  const meshResources = [];
  const resourceBySignature = /* @__PURE__ */ new Map();
  let warnedUnsupported = false;
  function buildResourceForItem(itemIdx, itemName) {
    const sampleIndices = samplesByItem.get(itemIdx) || [];
    const signature = [];
    const primitives = [];
    for (const k of sampleIndices) {
      const sample = meshes.samples(k);
      const repIdx = sample.representation();
      const matIdx = sample.material();
      const representation = repIdx < meshes.representationsLength() ? meshes.representations(repIdx) : null;
      const repClass = representation !== null ? representation.representationClass() : 1 /* SHELL */;
      if (!SUPPORTED_REPRESENTATION_CLASSES.has(repClass)) {
        if (!warnedUnsupported) {
          console.warn(
            `openskp fromFragments: skipping a sample with unsupported RepresentationClass=${repClass} (only SHELL is read today).`
          );
          warnedUnsupported = true;
        }
        continue;
      }
      signature.push([repIdx, matIdx]);
      const shellIdx = representation.id();
      if (shellIdx >= nShells) continue;
      const { points, triangles } = decodeShell(shellIdx);
      const normals = computeFlatNormals(points, triangles);
      const positions = new Float32Array(points.length * 3);
      const normalsArr = new Float32Array(points.length * 3);
      for (let i = 0; i < points.length; i++) {
        positions[i * 3] = points[i][0];
        positions[i * 3 + 1] = points[i][1];
        positions[i * 3 + 2] = points[i][2];
        normalsArr[i * 3] = normals[i][0];
        normalsArr[i * 3 + 1] = normals[i][1];
        normalsArr[i * 3 + 2] = normals[i][2];
      }
      const uvs = new Float32Array(points.length * 2);
      const indices = new Uint32Array(triangles.length * 3);
      for (let i = 0; i < triangles.length; i++) {
        indices[i * 3] = triangles[i][0];
        indices[i * 3 + 1] = triangles[i][1];
        indices[i * 3 + 2] = triangles[i][2];
      }
      primitives.push({ positions, normals: normalsArr, uvs, indices, materialIndex: matIdx < gltfMaterials.length ? matIdx : 0 });
    }
    const sigKey = signature.map(([r, m]) => `${r}:${m}`).join(",");
    if (sigKey && resourceBySignature.has(sigKey)) {
      return resourceBySignature.get(sigKey);
    }
    const resourceId = `frag-${itemIdx}`;
    meshResources.push({
      id: resourceId,
      definitionId: itemIdx,
      definitionName: itemName || resourceId,
      variantKey: "default",
      primitives
    });
    if (sigKey) resourceBySignature.set(sigKey, resourceId);
    return resourceId;
  }
  function buildNode(spatial) {
    const localId = spatial.localId();
    const category = spatial.category() || "";
    let name = "";
    let guid = "";
    let meshResourceId;
    let matrix = IDENTITY_MATRIX;
    let nameIsGenerated = false;
    if (localId !== null) {
      const itemIdx = localIdToItemIndex.get(localId);
      if (itemIdx !== void 0) {
        const attribute = itemIdx < model.attributesLength() ? model.attributes(itemIdx) : null;
        name = extractNameAttribute(attribute);
        guid = guidByItem.get(itemIdx) || "";
        nameIsGenerated = Boolean(guid) && generatedNameGuids.has(guid);
        if (samplesByItem.has(itemIdx)) {
          meshResourceId = buildResourceForItem(itemIdx, name || category);
          const transform = meshes.globalTransforms(samplesByItem.get(itemIdx)[0]);
          matrix = transformToMatrix16(transform);
        }
      }
    }
    const children = [];
    for (let i = 0; i < spatial.childrenLength(); i++) {
      children.push(buildNode(spatial.children(i)));
    }
    return {
      name,
      nameIsGenerated,
      definitionName: category,
      layer: category,
      matrix,
      positionMm: [0, 0, 0],
      properties: {},
      attributeDictionaries: {},
      guid,
      meshResourceId,
      children
    };
  }
  const rootSpatial = model.spatialStructure();
  const sceneHierarchy = rootSpatial !== null ? buildNode(rootSpatial) : {
    name: "ROOT",
    nameIsGenerated: false,
    definitionName: "ROOT",
    layer: "",
    matrix: IDENTITY_MATRIX,
    positionMm: [0, 0, 0],
    properties: {},
    attributeDictionaries: {},
    guid: "",
    children: []
  };
  return {
    bounds: null,
    sceneHierarchy,
    meshResources,
    gltfMaterials,
    textures: [],
    layerHidden
  };
}

// src/instanced-glb.ts
function stripTextureRefs(materials) {
  let needsCopy = false;
  for (const mat of materials) {
    if (mat?.pbrMetallicRoughness?.baseColorTexture) {
      needsCopy = true;
      break;
    }
  }
  if (!needsCopy) return materials;
  return materials.map((mat) => {
    const pbr = mat?.pbrMetallicRoughness;
    if (!pbr?.baseColorTexture) return mat;
    const restPbr = { ...pbr };
    delete restPbr.baseColorTexture;
    return { ...mat, pbrMetallicRoughness: restPbr };
  });
}
function createGlb(json, binaryBuffer) {
  let jsonString = JSON.stringify(json);
  const jsonRemainder = jsonString.length % 4;
  if (jsonRemainder !== 0) {
    jsonString += " ".repeat(4 - jsonRemainder);
  }
  const jsonBuffer = new TextEncoder().encode(jsonString);
  let paddedBinaryBuffer = binaryBuffer;
  const binaryRemainder = binaryBuffer.length % 4;
  if (binaryRemainder !== 0) {
    const padLength = 4 - binaryRemainder;
    paddedBinaryBuffer = new Uint8Array(binaryBuffer.length + padLength);
    paddedBinaryBuffer.set(binaryBuffer);
  }
  const totalLength = 12 + 8 + jsonBuffer.length + 8 + paddedBinaryBuffer.length;
  const glb = new Uint8Array(totalLength);
  const view = new DataView(glb.buffer);
  view.setUint32(0, 1179937895, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonBuffer.length, true);
  view.setUint32(16, 1313821514, true);
  glb.set(jsonBuffer, 20);
  const binHeaderOffset = 20 + jsonBuffer.length;
  view.setUint32(binHeaderOffset, paddedBinaryBuffer.length, true);
  view.setUint32(binHeaderOffset + 4, 5130562, true);
  glb.set(paddedBinaryBuffer, binHeaderOffset + 8);
  return glb;
}
function toInstancedGLB(scene, options) {
  const resources = scene.meshResources || [];
  const gltfMaterials = scene.gltfMaterials || [];
  const sceneTextures = options?.textures ? scene.textures || [] : [];
  const encodedIndices = /* @__PURE__ */ new Map();
  const encodedKey = (resId, primIdx) => `${resId}:${primIdx}`;
  let totalBinaryLength = 0;
  for (const res of resources) {
    for (let i = 0; i < res.primitives.length; i++) {
      const prim = res.primitives[i];
      const encoded = encodeIndices(prim.indices);
      encodedIndices.set(encodedKey(res.id, i), encoded);
      totalBinaryLength += prim.positions.byteLength;
      totalBinaryLength += prim.normals.byteLength;
      totalBinaryLength += prim.uvs.byteLength;
      totalBinaryLength += encoded.data.byteLength;
      totalBinaryLength += (4 - totalBinaryLength % 4) % 4;
    }
  }
  const imagePlacements = [];
  for (const tex of sceneTextures) {
    totalBinaryLength += (4 - totalBinaryLength % 4) % 4;
    imagePlacements.push({ offset: totalBinaryLength, length: tex.data.length });
    totalBinaryLength += tex.data.length;
  }
  const binaryBuffer = new Uint8Array(totalBinaryLength);
  const bufferViews = [];
  const accessors = [];
  const gltfMeshes = [];
  const meshIndexById = /* @__PURE__ */ new Map();
  let byteOffset = 0;
  for (const res of resources) {
    const gltfPrimitives = [];
    for (let primIdx = 0; primIdx < res.primitives.length; primIdx++) {
      const prim = res.primitives[primIdx];
      const encoded = encodedIndices.get(encodedKey(res.id, primIdx));
      const posByteOffset = byteOffset;
      binaryBuffer.set(
        new Uint8Array(prim.positions.buffer, prim.positions.byteOffset, prim.positions.byteLength),
        posByteOffset
      );
      byteOffset += prim.positions.byteLength;
      const normByteOffset = byteOffset;
      binaryBuffer.set(
        new Uint8Array(prim.normals.buffer, prim.normals.byteOffset, prim.normals.byteLength),
        normByteOffset
      );
      byteOffset += prim.normals.byteLength;
      const uvByteOffset = byteOffset;
      binaryBuffer.set(
        new Uint8Array(prim.uvs.buffer, prim.uvs.byteOffset, prim.uvs.byteLength),
        uvByteOffset
      );
      byteOffset += prim.uvs.byteLength;
      const indByteOffset = byteOffset;
      binaryBuffer.set(
        new Uint8Array(encoded.data.buffer, encoded.data.byteOffset, encoded.data.byteLength),
        indByteOffset
      );
      byteOffset += encoded.data.byteLength;
      byteOffset += (4 - byteOffset % 4) % 4;
      const posBufferViewIdx = bufferViews.length;
      bufferViews.push({
        buffer: 0,
        byteOffset: posByteOffset,
        byteLength: prim.positions.byteLength,
        target: 34962
        // ARRAY_BUFFER
      });
      const normBufferViewIdx = bufferViews.length;
      bufferViews.push({
        buffer: 0,
        byteOffset: normByteOffset,
        byteLength: prim.normals.byteLength,
        target: 34962
      });
      const uvBufferViewIdx = bufferViews.length;
      bufferViews.push({
        buffer: 0,
        byteOffset: uvByteOffset,
        byteLength: prim.uvs.byteLength,
        target: 34962
      });
      const indBufferViewIdx = bufferViews.length;
      bufferViews.push({
        buffer: 0,
        byteOffset: indByteOffset,
        byteLength: encoded.data.byteLength,
        target: 34963
        // ELEMENT_ARRAY_BUFFER
      });
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (let i = 0; i < prim.positions.length; i += 3) {
        const x = prim.positions[i];
        const y = prim.positions[i + 1];
        const z = prim.positions[i + 2];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
      if (minX === Infinity) {
        minX = minY = minZ = 0;
        maxX = maxY = maxZ = 0;
      }
      const posAccessorIdx = accessors.length;
      accessors.push({
        bufferView: posBufferViewIdx,
        byteOffset: 0,
        componentType: 5126,
        // FLOAT
        count: prim.positions.length / 3,
        type: "VEC3",
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ]
      });
      const normAccessorIdx = accessors.length;
      accessors.push({
        bufferView: normBufferViewIdx,
        byteOffset: 0,
        componentType: 5126,
        count: prim.normals.length / 3,
        type: "VEC3"
      });
      const uvAccessorIdx = accessors.length;
      accessors.push({
        bufferView: uvBufferViewIdx,
        byteOffset: 0,
        componentType: 5126,
        count: prim.uvs.length / 2,
        type: "VEC2"
      });
      const indAccessorIdx = accessors.length;
      accessors.push({
        bufferView: indBufferViewIdx,
        byteOffset: 0,
        componentType: encoded.componentType,
        count: prim.indices.length,
        type: "SCALAR"
      });
      gltfPrimitives.push({
        attributes: {
          POSITION: posAccessorIdx,
          NORMAL: normAccessorIdx,
          TEXCOORD_0: uvAccessorIdx
        },
        indices: indAccessorIdx,
        material: prim.materialIndex
      });
    }
    if (gltfPrimitives.length === 0) continue;
    meshIndexById.set(res.id, gltfMeshes.length);
    gltfMeshes.push({
      name: res.definitionName || res.id,
      primitives: gltfPrimitives
    });
  }
  const gltfNodes = [];
  const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const isIdentity = (m) => m.length === 16 && m.every((v, i) => Math.abs(v - IDENTITY[i]) < 1e-12);
  function emitNode(node) {
    const idx = gltfNodes.length;
    const gltfNode = {};
    if (node.name) gltfNode.name = node.name;
    else if (node.definitionName) gltfNode.name = node.definitionName;
    if (!isIdentity(node.matrix)) {
      gltfNode.matrix = node.matrix;
    }
    const meshIdx = node.meshResourceId !== void 0 ? meshIndexById.get(node.meshResourceId) : void 0;
    if (meshIdx !== void 0) {
      gltfNode.mesh = meshIdx;
    }
    gltfNodes.push(gltfNode);
    if (node.children.length > 0) {
      const childIndices = node.children.map(emitNode);
      gltfNodes[idx].children = childIndices;
    }
    return idx;
  }
  const rootIdx = emitNode(scene.sceneHierarchy);
  const gltfImages = [];
  const gltfTextures = [];
  for (let i = 0; i < sceneTextures.length; i++) {
    const tex = sceneTextures[i];
    const place = imagePlacements[i];
    binaryBuffer.set(tex.data, place.offset);
    const viewIdx = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset: place.offset, byteLength: place.length });
    gltfImages.push({ bufferView: viewIdx, mimeType: tex.mimeType });
    gltfTextures.push({ sampler: 0, source: gltfImages.length - 1 });
  }
  const gltfJson = {
    asset: {
      version: "2.0",
      generator: "OpenSKP TypeScript Instanced Exporter"
    },
    scene: 0,
    scenes: [{ nodes: [rootIdx] }],
    nodes: gltfNodes,
    meshes: gltfMeshes,
    materials: sceneTextures.length > 0 ? gltfMaterials : stripTextureRefs(gltfMaterials),
    buffers: [{ byteLength: totalBinaryLength }],
    bufferViews,
    accessors,
    ...gltfImages.length > 0 ? {
      images: gltfImages,
      textures: gltfTextures,
      samplers: [{ wrapS: 10497, wrapT: 10497 }]
      // REPEAT / REPEAT
    } : {}
  };
  return createGlb(gltfJson, binaryBuffer);
}

// src/obj.ts
function sanitizeMaterialName(name) {
  const clean = name.trim().replace(/[^\w.-]/g, "_");
  return clean || "default_material";
}
function materialNames(scene) {
  const bases = scene.gltfMaterials.map(
    (mat, i) => sanitizeMaterialName(mat?.name || `Material_${i}`)
  );
  const reserved = new Set(bases);
  const used = /* @__PURE__ */ new Set();
  return bases.map((base, i) => {
    let name = base;
    if (used.has(name)) {
      const stem = `${base}_${i + 1}`;
      name = stem;
      let suffix = 1;
      while (used.has(name) || reserved.has(name)) {
        name = `${stem}_${suffix++}`;
      }
    }
    used.add(name);
    return name;
  });
}
function toMTL(scene) {
  const lines = [
    "# OpenSKP MTL Material Library Export",
    `# Materials: ${scene.gltfMaterials.length}`,
    ""
  ];
  const names = materialNames(scene);
  for (let idx = 0; idx < scene.gltfMaterials.length; idx++) {
    const mat = scene.gltfMaterials[idx];
    const matName = names[idx];
    const pbr = mat.pbrMetallicRoughness || {};
    const baseColor = pbr.baseColorFactor || [0.8, 0.8, 0.8, 1];
    const r = (baseColor[0] ?? 0.8).toFixed(6);
    const g = (baseColor[1] ?? 0.8).toFixed(6);
    const b = (baseColor[2] ?? 0.8).toFixed(6);
    const a = (baseColor[3] ?? 1).toFixed(6);
    lines.push(
      `newmtl ${matName}`,
      "Ka 1.000000 1.000000 1.000000",
      `Kd ${r} ${g} ${b}`,
      "Ks 0.200000 0.200000 0.200000",
      "Ns 32.000000",
      `d ${a}`,
      "illum 2"
    );
    const texturePath = mat.texture_path;
    if (texturePath) {
      const texName = texturePath.split(/[/\\]/).pop();
      lines.push(`map_Kd ${texName}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
function toOBJ(scene, mtlFilename) {
  const lines = [
    "# OpenSKP OBJ Export",
    `# Primitives: ${scene.glbPrimitives.length}`
  ];
  if (mtlFilename) {
    lines.push(`mtllib ${mtlFilename}`);
  }
  lines.push("");
  const names = materialNames(scene);
  let vertOffset = 1;
  let uvOffset = 1;
  let normOffset = 1;
  for (const prim of scene.glbPrimitives) {
    lines.push(`o ${prim.geomName}`);
    const vertCount = Math.floor(prim.positions.length / 3);
    for (let i = 0; i < vertCount; i++) {
      const x = prim.positions[i * 3].toFixed(6);
      const y = prim.positions[i * 3 + 1].toFixed(6);
      const z = prim.positions[i * 3 + 2].toFixed(6);
      lines.push(`v ${x} ${y} ${z}`);
    }
    const uvCount = prim.uvs ? Math.floor(prim.uvs.length / 2) : 0;
    for (let i = 0; i < uvCount; i++) {
      const u = prim.uvs[i * 2].toFixed(6);
      const v = prim.uvs[i * 2 + 1].toFixed(6);
      lines.push(`vt ${u} ${v}`);
    }
    const normCount = prim.normals ? Math.floor(prim.normals.length / 3) : 0;
    for (let i = 0; i < normCount; i++) {
      const nx = prim.normals[i * 3].toFixed(6);
      const ny = prim.normals[i * 3 + 1].toFixed(6);
      const nz = prim.normals[i * 3 + 2].toFixed(6);
      lines.push(`vn ${nx} ${ny} ${nz}`);
    }
    const matIdx = prim.materialIndex;
    if (matIdx >= 0 && matIdx < scene.gltfMaterials.length) {
      lines.push(`usemtl ${names[matIdx]}`);
    }
    const triCount = Math.floor(prim.indices.length / 3);
    const hasUvs = uvCount === vertCount;
    const hasNormals = normCount === vertCount;
    for (let i = 0; i < triCount; i++) {
      const i0 = prim.indices[i * 3];
      const i1 = prim.indices[i * 3 + 1];
      const i2 = prim.indices[i * 3 + 2];
      const v0 = i0 + vertOffset;
      const v1 = i1 + vertOffset;
      const v2 = i2 + vertOffset;
      if (hasUvs && hasNormals) {
        const vt0 = i0 + uvOffset;
        const vt1 = i1 + uvOffset;
        const vt2 = i2 + uvOffset;
        const vn0 = i0 + normOffset;
        const vn1 = i1 + normOffset;
        const vn2 = i2 + normOffset;
        lines.push(`f ${v0}/${vt0}/${vn0} ${v1}/${vt1}/${vn1} ${v2}/${vt2}/${vn2}`);
      } else if (hasUvs) {
        const vt0 = i0 + uvOffset;
        const vt1 = i1 + uvOffset;
        const vt2 = i2 + uvOffset;
        lines.push(`f ${v0}/${vt0} ${v1}/${vt1} ${v2}/${vt2}`);
      } else if (hasNormals) {
        const vn0 = i0 + normOffset;
        const vn1 = i1 + normOffset;
        const vn2 = i2 + normOffset;
        lines.push(`f ${v0}//${vn0} ${v1}//${vn1} ${v2}//${vn2}`);
      } else {
        lines.push(`f ${v0} ${v1} ${v2}`);
      }
    }
    vertOffset += vertCount;
    if (hasUvs) uvOffset += uvCount;
    if (hasNormals) normOffset += normCount;
    lines.push("");
  }
  return lines.join("\n");
}
function exportOBJ(scene, outputPath, exportMtl = true) {
  if (typeof process !== "undefined" && process.versions && process.versions.node) {
    const fs = require("fs");
    const path = require("path");
    const mtlName = exportMtl ? `${path.basename(outputPath, path.extname(outputPath))}.mtl` : void 0;
    const text = toOBJ(scene, mtlName);
    const dir = path.dirname(outputPath);
    if (dir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, text, "utf-8");
    if (exportMtl && mtlName) {
      const mtlPath = path.join(dir, mtlName);
      fs.writeFileSync(mtlPath, toMTL(scene), "utf-8");
    }
  } else {
    throw new Error("exportOBJ file writing is only supported in Node.js environment");
  }
}

// src/stl.ts
function calculateNormal(v0, v1, v2) {
  const e1x = v1[0] - v0[0];
  const e1y = v1[1] - v0[1];
  const e1z = v1[2] - v0[2];
  const e2x = v2[0] - v0[0];
  const e2y = v2[1] - v0[1];
  const e2z = v2[2] - v0[2];
  const nx = e1y * e2z - e1z * e2y;
  const ny = e1z * e2x - e1x * e2z;
  const nz = e1x * e2y - e1y * e2x;
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (len > 1e-12) {
    return [nx / len, ny / len, nz / len];
  }
  return [0, 0, 0];
}
function toSTLAscii(scene, scale = 1) {
  if (!scene || !scene.glbPrimitives) {
    throw new Error("toSTLAscii requires a valid SkpScene instance");
  }
  const lines = ["solid OpenSKP_Model"];
  for (const prim of scene.glbPrimitives) {
    const triCount = Math.floor(prim.indices.length / 3);
    for (let i = 0; i < triCount; i++) {
      const i0 = prim.indices[i * 3];
      const i1 = prim.indices[i * 3 + 1];
      const i2 = prim.indices[i * 3 + 2];
      const v0 = [
        prim.positions[i0 * 3] * scale,
        prim.positions[i0 * 3 + 1] * scale,
        prim.positions[i0 * 3 + 2] * scale
      ];
      const v1 = [
        prim.positions[i1 * 3] * scale,
        prim.positions[i1 * 3 + 1] * scale,
        prim.positions[i1 * 3 + 2] * scale
      ];
      const v2 = [
        prim.positions[i2 * 3] * scale,
        prim.positions[i2 * 3 + 1] * scale,
        prim.positions[i2 * 3 + 2] * scale
      ];
      const [nx, ny, nz] = calculateNormal(v0, v1, v2);
      lines.push(
        `  facet normal ${nx.toFixed(6)} ${ny.toFixed(6)} ${nz.toFixed(6)}`
      );
      lines.push("    outer loop");
      lines.push(
        `      vertex ${v0[0].toFixed(6)} ${v0[1].toFixed(6)} ${v0[2].toFixed(6)}`
      );
      lines.push(
        `      vertex ${v1[0].toFixed(6)} ${v1[1].toFixed(6)} ${v1[2].toFixed(6)}`
      );
      lines.push(
        `      vertex ${v2[0].toFixed(6)} ${v2[1].toFixed(6)} ${v2[2].toFixed(6)}`
      );
      lines.push("    endloop");
      lines.push("  endfacet");
    }
  }
  lines.push("endsolid OpenSKP_Model\n");
  return lines.join("\n");
}
function toSTLBinary(scene, scale = 1) {
  if (!scene || !scene.glbPrimitives) {
    throw new Error("toSTLBinary requires a valid SkpScene instance");
  }
  let totalTriangles = 0;
  for (const prim of scene.glbPrimitives) {
    totalTriangles += Math.floor(prim.indices.length / 3);
  }
  const bufferSize = 80 + 4 + totalTriangles * 50;
  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);
  const headerText = "# OpenSKP Binary STL Export";
  for (let i = 0; i < 80; i++) {
    const charCode = i < headerText.length ? headerText.charCodeAt(i) : 0;
    view.setUint8(i, charCode);
  }
  view.setUint32(80, totalTriangles, true);
  let offset = 84;
  for (const prim of scene.glbPrimitives) {
    const triCount = Math.floor(prim.indices.length / 3);
    for (let i = 0; i < triCount; i++) {
      const i0 = prim.indices[i * 3];
      const i1 = prim.indices[i * 3 + 1];
      const i2 = prim.indices[i * 3 + 2];
      const v0 = [
        prim.positions[i0 * 3] * scale,
        prim.positions[i0 * 3 + 1] * scale,
        prim.positions[i0 * 3 + 2] * scale
      ];
      const v1 = [
        prim.positions[i1 * 3] * scale,
        prim.positions[i1 * 3 + 1] * scale,
        prim.positions[i1 * 3 + 2] * scale
      ];
      const v2 = [
        prim.positions[i2 * 3] * scale,
        prim.positions[i2 * 3 + 1] * scale,
        prim.positions[i2 * 3 + 2] * scale
      ];
      const [nx, ny, nz] = calculateNormal(v0, v1, v2);
      view.setFloat32(offset, nx, true);
      view.setFloat32(offset + 4, ny, true);
      view.setFloat32(offset + 8, nz, true);
      view.setFloat32(offset + 12, v0[0], true);
      view.setFloat32(offset + 16, v0[1], true);
      view.setFloat32(offset + 20, v0[2], true);
      view.setFloat32(offset + 24, v1[0], true);
      view.setFloat32(offset + 28, v1[1], true);
      view.setFloat32(offset + 32, v1[2], true);
      view.setFloat32(offset + 36, v2[0], true);
      view.setFloat32(offset + 40, v2[1], true);
      view.setFloat32(offset + 44, v2[2], true);
      view.setUint16(offset + 48, 0, true);
      offset += 50;
    }
  }
  return new Uint8Array(buffer);
}
function exportSTL(scene, outputPath, options) {
  if (typeof process !== "undefined" && process.versions && process.versions.node) {
    const fs = require("fs");
    const path = require("path");
    const binary = options?.binary ?? false;
    const scale = options?.scale ?? 1;
    const dir = path.dirname(outputPath);
    if (dir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (binary) {
      const data = toSTLBinary(scene, scale);
      fs.writeFileSync(outputPath, data);
    } else {
      const text = toSTLAscii(scene, scale);
      fs.writeFileSync(outputPath, text, "utf-8");
    }
  } else {
    throw new Error("exportSTL file writing is only supported in Node.js environment");
  }
}

// src/ply.ts
function getMaterialRGBA(scene, matIdx) {
  if (matIdx >= 0 && scene.gltfMaterials && matIdx < scene.gltfMaterials.length) {
    const mat = scene.gltfMaterials[matIdx];
    const color = mat?.pbrMetallicRoughness?.baseColorFactor;
    if (Array.isArray(color) && color.length >= 4) {
      const r = Math.max(0, Math.min(255, Math.round(color[0] * 255)));
      const g = Math.max(0, Math.min(255, Math.round(color[1] * 255)));
      const b = Math.max(0, Math.min(255, Math.round(color[2] * 255)));
      const a = Math.max(0, Math.min(255, Math.round(color[3] * 255)));
      return [r, g, b, a];
    }
  }
  return [200, 200, 200, 255];
}
function toPLYAscii(scene) {
  if (!scene || !scene.glbPrimitives) {
    throw new Error("toPLYAscii requires a valid SkpScene instance");
  }
  let totalVertices = 0;
  let totalFaces = 0;
  for (const prim of scene.glbPrimitives) {
    totalVertices += Math.floor(prim.positions.length / 3);
    totalFaces += Math.floor(prim.indices.length / 3);
  }
  const lines = [
    "ply",
    "format ascii 1.0",
    "comment Created by OpenSKP",
    `element vertex ${totalVertices}`,
    "property float x",
    "property float y",
    "property float z",
    "property float nx",
    "property float ny",
    "property float nz",
    "property float u",
    "property float v",
    "property uchar red",
    "property uchar green",
    "property uchar blue",
    "property uchar alpha",
    `element face ${totalFaces}`,
    "property list uchar int vertex_indices",
    "end_header"
  ];
  for (const prim of scene.glbPrimitives) {
    const [r, g, b, a] = getMaterialRGBA(scene, prim.materialIndex);
    const vertCount = Math.floor(prim.positions.length / 3);
    for (let i = 0; i < vertCount; i++) {
      const px = prim.positions[i * 3].toFixed(6);
      const py = prim.positions[i * 3 + 1].toFixed(6);
      const pz = prim.positions[i * 3 + 2].toFixed(6);
      const nx = (i * 3 < prim.normals.length ? prim.normals[i * 3] : 0).toFixed(6);
      const ny = (i * 3 + 1 < prim.normals.length ? prim.normals[i * 3 + 1] : 0).toFixed(6);
      const nz = (i * 3 + 2 < prim.normals.length ? prim.normals[i * 3 + 2] : 0).toFixed(6);
      const u = (i * 2 < prim.uvs.length ? prim.uvs[i * 2] : 0).toFixed(6);
      const v = (i * 2 + 1 < prim.uvs.length ? prim.uvs[i * 2 + 1] : 0).toFixed(6);
      lines.push(`${px} ${py} ${pz} ${nx} ${ny} ${nz} ${u} ${v} ${r} ${g} ${b} ${a}`);
    }
  }
  let vertOffset = 0;
  for (const prim of scene.glbPrimitives) {
    const triCount = Math.floor(prim.indices.length / 3);
    for (let i = 0; i < triCount; i++) {
      const i0 = prim.indices[i * 3] + vertOffset;
      const i1 = prim.indices[i * 3 + 1] + vertOffset;
      const i2 = prim.indices[i * 3 + 2] + vertOffset;
      lines.push(`3 ${i0} ${i1} ${i2}`);
    }
    vertOffset += Math.floor(prim.positions.length / 3);
  }
  return lines.join("\n") + "\n";
}
function toPLYBinary(scene) {
  if (!scene || !scene.glbPrimitives) {
    throw new Error("toPLYBinary requires a valid SkpScene instance");
  }
  let totalVertices = 0;
  let totalFaces = 0;
  for (const prim of scene.glbPrimitives) {
    totalVertices += Math.floor(prim.positions.length / 3);
    totalFaces += Math.floor(prim.indices.length / 3);
  }
  const headerText = `ply
format binary_little_endian 1.0
comment Created by OpenSKP
element vertex ${totalVertices}
property float x
property float y
property float z
property float nx
property float ny
property float nz
property float u
property float v
property uchar red
property uchar green
property uchar blue
property uchar alpha
element face ${totalFaces}
property list uchar int vertex_indices
end_header
`;
  const encoder = new TextEncoder();
  const headerBytes = encoder.encode(headerText);
  const vertexBytesSize = totalVertices * 36;
  const faceBytesSize = totalFaces * 13;
  const buffer = new ArrayBuffer(headerBytes.length + vertexBytesSize + faceBytesSize);
  const view = new DataView(buffer);
  const uint8View = new Uint8Array(buffer);
  uint8View.set(headerBytes, 0);
  let offset = headerBytes.length;
  for (const prim of scene.glbPrimitives) {
    const [r, g, b, a] = getMaterialRGBA(scene, prim.materialIndex);
    const vertCount = Math.floor(prim.positions.length / 3);
    for (let i = 0; i < vertCount; i++) {
      const px = prim.positions[i * 3];
      const py = prim.positions[i * 3 + 1];
      const pz = prim.positions[i * 3 + 2];
      const nx = i * 3 < prim.normals.length ? prim.normals[i * 3] : 0;
      const ny = i * 3 + 1 < prim.normals.length ? prim.normals[i * 3 + 1] : 0;
      const nz = i * 3 + 2 < prim.normals.length ? prim.normals[i * 3 + 2] : 0;
      const u = i * 2 < prim.uvs.length ? prim.uvs[i * 2] : 0;
      const v = i * 2 + 1 < prim.uvs.length ? prim.uvs[i * 2 + 1] : 0;
      view.setFloat32(offset, px, true);
      view.setFloat32(offset + 4, py, true);
      view.setFloat32(offset + 8, pz, true);
      view.setFloat32(offset + 12, nx, true);
      view.setFloat32(offset + 16, ny, true);
      view.setFloat32(offset + 20, nz, true);
      view.setFloat32(offset + 24, u, true);
      view.setFloat32(offset + 28, v, true);
      uint8View[offset + 32] = r;
      uint8View[offset + 33] = g;
      uint8View[offset + 34] = b;
      uint8View[offset + 35] = a;
      offset += 36;
    }
  }
  let vertOffset = 0;
  for (const prim of scene.glbPrimitives) {
    const triCount = Math.floor(prim.indices.length / 3);
    for (let i = 0; i < triCount; i++) {
      const i0 = prim.indices[i * 3] + vertOffset;
      const i1 = prim.indices[i * 3 + 1] + vertOffset;
      const i2 = prim.indices[i * 3 + 2] + vertOffset;
      uint8View[offset] = 3;
      view.setInt32(offset + 1, i0, true);
      view.setInt32(offset + 5, i1, true);
      view.setInt32(offset + 9, i2, true);
      offset += 13;
    }
    vertOffset += Math.floor(prim.positions.length / 3);
  }
  return uint8View;
}
function exportPLY(scene, outputPath, options) {
  if (typeof process !== "undefined" && process.versions && process.versions.node) {
    const fs = require("fs");
    const path = require("path");
    const binary = options?.binary ?? false;
    const dir = path.dirname(outputPath);
    if (dir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (binary) {
      const data = toPLYBinary(scene);
      fs.writeFileSync(outputPath, data);
    } else {
      const text = toPLYAscii(scene);
      fs.writeFileSync(outputPath, text, "utf-8");
    }
  } else {
    throw new Error("exportPLY file writing is only supported in Node.js environment");
  }
}

// src/dxf.ts
var METRES_TO_INCHES = 39.37007874015748;
function sanitizeLayerName(name) {
  if (!name) return "0";
  const illegal = /[<>/\\"~:;?*=`|]/g;
  const clean = name.replace(illegal, "_").trim() || "0";
  const maxLen = 255;
  if (clean.length > maxLen) {
    let hash = 0;
    for (let i = 0; i < clean.length; i++) {
      hash = Math.imul(31, hash) + clean.charCodeAt(i) | 0;
    }
    const suffix = (hash >>> 0).toString(16).padStart(8, "0");
    return clean.slice(0, maxLen - suffix.length - 1) + "_" + suffix;
  }
  return clean;
}
var HEADER_STATIC_A = [
  "  0",
  "SECTION",
  "  2",
  "HEADER",
  "  9",
  "$ACADVER",
  "  1",
  "AC1015",
  "  9",
  "$ACADMAINTVER",
  " 70",
  "6",
  "  9",
  "$DWGCODEPAGE",
  "  3",
  "ANSI_1252",
  "  9",
  "$INSBASE",
  " 10",
  "0.0",
  " 20",
  "0.0",
  " 30",
  "0.0",
  "  9",
  "$EXTMIN",
  " 10",
  "1e+20",
  " 20",
  "1e+20",
  " 30",
  "1e+20",
  "  9",
  "$EXTMAX",
  " 10",
  "-1e+20",
  " 20",
  "-1e+20",
  " 30",
  "-1e+20",
  "  9",
  "$LIMMIN",
  " 10",
  "0.0",
  " 20",
  "0.0",
  "  9",
  "$LIMMAX",
  " 10",
  "420.0",
  " 20",
  "297.0",
  "  9",
  "$ORTHOMODE",
  " 70",
  "0",
  "  9",
  "$REGENMODE",
  " 70",
  "1",
  "  9",
  "$FILLMODE",
  " 70",
  "1",
  "  9",
  "$QTEXTMODE",
  " 70",
  "0",
  "  9",
  "$MIRRTEXT",
  " 70",
  "1",
  "  9",
  "$LTSCALE",
  " 40",
  "1.0",
  "  9",
  "$ATTMODE",
  " 70",
  "1",
  "  9",
  "$TEXTSIZE",
  " 40",
  "2.5",
  "  9",
  "$TRACEWID",
  " 40",
  "1.0",
  "  9",
  "$TEXTSTYLE",
  "  7",
  "Standard",
  "  9",
  "$CLAYER",
  "  8",
  "0",
  "  9",
  "$CELTYPE",
  "  6",
  "ByLayer",
  "  9",
  "$CECOLOR",
  " 62",
  "256",
  "  9",
  "$CELTSCALE",
  " 40",
  "1.0",
  "  9",
  "$DISPSILH",
  " 70",
  "0",
  "  9",
  "$DIMSCALE",
  " 40",
  "1.0",
  "  9",
  "$DIMASZ",
  " 40",
  "2.5",
  "  9",
  "$DIMEXO",
  " 40",
  "0.625",
  "  9",
  "$DIMDLI",
  " 40",
  "3.75",
  "  9",
  "$DIMRND",
  " 40",
  "0.0",
  "  9",
  "$DIMDLE",
  " 40",
  "0.0",
  "  9",
  "$DIMEXE",
  " 40",
  "1.25",
  "  9",
  "$DIMTP",
  " 40",
  "0.0",
  "  9",
  "$DIMTM",
  " 40",
  "0.0",
  "  9",
  "$DIMTXT",
  " 40",
  "2.5",
  "  9",
  "$DIMCEN",
  " 40",
  "2.5",
  "  9",
  "$DIMTSZ",
  " 40",
  "0.0",
  "  9",
  "$DIMTOL",
  " 70",
  "0",
  "  9",
  "$DIMLIM",
  " 70",
  "0",
  "  9",
  "$DIMTIH",
  " 70",
  "0",
  "  9",
  "$DIMTOH",
  " 70",
  "0",
  "  9",
  "$DIMSE1",
  " 70",
  "0",
  "  9",
  "$DIMSE2",
  " 70",
  "0",
  "  9",
  "$DIMTAD",
  " 70",
  "1",
  "  9",
  "$DIMZIN",
  " 70",
  "8",
  "  9",
  "$DIMBLK",
  "  1",
  "",
  "  9",
  "$DIMASO",
  " 70",
  "1",
  "  9",
  "$DIMSHO",
  " 70",
  "1",
  "  9",
  "$DIMPOST",
  "  1",
  "",
  "  9",
  "$DIMAPOST",
  "  1",
  "",
  "  9",
  "$DIMALT",
  " 70",
  "0",
  "  9",
  "$DIMALTD",
  " 70",
  "3",
  "  9",
  "$DIMALTF",
  " 40",
  "0.03937007874",
  "  9",
  "$DIMLFAC",
  " 40",
  "1.0",
  "  9",
  "$DIMTOFL",
  " 70",
  "1",
  "  9",
  "$DIMTVP",
  " 40",
  "0.0",
  "  9",
  "$DIMTIX",
  " 70",
  "0",
  "  9",
  "$DIMSOXD",
  " 70",
  "0",
  "  9",
  "$DIMSAH",
  " 70",
  "0",
  "  9",
  "$DIMBLK1",
  "  1",
  "",
  "  9",
  "$DIMBLK2",
  "  1",
  "",
  "  9",
  "$DIMSTYLE",
  "  2",
  "ISO-25",
  "  9",
  "$DIMCLRD",
  " 70",
  "0",
  "  9",
  "$DIMCLRE",
  " 70",
  "0",
  "  9",
  "$DIMCLRT",
  " 70",
  "0",
  "  9",
  "$DIMTFAC",
  " 40",
  "1.0",
  "  9",
  "$DIMGAP",
  " 40",
  "0.625",
  "  9",
  "$DIMJUST",
  " 70",
  "0",
  "  9",
  "$DIMSD1",
  " 70",
  "0",
  "  9",
  "$DIMSD2",
  " 70",
  "0",
  "  9",
  "$DIMTOLJ",
  " 70",
  "0",
  "  9",
  "$DIMTZIN",
  " 70",
  "8",
  "  9",
  "$DIMALTZ",
  " 70",
  "0",
  "  9",
  "$DIMALTTZ",
  " 70",
  "0",
  "  9",
  "$DIMUPT",
  " 70",
  "0",
  "  9",
  "$DIMDEC",
  " 70",
  "2",
  "  9",
  "$DIMTDEC",
  " 70",
  "2",
  "  9",
  "$DIMALTU",
  " 70",
  "2",
  "  9",
  "$DIMALTTD",
  " 70",
  "3",
  "  9",
  "$DIMTXSTY",
  "  7",
  "Standard",
  "  9",
  "$DIMAUNIT",
  " 70",
  "0",
  "  9",
  "$DIMADEC",
  " 70",
  "0",
  "  9",
  "$DIMALTRND",
  " 40",
  "0.0",
  "  9",
  "$DIMAZIN",
  " 70",
  "0",
  "  9",
  "$DIMDSEP",
  " 70",
  "44",
  "  9",
  "$DIMATFIT",
  " 70",
  "3",
  "  9",
  "$DIMFRAC",
  " 70",
  "0",
  "  9",
  "$DIMLDRBLK",
  "  1",
  "",
  "  9",
  "$DIMLUNIT",
  " 70",
  "2",
  "  9",
  "$DIMLWD",
  " 70",
  "-2",
  "  9",
  "$DIMLWE",
  " 70",
  "-2",
  "  9",
  "$DIMTMOVE",
  " 70",
  "0",
  "  9",
  "$LUNITS",
  " 70",
  "2",
  "  9",
  "$LUPREC",
  " 70",
  "4",
  "  9",
  "$SKETCHINC",
  " 40",
  "1.0",
  "  9",
  "$FILLETRAD",
  " 40",
  "10.0",
  "  9",
  "$AUNITS",
  " 70",
  "0",
  "  9",
  "$AUPREC",
  " 70",
  "2",
  "  9",
  "$MENU",
  "  1",
  ".",
  "  9",
  "$ELEVATION",
  " 40",
  "0.0",
  "  9",
  "$PELEVATION",
  " 40",
  "0.0",
  "  9",
  "$THICKNESS",
  " 40",
  "0.0",
  "  9",
  "$LIMCHECK",
  " 70",
  "0",
  "  9",
  "$CHAMFERA",
  " 40",
  "0.0",
  "  9",
  "$CHAMFERB",
  " 40",
  "0.0",
  "  9",
  "$CHAMFERC",
  " 40",
  "0.0",
  "  9",
  "$CHAMFERD",
  " 40",
  "0.0",
  "  9",
  "$SKPOLY",
  " 70",
  "0",
  "  9",
  "$TDCREATE",
  " 40",
  "2461265.626689815",
  "  9",
  "$TDUCREATE",
  " 40",
  "2458532.153996898",
  "  9",
  "$TDUPDATE",
  " 40",
  "2461265.626689815",
  "  9",
  "$TDUUPDATE",
  " 40",
  "2458532.1544311",
  "  9",
  "$TDINDWG",
  " 40",
  "0.0",
  "  9",
  "$TDUSRTIMER",
  " 40",
  "0.0",
  "  9",
  "$USRTIMER",
  " 70",
  "1",
  "  9",
  "$ANGBASE",
  " 50",
  "0.0",
  "  9",
  "$ANGDIR",
  " 70",
  "0",
  "  9",
  "$PDMODE",
  " 70",
  "0",
  "  9",
  "$PDSIZE",
  " 40",
  "0.0",
  "  9",
  "$PLINEWID",
  " 40",
  "0.0",
  "  9",
  "$SPLFRAME",
  " 70",
  "0",
  "  9",
  "$SPLINETYPE",
  " 70",
  "6",
  "  9",
  "$SPLINESEGS",
  " 70",
  "8",
  "  9",
  "$HANDSEED",
  "  5",
  "__HANDSEED__",
  "  9",
  "$SURFTAB1",
  " 70",
  "6",
  "  9",
  "$SURFTAB2",
  " 70",
  "6",
  "  9",
  "$SURFTYPE",
  " 70",
  "6",
  "  9",
  "$SURFU",
  " 70",
  "6",
  "  9",
  "$SURFV",
  " 70",
  "6",
  "  9",
  "$UCSBASE",
  "  2",
  "",
  "  9",
  "$UCSNAME",
  "  2",
  "",
  "  9",
  "$UCSORG",
  " 10",
  "0.0",
  " 20",
  "0.0",
  " 30",
  "0.0",
  "  9",
  "$UCSXDIR",
  " 10",
  "1.0",
  " 20",
  "0.0",
  " 30",
  "0.0",
  "  9",
  "$UCSYDIR",
  " 10",
  "0.0",
  " 20",
  "1.0",
  " 30",
  "0.0",
  "  9",
  "$UCSORTHOREF",
  "  2",
  "",
  "  9",
  "$UCSORTHOVIEW",
  " 70",
  "0",
  "  9",
  "$UCSORGTOP",
  " 10",
  "0.0",
  " 20",
  "0.0",
  " 30",
  "0.0",
  "  9",
  "$UCSORGBOTTOM",
  " 10",
  "0.0",
  " 20",
  "0.0",
  " 30",
  "0.0",
  "  9",
  "$UCSORGLEFT",
  " 10",
  "0.0",
  " 20",
  "0.0",
  " 30",
  "0.0",
  "  9",
  "$UCSORGRIGHT",
  " 10",
  "0.0",
  " 20",
  "0.0",
  " 30",
  "0.0",
  "  9",
  "$UCSORGFRONT",
  " 10",
  "0.0",
  " 20",
  "0.0",
  " 30",
  "0.0",
  "  9",
  "$UCSORGBACK",
  " 10",
  "0.0",
  " 20",
  "0.0",
  " 30",
  "0.0",
  "  9",
  "$PUCSBASE",
  "  2",
  "",
  "  9",
  "$PUCSNAME",
  "  2",
  "",
  "  9",
  "$PUCSORG",
  " 10",
  "0.0",
  " 20",
  "0.0",
  " 30",
  "0.0",
  "  9",
  "$PUCSXDIR",
  " 10",
  "1.0",
  " 20",
  "0.0",
  " 30",
  "0.0",
  "  9",
  "$PUCSYDIR",
  " 10",
  "0.0",
  " 20",
  "1.0",
  " 30",
  "0.0",
  "  9",
  "$PUCSORTHOREF",
  "  2",
  "",
  "  9",
  "$PUCSORTHOVIEW",
  " 70",
  "0",
  "  9",
  "$PUCSORGTOP",
  " 10",
  "0.0",
  " 20",
  "0.0",
  " 30",
  "0.0",
  "  9",
  "$PUCSORGBOTTOM",
  " 10",
  "0.0",
  " 20",
  "0.0",
  " 30",
  "0.0",
  "  9",
  "$PUCSORGLEFT",
  " 10",
  "0.0",
  " 20",
  "0.0",
  " 30",
  "0.0",
  "  9",
  "$PUCSORGRIGHT",
  " 10",
  "0.0",
  " 20",
  "0.0",
  " 30",
  "0.0",
  "  9",
  "$PUCSORGFRONT",
  " 10",
  "0.0",
  " 20",
  "0.0",
  " 30",
  "0.0",
  "  9",
  "$PUCSORGBACK",
  " 10",
  "0.0",
  " 20",
  "0.0",
  " 30",
  "0.0",
  "  9",
  "$USERI1",
  " 70",
  "0",
  "  9",
  "$USERI2",
  " 70",
  "0",
  "  9",
  "$USERI3",
  " 70",
  "0",
  "  9",
  "$USERI4",
  " 70",
  "0",
  "  9",
  "$USERI5",
  " 70",
  "0",
  "  9",
  "$USERR1",
  " 40",
  "0.0",
  "  9",
  "$USERR2",
  " 40",
  "0.0",
  "  9",
  "$USERR3",
  " 40",
  "0.0",
  "  9",
  "$USERR4",
  " 40",
  "0.0",
  "  9",
  "$USERR5",
  " 40",
  "0.0",
  "  9",
  "$WORLDVIEW",
  " 70",
  "1",
  "  9",
  "$SHADEDGE",
  " 70",
  "3",
  "  9",
  "$SHADEDIF",
  " 70",
  "70",
  "  9",
  "$TILEMODE",
  " 70",
  "1",
  "  9",
  "$MAXACTVP",
  " 70",
  "64",
  "  9",
  "$PINSBASE",
  " 10",
  "0.0",
  " 20",
  "0.0",
  " 30",
  "0.0",
  "  9",
  "$PLIMCHECK",
  " 70",
  "0",
  "  9",
  "$PEXTMIN",
  " 10",
  "1e+20",
  " 20",
  "1e+20",
  " 30",
  "1e+20",
  "  9",
  "$PEXTMAX",
  " 10",
  "-1e+20",
  " 20",
  "-1e+20",
  " 30",
  "-1e+20",
  "  9",
  "$PLIMMIN",
  " 10",
  "0.0",
  " 20",
  "0.0",
  "  9",
  "$PLIMMAX",
  " 10",
  "420.0",
  " 20",
  "297.0",
  "  9",
  "$UNITMODE",
  " 70",
  "0",
  "  9",
  "$VISRETAIN",
  " 70",
  "1",
  "  9",
  "$PLINEGEN",
  " 70",
  "0",
  "  9",
  "$PSLTSCALE",
  " 70",
  "1",
  "  9",
  "$TREEDEPTH",
  " 70",
  "3020",
  "  9",
  "$CMLSTYLE",
  "  2",
  "Standard",
  "  9",
  "$CMLJUST",
  " 70",
  "0",
  "  9",
  "$CMLSCALE",
  " 40",
  "20.0",
  "  9",
  "$PROXYGRAPHICS",
  " 70",
  "1",
  "  9",
  "$MEASUREMENT",
  " 70",
  "1",
  "  9",
  "$CELWEIGHT",
  "370",
  "-1",
  "  9",
  "$ENDCAPS",
  "280",
  "0",
  "  9",
  "$JOINSTYLE",
  "280",
  "0",
  "  9",
  "$LWDISPLAY",
  "290",
  "0",
  "  9",
  "$INSUNITS",
  " 70",
  "1",
  "  9",
  "$HYPERLINKBASE",
  "  1",
  "",
  "  9",
  "$STYLESHEET",
  "  1",
  "",
  "  9",
  "$XEDIT",
  "290",
  "1",
  "  9",
  "$CEPSNTYPE",
  "380",
  "0",
  "  9",
  "$PSTYLEMODE",
  "290",
  "1",
  "  9",
  "$FINGERPRINTGUID",
  "  2",
  "{901E6446-C8CA-4381-B5FE-8494D931A798}",
  "  9",
  "$VERSIONGUID",
  "  2",
  "{4B5A3BC4-57FB-4960-955B-D909E47DC28A}",
  "  9",
  "$EXTNAMES",
  "290",
  "1",
  "  9",
  "$PSVPSCALE",
  " 40",
  "0.0",
  "  9",
  "$OLESTARTUP",
  "290",
  "0",
  "  0",
  "ENDSEC",
  "  0",
  "SECTION",
  "  2",
  "CLASSES",
  "  0",
  "CLASS",
  "  1",
  "ACDBDICTIONARYWDFLT",
  "  2",
  "AcDbDictionaryWithDefault",
  "  3",
  "ObjectDBX Classes",
  " 90",
  "0",
  "280",
  "0",
  "281",
  "0",
  "  0",
  "CLASS",
  "  1",
  "SUN",
  "  2",
  "AcDbSun",
  "  3",
  "SCENEOE",
  " 90",
  "1153",
  "280",
  "0",
  "281",
  "0",
  "  0",
  "CLASS",
  "  1",
  "VISUALSTYLE",
  "  2",
  "AcDbVisualStyle",
  "  3",
  "ObjectDBX Classes",
  " 90",
  "4095",
  "280",
  "0",
  "281",
  "0",
  "  0",
  "CLASS",
  "  1",
  "MATERIAL",
  "  2",
  "AcDbMaterial",
  "  3",
  "ObjectDBX Classes",
  " 90",
  "1153",
  "280",
  "0",
  "281",
  "0",
  "  0",
  "CLASS",
  "  1",
  "SCALE",
  "  2",
  "AcDbScale",
  "  3",
  "ObjectDBX Classes",
  " 90",
  "1153",
  "280",
  "0",
  "281",
  "0",
  "  0",
  "CLASS",
  "  1",
  "TABLESTYLE",
  "  2",
  "AcDbTableStyle",
  "  3",
  "ObjectDBX Classes",
  " 90",
  "4095",
  "280",
  "0",
  "281",
  "0",
  "  0",
  "CLASS",
  "  1",
  "MLEADERSTYLE",
  "  2",
  "AcDbMLeaderStyle",
  "  3",
  "ACDB_MLEADERSTYLE_CLASS",
  " 90",
  "4095",
  "280",
  "0",
  "281",
  "0",
  "  0",
  "CLASS",
  "  1",
  "DICTIONARYVAR",
  "  2",
  "AcDbDictionaryVar",
  "  3",
  "ObjectDBX Classes",
  " 90",
  "0",
  "280",
  "0",
  "281",
  "0",
  "  0",
  "CLASS",
  "  1",
  "CELLSTYLEMAP",
  "  2",
  "AcDbCellStyleMap",
  "  3",
  "ObjectDBX Classes",
  " 90",
  "1152",
  "280",
  "0",
  "281",
  "0",
  "  0",
  "CLASS",
  "  1",
  "MENTALRAYRENDERSETTINGS",
  "  2",
  "AcDbMentalRayRenderSettings",
  "  3",
  "SCENEOE",
  " 90",
  "1024",
  "280",
  "0",
  "281",
  "0",
  "  0",
  "CLASS",
  "  1",
  "ACDBDETAILVIEWSTYLE",
  "  2",
  "AcDbDetailViewStyle",
  "  3",
  "ObjectDBX Classes",
  " 90",
  "1025",
  "280",
  "0",
  "281",
  "0",
  "  0",
  "CLASS",
  "  1",
  "ACDBSECTIONVIEWSTYLE",
  "  2",
  "AcDbSectionViewStyle",
  "  3",
  "ObjectDBX Classes",
  " 90",
  "1025",
  "280",
  "0",
  "281",
  "0",
  "  0",
  "CLASS",
  "  1",
  "RASTERVARIABLES",
  "  2",
  "AcDbRasterVariables",
  "  3",
  "ISM",
  " 90",
  "0",
  "280",
  "0",
  "281",
  "0",
  "  0",
  "CLASS",
  "  1",
  "ACDBPLACEHOLDER",
  "  2",
  "AcDbPlaceHolder",
  "  3",
  "ObjectDBX Classes",
  " 90",
  "0",
  "280",
  "0",
  "281",
  "0",
  "  0",
  "CLASS",
  "  1",
  "LAYOUT",
  "  2",
  "AcDbLayout",
  "  3",
  "ObjectDBX Classes",
  " 90",
  "0",
  "280",
  "0",
  "281",
  "0",
  "  0",
  "ENDSEC",
  "  0",
  "SECTION",
  "  2",
  "TABLES",
  "  0",
  "TABLE",
  "  2",
  "VPORT",
  "  5",
  "8",
  "330",
  "0",
  "100",
  "AcDbSymbolTable",
  " 70",
  "1",
  "  0",
  "VPORT",
  "  5",
  "23",
  "330",
  "8",
  "100",
  "AcDbSymbolTableRecord",
  "100",
  "AcDbViewportTableRecord",
  "  2",
  "*Active",
  " 70",
  "0",
  " 10",
  "0.0",
  " 20",
  "0.0",
  " 11",
  "1.0",
  " 21",
  "1.0",
  " 12",
  "0.0",
  " 22",
  "0.0",
  " 13",
  "0.0",
  " 23",
  "0.0",
  " 14",
  "0.5",
  " 24",
  "0.5",
  " 15",
  "0.5",
  " 25",
  "0.5",
  " 16",
  "0.0",
  " 26",
  "0.0",
  " 36",
  "1.0",
  " 17",
  "0.0",
  " 27",
  "0.0",
  " 37",
  "0.0",
  " 40",
  "1000.0",
  " 41",
  "1.34",
  " 42",
  "50.0",
  " 43",
  "0.0",
  " 44",
  "0.0",
  " 50",
  "0.0",
  " 51",
  "0.0",
  " 71",
  "0",
  " 72",
  "1000",
  " 73",
  "1",
  " 74",
  "3",
  " 75",
  "0",
  " 76",
  "0",
  " 77",
  "0",
  " 78",
  "0",
  "281",
  "0",
  " 65",
  "0",
  "146",
  "0.0",
  "  0",
  "ENDTAB",
  "  0",
  "TABLE",
  "  2",
  "LTYPE",
  "  5",
  "2",
  "330",
  "0",
  "100",
  "AcDbSymbolTable",
  " 70",
  "3",
  "  0",
  "LTYPE",
  "  5",
  "24",
  "330",
  "2",
  "100",
  "AcDbSymbolTableRecord",
  "100",
  "AcDbLinetypeTableRecord",
  "  2",
  "ByBlock",
  " 70",
  "0",
  "  3",
  "",
  " 72",
  "65",
  " 73",
  "0",
  " 40",
  "0.0",
  "  0",
  "LTYPE",
  "  5",
  "25",
  "330",
  "2",
  "100",
  "AcDbSymbolTableRecord",
  "100",
  "AcDbLinetypeTableRecord",
  "  2",
  "ByLayer",
  " 70",
  "0",
  "  3",
  "",
  " 72",
  "65",
  " 73",
  "0",
  " 40",
  "0.0",
  "  0",
  "LTYPE",
  "  5",
  "26",
  "330",
  "2",
  "100",
  "AcDbSymbolTableRecord",
  "100",
  "AcDbLinetypeTableRecord",
  "  2",
  "Continuous",
  " 70",
  "0",
  "  3",
  "",
  " 72",
  "65",
  " 73",
  "0",
  " 40",
  "0.0",
  "  0",
  "ENDTAB",
  "  0",
  "TABLE",
  "  2",
  "LAYER",
  "  5",
  "1",
  "330",
  "0",
  "100",
  "AcDbSymbolTable",
  " 70"
];
var HEADER_STATIC_B = [
  "  0",
  "LAYER",
  "  5",
  "27",
  "330",
  "1",
  "100",
  "AcDbSymbolTableRecord",
  "100",
  "AcDbLayerTableRecord",
  "  2",
  "0",
  " 70",
  "0",
  " 62",
  "7",
  "  6",
  "Continuous",
  "370",
  "-3",
  "390",
  "13",
  "  0",
  "LAYER",
  "  5",
  "28",
  "330",
  "1",
  "100",
  "AcDbSymbolTableRecord",
  "100",
  "AcDbLayerTableRecord",
  "  2",
  "Defpoints",
  " 70",
  "0",
  " 62",
  "7",
  "  6",
  "Continuous",
  "290",
  "0",
  "370",
  "-3",
  "390",
  "13"
];
var HEADER_STATIC_C = [
  "  0",
  "ENDTAB",
  "  0",
  "TABLE",
  "  2",
  "STYLE",
  "  5",
  "5",
  "330",
  "0",
  "100",
  "AcDbSymbolTable",
  " 70",
  "1",
  "  0",
  "STYLE",
  "  5",
  "29",
  "330",
  "5",
  "100",
  "AcDbSymbolTableRecord",
  "100",
  "AcDbTextStyleTableRecord",
  "  2",
  "Standard",
  " 70",
  "0",
  " 40",
  "0.0",
  " 41",
  "1.0",
  " 50",
  "0.0",
  " 71",
  "0",
  " 42",
  "2.5",
  "  3",
  "txt",
  "  4",
  "",
  "  0",
  "ENDTAB",
  "  0",
  "TABLE",
  "  2",
  "VIEW",
  "  5",
  "7",
  "330",
  "0",
  "100",
  "AcDbSymbolTable",
  " 70",
  "0",
  "  0",
  "ENDTAB",
  "  0",
  "TABLE",
  "  2",
  "UCS",
  "  5",
  "6",
  "330",
  "0",
  "100",
  "AcDbSymbolTable",
  " 70",
  "0",
  "  0",
  "ENDTAB",
  "  0",
  "TABLE",
  "  2",
  "APPID",
  "  5",
  "3",
  "330",
  "0",
  "100",
  "AcDbSymbolTable",
  " 70",
  "3",
  "  0",
  "APPID",
  "  5",
  "2A",
  "330",
  "3",
  "100",
  "AcDbSymbolTableRecord",
  "100",
  "AcDbRegAppTableRecord",
  "  2",
  "ACAD",
  " 70",
  "0",
  "  0",
  "APPID",
  "  5",
  "2F",
  "330",
  "3",
  "100",
  "AcDbSymbolTableRecord",
  "100",
  "AcDbRegAppTableRecord",
  "  2",
  "HATCHBACKGROUNDCOLOR",
  " 70",
  "0",
  "  0",
  "APPID",
  "  5",
  "30",
  "330",
  "3",
  "100",
  "AcDbSymbolTableRecord",
  "100",
  "AcDbRegAppTableRecord",
  "  2",
  "EZDXF",
  " 70",
  "0",
  "  0",
  "ENDTAB",
  "  0",
  "TABLE",
  "  2",
  "DIMSTYLE",
  "  5",
  "4",
  "330",
  "0",
  "100",
  "AcDbSymbolTable",
  " 70",
  "1",
  "100",
  "AcDbDimStyleTable",
  "  0",
  "DIMSTYLE",
  "105",
  "2B",
  "330",
  "4",
  "100",
  "AcDbSymbolTableRecord",
  "100",
  "AcDbDimStyleTableRecord",
  "  2",
  "Standard",
  " 70",
  "0",
  "  3",
  "",
  "  4",
  "",
  " 40",
  "1.0",
  " 41",
  "2.5",
  " 42",
  "0.625",
  " 43",
  "3.75",
  " 44",
  "1.25",
  " 45",
  "0.0",
  " 46",
  "0.0",
  " 47",
  "0.0",
  " 48",
  "0.0",
  "140",
  "2.5",
  "141",
  "2.5",
  "142",
  "0.0",
  "143",
  "0.03937007874",
  "144",
  "1.0",
  "145",
  "0.0",
  "146",
  "1.0",
  "147",
  "0.625",
  "148",
  "0.0",
  " 71",
  "0",
  " 72",
  "0",
  " 73",
  "0",
  " 74",
  "0",
  " 75",
  "0",
  " 76",
  "0",
  " 77",
  "1",
  " 78",
  "8",
  " 79",
  "3",
  "170",
  "0",
  "171",
  "3",
  "172",
  "1",
  "173",
  "0",
  "174",
  "0",
  "175",
  "0",
  "176",
  "0",
  "177",
  "0",
  "178",
  "0",
  "179",
  "2",
  "271",
  "2",
  "272",
  "2",
  "273",
  "2",
  "274",
  "3",
  "275",
  "0",
  "276",
  "0",
  "277",
  "2",
  "278",
  "44",
  "279",
  "0",
  "280",
  "0",
  "281",
  "0",
  "282",
  "0",
  "283",
  "0",
  "284",
  "8",
  "285",
  "0",
  "286",
  "0",
  "288",
  "0",
  "289",
  "3",
  "371",
  "-2",
  "372",
  "-2",
  "  0",
  "ENDTAB",
  "  0",
  "TABLE",
  "  2",
  "BLOCK_RECORD",
  "  5",
  "9",
  "330",
  "0",
  "100",
  "AcDbSymbolTable",
  " 70",
  "2",
  "  0",
  "BLOCK_RECORD",
  "  5",
  "17",
  "330",
  "9",
  "100",
  "AcDbSymbolTableRecord",
  "100",
  "AcDbBlockTableRecord",
  "  2",
  "*Model_Space",
  "340",
  "1A",
  "  0",
  "BLOCK_RECORD",
  "  5",
  "1B",
  "330",
  "9",
  "100",
  "AcDbSymbolTableRecord",
  "100",
  "AcDbBlockTableRecord",
  "  2",
  "*Paper_Space",
  "340",
  "1E",
  "  0",
  "ENDTAB",
  "  0",
  "ENDSEC",
  "  0",
  "SECTION",
  "  2",
  "BLOCKS",
  "  0",
  "BLOCK",
  "  5",
  "18",
  "330",
  "17",
  "100",
  "AcDbEntity",
  "  8",
  "0",
  "100",
  "AcDbBlockBegin",
  "  2",
  "*Model_Space",
  " 70",
  "0",
  " 10",
  "0.0",
  " 20",
  "0.0",
  " 30",
  "0.0",
  "  3",
  "*Model_Space",
  "  1",
  "",
  "  0",
  "ENDBLK",
  "  5",
  "19",
  "330",
  "17",
  "100",
  "AcDbEntity",
  "  8",
  "0",
  "100",
  "AcDbBlockEnd",
  "  0",
  "BLOCK",
  "  5",
  "1C",
  "330",
  "1B",
  "100",
  "AcDbEntity",
  "  8",
  "0",
  "100",
  "AcDbBlockBegin",
  "  2",
  "*Paper_Space",
  " 70",
  "0",
  " 10",
  "0.0",
  " 20",
  "0.0",
  " 30",
  "0.0",
  "  3",
  "*Paper_Space",
  "  1",
  "",
  "  0",
  "ENDBLK",
  "  5",
  "1D",
  "330",
  "1B",
  "100",
  "AcDbEntity",
  "  8",
  "0",
  "100",
  "AcDbBlockEnd",
  "  0",
  "ENDSEC"
];
var OBJECTS_STATIC = [
  "  0",
  "SECTION",
  "  2",
  "OBJECTS",
  "  0",
  "DICTIONARY",
  "  5",
  "A",
  "330",
  "0",
  "100",
  "AcDbDictionary",
  "281",
  "1",
  "  3",
  "ACAD_COLOR",
  "350",
  "B",
  "  3",
  "ACAD_GROUP",
  "350",
  "C",
  "  3",
  "ACAD_LAYOUT",
  "350",
  "D",
  "  3",
  "ACAD_MATERIAL",
  "350",
  "E",
  "  3",
  "ACAD_MLEADERSTYLE",
  "350",
  "F",
  "  3",
  "ACAD_MLINESTYLE",
  "350",
  "10",
  "  3",
  "ACAD_PLOTSETTINGS",
  "350",
  "11",
  "  3",
  "ACAD_PLOTSTYLENAME",
  "350",
  "12",
  "  3",
  "ACAD_SCALELIST",
  "350",
  "14",
  "  3",
  "ACAD_TABLESTYLE",
  "350",
  "15",
  "  3",
  "ACAD_VISUALSTYLE",
  "350",
  "16",
  "  3",
  "EZDXF_META",
  "350",
  "2D",
  "  0",
  "DICTIONARY",
  "  5",
  "B",
  "330",
  "A",
  "100",
  "AcDbDictionary",
  "281",
  "1",
  "  0",
  "DICTIONARY",
  "  5",
  "C",
  "330",
  "A",
  "100",
  "AcDbDictionary",
  "281",
  "1",
  "  0",
  "DICTIONARY",
  "  5",
  "D",
  "330",
  "A",
  "100",
  "AcDbDictionary",
  "281",
  "1",
  "  3",
  "Model",
  "350",
  "1A",
  "  3",
  "Layout1",
  "350",
  "1E",
  "  0",
  "DICTIONARY",
  "  5",
  "E",
  "330",
  "A",
  "100",
  "AcDbDictionary",
  "281",
  "1",
  "  3",
  "ByBlock",
  "350",
  "1F",
  "  3",
  "ByLayer",
  "350",
  "20",
  "  3",
  "Global",
  "350",
  "21",
  "  0",
  "DICTIONARY",
  "  5",
  "F",
  "330",
  "A",
  "100",
  "AcDbDictionary",
  "281",
  "1",
  "  3",
  "Standard",
  "350",
  "2C",
  "  0",
  "DICTIONARY",
  "  5",
  "10",
  "330",
  "A",
  "100",
  "AcDbDictionary",
  "281",
  "1",
  "  3",
  "Standard",
  "350",
  "22",
  "  0",
  "DICTIONARY",
  "  5",
  "11",
  "330",
  "A",
  "100",
  "AcDbDictionary",
  "281",
  "1",
  "  0",
  "ACDBDICTIONARYWDFLT",
  "  5",
  "12",
  "330",
  "A",
  "100",
  "AcDbDictionary",
  "281",
  "1",
  "  3",
  "Normal",
  "350",
  "13",
  "100",
  "AcDbDictionaryWithDefault",
  "340",
  "13",
  "  0",
  "ACDBPLACEHOLDER",
  "  5",
  "13",
  "330",
  "12",
  "  0",
  "DICTIONARY",
  "  5",
  "14",
  "330",
  "A",
  "100",
  "AcDbDictionary",
  "281",
  "1",
  "  0",
  "DICTIONARY",
  "  5",
  "15",
  "330",
  "A",
  "100",
  "AcDbDictionary",
  "281",
  "1",
  "  0",
  "DICTIONARY",
  "  5",
  "16",
  "330",
  "A",
  "100",
  "AcDbDictionary",
  "281",
  "1",
  "  0",
  "LAYOUT",
  "  5",
  "1A",
  "330",
  "D",
  "100",
  "AcDbPlotSettings",
  "  1",
  "",
  "  4",
  "A3",
  "  6",
  "",
  " 40",
  "7.5",
  " 41",
  "20.0",
  " 42",
  "7.5",
  " 43",
  "20.0",
  " 44",
  "420.0",
  " 45",
  "297.0",
  " 46",
  "0.0",
  " 47",
  "0.0",
  " 48",
  "0.0",
  " 49",
  "0.0",
  "140",
  "0.0",
  "141",
  "0.0",
  "142",
  "1.0",
  "143",
  "1.0",
  " 70",
  "1024",
  " 72",
  "1",
  " 73",
  "0",
  " 74",
  "5",
  "  7",
  "",
  " 75",
  "16",
  " 76",
  "0",
  " 77",
  "2",
  " 78",
  "300",
  "147",
  "1.0",
  "148",
  "0.0",
  "149",
  "0.0",
  "100",
  "AcDbLayout",
  "  1",
  "Model",
  " 70",
  "1",
  " 71",
  "0",
  " 10",
  "0.0",
  " 20",
  "0.0",
  " 11",
  "420.0",
  " 21",
  "297.0",
  " 12",
  "0.0",
  " 22",
  "0.0",
  " 32",
  "0.0",
  " 14",
  "1e+20",
  " 24",
  "1e+20",
  " 34",
  "1e+20",
  " 15",
  "-1e+20",
  " 25",
  "-1e+20",
  " 35",
  "-1e+20",
  "146",
  "0.0",
  " 13",
  "0.0",
  " 23",
  "0.0",
  " 33",
  "0.0",
  " 16",
  "1.0",
  " 26",
  "0.0",
  " 36",
  "0.0",
  " 17",
  "0.0",
  " 27",
  "1.0",
  " 37",
  "0.0",
  " 76",
  "1",
  "330",
  "17",
  "  0",
  "LAYOUT",
  "  5",
  "1E",
  "330",
  "D",
  "100",
  "AcDbPlotSettings",
  "  1",
  "",
  "  4",
  "A3",
  "  6",
  "",
  " 40",
  "7.5",
  " 41",
  "20.0",
  " 42",
  "7.5",
  " 43",
  "20.0",
  " 44",
  "420.0",
  " 45",
  "297.0",
  " 46",
  "0.0",
  " 47",
  "0.0",
  " 48",
  "0.0",
  " 49",
  "0.0",
  "140",
  "0.0",
  "141",
  "0.0",
  "142",
  "1.0",
  "143",
  "1.0",
  " 70",
  "0",
  " 72",
  "1",
  " 73",
  "0",
  " 74",
  "5",
  "  7",
  "",
  " 75",
  "16",
  " 76",
  "0",
  " 77",
  "2",
  " 78",
  "300",
  "147",
  "1.0",
  "148",
  "0.0",
  "149",
  "0.0",
  "100",
  "AcDbLayout",
  "  1",
  "Layout1",
  " 70",
  "1",
  " 71",
  "1",
  " 10",
  "0.0",
  " 20",
  "0.0",
  " 11",
  "420.0",
  " 21",
  "297.0",
  " 12",
  "0.0",
  " 22",
  "0.0",
  " 32",
  "0.0",
  " 14",
  "1e+20",
  " 24",
  "1e+20",
  " 34",
  "1e+20",
  " 15",
  "-1e+20",
  " 25",
  "-1e+20",
  " 35",
  "-1e+20",
  "146",
  "0.0",
  " 13",
  "0.0",
  " 23",
  "0.0",
  " 33",
  "0.0",
  " 16",
  "1.0",
  " 26",
  "0.0",
  " 36",
  "0.0",
  " 17",
  "0.0",
  " 27",
  "1.0",
  " 37",
  "0.0",
  " 76",
  "1",
  "330",
  "1B",
  "  0",
  "MATERIAL",
  "  5",
  "1F",
  "102",
  "{ACAD_REACTORS",
  "330",
  "E",
  "102",
  "}",
  "330",
  "E",
  "100",
  "AcDbMaterial",
  "  1",
  "ByBlock",
  "  2",
  "",
  " 70",
  "0",
  " 40",
  "1.0",
  " 71",
  "1",
  " 41",
  "1.0",
  " 91",
  "-1023410177",
  " 42",
  "1.0",
  " 72",
  "1",
  "  3",
  "",
  " 73",
  "1",
  " 74",
  "1",
  " 75",
  "1",
  " 44",
  "0.5",
  " 73",
  "0",
  " 45",
  "1.0",
  " 46",
  "1.0",
  " 77",
  "1",
  "  4",
  "",
  " 78",
  "1",
  " 79",
  "1",
  "170",
  "1",
  " 48",
  "1.0",
  "171",
  "1",
  "  6",
  "",
  "172",
  "1",
  "173",
  "1",
  "174",
  "1",
  "140",
  "1.0",
  "141",
  "1.0",
  "175",
  "1",
  "  7",
  "",
  "176",
  "1",
  "177",
  "1",
  "178",
  "1",
  "143",
  "1.0",
  "179",
  "1",
  "  8",
  "",
  "270",
  "1",
  "271",
  "1",
  "272",
  "1",
  "145",
  "1.0",
  "146",
  "1.0",
  "273",
  "1",
  "  9",
  "",
  "274",
  "1",
  "275",
  "1",
  "276",
  "1",
  " 42",
  "1.0",
  " 72",
  "1",
  "  3",
  "",
  " 73",
  "1",
  " 74",
  "1",
  " 75",
  "1",
  " 94",
  "63",
  "  0",
  "MATERIAL",
  "  5",
  "20",
  "102",
  "{ACAD_REACTORS",
  "330",
  "E",
  "102",
  "}",
  "330",
  "E",
  "100",
  "AcDbMaterial",
  "  1",
  "ByLayer",
  "  2",
  "",
  " 70",
  "0",
  " 40",
  "1.0",
  " 71",
  "1",
  " 41",
  "1.0",
  " 91",
  "-1023410177",
  " 42",
  "1.0",
  " 72",
  "1",
  "  3",
  "",
  " 73",
  "1",
  " 74",
  "1",
  " 75",
  "1",
  " 44",
  "0.5",
  " 73",
  "0",
  " 45",
  "1.0",
  " 46",
  "1.0",
  " 77",
  "1",
  "  4",
  "",
  " 78",
  "1",
  " 79",
  "1",
  "170",
  "1",
  " 48",
  "1.0",
  "171",
  "1",
  "  6",
  "",
  "172",
  "1",
  "173",
  "1",
  "174",
  "1",
  "140",
  "1.0",
  "141",
  "1.0",
  "175",
  "1",
  "  7",
  "",
  "176",
  "1",
  "177",
  "1",
  "178",
  "1",
  "143",
  "1.0",
  "179",
  "1",
  "  8",
  "",
  "270",
  "1",
  "271",
  "1",
  "272",
  "1",
  "145",
  "1.0",
  "146",
  "1.0",
  "273",
  "1",
  "  9",
  "",
  "274",
  "1",
  "275",
  "1",
  "276",
  "1",
  " 42",
  "1.0",
  " 72",
  "1",
  "  3",
  "",
  " 73",
  "1",
  " 74",
  "1",
  " 75",
  "1",
  " 94",
  "63",
  "  0",
  "MATERIAL",
  "  5",
  "21",
  "102",
  "{ACAD_REACTORS",
  "330",
  "E",
  "102",
  "}",
  "330",
  "E",
  "100",
  "AcDbMaterial",
  "  1",
  "Global",
  "  2",
  "",
  " 70",
  "0",
  " 40",
  "1.0",
  " 71",
  "1",
  " 41",
  "1.0",
  " 91",
  "-1023410177",
  " 42",
  "1.0",
  " 72",
  "1",
  "  3",
  "",
  " 73",
  "1",
  " 74",
  "1",
  " 75",
  "1",
  " 44",
  "0.5",
  " 73",
  "0",
  " 45",
  "1.0",
  " 46",
  "1.0",
  " 77",
  "1",
  "  4",
  "",
  " 78",
  "1",
  " 79",
  "1",
  "170",
  "1",
  " 48",
  "1.0",
  "171",
  "1",
  "  6",
  "",
  "172",
  "1",
  "173",
  "1",
  "174",
  "1",
  "140",
  "1.0",
  "141",
  "1.0",
  "175",
  "1",
  "  7",
  "",
  "176",
  "1",
  "177",
  "1",
  "178",
  "1",
  "143",
  "1.0",
  "179",
  "1",
  "  8",
  "",
  "270",
  "1",
  "271",
  "1",
  "272",
  "1",
  "145",
  "1.0",
  "146",
  "1.0",
  "273",
  "1",
  "  9",
  "",
  "274",
  "1",
  "275",
  "1",
  "276",
  "1",
  " 42",
  "1.0",
  " 72",
  "1",
  "  3",
  "",
  " 73",
  "1",
  " 74",
  "1",
  " 75",
  "1",
  " 94",
  "63",
  "  0",
  "MLINESTYLE",
  "  5",
  "22",
  "102",
  "{ACAD_REACTORS",
  "330",
  "10",
  "102",
  "}",
  "330",
  "10",
  "100",
  "AcDbMlineStyle",
  "  2",
  "Standard",
  " 70",
  "0",
  "  3",
  "",
  " 62",
  "256",
  " 51",
  "90.0",
  " 52",
  "90.0",
  " 71",
  "2",
  " 49",
  "0.5",
  " 62",
  "256",
  "  6",
  "BYLAYER",
  " 49",
  "-0.5",
  " 62",
  "256",
  "  6",
  "BYLAYER",
  "  0",
  "MLEADERSTYLE",
  "  5",
  "2C",
  "102",
  "{ACAD_REACTORS",
  "330",
  "F",
  "102",
  "}",
  "330",
  "F",
  "100",
  "AcDbMLeaderStyle",
  "179",
  "2",
  "170",
  "2",
  "171",
  "1",
  "172",
  "0",
  " 90",
  "2",
  " 40",
  "0.0",
  " 41",
  "0.0",
  "173",
  "1",
  " 91",
  "-1056964608",
  " 92",
  "-2",
  "290",
  "1",
  " 42",
  "2.0",
  "291",
  "1",
  " 43",
  "8.0",
  "  3",
  "Standard",
  " 44",
  "4.0",
  "300",
  "",
  "342",
  "29",
  "174",
  "1",
  "175",
  "1",
  "176",
  "0",
  "178",
  "1",
  " 93",
  "-1056964608",
  " 45",
  "4.0",
  "292",
  "0",
  "297",
  "0",
  " 46",
  "4.0",
  " 94",
  "-1056964608",
  " 47",
  "1.0",
  " 49",
  "1.0",
  "140",
  "1.0",
  "294",
  "1",
  "141",
  "0.0",
  "177",
  "0",
  "142",
  "1.0",
  "295",
  "0",
  "296",
  "0",
  "143",
  "3.75",
  "271",
  "0",
  "272",
  "9",
  "273",
  "9",
  "  0",
  "DICTIONARY",
  "  5",
  "2D",
  "330",
  "A",
  "100",
  "AcDbDictionary",
  "280",
  "1",
  "281",
  "1",
  "  3",
  "CREATED_BY_EZDXF",
  "350",
  "2E",
  "  3",
  "WRITTEN_BY_EZDXF",
  "350",
  "31",
  "  0",
  "DICTIONARYVAR",
  "  5",
  "2E",
  "330",
  "2D",
  "100",
  "DictionaryVariables",
  "280",
  "0",
  "  1",
  "1.4.3 @ 2026-08-12T10:02:26.972595+00:00",
  "  0",
  "DICTIONARYVAR",
  "  5",
  "31",
  "330",
  "2D",
  "100",
  "DictionaryVariables",
  "280",
  "0",
  "  1",
  "1.4.3 @ 2026-08-12T10:02:26.973142+00:00",
  "  0",
  "ENDSEC",
  "  0",
  "EOF"
];
function rgbToAci(r, g, b) {
  const standardAci = [
    [255, 0, 0, 1],
    [255, 255, 0, 2],
    [0, 255, 0, 3],
    [0, 255, 255, 4],
    [0, 0, 255, 5],
    [255, 0, 255, 6],
    [255, 255, 255, 7],
    [128, 128, 128, 8],
    [192, 192, 192, 9]
  ];
  let bestAci = 7;
  let minDist = Infinity;
  for (const [sr, sg, sb, aci] of standardAci) {
    const dist = (r - sr) ** 2 + (g - sg) ** 2 + (b - sb) ** 2;
    if (dist < minDist) {
      minDist = dist;
      bestAci = aci;
    }
  }
  return bestAci;
}
function getPrimRgb(scene, prim) {
  let r = 200;
  let g = 200;
  let b = 200;
  if (prim.materialIndex !== void 0 && prim.materialIndex !== null && scene.gltfMaterials && prim.materialIndex < scene.gltfMaterials.length) {
    const mat = scene.gltfMaterials[prim.materialIndex];
    if (mat && mat.pbrMetallicRoughness && mat.pbrMetallicRoughness.baseColorFactor) {
      const colorVec = mat.pbrMetallicRoughness.baseColorFactor;
      if (Array.isArray(colorVec) && colorVec.length >= 3) {
        r = Math.round(colorVec[0] * 255);
        g = Math.round(colorVec[1] * 255);
        b = Math.round(colorVec[2] * 255);
      }
    }
  }
  return [Math.max(0, Math.min(255, r)), Math.max(0, Math.min(255, g)), Math.max(0, Math.min(255, b))];
}
function toDXF(scene, scale = METRES_TO_INCHES, mode = "polyface") {
  if (!scene || !scene.glbPrimitives) {
    throw new Error("toDXF requires a valid SkpScene instance");
  }
  const layerColors = /* @__PURE__ */ new Map();
  for (const prim of scene.glbPrimitives) {
    const layerName = sanitizeLayerName(prim.geomName || "0");
    if (!layerColors.has(layerName)) {
      layerColors.set(layerName, getPrimRgb(scene, prim));
    }
  }
  if (layerColors.size === 0) {
    layerColors.set("0", [200, 200, 200]);
  }
  const sortedLayers = Array.from(layerColors.keys()).sort();
  let handleId = 1681;
  const nextHandle = () => {
    const h = handleId.toString(16).toUpperCase();
    handleId++;
    return h;
  };
  const layerHandles = {};
  for (const lName of sortedLayers) {
    layerHandles[lName] = nextHandle();
  }
  const lines = [...HEADER_STATIC_A];
  lines.push((sortedLayers.length + 2).toString());
  lines.push(...HEADER_STATIC_B);
  for (const lName of sortedLayers) {
    const [lr, lg, lb] = layerColors.get(lName);
    const aci = rgbToAci(lr, lg, lb);
    lines.push(
      "  0",
      "LAYER",
      "  5",
      layerHandles[lName],
      "330",
      "1",
      "100",
      "AcDbSymbolTableRecord",
      "100",
      "AcDbLayerTableRecord",
      "  2",
      lName,
      " 70",
      "0",
      " 62",
      aci.toString(),
      "  6",
      "Continuous",
      "370",
      "-3",
      "390",
      "13"
    );
  }
  lines.push(...HEADER_STATIC_C);
  lines.push("  0", "SECTION", "  2", "ENTITIES");
  for (const prim of scene.glbPrimitives) {
    const layerName = sanitizeLayerName(prim.geomName || "0");
    const triCount = Math.floor(prim.indices.length / 3);
    if (triCount === 0) continue;
    const [pr, pg, pb] = getPrimRgb(scene, prim);
    const aci = rgbToAci(pr, pg, pb);
    if (mode === "polyface") {
      const vCount = Math.floor(prim.positions.length / 3);
      const polylineHandle = nextHandle();
      lines.push(
        "  0",
        "POLYLINE",
        "  5",
        polylineHandle,
        "330",
        "17",
        "100",
        "AcDbEntity",
        "  8",
        layerName,
        " 62",
        aci.toString(),
        "100",
        "AcDbPolyFaceMesh",
        " 66",
        "1",
        " 10",
        "0.0",
        " 20",
        "0.0",
        " 30",
        "0.0",
        " 70",
        "64",
        " 71",
        vCount.toString(),
        " 72",
        triCount.toString()
      );
      for (let i = 0; i < vCount; i++) {
        const vx = (prim.positions[i * 3] * scale).toFixed(6);
        const vy = (prim.positions[i * 3 + 1] * scale).toFixed(6);
        const vz = (prim.positions[i * 3 + 2] * scale).toFixed(6);
        lines.push(
          "  0",
          "VERTEX",
          "  5",
          nextHandle(),
          "330",
          "17",
          "100",
          "AcDbEntity",
          "  8",
          layerName,
          "100",
          "AcDbVertex",
          "100",
          "AcDbPolyFaceMeshVertex",
          " 10",
          vx,
          " 20",
          vy,
          " 30",
          vz,
          " 70",
          "192"
        );
      }
      for (let i = 0; i < triCount; i++) {
        const idx0 = prim.indices[i * 3] + 1;
        const idx1 = prim.indices[i * 3 + 1] + 1;
        const idx2 = prim.indices[i * 3 + 2] + 1;
        lines.push(
          "  0",
          "VERTEX",
          "  5",
          nextHandle(),
          "330",
          "17",
          "100",
          "AcDbEntity",
          "  8",
          layerName,
          " 62",
          aci.toString(),
          "100",
          "AcDbFaceRecord",
          " 10",
          "0.0",
          " 20",
          "0.0",
          " 30",
          "0.0",
          " 70",
          "128",
          " 71",
          idx0.toString(),
          " 72",
          idx1.toString(),
          " 73",
          idx2.toString()
        );
      }
      lines.push("  0", "SEQEND", "  5", nextHandle(), "330", polylineHandle, "100", "AcDbEntity", "  8", layerName);
    } else {
      for (let i = 0; i < triCount; i++) {
        const idx0 = prim.indices[i * 3];
        const idx1 = prim.indices[i * 3 + 1];
        const idx2 = prim.indices[i * 3 + 2];
        const v0x = (prim.positions[idx0 * 3] * scale).toFixed(6);
        const v0y = (prim.positions[idx0 * 3 + 1] * scale).toFixed(6);
        const v0z = (prim.positions[idx0 * 3 + 2] * scale).toFixed(6);
        const v1x = (prim.positions[idx1 * 3] * scale).toFixed(6);
        const v1y = (prim.positions[idx1 * 3 + 1] * scale).toFixed(6);
        const v1z = (prim.positions[idx1 * 3 + 2] * scale).toFixed(6);
        const v2x = (prim.positions[idx2 * 3] * scale).toFixed(6);
        const v2y = (prim.positions[idx2 * 3 + 1] * scale).toFixed(6);
        const v2z = (prim.positions[idx2 * 3 + 2] * scale).toFixed(6);
        lines.push(
          "  0",
          "3DFACE",
          "  5",
          nextHandle(),
          "330",
          "17",
          "100",
          "AcDbEntity",
          "  8",
          layerName,
          " 62",
          aci.toString(),
          "100",
          "AcDbFace",
          " 10",
          v0x,
          " 20",
          v0y,
          " 30",
          v0z,
          " 11",
          v1x,
          " 21",
          v1y,
          " 31",
          v1z,
          " 12",
          v2x,
          " 22",
          v2y,
          " 32",
          v2z,
          " 13",
          v2x,
          " 23",
          v2y,
          " 33",
          v2z
        );
      }
    }
  }
  lines.push("  0", "ENDSEC");
  lines.push(...OBJECTS_STATIC);
  const text = lines.join("\r\n") + "\r\n";
  return text.replace("__HANDSEED__", (handleId + 16).toString(16).toUpperCase());
}
function exportDXF(scene, outputPath, scale = METRES_TO_INCHES, mode = "polyface") {
  if (typeof process !== "undefined" && process.versions && process.versions.node) {
    const fs = require("fs");
    const path = require("path");
    const dir = path.dirname(outputPath);
    if (dir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const text = toDXF(scene, scale, mode);
    fs.writeFileSync(outputPath, text, "utf-8");
  } else {
    throw new Error("exportDXF file writing is only supported in Node.js environment");
  }
}

// src/ifc.ts
var METRES_TO_INCHES2 = 39.37007874015748;
var IFC_BASE64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
function generateIFCGUID() {
  let result = "";
  for (let i = 0; i < 22; i++) {
    const r = Math.floor(Math.random() * 64);
    result += IFC_BASE64[r];
  }
  return result;
}
function sanitizeName(name) {
  if (!name) return "Unnamed";
  const clean = name.replace(/'/g, "''").replace(/\\/g, "\\\\").trim();
  return clean.length > 0 ? clean : "Unnamed";
}
function classifyByKeyword(name) {
  const l = name.toLowerCase();
  if (l.includes("wall")) return ["IFCWALL", "IfcWall"];
  if (l.includes("door")) return ["IFCDOOR", "IfcDoor"];
  if (l.includes("window")) return ["IFCWINDOW", "IfcWindow"];
  if (l.includes("slab") || l.includes("floor")) return ["IFCSLAB", "IfcSlab"];
  if (l.includes("column") || l.includes("pillar")) return ["IFCCOLUMN", "IfcColumn"];
  if (l.includes("beam") || l.includes("joist")) return ["IFCBEAM", "IfcBeam"];
  if (l.includes("roof")) return ["IFCROOF", "IfcRoof"];
  return null;
}
function classifyElement(geomName, layerName = "") {
  const byName = classifyByKeyword(geomName);
  if (byName) return byName;
  if (layerName) {
    const byLayer = classifyByKeyword(layerName);
    if (byLayer) return byLayer;
  }
  return ["IFCBUILDINGELEMENTPROXY", "IfcBuildingElementProxy"];
}
function getPrimRgb2(scene, primMatIdx) {
  let r = 0.8, g = 0.8, b = 0.8, a = 1;
  if (scene.gltfMaterials && primMatIdx >= 0 && primMatIdx < scene.gltfMaterials.length) {
    const mat = scene.gltfMaterials[primMatIdx];
    if (mat && mat.pbrMetallicRoughness && Array.isArray(mat.pbrMetallicRoughness.baseColorFactor)) {
      const vec = mat.pbrMetallicRoughness.baseColorFactor;
      if (vec.length >= 3) {
        r = Math.max(0, Math.min(1, Number(vec[0])));
        g = Math.max(0, Math.min(1, Number(vec[1])));
        b = Math.max(0, Math.min(1, Number(vec[2])));
        if (vec.length >= 4) {
          a = Math.max(0, Math.min(1, Number(vec[3])));
        }
      }
    }
  }
  return [r, g, b, a];
}
function toIFC(scene, scale = METRES_TO_INCHES2, schema = "IFC4", classifier) {
  if (!scene || !scene.glbPrimitives) {
    throw new Error("toIFC requires a valid SkpScene instance");
  }
  const classify = classifier || classifyElement;
  const schemaStr = (schema || "IFC4").toUpperCase();
  const nowIso = (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "");
  const timestampEpoch = Math.floor(Date.now() / 1e3);
  const lines = [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');",
    `FILE_NAME('model.ifc','${nowIso}',('OpenSKP Author'),('OpenSKP Organization'),'OpenSKP IFC Exporter','OpenSKP','');`,
    `FILE_SCHEMA(('${schemaStr}'));`,
    "ENDSEC;",
    "DATA;"
  ];
  let entityId = 1;
  const nextId = () => entityId++;
  const personId = nextId();
  lines.push(`#${personId}=IFCPERSON($,$,'OpenSKP User',$,$,$,$,$);`);
  const orgId = nextId();
  lines.push(`#${orgId}=IFCORGANIZATION($,'OpenSKP',$,$,$);`);
  const personOrgId = nextId();
  lines.push(`#${personOrgId}=IFCPERSONANDORGANIZATION(#${personId},#${orgId},$);`);
  const appId = nextId();
  lines.push(`#${appId}=IFCAPPLICATION(#${orgId},'0.3.1','OpenSKP Exporter','OpenSKP');`);
  const ownerHistId = nextId();
  lines.push(
    `#${ownerHistId}=IFCOWNERHISTORY(#${personOrgId},#${appId},$,.READWRITE.,$,$,$,${timestampEpoch});`
  );
  const lengthUnitId = nextId();
  lines.push(`#${lengthUnitId}=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);`);
  const angleUnitId = nextId();
  lines.push(`#${angleUnitId}=IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.);`);
  const solidUnitId = nextId();
  lines.push(`#${solidUnitId}=IFCSIUNIT(*,.STERADIANUNIT.,$,.STERADIAN.);`);
  const unitAssignId = nextId();
  lines.push(
    `#${unitAssignId}=IFCUNITASSIGNMENT((#${lengthUnitId},#${angleUnitId},#${solidUnitId}));`
  );
  const ptZeroId = nextId();
  lines.push(`#${ptZeroId}=IFCCARTESIANPOINT((0.0,0.0,0.0));`);
  const axisPlacementId = nextId();
  lines.push(`#${axisPlacementId}=IFCAXIS2PLACEMENT3D(#${ptZeroId},$,$);`);
  const geomCtxId = nextId();
  lines.push(
    `#${geomCtxId}=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.0E-5,#${axisPlacementId},$);`
  );
  const projId = nextId();
  lines.push(
    `#${projId}=IFCPROJECT('${generateIFCGUID()}',#${ownerHistId},'OpenSKP Project',$,$,$,$,(#${geomCtxId}),#${unitAssignId});`
  );
  const sitePlacementId = nextId();
  lines.push(`#${sitePlacementId}=IFCLOCALPLACEMENT($,#${axisPlacementId});`);
  const siteId = nextId();
  lines.push(
    `#${siteId}=IFCSITE('${generateIFCGUID()}',#${ownerHistId},'Site',$,$,#${sitePlacementId},$,$,.ELEMENT.,$,$,$,$,$);`
  );
  const bldgPlacementId = nextId();
  lines.push(`#${bldgPlacementId}=IFCLOCALPLACEMENT(#${sitePlacementId},#${axisPlacementId});`);
  const bldgId = nextId();
  lines.push(
    `#${bldgId}=IFCBUILDING('${generateIFCGUID()}',#${ownerHistId},'Building',$,$,#${bldgPlacementId},$,$,.ELEMENT.,$,$,$);`
  );
  const storeyPlacementId = nextId();
  lines.push(`#${storeyPlacementId}=IFCLOCALPLACEMENT(#${bldgPlacementId},#${axisPlacementId});`);
  const storeyId = nextId();
  lines.push(
    `#${storeyId}=IFCBUILDINGSTOREY('${generateIFCGUID()}',#${ownerHistId},'Level 0',$,$,#${storeyPlacementId},$,$,.ELEMENT.,0.0);`
  );
  lines.push(
    `#${nextId()}=IFCRELAGGREGATES('${generateIFCGUID()}',#${ownerHistId},$,$,#${projId},(#${siteId}));`
  );
  lines.push(
    `#${nextId()}=IFCRELAGGREGATES('${generateIFCGUID()}',#${ownerHistId},$,$,#${siteId},(#${bldgId}));`
  );
  lines.push(
    `#${nextId()}=IFCRELAGGREGATES('${generateIFCGUID()}',#${ownerHistId},$,$,#${bldgId},(#${storeyId}));`
  );
  const productIds = [];
  const layerItems = /* @__PURE__ */ new Map();
  const matStyleCache = /* @__PURE__ */ new Map();
  for (const prim of scene.glbPrimitives) {
    const triCount = Math.floor(prim.indices.length / 3);
    const vCount = Math.floor(prim.positions.length / 3);
    if (triCount === 0 || vCount === 0) continue;
    const geomName = sanitizeName(prim.geomName);
    const meta = scene.meshIndex ? scene.meshIndex[prim.geomName] : void 0;
    const layerName = sanitizeName(meta && meta.layer ? meta.layer : "Layer0");
    const [stepType] = classify(geomName, layerName);
    const ptCoords = [];
    for (let i = 0; i < vCount; i++) {
      const vx = (prim.positions[i * 3] * scale).toFixed(6);
      const vy = (prim.positions[i * 3 + 1] * scale).toFixed(6);
      const vz = (prim.positions[i * 3 + 2] * scale).toFixed(6);
      ptCoords.push(`(${vx},${vy},${vz})`);
    }
    const ptListId = nextId();
    lines.push(`#${ptListId}=IFCCARTESIANPOINTLIST3D((${ptCoords.join(",")}));`);
    const faceIndices = [];
    for (let i = 0; i < triCount; i++) {
      const idx0 = prim.indices[i * 3] + 1;
      const idx1 = prim.indices[i * 3 + 1] + 1;
      const idx2 = prim.indices[i * 3 + 2] + 1;
      faceIndices.push(`(${idx0},${idx1},${idx2})`);
    }
    const faceSetId = nextId();
    lines.push(
      `#${faceSetId}=IFCTRIANGULATEDFACESET(#${ptListId},$,.TRUE.,(${faceIndices.join(",")}),$);`
    );
    if (!layerItems.has(layerName)) {
      layerItems.set(layerName, []);
    }
    layerItems.get(layerName).push(faceSetId);
    const [r, g, b, a] = getPrimRgb2(scene, prim.materialIndex);
    const rgbaKey = `${r.toFixed(4)},${g.toFixed(4)},${b.toFixed(4)},${a.toFixed(4)}`;
    let styleAssignId;
    if (!matStyleCache.has(rgbaKey)) {
      const colId = nextId();
      lines.push(`#${colId}=IFCCOLOURRGB($,${r.toFixed(4)},${g.toFixed(4)},${b.toFixed(4)});`);
      const transparency = (1 - a).toFixed(4);
      const renderingId = nextId();
      lines.push(
        `#${renderingId}=IFCSURFACESTYLERENDERING(#${colId},${transparency},$,$,$,$,$,$,.FLAT.);`
      );
      const styleId = nextId();
      lines.push(`#${styleId}=IFCSURFACESTYLE('${geomName}_Material',.BOTH.,(#${renderingId}));`);
      styleAssignId = nextId();
      lines.push(`#${styleAssignId}=IFCPRESENTATIONSTYLEASSIGNMENT((#${styleId}));`);
      matStyleCache.set(rgbaKey, styleAssignId);
    } else {
      styleAssignId = matStyleCache.get(rgbaKey);
    }
    const styledItemId = nextId();
    lines.push(`#${styledItemId}=IFCSTYLEDITEM(#${faceSetId},(#${styleAssignId}),$);`);
    const shapeRepId = nextId();
    lines.push(
      `#${shapeRepId}=IFCSHAPEREPRESENTATION(#${geomCtxId},'Body','Tessellation',(#${faceSetId}));`
    );
    const prodShapeId = nextId();
    lines.push(`#${prodShapeId}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${shapeRepId}));`);
    const prodPlacementId = nextId();
    lines.push(`#${prodPlacementId}=IFCLOCALPLACEMENT(#${storeyPlacementId},#${axisPlacementId});`);
    const productId = nextId();
    const prodGuid = generateIFCGUID();
    if (stepType === "IFCBUILDINGELEMENTPROXY") {
      lines.push(
        `#${productId}=${stepType}('${prodGuid}',#${ownerHistId},'${geomName}',$,$,#${prodPlacementId},#${prodShapeId},$,.NOTDEFINED.);`
      );
    } else {
      lines.push(
        `#${productId}=${stepType}('${prodGuid}',#${ownerHistId},'${geomName}',$,$,#${prodPlacementId},#${prodShapeId},$,$);`
      );
    }
    productIds.push(productId);
    if (meta && meta.properties && typeof meta.properties === "object") {
      const propValIds = [];
      for (const [pk, pv] of Object.entries(meta.properties)) {
        const cleanK = sanitizeName(String(pk));
        const cleanV = sanitizeName(String(pv));
        const propId = nextId();
        lines.push(`#${propId}=IFCPROPERTYSINGLEVALUE('${cleanK}',$,IFCTEXT('${cleanV}'),$);`);
        propValIds.push(propId);
      }
      if (propValIds.length > 0) {
        const psetId = nextId();
        const propRefs = propValIds.map((pid) => `#${pid}`).join(",");
        lines.push(
          `#${psetId}=IFCPROPERTYSET('${generateIFCGUID()}',#${ownerHistId},'Pset_CustomProperties',$,(${propRefs}));`
        );
        lines.push(
          `#${nextId()}=IFCRELDEFINESBYPROPERTIES('${generateIFCGUID()}',#${ownerHistId},$,$,(#${productId}),#${psetId});`
        );
      }
    }
  }
  const sortedLayerNames = Array.from(layerItems.keys()).sort();
  for (const lName of sortedLayerNames) {
    const itemIds = layerItems.get(lName);
    if (itemIds.length > 0) {
      const itemRefs = itemIds.map((iid) => `#${iid}`).join(",");
      lines.push(
        `#${nextId()}=IFCPRESENTATIONLAYERASSIGNMENT('${lName}',$,(${itemRefs}),$);`
      );
    }
  }
  if (productIds.length > 0) {
    const prodRefs = productIds.map((pid) => `#${pid}`).join(",");
    lines.push(
      `#${nextId()}=IFCRELCONTAINEDINSPATIALSTRUCTURE('${generateIFCGUID()}',#${ownerHistId},$,$,(${prodRefs}),#${storeyId});`
    );
  }
  lines.push("ENDSEC;", "END-ISO-10303-21;");
  return lines.join("\r\n") + "\r\n";
}
function exportIFC(scene, outputPath, scale = METRES_TO_INCHES2, schema = "IFC4", classifier) {
  if (typeof process !== "undefined" && process.versions && process.versions.node) {
    const fs = require("fs");
    const path = require("path");
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const text = toIFC(scene, scale, schema, classifier);
    fs.writeFileSync(outputPath, text, "utf8");
  } else {
    throw new Error("exportIFC is only supported in Node.js environment");
  }
}

// src/codegen.ts
var BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function toBase64(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : void 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : void 0;
    out += BASE64_CHARS[b0 >> 2];
    out += BASE64_CHARS[(b0 & 3) << 4 | (b1 === void 0 ? 0 : b1 >> 4)];
    out += b1 === void 0 ? "=" : BASE64_CHARS[(b1 & 15) << 2 | (b2 === void 0 ? 0 : b2 >> 6)];
    out += b2 === void 0 ? "=" : BASE64_CHARS[b2 & 63];
  }
  return out;
}
function toTypeScriptCode(model) {
  const lines = [];
  const push = (s) => {
    lines.push(s);
  };
  function round(n) {
    const r = Math.round(n * 1e4) / 1e4;
    return Object.is(r, -0) ? 0 : r;
  }
  function pointStr(p) {
    return `[${round(p[0])}, ${round(p[1])}, ${round(p[2])}]`;
  }
  function matrix3x3Str(m9) {
    return `[${m9.map(round).join(", ")}]`;
  }
  function reconstructLoopVertices2(loop, edgesById) {
    const verts = [];
    for (const { edgeId, orientation } of loop) {
      const e = edgesById.get(edgeId);
      if (!e) continue;
      const vStart = orientation === 1 ? e.v1Id : e.v2Id;
      if (verts.length === 0 || verts[verts.length - 1] !== vStart) verts.push(vStart);
    }
    if (verts.length > 1 && verts[0] === verts[verts.length - 1]) verts.pop();
    return verts;
  }
  const matVar = /* @__PURE__ */ new Map();
  const texturedMats = /* @__PURE__ */ new Set();
  let matCounter = 0;
  push(`import { create } from 'openskp';`);
  push(``);
  push(`export function build() {`);
  push(`  const builder = create();`);
  push(``);
  push(`  // --- Materials (${model.materials.length}) ---`);
  for (const mat of model.materials) {
    const varName = `mat${matCounter++}`;
    matVar.set(mat.name, varName);
    if (mat.texture && mat.texture.data) {
      texturedMats.add(mat.name);
      const b64 = toBase64(mat.texture.data);
      const appH = mat.texture.height || 1;
      const appW = mat.texture.width || 1;
      const opacityArg = mat.transparency < 1 - 1e-6 ? `, ${round(mat.transparency)}` : "";
      push(`  const ${varName} = builder.addTextureMaterial(`);
      push(`    ${JSON.stringify(mat.name)},`);
      push(`    Uint8Array.from(atob(${JSON.stringify(b64)}), (c) => c.charCodeAt(0)),`);
      push(`    ${JSON.stringify(mat.texture.filename)}, ${round(appH)}, ${round(appW)}${opacityArg}`);
      push(`  );`);
    } else {
      const rgba = [mat.color.r, mat.color.g, mat.color.b, mat.color.a];
      push(`  const ${varName} = builder.addMaterial(${JSON.stringify(mat.name)}, [${rgba.join(", ")}]);`);
    }
  }
  push(``);
  push(`  // --- Layers (${model.layers.length}) ---`);
  const layerVar = /* @__PURE__ */ new Map();
  let layerCounter = 0;
  for (const layer of model.layers) {
    const varName = `layer${layerCounter++}`;
    layerVar.set(layer.name, varName);
    const colorStr = `[${layer.color.r}, ${layer.color.g}, ${layer.color.b}]`;
    push(
      `  const ${varName} = builder.addLayer(${JSON.stringify(layer.name)}, { color: ${colorStr}, hidden: ${layer.hidden} });`
    );
  }
  function pickNonCollinearTriple(points) {
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        for (let k = j + 1; k < points.length; k++) {
          const [ax, ay, az] = points[i];
          const [bx, by, bz] = points[j];
          const [cx, cy, cz] = points[k];
          const e1 = [bx - ax, by - ay, bz - az];
          const e2 = [cx - ax, cy - ay, cz - az];
          const cross2 = [
            e1[1] * e2[2] - e1[2] * e2[1],
            e1[2] * e2[0] - e1[0] * e2[2],
            e1[0] * e2[1] - e1[1] * e2[0]
          ];
          const mag2 = cross2[0] * cross2[0] + cross2[1] * cross2[1] + cross2[2] * cross2[2];
          if (mag2 > 1e-9) return [i, j, k];
        }
      }
    }
    return null;
  }
  function uvTripleStr(points, normal, uvTransform, tileW, tileH) {
    if (points.length < 3) return null;
    const idxs = pickNonCollinearTriple(points);
    if (!idxs) return null;
    const { xr, yr } = faceUvBasis(normal);
    const triple = idxs.map((i) => {
      const p = points[i];
      const [u, v] = computeFaceUv(p, xr, yr, uvTransform, tileW, tileH);
      return `[${pointStr(p)}, [${round(u)}, ${round(v)}]]`;
    });
    return `[${triple.join(", ")}]`;
  }
  function materialOptsStr(face, points, materialsById2) {
    const parts = [];
    let hasUv = false;
    if (face.materialId != null) {
      const m = materialsById2.get(face.materialId);
      if (m) {
        parts.push(`material: ${matVar.get(m.name)}`);
        if (texturedMats.has(m.name)) {
          const triple = uvTripleStr(points, face.normal, face.uvTransform, m.texture?.width || 1, m.texture?.height || 1);
          if (triple) {
            parts.push(`frontUv: ${triple}`);
            hasUv = true;
          }
        }
      }
    }
    if (face.backMaterialId != null) {
      const m = materialsById2.get(face.backMaterialId);
      if (m) {
        parts.push(`backMaterial: ${matVar.get(m.name)}`);
        if (texturedMats.has(m.name)) {
          const triple = uvTripleStr(points, face.normal, face.uvTransformBack, m.texture?.width || 1, m.texture?.height || 1);
          if (triple) {
            parts.push(`backUv: ${triple}`);
            hasUv = true;
          }
        }
      }
    }
    return { str: parts.length ? `{ ${parts.join(", ")} }` : "", hasUv };
  }
  const materialsById = new Map(model.materials.map((m) => [m.id ?? -1, m]));
  let facesSkippedDegenerate = 0;
  function loopPoints(loop, edgesById, vertsById) {
    const vertIds = reconstructLoopVertices2(loop, edgesById);
    if (vertIds.length < 3) return null;
    const points = vertIds.map((id) => vertsById.get(id)).filter((v) => v != null);
    if (points.length < 3) return null;
    return points.map((p) => [p.x, p.y, p.z]);
  }
  function emitFaces(def, targetVarName, indent) {
    const vertsById = new Map(def.vertices.map((v) => [v.id, v]));
    const edgesById = new Map(def.edges.map((e) => [e.id, e]));
    for (const face of def.faces) {
      if (face.loops.length === 0) continue;
      const pointsArr = loopPoints(face.loops[0], edgesById, vertsById);
      if (!pointsArr) {
        facesSkippedDegenerate++;
        continue;
      }
      const holes = [];
      for (let i = 1; i < face.loops.length; i++) {
        const holePts = loopPoints(face.loops[i], edgesById, vertsById);
        if (holePts) holes.push(holePts);
      }
      const { str: matStr, hasUv } = materialOptsStr(face, pointsArr, materialsById);
      const pointsStr = pointsArr.map(pointStr).join(", ");
      const extraParts = [];
      if (!hasUv) extraParts.push("autoTriangulate: true");
      if (holes.length > 0) {
        const holesStr = holes.map((h) => `[${h.map(pointStr).join(", ")}]`).join(", ");
        extraParts.push(`holes: [${holesStr}]`);
      }
      let optsStr = matStr;
      if (extraParts.length > 0) {
        optsStr = matStr ? matStr.replace(/\s*}$/, `, ${extraParts.join(", ")} }`) : `{ ${extraParts.join(", ")} }`;
      }
      push(`${indent}${targetVarName}.addFace([${pointsStr}]${optsStr ? `, ${optsStr}` : ""});`);
    }
  }
  function instanceOptsStr(inst, defName) {
    const parts = [];
    if (inst.materialId != null) {
      const m = materialsById.get(inst.materialId);
      if (m) parts.push(`material: ${matVar.get(m.name)}`);
    }
    if (inst.name !== defName) parts.push(`name: ${JSON.stringify(inst.name)}`);
    return parts;
  }
  const defVar = /* @__PURE__ */ new Map();
  let defCounter = 0;
  function getOrBuildDef(defId, visiting) {
    const existing = defVar.get(defId);
    if (existing) return existing;
    if (visiting.has(defId)) return null;
    visiting.add(defId);
    const def = model.definitions.get(defId);
    if (!def || def.faces.length === 0 && def.instances.length === 0) {
      return null;
    }
    for (const inst of def.instances) getOrBuildDef(inst.refIdx, visiting);
    const varName = `def${defCounter++}`;
    const defName = def.name;
    defVar.set(defId, varName);
    push(``);
    push(`  // "${def.name}" - ${def.faces.length} faces, ${def.instances.length} nested instances`);
    push(`  const ${varName} = builder.addComponentDefinition(${JSON.stringify(defName)}, (${varName}) => {`);
    emitFaces(def, varName, "    ");
    for (const inst of def.instances) {
      const childVar = inst.refIdx != null ? defVar.get(inst.refIdx) : void 0;
      if (!childVar) continue;
      const m9 = inst.matrix.slice(0, 9);
      const t = inst.matrix.slice(9, 12);
      const extra = instanceOptsStr(inst, defName);
      const optsStr = [`translation: ${pointStr(t)}`, `matrix3x3: ${matrix3x3Str(m9)}`, ...extra].join(", ");
      push(`    ${varName}.addInstance(${childVar}, { ${optsStr} });`);
    }
    push(`  });`);
    return varName;
  }
  for (const [defId] of model.definitions) {
    getOrBuildDef(defId, /* @__PURE__ */ new Set());
  }
  push(``);
  push(`  // --- Root instances (${model.root.instances.length}) ---`);
  for (const inst of model.root.instances) {
    const childVar = inst.refIdx != null ? defVar.get(inst.refIdx) : void 0;
    if (!childVar) continue;
    const childDefName = inst.refIdx != null ? model.definitions.get(inst.refIdx)?.name ?? "" : "";
    const m9 = inst.matrix.slice(0, 9);
    const t = inst.matrix.slice(9, 12);
    const extra = instanceOptsStr(inst, childDefName);
    const optsStr = [`translation: ${pointStr(t)}`, `matrix3x3: ${matrix3x3Str(m9)}`, ...extra].join(", ");
    push(`  builder.addInstance(${childVar}, { ${optsStr} });`);
  }
  emitFaces(model.root, "builder", "  ");
  push(``);
  push(`  return builder.toBytes();`);
  push(`}`);
  if (facesSkippedDegenerate > 0) {
    lines.splice(
      1,
      0,
      `// ${facesSkippedDegenerate} degenerate face(s) (fewer than 3 resolvable vertices) were skipped during generation.`
    );
  }
  return lines.join("\n");
}

// src/scaffold.ts
var SCAFFOLD_BASE64 = "//7/DlMAawBlAHQAYwBoAFUAcAAgAE0AbwBkAGUAbAD//v8IewAxADcALgAwAC4AMQB9AJrTkzBpqilOjVMVy/49lLD//v8Am6l9av//AAALAENWZXJzaW9uTWFw//7/CUMAQQByAGMAQwB1AHIAdgBlAAMAAAD//v8KQwBBAHQAdAByAGkAYgB1AHQAZQAAAAAA//7/E0MAQQB0AHQAcgBpAGIAdQB0AGUAQwBvAG4AdABhAGkAbgBlAHIAAAAAAP/+/w9DAEEAdAB0AHIAaQBiAHUAdABlAE4AYQBtAGUAZAABAAAA//7/EEMAQgBhAGMAawBnAHIAbwB1AG4AZABJAG0AYQBnAGUACgAAAP/+/wdDAEMAYQBtAGUAcgBhAAUAAAD//v8KQwBDAG8AbQBwAG8AbgBlAG4AdAALAAAA//7/EkMAQwBvAG0AcABvAG4AZQBuAHQAQgBlAGgAYQB2AGkAbwByAAUAAAD//v8UQwBDAG8AbQBwAG8AbgBlAG4AdABEAGUAZgBpAG4AaQB0AGkAbwBuAAoAAAD//v8SQwBDAG8AbQBwAG8AbgBlAG4AdABJAG4AcwB0AGEAbgBjAGUABQAAAP/+/xVDAEMAbwBuAHMAdAByAHUAYwB0AGkAbwBuAEcAZQBvAG0AZQB0AHIAeQAAAAAA//7/EUMAQwBvAG4AcwB0AHIAdQBjAHQAaQBvAG4ATABpAG4AZQABAAAA//7/EkMAQwBvAG4AcwB0AHIAdQBjAHQAaQBvAG4AUABvAGkAbgB0AAAAAAD//v8GQwBDAHUAcgB2AGUABAAAAP/+/w9DAEQAZQBmAGkAbgBpAHQAaQBvAG4ATABpAHMAdAAAAAAA//7/BEMARABpAGIAAwAAAP/+/wpDAEQAaQBtAGUAbgBzAGkAbwBuAAEAAAD//v8QQwBEAGkAbQBlAG4AcwBpAG8AbgBMAGkAbgBlAGEAcgAGAAAA//7/EEMARABpAG0AZQBuAHMAaQBvAG4AUgBhAGQAaQBhAGwAAgAAAP/+/w9DAEQAaQBtAGUAbgBzAGkAbwBuAFMAdAB5AGwAZQAEAAAA//7/D0MARAByAGEAdwBpAG4AZwBFAGwAZQBtAGUAbgB0AAkAAAD//v8FQwBFAGQAZwBlAAIAAAD//v8IQwBFAGQAZwBlAFUAcwBlAAEAAAD//v8HQwBFAG4AdABpAHQAeQAFAAAA//7/BUMARgBhAGMAZQADAAAA//7/EkMARgBhAGMAZQBUAGUAeAB0AHUAcgBlAEMAbwBvAHIAZABzAAQAAAD//v8MQwBGAG8AbgB0AE0AYQBuAGEAZwBlAHIAAAAAAP/+/wZDAEcAcgBvAHUAcAABAAAA//7/BkMASQBtAGEAZwBlAAEAAAD//v8GQwBMAGEAeQBlAHIAAgAAAP/+/w1DAEwAYQB5AGUAcgBNAGEAbgBhAGcAZQByAAQAAAD//v8FQwBMAG8AbwBwAAEAAAD//v8JQwBNAGEAdABlAHIAaQBhAGwADAAAAP/+/xBDAE0AYQB0AGUAcgBpAGEAbABNAGEAbgBhAGcAZQByAAQAAAD//v8JQwBQAGEAZwBlAEwAaQBzAHQAAQAAAP/+/wtDAFAAbwBsAHkAbABpAG4AZQAzAGQAAAAAAP/+/w1DAFIAZQBsAGEAdABpAG8AbgBzAGgAaQBwAAAAAAD//v8QQwBSAGUAbABhAHQAaQBvAG4AcwBoAGkAcABNAGEAcAAAAAAA//7/EUMAUgBlAG4AZABlAHIAaQBuAGcATwBwAHQAaQBvAG4AcwAkAAAA//7/C0MAUwBjAGgAZQBtAGEARgBpAGwAZQABAAAA//7/EUMAUwBjAGgAZQBtAGEARgBpAGwAdABlAHIARgBpAGwAZQAAAAAA//7/DkMAUwBjAGgAZQBtAGEAWgBpAHAARgBpAGwAZQABAAAA//7/DUMAUwBlAGMAdABpAG8AbgBQAGwAYQBuAGUAAgAAAP/+/wtDAFMAaABhAGQAbwB3AEkAbgBmAG8ABwAAAP/+/wdDAFMAawBGAG8AbgB0AAEAAAD//v8JQwBTAGsAZQB0AGMAaABDAFMAAAAAAP/+/w5DAFMAawBlAHQAYwBoAFUAcABNAG8AZABlAGwAGgAAAP/+/w1DAFMAawBlAHQAYwBoAFUAcABQAGEAZwBlAAEAAAD//v8JQwBTAGsAcABTAHQAeQBsAGUAAQAAAP/+/xBDAFMAawBwAFMAdAB5AGwAZQBNAGEAbgBhAGcAZQByAAIAAAD//v8FQwBUAGUAeAB0AAkAAAD//v8KQwBUAGUAeAB0AFMAdAB5AGwAZQAFAAAA//7/CEMAVABlAHgAdAB1AHIAZQAGAAAA//7/CkMAVABoAHUAbQBiAG4AYQBpAGwAAQAAAP/+/wdDAFYAZQByAHQAZQB4AAAAAAD//v8JQwBWAGkAZQB3AFAAYQBnAGUADAAAAP/+/wpDAFcAYQB0AGUAcgBtAGEAcgBrAAEAAAD//v8RQwBXAGEAdABlAHIAbQBhAHIAawBNAGEAbgBhAGcAZQByAAIAAAD//v8SRQBuAGQALQBPAGYALQBWAGUAcgBzAGkAbwBuAC0ATQBhAHAAAAAAAAEAAACwBAAAAAAAABIAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAD//v8AAwAAAAQAAAD//v8MTgBhAG0AZQBkAE8AcAB0AGkAbwBuAHMA//7/AP/+/wtQAGEAZwBlAE8AcAB0AGkAbwBuAHMA//7/DlMAaABvAHcAVAByAGEAbgBzAGkAdABpAG8AbgAHAf/+/w5UAHIAYQBuAHMAaQB0AGkAbwBuAFQAaQBtAGUABgAAAAAAAPg///7/AP/+/xBTAGwAaQBkAGUAcwBoAG8AdwBPAHAAdABpAG8AbgBzAP/+/w1MAG8AbwBwAFMAbABpAGQAZQBzAGgAbwB3AAcB//7/CVMAbABpAGQAZQBUAGkAbQBlAAYAAAAAAADwP//+/wD//v8MVQBuAGkAdABzAE8AcAB0AGkAbwBuAHMA//7/D0wAZQBuAGcAdABoAFAAcgBlAGMAaQBzAGkAbwBuAAQEAAAA//7/DEwAZQBuAGcAdABoAEYAbwByAG0AYQB0AAQBAAAA//7/CkwAZQBuAGcAdABoAFUAbgBpAHQABAAAAAD//v8RTABlAG4AZwB0AGgAUwBuAGEAcABFAG4AYQBiAGwAZQBkAAcB//7/EEwAZQBuAGcAdABoAFMAbgBhAHAATABlAG4AZwB0AGgABgAAAAAAALA///7/DkEAbgBnAGwAZQBQAHIAZQBjAGkAcwBpAG8AbgAEAQAAAP/+/xBBAG4AZwBsAGUAUwBuAGEAcABFAG4AYQBiAGwAZQBkAAcB//7/CVMAbgBhAHAAQQBuAGcAbABlAAYAAAAAAAAuQP/+/xRTAHUAcABwAHIAZQBzAHMAVQBuAGkAdABzAEQAaQBzAHAAbABhAHkABwD//v8QRgBvAHIAYwBlAEkAbgBjAGgARABpAHMAcABsAGEAeQAHAP/+/whBAHIAZQBhAFUAbgBpAHQABAAAAAD//v8KVgBvAGwAdQBtAGUAVQBuAGkAdAAEAAAAAP/+/w1BAHIAZQBhAFAAcgBlAGMAaQBzAGkAbwBuAAQCAAAA//7/D1YAbwBsAHUAbQBlAFAAcgBlAGMAaQBzAGkAbwBuAAQCAAAA//7/AP//AAATAENBdHRyaWJ1dGVDb250YWluZXIAAAD//wEADwBDQXR0cmlidXRlTmFtZWQAAAAAAAAA//7/D00AbwBkAGUAbABQAHIAbwBwAGUAcgB0AGkAZQBzAP/+/wxJAHMAQwBsAGEAcwBzAGkAZgBpAGUAZAAHAP/+/wlJAHMARAB5AG4AYQBtAGkAYwAHAP/+/wZJAHMATABpAHYAZQAHAP/+/wAAAAAAAAAAAP//BQAHAENDYW1lcmEAAAAAAAAAAAAAAAAAAAAAAAAAAABAf0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPA/AAAAAAAAAAAAAAAAAADwPwAAAAAAQI9AAQAAAAAAAD5AAAAAAACgYEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEA//7/AAAAAAAAAAAAAAAAAAAAAPA/AAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAQABAAAAAAAAAAAAAAD//wD/gICA/wAAAAEBAAAAAAgAAAABAwAAAAAEAAAAAAUAAAAAAAAAAADh4cj/gIDI/wAAAAAAAOg/AAAAAAAA4D8AAAAAAAAAAQAAAAAAAPC/AAAAAAAA8L8BAAAAAAAAAAEBAQCMpf//AAAAAD+TP/8AAAEyAAAAZm6N/8DAwP//AAD/BAAAAAMAAAAAAAAAAYhE50oYV9Y/Af8AAP8BzczMzMzM5D8AAQAAAAAAAPA/AZqZmZmZmek/AAAAAAEAAAAAAAAAAAABAQAAAAAAAAAAAAAAAAAAAAAAAQAAAP//AwAGAENMYXllcgAAAQT//v8GTABhAHkAZQByADAAAAAAAQX//v8MTABhAHkAZQByAF8ATABhAHkAZQByADAAAAH/VFT///7/AAAAAAAAAAAAAAAAAAAA4D8AAAAAAAoAAAAAAAAAAAAAAAAAAAAAAABY5zdqAP/+/wxCAG8AdQBsAGQAZQByACAAKABDAE8AKQD//v8DVQBTAEEAJzEIrBxSWsAZBFYOLQJEQAAAAAAAABzAAAAAAAAAAAAAAAAAAADwPwAAAAAAAAAAAAEBAFAAAAAUAAAAAAAAAAAAAAAAAAAAAAAAAAEBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADwPwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPA/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8D8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP//AQAHAENTa0ZvbnQAAAEC//7/BUEAcgBpAGEAbAAAAAwAAAAAAAAAAAAA8D8AAQUAAAAKAAAAAQAAAAMAAAAKAAAAAP8AAP8BADMzMzMzM+M/AAAAAAAAACRAQEBA/wAAAAABAAAAAAAAC4AAAAED//7/BlQAYQBoAG8AbQBhAAAADAAAAAAAAAAAAADwPwIAAAABAAAAAAMAAAABAAAA/wAAAP8NAAAAAAIAAAAMAA0AAAAAAAABAAAA//8CAAkAQ1NrcFN0eWxlAAABAWvm/pTOLXlLradL5W+SZqL//v8AAwAAAP/+/wVTAHQAeQBsAGUA//7/ADgAAADoAwAAAQAAAAQAAAABAAAA6QMAAAEAAAAEAAAAAAAAAOoDAAABAAAABAAAAAEAAADsAwAAAQAAAAEAAAAA7QMAAAEAAAAEAAAACAAAAO4DAAABAAAAAQAAAAHvAwAAAQAAAAQAAAADAAAA8AMAAAEAAAABAAAAAPEDAAABAAAABAAAAAQAAADyAwAAAQAAAAEAAAAA8wMAAAEAAAAEAAAABQAAAPQDAAABAAAAAQAAAAD2AwAAAQAAAAQAAAAAAAD/9wMAAAEAAAABAAAAAPgDAAABAAAAAQAAAAHRBwAAAQAAAAQAAAACAAAA0gcAAAEAAAAEAAAA4eHI/9MHAAABAAAABAAAAICAyP/UBwAAAQAAAAEAAAAA1QcAAAEAAAABAAAAAdYHAAABAAAABAAAAAAAAADXBwAAAQAAAAEAAAAB2AcAAAEAAAAHAAAAzczMzMzM5D+gDwAAAQAAAAQAAAD/////oQ8AAAEAAAAEAAAAjKX//6IPAAABAAAAAQAAAACjDwAAAQAAAAQAAAA/kz//pA8AAAEAAAABAAAAAKUPAAABAAAABAAAADIAAACmDwAAAQAAAAEAAAABpw8AAAEAAAAEAAAAAAAAAIgTAAABAAAAAQAAAAGJEwAAAAAAAFgbAAABAAAABAAAAP//AP9ZGwAAAQAAAAQAAAD/AAD/WhsAAAEAAAAEAAAAgICA/1sbAAABAAAABAAAAGZujf9cGwAAAQAAAAQAAADAwMD/XRsAAAEAAAAEAAAA/wAA/2AbAAABAAAAAQAAAAFiGwAAAQAAAAEAAAAAYxsAAAEAAAABAAAAAGQbAAABAAAAAQAAAABlGwAAAQAAAAQAAAADAAAAZhsAAAEAAAAEAAAABAAAAGcbAAABAAAAAQAAAABoGwAAAQAAAAQAAAAAAAD/aRsAAAEAAAABAAAAAGobAAABAAAAAQAAAABAHwAAAQAAAAEAAAABQR8AAAEAAAAHAAAAAAAAAAAA8D9CHwAAAQAAAAEAAAABQx8AAAEAAAAHAAAAmpmZmZmZ6T+kHwAAAQAAAAEAAAAAph8AAAEAAAAGAAAAAAAgQacfAAABAAAABgAAAAAAAAAPAA6AAAAAeqx6ZlrRnUCdIST/qAReYf/+/wADAAAA//7/BVMAdAB5AGwAZQD//v8AOAAAAOgDAAABAAAABAAAAAEAAADpAwAAAQAAAAQAAAAAAAAA6gMAAAEAAAAEAAAAAQAAAOwDAAABAAAAAQAAAADtAwAAAQAAAAQAAAAIAAAA7gMAAAEAAAABAAAAAe8DAAABAAAABAAAAAMAAADwAwAAAQAAAAEAAAAA8QMAAAEAAAAEAAAABAAAAPIDAAABAAAAAQAAAADzAwAAAQAAAAQAAAAFAAAA9AMAAAEAAAABAAAAAPYDAAABAAAABAAAAAAAAP/3AwAAAQAAAAEAAAAA+AMAAAEAAAABAAAAAdEHAAABAAAABAAAAAIAAADSBwAAAQAAAAQAAADh4cj/0wcAAAEAAAAEAAAAgIDI/9QHAAABAAAAAQAAAADVBwAAAQAAAAEAAAAB1gcAAAEAAAAEAAAAAAAAANcHAAABAAAAAQAAAAHYBwAAAQAAAAcAAADNzMzMzMzkP6APAAABAAAABAAAAP////+hDwAAAQAAAAQAAACMpf//og8AAAEAAAABAAAAAKMPAAABAAAABAAAAD+TP/+kDwAAAQAAAAEAAAAApQ8AAAEAAAAEAAAAMgAAAKYPAAABAAAAAQAAAAGnDwAAAQAAAAQAAAAAAAAAiBMAAAEAAAABAAAAAYkTAAAAAAAAWBsAAAEAAAAEAAAA//8A/1kbAAABAAAABAAAAP8AAP9aGwAAAQAAAAQAAACAgID/WxsAAAEAAAAEAAAAZm6N/1wbAAABAAAABAAAAMDAwP9dGwAAAQAAAAQAAAD/AAD/YBsAAAEAAAABAAAAAWIbAAABAAAAAQAAAABjGwAAAQAAAAEAAAAAZBsAAAEAAAABAAAAAGUbAAABAAAABAAAAAMAAABmGwAAAQAAAAQAAAAEAAAAZxsAAAEAAAABAAAAAGgbAAABAAAABAAAAAAAAP9pGwAAAQAAAAEAAAAAahsAAAEAAAABAAAAAEAfAAABAAAAAQAAAAFBHwAAAQAAAAcAAAAAAAAAAADwP0IfAAABAAAAAQAAAAFDHwAAAQAAAAcAAACamZmZmZnpP6QfAAABAAAAAQAAAACmHwAAAQAAAAYAAAAAACBBpx8AAAEAAAAGAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAA";
function loadScaffold() {
  let binary;
  if (typeof atob === "function") {
    binary = atob(SCAFFOLD_BASE64);
  } else {
    binary = Buffer.from(SCAFFOLD_BASE64, "base64").toString("binary");
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
var MATERIAL_INSERT_POS = 3400;
var BASE = 9;
var LAYER_COUNT_POS = 3405;
var ORIG_LAYER_COUNT = 1;
var LAYER_INSERT_POS = 3505;
var DEF_COUNT_POS = 3507;
var ORIG_DEF_COUNT = 0;
var ROOT_COUNT_POS = 3511;
var ORIG_ROOT_COUNT = 0;
var TAIL_POS = 3515;
var SCAFFOLD_NEXT_SLOT = 11;
var LAYER_WRITER_BASE = 11;
var SCAFFOLD_CLASS_SLOT = { CLayer: BASE };

// src/create.ts
var SkpWriteError = class _SkpWriteError extends Error {
  constructor(message) {
    super(message);
    this.name = "SkpWriteError";
    Object.setPrototypeOf(this, _SkpWriteError.prototype);
  }
};
function hexToBytes(hex) {
  const out = [];
  for (let i = 0; i < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
  return out;
}
var TAIL_REF_POSITIONS = [409, 468, 477, 479, 1383, 1385];
var ISO_CAMERA_PREFIX_OFFSET = 2993;
var ISO_CAMERA_PREFIX_PATCH = hexToBytes(
  "594000000000000059c000000000000059400000000000000000000000000000000000000000000000003f2c0c70bd20dabf3f2c0c70bd20da3f3f2c0c70bd20ea3f000000000000f03f0000000000408f40000000000000003e402adf272c803457"
);
var ISO_CAMERA_TAIL_PATCHES = [
  [509, hexToBytes("d0a869613c442d4799a4667d1adfa836")],
  [1390, hexToBytes("4e53c84477029246bba95827bba7e2")]
];
var ACTIVE_LAYER_ANCHOR_REL = 0;
var PID_COUNTER_POS = 1987;
var MATERIAL_SCHEMA = 12;
var DIB_SCHEMA = 3;
var _TEXTURE_H_SENTINEL = hexToBytes("f0ffffffffffff0f");
var DEFINITION_SCHEMA = 11;
var INSTANCE_SCHEMA = 6;
var GROUP_SCHEMA = 1;
var IMAGE_SCHEMA = 6;
var THUMBNAIL_SCHEMA = 1;
var LAYER_SCHEMA = 3;
var FTC_SCHEMA = 4;
var ARCCURVE_SCHEMA = 3;
var CCURVE_SCHEMA = 4;
var SECTIONPLANE_SCHEMA = 3;
var DIMENSIONLINEAR_SCHEMA = 6;
var SKFONT_SCHEMA = 1;
var TEXT_SCHEMA = 9;
var CONSTRUCTIONLINE_SCHEMA = 1;
var CONSTRUCTIONPOINT_SCHEMA = 0;
var DIM_FONT_PAYLOAD = hexToBytes(
  "000000fffeff065400610068006f006d00610000000800000000ecf57abd5eaf2340"
  // height f64
);
var TEXT_DELIM = hexToBytes("0100000001000300000001");
var CLINE_INFINITE = 1e30;
var CCAMERA_SLOT = 7;
var ATTR_CONTAINER_SLOT = 3;
var ATTRIBUTE_NAMED_SLOT = 5;
var ATTR_TYPE_INT32 = 4;
var ATTR_TYPE_DOUBLE = 6;
var ATTR_TYPE_STRING = 10;
var CAMERA_TEMPLATE = hexToBytes(
  "00000000000000000000000000000000000000000000f03f000000000000000000000000000000000000000000000000004000000000000000000000000000f03f0000000000000000000000000000000000000000000000000100000000003e40000000000000f03f00000000000000000000000000000000000000000000000000000000000000000100fffeff00000000000000000000000000000000f03f00000000000000000000000000000000"
);
var DEFINITION_BASE_BLOCK = [0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
var IDENTITY_UV_MATRIX = [1, 0, 0, 0, 1, 0, 0, 0, 1];
function det3(m) {
  return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
}
function solve3x3(a, b) {
  const d = det3(a);
  if (Math.abs(d) < 1e-9) {
    throw new SkpWriteError(
      "the 3 texture-positioning points map to collinear (u, v) coordinates - cannot determine a texture mapping from them"
    );
  }
  const cols = [];
  for (let col = 0; col < 3; col++) {
    const ai = a.map((row) => row.slice());
    for (let r = 0; r < 3; r++) ai[r][col] = b[r];
    cols.push(det3(ai) / d);
  }
  return [cols[0], cols[1], cols[2]];
}
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function normalize3(v) {
  const length = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (length < 1e-9) {
    throw new SkpWriteError("cannot determine a texture-positioning basis: the face's first edge is degenerate");
  }
  return [v[0] / length, v[1] / length, v[2] / length];
}
function rotationMatrix3x3(axis, angleRadians) {
  const length = Math.sqrt(axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2);
  if (length < 1e-9) throw new SkpWriteError("rotation axis must not be the zero vector");
  const x = axis[0] / length;
  const y = axis[1] / length;
  const z = axis[2] / length;
  const c = Math.cos(angleRadians);
  const s = Math.sin(angleRadians);
  const t = 1 - c;
  return [
    t * x * x + c,
    t * x * y - s * z,
    t * x * z + s * y,
    t * x * y + s * z,
    t * y * y + c,
    t * y * z - s * x,
    t * x * z - s * y,
    t * y * z + s * x,
    t * z * z + c
  ];
}
function resolveMatrix3x3(matrix3x3, rotation) {
  if (matrix3x3 !== void 0 && rotation !== void 0) {
    throw new SkpWriteError("pass at most one of matrix3x3/rotation - rotation is just a convenience for matrix3x3");
  }
  if (rotation !== void 0) return rotationMatrix3x3(rotation.axis, rotation.angleRadians);
  return matrix3x3;
}
function faceUvBasis2(points, normal) {
  const u = normalize3([points[1][0] - points[0][0], points[1][1] - points[0][1], points[1][2] - points[0][2]]);
  const w = normalize3(cross(normal, u));
  return [u, w];
}
function circleBasis(normal) {
  const seed = Math.abs(normal[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const dot = seed[0] * normal[0] + seed[1] * normal[1] + seed[2] * normal[2];
  const uRaw = [seed[0] - dot * normal[0], seed[1] - dot * normal[1], seed[2] - dot * normal[2]];
  const u = normalize3(uRaw);
  const w = normalize3(cross(normal, u));
  return [u, w];
}
function circlePoints(center, radius, numSegments, u, w) {
  const pts = [];
  for (let i = 0; i < numSegments; i++) {
    const angle = 2 * Math.PI * i / numSegments;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    pts.push([
      center[0] + radius * (c * u[0] + s * w[0]),
      center[1] + radius * (c * u[1] + s * w[1]),
      center[2] + radius * (c * u[2] + s * w[2])
    ]);
  }
  return pts;
}
function arcPoints(center, radius, numSegments, u, w, startAngle, endAngle) {
  const pts = [];
  for (let i = 0; i <= numSegments; i++) {
    const angle = startAngle + (endAngle - startAngle) * i / numSegments;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    pts.push([
      center[0] + radius * (c * u[0] + s * w[0]),
      center[1] + radius * (c * u[1] + s * w[1]),
      center[2] + radius * (c * u[2] + s * w[2])
    ]);
  }
  return pts;
}
function solveUvMatrix(pairs, basis) {
  if (pairs.length !== 3) throw new SkpWriteError("texture positioning needs exactly 3 (point, uv) pairs");
  const [uAxis, wAxis] = basis;
  const a = pairs.map(([, uv]) => [uv[0], uv[1], 1]);
  const bx = pairs.map(([pt]) => pt[0] * uAxis[0] + pt[1] * uAxis[1] + pt[2] * uAxis[2]);
  const by = pairs.map(([pt]) => pt[0] * wAxis[0] + pt[1] * wAxis[1] + pt[2] * wAxis[2]);
  const [a0, c0, e0] = solve3x3(a, bx);
  const [b0, d0, f0] = solve3x3(a, by);
  return [a0, b0, 0, c0, d0, 0, e0, f0, 1];
}
function uvMatrixForFace(points, pairs, normal) {
  return solveUvMatrix(pairs, faceUvBasis2(points, normal));
}
var GrowableBytes = class {
  constructor(capacity = 1 << 16) {
    this.length = 0;
    this.buf = new Uint8Array(capacity);
  }
  reserve(extra) {
    const needed = this.length + extra;
    if (needed <= this.buf.length) return;
    let capacity = this.buf.length * 2;
    while (capacity < needed) capacity *= 2;
    const next = new Uint8Array(capacity);
    next.set(this.buf.subarray(0, this.length));
    this.buf = next;
  }
  push(...values) {
    this.reserve(values.length);
    const buf = this.buf;
    let n = this.length;
    for (let i = 0; i < values.length; i++) buf[n++] = values[i];
    this.length = n;
  }
  append(src) {
    this.reserve(src.length);
    this.buf.set(src instanceof Uint8Array ? src : Uint8Array.from(src), this.length);
    this.length += src.length;
  }
  /** The bytes written so far, without copying. */
  view() {
    return this.buf.subarray(0, this.length);
  }
};
function f64Bytes(v) {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setFloat64(0, v, true);
  return Array.from(b);
}
function u32Bytes(v) {
  return [v & 255, v >>> 8 & 255, v >>> 16 & 255, v >>> 24 & 255];
}
function readU16(buf, pos) {
  return (buf[pos] | buf[pos + 1] << 8) & 65535;
}
function writeU16At(buf, pos, v) {
  buf[pos] = v & 255;
  buf[pos + 1] = v >> 8 & 255;
}
function writeU32At(buf, pos, v) {
  const b = u32Bytes(v);
  buf[pos] = b[0];
  buf[pos + 1] = b[1];
  buf[pos + 2] = b[2];
  buf[pos + 3] = b[3];
}
function shiftRef(buf, pos, shift) {
  const u16 = readU16(buf, pos);
  const tagBit = u16 & 32768;
  const slot = u16 & 32767;
  const newSlot = slot + shift;
  if (newSlot < 32767) {
    writeU16At(buf, pos, tagBit | newSlot);
    return 0;
  }
  const val = tagBit ? (2147483648 | newSlot) >>> 0 : newSlot;
  buf.splice(pos, 2, 255, 127, ...u32Bytes(val));
  return 4;
}
function randomGuidBytes() {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = bytes[6] & 15 | 64;
  bytes[8] = bytes[8] & 63 | 128;
  return Array.from(bytes);
}
function detectImageSubtype(imageBytes) {
  if (imageBytes.length >= 8 && imageBytes[0] === 137 && imageBytes[1] === 80 && imageBytes[2] === 78 && imageBytes[3] === 71 && imageBytes[4] === 13 && imageBytes[5] === 10 && imageBytes[6] === 26 && imageBytes[7] === 10) {
    return 4;
  }
  if (imageBytes.length >= 3 && imageBytes[0] === 255 && imageBytes[1] === 216 && imageBytes[2] === 255) {
    return 1;
  }
  throw new SkpWriteError(
    "unrecognized image format - only PNG and JPEG textures are supported for now (detected from the file's own magic bytes, not its extension)"
  );
}
function vertexKey(p) {
  return `${p[0]}|${p[1]}|${p[2]}`;
}
function edgeKey(a, b) {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}
var ArchiveWriter = class {
  constructor(nextSlot, classSlot, nextPid = 1) {
    this.bytes = new GrowableBytes();
    // One CSkFont per file, serialized inline at the first dimension/text's
    // font field (exactly as SketchUp writes it) and re-used by back-ref
    // afterwards - see writeDimension/writeText.
    this.dimFontSlot = null;
    this.nextSlot = nextSlot;
    this.classSlot = { ...classSlot };
    this.nextPid = nextPid;
  }
  get length() {
    return this.bytes.length;
  }
  alloc() {
    const s = this.nextSlot;
    this.nextSlot += 1;
    return s;
  }
  allocPid() {
    const p = this.nextPid;
    this.nextPid += 1;
    return p;
  }
  pushU8(v) {
    this.bytes.push(v & 255);
  }
  pushU16(v) {
    this.bytes.push(v & 255, v >> 8 & 255);
  }
  pushU32(v) {
    this.bytes.push(...u32Bytes(v));
  }
  pushI32(v) {
    this.pushU32(v);
  }
  pushF64(v) {
    this.bytes.push(...f64Bytes(v));
  }
  pushBytes(arr) {
    for (let i = 0; i < arr.length; i++) this.bytes.push(arr[i]);
  }
  pushZeros(n) {
    for (let i = 0; i < n; i++) this.bytes.push(0);
  }
  patchU32(pos, v) {
    writeU32At(this.bytes.buf, pos, v);
  }
  newOfKnownClass(className, schema) {
    if (!(className in this.classSlot)) {
      if (schema === void 0) throw new SkpWriteError(`${className} not yet declared and no schema given`);
      this.pushU16(65535);
      this.pushU16(schema);
      this.pushU16(className.length);
      for (let i = 0; i < className.length; i++) this.bytes.push(className.charCodeAt(i) & 255);
      this.classSlot[className] = this.alloc();
      return this.alloc();
    }
    const slot = this.classSlot[className];
    if (slot < 32767) {
      this.pushU16(32768 | slot);
    } else {
      this.pushU16(32767);
      this.pushU32(2147483648 | slot);
    }
    return this.alloc();
  }
  writeNull() {
    this.pushU16(0);
  }
  writeBackref(slot) {
    if (slot < 32767) {
      this.pushU16(slot);
    } else {
      this.pushU16(32767);
      this.pushU32(slot);
    }
  }
  encodePid(pid) {
    let mask = 0;
    const pidBytes = [];
    let p = pid;
    for (let bit = 0; bit < 8; bit++) {
      const byteVal = p % 256;
      p = Math.floor(p / 256);
      if (byteVal) {
        mask |= 1 << bit;
        pidBytes.push(byteVal);
      }
    }
    return [mask, ...pidBytes];
  }
  preamble(pid, realAttrs = false) {
    if (realAttrs) {
      this.pushU16(32768 | ATTR_CONTAINER_SLOT);
      this.alloc();
      this.pushZeros(3);
      this.pushU16(0);
    } else {
      this.writeNull();
    }
    const realPid = pid === void 0 ? this.allocPid() : pid;
    this.pushBytes(this.encodePid(realPid));
  }
  preambleWithRealAttrs(frontMatrix, backMatrix, attributeDicts = [], pid) {
    this.pushU16(32768 | ATTR_CONTAINER_SLOT);
    this.alloc();
    this.pushZeros(3);
    if (frontMatrix !== void 0 || backMatrix !== void 0) {
      this.writeFaceTextureCoords(frontMatrix, backMatrix);
    }
    for (const [dictName, entries] of attributeDicts) {
      this.writeAttributeDict(dictName, entries);
    }
    this.writeNull();
    const realPid = pid === void 0 ? this.allocPid() : pid;
    this.pushBytes(this.encodePid(realPid));
  }
  /** Shares writeAttributeDict's own exact validation rules so a caller
   * can check every attribute dict a multi-part write will need BEFORE
   * that write starts mutating this.bytes. */
  validateAttributeEntries(entries) {
    for (const [key, value] of Object.entries(entries)) {
      if (typeof value === "boolean") {
        throw new SkpWriteError(`attribute ${JSON.stringify(key)}: bool is not a supported value type - use 0/1 instead`);
      }
      if (typeof value !== "string" && typeof value !== "number") {
        throw new SkpWriteError(`attribute ${JSON.stringify(key)}: unsupported value type (only str and number are supported)`);
      }
    }
  }
  writeAttributeDict(dictName, entries) {
    this.pushU16(32768 | ATTRIBUTE_NAMED_SLOT);
    this.alloc();
    this.pushZeros(3);
    this.pushU32(0);
    this.validateAttributeEntries(entries);
    this.writeStr(dictName);
    for (const [key, value] of Object.entries(entries)) {
      this.writeStr(key);
      if (typeof value === "string") {
        this.pushU8(ATTR_TYPE_STRING);
        this.writeStr(value);
      } else if (Number.isInteger(value) && value >= -(2 ** 31) && value < 2 ** 31) {
        this.pushU8(ATTR_TYPE_INT32);
        this.pushI32(value);
      } else {
        this.pushU8(ATTR_TYPE_DOUBLE);
        this.pushF64(value);
      }
    }
    this.writeStr("");
    this.pushU32(0);
  }
  /** Write one CFaceTextureCoords record. `frontMatrix`/`backMatrix` are
   * the 9-value row-major UV-to-world affine matrices from
   * uvMatrixForFace, or undefined for a side that isn't explicitly
   * positioned (written as identity). */
  writeFaceTextureCoords(frontMatrix, backMatrix) {
    this.newOfKnownClass("CFaceTextureCoords", FTC_SCHEMA);
    this.preamble(0);
    this.pushU32(0);
    const ks = new Array(24).fill(0);
    const front = frontMatrix ?? IDENTITY_UV_MATRIX;
    const back = backMatrix ?? IDENTITY_UV_MATRIX;
    for (let i = 0; i < 9; i++) ks[i] = front[i];
    for (let i = 0; i < 9; i++) ks[12 + i] = back[i];
    for (const v of ks) this.pushF64(v);
    this.pushU32(0);
    this.pushU32(0);
    this.pushU32(frontMatrix !== void 0 ? 1 : 0);
    this.pushU32(backMatrix !== void 0 ? 1 : 0);
  }
  drawbase(mat = 0, layer = 0, hidden = false, soft = false, smooth = false) {
    const b = new Array(10).fill(0);
    b[0] = mat & 255;
    b[1] = mat >> 8 & 255;
    b[2] = hidden ? 1 : 0;
    b[3] = 1;
    b[4] = 1;
    b[5] = soft ? 1 : 0;
    b[6] = smooth ? 1 : 0;
    b[8] = layer & 255;
    b[9] = layer >> 8 & 255;
    this.pushBytes(b);
  }
  writeVertex(point) {
    const slot = this.newOfKnownClass("CVertex", 0);
    this.preamble();
    this.pushF64(point[0]);
    this.pushF64(point[1]);
    this.pushF64(point[2]);
    return slot;
  }
  /** Write one CArcCurve record and return its slot - the shared
   * geometric-parameter object a circle/arc's straight CEdge segments
   * each carry a backref to. `xaxis` is the arc's own fixed 0-angle
   * reference direction (a unit vector times radius, in the plane
   * perpendicular to normal) - startAngle/endAngle are offsets from it. */
  writeArcCurve(p) {
    if (!(p.numSegments >= 0 && p.numSegments <= 255)) {
      throw new SkpWriteError(`num_segments must be between 0 and 255, got ${p.numSegments}`);
    }
    const slot = this.newOfKnownClass("CArcCurve", ARCCURVE_SCHEMA);
    this.preamble();
    this.pushBytes([0, p.numSegments, 0, 0, 0]);
    const values = [...p.center, ...p.normal, ...p.xaxis, p.startAngle, p.endAngle, 0, p.radius, 0];
    for (const v of values) this.pushF64(v);
    return slot;
  }
  /** Write one CCurve record and return its slot - a freeform polyline
   * curve grouping: a labeled set of already-straight CEdge segments,
   * with no geometric data of its own beyond how many edges share it. */
  writeCurve(numEdges) {
    const slot = this.newOfKnownClass("CCurve", CCURVE_SCHEMA);
    this.preamble();
    this.pushU8(1);
    this.pushU32(numEdges);
    return slot;
  }
  writeStr(s) {
    if (s.length >= 255) throw new SkpWriteError("string too long to encode (255 char limit)");
    this.bytes.push(255, 254, 255, s.length);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      this.bytes.push(c & 255, c >> 8 & 255);
    }
  }
  /** Write the first dimension/text's CSkFont record inline, or back-ref
   * the one already written earlier in this file - shared 1-per-file
   * state, same as create.py's own `_dim_font_slot`. */
  writeDimFontRef() {
    if (this.dimFontSlot === null) {
      this.dimFontSlot = this.newOfKnownClass("CSkFont", SKFONT_SCHEMA);
      this.pushBytes(DIM_FONT_PAYLOAD);
    } else {
      this.writeBackref(this.dimFontSlot);
    }
  }
  /** Add a FREE linear dimension between two explicit points (inches,
   * world space). `offset` is the dimension line's offset from the
   * measured segment, in inches (signed).
   *
   * The record layout is the byte-exact one the real SketchUp SDK writes
   * for free dimensions (generated via SketchUpAPI and harvested - see
   * docs/dimension-record-notes.md): connection type 1 with the point
   * stored inline in each connection block and null object refs. Free
   * dimensions render in any orientation; anchored (type 2) dimensions are
   * a future refinement. */
  writeDimension(p1, p2, offset = 10) {
    if (p1[0] === p2[0] && p1[1] === p2[1] && p1[2] === p2[2]) {
      throw new SkpWriteError("addDimension endpoints coincide");
    }
    this.newOfKnownClass("CDimensionLinear", DIMENSIONLINEAR_SCHEMA);
    this.preamble();
    this.drawbase();
    this.writeStr("");
    this.writeDimFontRef();
    this.pushZeros(5);
    this.pushU32(1);
    this.pushU32(4);
    this.pushF64(p1[0]);
    this.pushF64(p1[1]);
    this.pushF64(p1[2]);
    this.pushU16(0);
    this.pushZeros(10);
    this.pushU32(1);
    this.pushU32(4);
    this.pushF64(p2[0]);
    this.pushF64(p2[1]);
    this.pushF64(p2[2]);
    this.pushU16(0);
    this.pushZeros(2);
    for (const v of [0, 0, 0, 1, 1, 0, 0]) this.pushF64(v);
    this.pushU32(0);
    this.pushF64(offset);
    this.pushF64(0);
    this.pushU32(1);
  }
  /** Add a leader text (SketchUp's Text tool) anchored at `point` (inches,
   * world space), with the label floating at `point + leader` and a
   * leader line joining them.
   *
   * The record mirrors human-drawn leader texts harvested from real files
   * (the SDK's own create only produces SCREEN texts - its two 0.5
   * doubles are screen fractions): screen slot zeroed, the free-connection
   * block dimensions use ([u32 1][u32 4][point3d]), the label's world
   * position in the placement tail, and leader type 2 (pushpin) before the
   * arrow delimiter. */
  writeText(text, point, leader = [15, 15, 15]) {
    const lb = [point[0] + leader[0], point[1] + leader[1], point[2] + leader[2]];
    this.newOfKnownClass("CText", TEXT_SCHEMA);
    this.preamble();
    this.drawbase();
    this.writeDimFontRef();
    this.pushF64(0);
    this.pushF64(0);
    this.pushU32(1);
    this.pushU32(4);
    this.pushF64(point[0]);
    this.pushF64(point[1]);
    this.pushF64(point[2]);
    this.pushZeros(12);
    this.pushF64(lb[0]);
    this.pushF64(lb[1]);
    this.pushF64(lb[2]);
    this.pushZeros(16);
    this.pushF64(1);
    this.pushU32(2);
    this.pushBytes(TEXT_DELIM);
    this.writeStr(text);
    this.pushZeros(5);
  }
  /** Add a construction/guide line (SketchUp's Construction Line tool).
   * Pass exactly one of `point2` (a bounded segment between `point` and
   * `point2`) or `direction` (an unbounded guide line through `point`).
   *
   * Ground truth (real SketchUp 2025, SDK/Ruby cross-checked against both
   * a v2020-downgrade save and a genuinely v17-native save): the record
   * stores a point + normalized direction + two signed distance
   * parameters along that direction marking the visible segment's
   * start/end. An unbounded direction is written as the real ±1e30
   * sentinel SketchUp itself uses. */
  writeConstructionLine(point, point2, direction) {
    if (point2 === void 0 === (direction === void 0)) {
      throw new SkpWriteError("addConstructionLine: pass exactly one of point2 or direction");
    }
    let dir;
    let startParam;
    let endParam;
    if (point2 !== void 0) {
      const dx = point2[0] - point[0];
      const dy = point2[1] - point[1];
      const dz = point2[2] - point[2];
      const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (length === 0) throw new SkpWriteError("addConstructionLine: point and point2 coincide");
      dir = [dx / length, dy / length, dz / length];
      startParam = 0;
      endParam = length;
    } else {
      const d = direction;
      const dlen = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
      if (dlen === 0) throw new SkpWriteError("addConstructionLine: direction must be nonzero");
      dir = [d[0] / dlen, d[1] / dlen, d[2] / dlen];
      startParam = -CLINE_INFINITE;
      endParam = CLINE_INFINITE;
    }
    this.newOfKnownClass("CConstructionLine", CONSTRUCTIONLINE_SCHEMA);
    this.preamble();
    this.drawbase();
    for (const v of [point[0], point[1], point[2], dir[0], dir[1], dir[2], startParam, endParam]) this.pushF64(v);
    this.pushZeros(4);
  }
  /** Add a construction/guide point (SketchUp's Construction Point tool)
   * at `position` (inches, world space).
   *
   * Ground truth (real SketchUp 2025, SDK/Ruby cross-checked): a second,
   * always-zero 3-double block and a trailing zero byte follow the
   * position - reserved/unused, written as zero to match every real-file
   * sample seen. */
  writeConstructionPoint(position) {
    this.newOfKnownClass("CConstructionPoint", CONSTRUCTIONPOINT_SCHEMA);
    this.preamble();
    this.drawbase();
    for (const v of [position[0], position[1], position[2], 0, 0, 0]) this.pushF64(v);
    this.pushZeros(1);
  }
  /** Add a section plane (SketchUp's Section Plane tool) through `point`
   * with the given `normal` (need not be unit length), matching
   * `Entities#add_section_plane([point, normal])`.
   *
   * Ground truth (real SketchUp 2025, SDK/Ruby cross-checked against a
   * genuinely v17-native save): the record is preamble + drawbase + the
   * plane as 4 doubles (a, b, c, d) satisfying a*x + b*y + c*z + d = 0 for
   * every point on the plane - the same implicit form
   * `Sketchup::SectionPlane#get_plane` returns (normal normalized,
   * d = -(normal . point)). A name/short-label pair can follow on v18+
   * saves per the reader (legacy.ts's readSectionPlane) - omitted here
   * since this writer only ever produces v17-tagged files, same scope as
   * writeDimension/writeText/writeConstructionLine. */
  writeSectionPlane(point, normal) {
    const nlen = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]);
    if (nlen === 0) throw new SkpWriteError("addSectionPlane: normal must be nonzero");
    const a = normal[0] / nlen;
    const b = normal[1] / nlen;
    const c = normal[2] / nlen;
    const d = -(a * point[0] + b * point[1] + c * point[2]);
    this.newOfKnownClass("CSectionPlane", SECTIONPLANE_SCHEMA);
    this.preamble();
    this.drawbase();
    this.pushF64(a);
    this.pushF64(b);
    this.pushF64(c);
    this.pushF64(d);
  }
  /** Write one solid-color CMaterial record and return its slot. */
  writeMaterial(name, rgba, opacity) {
    const slot = this.newOfKnownClass("CMaterial", MATERIAL_SCHEMA);
    this.preamble();
    this.writeStr(name);
    this.pushU16(0);
    this.pushBytes(rgba);
    this.writeStr("");
    this.pushZeros(8);
    this.pushF64(opacity === void 0 ? 1 : 1 - opacity);
    this.pushU8(opacity === void 0 ? 0 : 1);
    return slot;
  }
  /** Write one image-textured CMaterial record (embedding `imageBytes`
   * verbatim inside a CDib sub-object) and return its slot. `subtype` is
   * CDib's image format tag (4 for PNG, 1 for JPEG).
   *
   * `appliedWidth`/`appliedHeight` both default to 1.0. Pass the
   * material's real-world tile size for a textured material used with
   * default (unpositioned) projection, to make the texture repeat at a
   * specific size instead of every 1 inch (real SketchUp writes the
   * material's own size here - a file authored in SketchUp Web carries
   * 8.0 x 16.0 for a brick) - the reader's own ground-truth-derived UV
   * formula divides a face's final UV by the material's applied
   * width/height, for a default-projected face exactly as much as a
   * positioned (`frontUv`/`backUv`) one. Until 2026-08-28 this defaulted
   * to a corrupted sentinel byte pattern instead (see
   * _TEXTURE_H_SENTINEL's own comment) - confirmed via real SketchUp
   * screenshots to render as a streaky, vertically-smeared texture
   * regardless of projection mode.
   *
   * `appliedWidth` and `opacity` are appended after `appliedHeight`
   * (rather than sitting next to it, matching Python's ordering) so an
   * existing positional call passing `appliedHeight` as the 5th argument
   * keeps meaning what it always meant. */
  writeTexturedMaterial(name, imageBytes, texturePath, subtype, appliedHeight, appliedWidth, opacity) {
    const slot = this.newOfKnownClass("CMaterial", MATERIAL_SCHEMA);
    this.preamble();
    this.writeStr(name);
    this.pushU16(1);
    this.pushZeros(2);
    this.newOfKnownClass("CDib", DIB_SCHEMA);
    this.pushU32(subtype);
    this.pushU32(imageBytes.length);
    this.pushBytes(imageBytes);
    if (subtype === 1) {
      this.pushU32(90);
    }
    this.pushF64(appliedWidth !== void 0 ? appliedWidth : 1);
    this.pushF64(appliedHeight !== void 0 ? appliedHeight : 1);
    this.writeStr(texturePath);
    this.pushBytes([255, 255, 255, 254, 0, 255, 255, 255, 254]);
    this.writeStr("");
    this.pushU32(1);
    this.pushU32(0);
    this.pushF64(opacity === void 0 ? 1 : 1 - opacity);
    this.pushU8(opacity === void 0 ? 0 : 1);
    return slot;
  }
  /** Write one CLayer record and return its slot. Ground truth shows
   * each top-level layer record contains a second, embedded pid - so
   * each layer consumes 2 pids, not 1. `withPids=false` (used only for
   * the layer a component definition embeds internally) omits both. */
  writeLayer(name, withPids = true, hidden = false, rgba) {
    const slot = this.newOfKnownClass("CLayer", LAYER_SCHEMA);
    this.preamble(withPids ? void 0 : 0);
    this.writeStr(name);
    const pid2 = withPids ? this.allocPid() : 0;
    this.pushBytes([hidden ? 1 : 0, 0, 0]);
    this.pushBytes(this.encodePid(pid2));
    this.writeStr(`Layer_${name}`);
    this.pushU16(256);
    this.pushBytes(rgba ?? [0, 0, 0, 0]);
    this.writeStr("");
    this.pushZeros(8);
    this.pushF64(0.5);
    this.pushZeros(5);
    return slot;
  }
  /** Write a CThumbnail with a default camera and no image - ground
   * truth shows the image itself is optional. */
  writeThumbnail() {
    this.newOfKnownClass("CThumbnail", THUMBNAIL_SCHEMA);
    this.preamble(0);
    this.pushU16(32768 | CCAMERA_SLOT);
    this.alloc();
    this.pushBytes(CAMERA_TEMPLATE);
    this.writeNull();
  }
  /** Begin a CComponentDefinition record - everything up to (not
   * including) its internal entity list. Returns [definitionSlot,
   * countPatchPos]. */
  writeDefinitionHeader(attributeDicts = []) {
    const slot = this.newOfKnownClass("CComponentDefinition", DEFINITION_SCHEMA);
    if (attributeDicts.length > 0) {
      this.preambleWithRealAttrs(void 0, void 0, attributeDicts);
    } else {
      this.preamble(void 0, true);
    }
    this.pushBytes(DEFINITION_BASE_BLOCK);
    this.pushU32(1);
    const embeddedLayerSlot = this.writeLayer("Layer0", false);
    this.writeBackref(embeddedLayerSlot);
    this.pushU32(0);
    const countPatchPos = this.length;
    this.pushU32(0);
    return [slot, countPatchPos];
  }
  /** Close out a CComponentDefinition record: relationship count, GUID,
   * name, timestamp, behavior flags, and a default thumbnail. */
  writeDefinitionTail(name, isGroup = false) {
    this.pushU32(0);
    this.pushU16(0);
    this.pushBytes(randomGuidBytes());
    this.writeStr(name);
    this.writeStr("");
    this.writeStr("");
    this.pushU32(Math.floor(Date.now() / 1e3));
    const groupFlagPos = this.bytes.length + 39;
    this.pushZeros(39);
    this.pushU32(isGroup ? 1 : 0);
    this.writeThumbnail();
    return groupFlagPos;
  }
  writeInstanceLike(className, schema, realAttrs, definitionSlot, name, translation, matrix3x3, mat, layer, attributeDicts = [], hidden = false) {
    this.newOfKnownClass(className, schema);
    if (realAttrs && attributeDicts.length > 0) {
      this.preambleWithRealAttrs(void 0, void 0, attributeDicts);
    } else {
      this.preamble(void 0, realAttrs);
    }
    this.drawbase(mat, layer, hidden);
    this.writeBackref(definitionSlot);
    const m = matrix3x3 ?? [1, 0, 0, 0, 1, 0, 0, 0, 1];
    for (const v of [...m, ...translation, 1]) this.pushF64(v);
    this.writeStr(name);
    this.pushBytes(randomGuidBytes());
  }
  /** Write one CComponentInstance placing a copy of `definitionSlot` and
   * return how many new root-entity-list slots it consumed (always 1). */
  writeInstance(definitionSlot, name, translation = [0, 0, 0], matrix3x3, instanceMaterial = 0, instanceLayer = 0, attributeDicts = [], hidden = false) {
    this.writeInstanceLike(
      "CComponentInstance",
      INSTANCE_SCHEMA,
      true,
      definitionSlot,
      name,
      translation,
      matrix3x3,
      instanceMaterial,
      instanceLayer,
      attributeDicts,
      hidden
    );
    return 1;
  }
  /** Write one CGroup placing a copy of `definitionSlot` - structurally
   * almost identical to writeInstance; the real differences are its
   * class name/schema and its attribute pointer: unlike CComponentInstance
   * (which always carries a real, if often empty, CAttributeContainer), a
   * group only gets one when `attributeDicts` is actually given - matching
   * writeFace's conditional pattern instead. A real production Group WITH
   * attributes (SketchUp 2020 export, ground truth) carries a genuine
   * CAttributeContainer at this exact schema; a never-attributed group
   * still correctly gets a null pointer either way (openskp#261). */
  writeGroup(definitionSlot, name, translation = [0, 0, 0], matrix3x3, groupMaterial = 0, groupLayer = 0, attributeDicts = [], hidden = false) {
    this.writeInstanceLike(
      "CGroup",
      GROUP_SCHEMA,
      attributeDicts.length > 0,
      definitionSlot,
      name,
      translation,
      matrix3x3,
      groupMaterial,
      groupLayer,
      attributeDicts,
      hidden
    );
    return 1;
  }
  /** Write one CImage placing `definitionSlot` (the quad + texture
   * material `addImage` built for it) - return contract matches
   * writeInstance/writeGroup (always 1).
   *
   * legacy.ts's image reader treats CImage as "instance-shaped": preamble,
   * drawbase, a definition back-ref, a 3x4 placement, a constant 1.0, a
   * source-path string, and a 16-byte GUID - field-for-field identical in
   * count and order to writeInstance's own
   * matrix3x3(9)+translation(3)+1.0(1)=13 f64s, name string, GUID. The
   * source-path string is always empty - ground truth shows real SketchUp
   * writes it empty too. No material argument - an Image entity isn't
   * painted a material the way a face or instance can be; its appearance
   * comes entirely from the definition's own textured face. */
  writeImage(definitionSlot, translation = [0, 0, 0], matrix3x3, imageLayer = 0, hidden = false) {
    this.writeInstanceLike(
      "CImage",
      IMAGE_SCHEMA,
      false,
      definitionSlot,
      "",
      translation,
      matrix3x3,
      0,
      imageLayer,
      [],
      hidden
    );
    return 1;
  }
  /** Write a chain of straight CEdge records connecting `points` in
   * order, sharing vertices/edges via `vertexSlots`/`edgeRegistry`.
   * `closed=true` also connects the last point back to the first.
   * Returns [edgeSlots, edgeSenses, newEntities]. At most one of
   * `curveParams`/`polylineNumEdges` should be given - ground truth
   * shows the shared curve object is declared inline as the FIRST
   * newly-declared edge's own "curve" field. */
  writeEdgeChain(points, vertexSlots, edgeRegistry, closed, hiddenEdges = false, softEdges = false, smoothEdges = false, curveParams, polylineNumEdges) {
    const n = points.length;
    const pairCount = closed ? n : n - 1;
    const pointSlots = points.map((p) => vertexSlots.get(vertexKey(p)));
    const edgeSlots = [];
    const edgeSenses = [];
    let newEntities = 0;
    let curveSlot;
    for (let i = 0; i < pairCount; i++) {
      const v1Idx = i;
      const v2Idx = (i + 1) % n;
      const v1Known = pointSlots[v1Idx];
      const v2Known = pointSlots[v2Idx];
      const key = v1Known !== void 0 && v2Known !== void 0 ? edgeKey(v1Known, v2Known) : void 0;
      if (key !== void 0 && edgeRegistry.has(key)) {
        const [edgeSlot2, fwdV1] = edgeRegistry.get(key);
        edgeSlots.push(edgeSlot2);
        edgeSenses.push(fwdV1 === v1Known ? 0 : 1);
        continue;
      }
      const edgeSlot = this.newOfKnownClass("CEdge", 2);
      this.preamble();
      this.drawbase(0, 0, hiddenEdges, softEdges, smoothEdges);
      for (const idx of [v1Idx, v2Idx]) {
        if (pointSlots[idx] === void 0) {
          const s = this.writeVertex(points[idx]);
          pointSlots[idx] = s;
          vertexSlots.set(vertexKey(points[idx]), s);
        } else {
          this.writeBackref(pointSlots[idx]);
        }
      }
      if (curveSlot !== void 0) {
        this.writeBackref(curveSlot);
      } else if (curveParams !== void 0) {
        curveSlot = this.writeArcCurve(curveParams);
      } else if (polylineNumEdges !== void 0) {
        curveSlot = this.writeCurve(polylineNumEdges);
      } else {
        this.writeNull();
      }
      edgeSlots.push(edgeSlot);
      edgeSenses.push(0);
      newEntities += 1;
      edgeRegistry.set(edgeKey(pointSlots[v1Idx], pointSlots[v2Idx]), [
        edgeSlot,
        pointSlots[v1Idx]
      ]);
    }
    return [edgeSlots, edgeSenses, newEntities];
  }
  /** Write a partial (open) arc as a chain of straight CEdge records - no
   * face. Returns how many new root-entity-list slots were consumed. */
  writeArc(points, vertexSlots, edgeRegistry, curveParams, hiddenEdges = false, softEdges = false, smoothEdges = false) {
    const [, , newEntities] = this.writeEdgeChain(
      points,
      vertexSlots,
      edgeRegistry,
      false,
      hiddenEdges,
      softEdges,
      smoothEdges,
      curveParams
    );
    return newEntities;
  }
  /** Write a freeform polyline curve - a chain of straight CEdge records
   * connecting `points` in order, all sharing one CCurve grouping, no
   * face. Returns how many new root-entity-list slots were consumed. */
  writePolyline(points, vertexSlots, edgeRegistry, closed = false, hiddenEdges = false, softEdges = false, smoothEdges = false) {
    const n = points.length;
    const pairCount = closed ? n : n - 1;
    const [, , newEntities] = this.writeEdgeChain(
      points,
      vertexSlots,
      edgeRegistry,
      closed,
      hiddenEdges,
      softEdges,
      smoothEdges,
      void 0,
      pairCount
    );
    return newEntities;
  }
  /** Write one planar face and return how many new root-entity-list
   * slots it consumed (edges newly declared, plus the face itself).
   * `points` form a closed polygon in order (do not repeat the first
   * point). `holes`, if given, cuts out independent closed polygons -
   * ground truth (an SDK-authored window-in-a-wall face) shows a hole is
   * just another CLoop, distinguished only by its first flag byte (0
   * instead of 1). */
  writeFace(points, vertexSlots, edgeRegistry, faceMaterial = 0, faceLayer = 0, backMaterial = 0, hidden = false, softEdges = false, smoothEdges = false, hiddenEdges = false, frontUv, backUv, attributeDicts = [], curveParams, holes = []) {
    const [nx, ny, nz, d] = planeFromPolygon(points);
    const frontMatrix = frontUv !== void 0 ? uvMatrixForFace(points, frontUv, [nx, ny, nz]) : void 0;
    const backMatrix = backUv !== void 0 ? uvMatrixForFace(points, backUv, [nx, ny, nz]) : void 0;
    for (const [, entries] of attributeDicts) this.validateAttributeEntries(entries);
    const span = Math.max(
      ...[0, 1, 2].map((i) => Math.max(...points.map((p) => p[i])) - Math.min(...points.map((p) => p[i])))
    );
    const tol = Math.max(span, 1) * 1e-6;
    for (const hole of holes) {
      if (hole.length < 3) throw new SkpWriteError("a hole needs at least 3 points");
      for (const p of hole) {
        const dist = nx * p[0] + ny * p[1] + nz * p[2] - d;
        if (Math.abs(dist) > tol) {
          throw new SkpWriteError(
            `hole point ${JSON.stringify(p)} is ${Math.abs(dist)} units off the face's own plane - a hole must lie on the same plane as the outer boundary`
          );
        }
      }
    }
    const [edgeSlots, edgeSenses, edgeNewEntities] = this.writeEdgeChain(
      points,
      vertexSlots,
      edgeRegistry,
      true,
      hiddenEdges,
      softEdges,
      smoothEdges,
      curveParams
    );
    let newEntities = edgeNewEntities;
    const holeLoops = [];
    for (const hole of holes) {
      const [hEdgeSlots, hEdgeSenses, hNew] = this.writeEdgeChain(
        hole,
        vertexSlots,
        edgeRegistry,
        true,
        hiddenEdges,
        softEdges,
        smoothEdges,
        void 0
      );
      holeLoops.push([hEdgeSlots, hEdgeSenses]);
      newEntities += hNew;
    }
    this.newOfKnownClass("CFace", 3);
    if (frontUv !== void 0 || backUv !== void 0 || attributeDicts.length > 0) {
      this.preambleWithRealAttrs(frontMatrix, backMatrix, attributeDicts);
    } else {
      this.preamble();
    }
    this.drawbase(faceMaterial, faceLayer, hidden);
    this.pushF64(nx);
    this.pushF64(ny);
    this.pushF64(nz);
    this.pushF64(-d);
    this.pushU32(1 + holes.length);
    const loopSlot = this.newOfKnownClass("CLoop", 1);
    this.preamble(0);
    this.pushBytes([1, 1]);
    for (let i = 0; i < edgeSlots.length; i++) {
      this.newOfKnownClass("CEdgeUse", 1);
      this.preamble(0);
      this.writeBackref(edgeSlots[i]);
      this.pushU8(edgeSenses[i]);
      this.writeBackref(loopSlot);
    }
    this.writeNull();
    for (const [hEdgeSlots, hEdgeSenses] of holeLoops) {
      const hLoopSlot = this.newOfKnownClass("CLoop", 1);
      this.preamble(0);
      this.pushBytes([0, 1]);
      for (let i = 0; i < hEdgeSlots.length; i++) {
        this.newOfKnownClass("CEdgeUse", 1);
        this.preamble(0);
        this.writeBackref(hEdgeSlots[i]);
        this.pushU8(hEdgeSenses[i]);
        this.writeBackref(hLoopSlot);
      }
      this.writeNull();
    }
    this.pushU16(backMaterial);
    newEntities += 1;
    return newEntities;
  }
};
function planeFromPolygon(points) {
  const n = points.length;
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < n; i++) {
    const [x0, y0, z0] = points[i];
    const [x1, y1, z1] = points[(i + 1) % n];
    nx += (y0 - y1) * (z0 + z1);
    ny += (z0 - z1) * (x0 + x1);
    nz += (x0 - x1) * (y0 + y1);
  }
  const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (length < 1e-9) throw new SkpWriteError("face points are collinear or degenerate; cannot compute a plane");
  nx /= length;
  ny /= length;
  nz /= length;
  const cx = points.reduce((s, p) => s + p[0], 0) / n;
  const cy = points.reduce((s, p) => s + p[1], 0) / n;
  const cz = points.reduce((s, p) => s + p[2], 0) / n;
  const d = nx * cx + ny * cy + nz * cz;
  const span = Math.max(
    ...[0, 1, 2].map((i) => Math.max(...points.map((p) => p[i])) - Math.min(...points.map((p) => p[i])))
  );
  const tol = Math.max(span, 1) * 1e-6;
  for (const p of points) {
    const dist = nx * p[0] + ny * p[1] + nz * p[2] - d;
    if (Math.abs(dist) > tol) {
      throw new SkpWriteError(
        `face points are not coplanar (point ${JSON.stringify(p)} is ${Math.abs(dist)} units off the fitted plane) - openskp only supports planar faces`
      );
    }
  }
  return [nx, ny, nz, d];
}
function isCoplanar(points) {
  const n = points.length;
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < n; i++) {
    const [x0, y0, z0] = points[i];
    const [x1, y1, z1] = points[(i + 1) % n];
    nx += (y0 - y1) * (z0 + z1);
    ny += (z0 - z1) * (x0 + x1);
    nz += (x0 - x1) * (y0 + y1);
  }
  const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (length < 1e-9) throw new SkpWriteError("face points are collinear or degenerate; cannot compute a plane");
  nx /= length;
  ny /= length;
  nz /= length;
  const cx = points.reduce((s, p) => s + p[0], 0) / n;
  const cy = points.reduce((s, p) => s + p[1], 0) / n;
  const cz = points.reduce((s, p) => s + p[2], 0) / n;
  const d = nx * cx + ny * cy + nz * cz;
  const span = Math.max(
    ...[0, 1, 2].map((i) => Math.max(...points.map((p) => p[i])) - Math.min(...points.map((p) => p[i])))
  );
  const tol = Math.max(span, 1) * 1e-6;
  return points.every((p) => Math.abs(nx * p[0] + ny * p[1] + nz * p[2] - d) <= tol);
}
function writeFaceOrTriangulate(args) {
  const { writer, points, vertexSlots, edgeRegistry, material, layer, backMaterial, hidden, softEdges, smoothEdges, hiddenEdges, frontUv, backUv, attributeDicts, autoTriangulate, holes } = args;
  if (holes.length > 0 || !autoTriangulate || points.length === 3 || isCoplanar(points)) {
    return writer.writeFace(
      points,
      vertexSlots,
      edgeRegistry,
      material,
      layer,
      backMaterial,
      hidden,
      softEdges,
      smoothEdges,
      hiddenEdges,
      frontUv,
      backUv,
      attributeDicts,
      void 0,
      holes
    );
  }
  if (frontUv !== void 0 || backUv !== void 0) {
    throw new SkpWriteError("autoTriangulate cannot be combined with frontUv/backUv positioning");
  }
  let total = 0;
  for (let i = 1; i < points.length - 1; i++) {
    total += writer.writeFace(
      [points[0], points[i], points[i + 1]],
      vertexSlots,
      edgeRegistry,
      material,
      layer,
      backMaterial,
      hidden,
      softEdges,
      smoothEdges,
      hiddenEdges,
      void 0,
      void 0,
      attributeDicts
    );
  }
  return total;
}
function toPoint3(p) {
  return [Number(p[0]), Number(p[1]), Number(p[2])];
}
function attributeDictsFrom(attributes, name) {
  return attributes ? [[name, attributes]] : [];
}
var ComponentDefinitionBuilder = class {
  /** @internal */
  constructor(skp, slot, name, countPatchPos, groupPlacement) {
    this.vertexSlots = /* @__PURE__ */ new Map();
    this.edgeRegistry = /* @__PURE__ */ new Map();
    this.newEntityCount = 0;
    this.closed = false;
    this._skp = skp;
    this.slot = slot;
    this.name = name;
    this.countPatchPos = countPatchPos;
    this.groupPlacement = groupPlacement;
  }
  checkWritable(action) {
    if (this.closed) {
      throw new SkpWriteError(
        `component definition ${JSON.stringify(this.name)} has already closed - cannot add more ${action} to it`
      );
    }
  }
  addFace(points, options = {}) {
    this.checkWritable("faces");
    this._skp._checkMaterialHandle(options.material, "material");
    this._skp._checkMaterialHandle(options.backMaterial, "backMaterial");
    this._skp._checkLayerHandle(options.layer);
    const pts = points.map(toPoint3);
    if (pts.length < 3) throw new SkpWriteError("a face needs at least 3 points");
    const holes = (options.holes ?? []).map((h) => h.map(toPoint3));
    const attributeDicts = attributeDictsFrom(options.attributes, options.attributeDictName ?? "attributes");
    this.newEntityCount += writeFaceOrTriangulate({
      writer: this._skp._definitionWriter(),
      points: pts,
      vertexSlots: this.vertexSlots,
      edgeRegistry: this.edgeRegistry,
      material: options.material ?? 0,
      layer: options.layer ?? 0,
      backMaterial: options.backMaterial ?? 0,
      hidden: options.hidden ?? false,
      softEdges: options.softEdges ?? false,
      smoothEdges: options.smoothEdges ?? false,
      hiddenEdges: options.hiddenEdges ?? false,
      frontUv: options.frontUv,
      backUv: options.backUv,
      attributeDicts,
      autoTriangulate: options.autoTriangulate ?? false,
      holes
    });
  }
  addCircle(center, normal, radius, options = {}) {
    this.checkWritable("faces");
    this._skp._checkMaterialHandle(options.material, "material");
    this._skp._checkMaterialHandle(options.backMaterial, "backMaterial");
    this._skp._checkLayerHandle(options.layer);
    const numSegments = options.numSegments ?? 24;
    if (!(numSegments >= 3 && numSegments <= 255)) {
      throw new SkpWriteError(`num_segments must be between 3 and 255, got ${numSegments}`);
    }
    const c = toPoint3(center);
    const n = normalize3(toPoint3(normal));
    const [u, w] = circleBasis(n);
    const xaxis = [radius * u[0], radius * u[1], radius * u[2]];
    const curveParams = { center: c, normal: n, xaxis, startAngle: 0, endAngle: 2 * Math.PI, radius, numSegments };
    const points = circlePoints(c, radius, numSegments, u, w);
    const attributeDicts = attributeDictsFrom(options.attributes, options.attributeDictName ?? "attributes");
    this.newEntityCount += this._skp._definitionWriter().writeFace(
      points,
      this.vertexSlots,
      this.edgeRegistry,
      options.material ?? 0,
      options.layer ?? 0,
      options.backMaterial ?? 0,
      options.hidden ?? false,
      false,
      false,
      false,
      options.frontUv,
      options.backUv,
      attributeDicts,
      curveParams
    );
  }
  addArc(center, normal, radius, startAngle, endAngle, options = {}) {
    this.checkWritable("arcs");
    const numSegments = options.numSegments ?? 24;
    if (!(numSegments >= 3 && numSegments <= 255)) {
      throw new SkpWriteError(`num_segments must be between 3 and 255, got ${numSegments}`);
    }
    if (endAngle === startAngle) {
      throw new SkpWriteError("start_angle and end_angle must differ - use addCircle for a full circle");
    }
    const c = toPoint3(center);
    const n = normalize3(toPoint3(normal));
    const [u, w] = circleBasis(n);
    const xaxis = [radius * u[0], radius * u[1], radius * u[2]];
    const curveParams = { center: c, normal: n, xaxis, startAngle, endAngle, radius, numSegments };
    const points = arcPoints(c, radius, numSegments, u, w, startAngle, endAngle);
    this.newEntityCount += this._skp._definitionWriter().writeArc(
      points,
      this.vertexSlots,
      this.edgeRegistry,
      curveParams,
      options.hiddenEdges ?? false,
      options.softEdges ?? false,
      options.smoothEdges ?? false
    );
  }
  addPolyline(points, options = {}) {
    this.checkWritable("polylines");
    const pts = points.map(toPoint3);
    if (pts.length < 2) throw new SkpWriteError("a polyline needs at least 2 points");
    this.newEntityCount += this._skp._definitionWriter().writePolyline(
      pts,
      this.vertexSlots,
      this.edgeRegistry,
      options.closed ?? false,
      options.hiddenEdges ?? false,
      options.softEdges ?? false,
      options.smoothEdges ?? false
    );
  }
  /** Place one instance of another, already-closed component definition
   * inside this one - the same nesting real SketchUp supports.
   * `definition` must come from this same builder, and be a different,
   * already-closed definition (never `this`). */
  addInstance(definition, options = {}) {
    this.checkWritable("instances");
    this._skp._checkMaterialHandle(options.material, "material");
    this._skp._checkLayerHandle(options.layer);
    if (definition._skp !== this._skp) {
      throw new SkpWriteError(
        `component definition ${JSON.stringify(definition.name)} belongs to a different builder (a different create() call) - its slot number is meaningless here`
      );
    }
    if (definition === this) {
      throw new SkpWriteError(`component definition ${JSON.stringify(this.name)} cannot nest an instance of itself`);
    }
    const matrix3x3 = resolveMatrix3x3(options.matrix3x3, options.rotation);
    const attributeDicts = attributeDictsFrom(options.attributes, options.attributeDictName ?? "attributes");
    this.newEntityCount += this._skp._definitionWriter().writeInstance(
      definition.slot,
      options.name ?? definition.name,
      options.translation ?? [0, 0, 0],
      matrix3x3,
      options.material ?? 0,
      options.layer ?? 0,
      attributeDicts,
      options.hidden ?? false
    );
  }
  /** Place another, already-closed component definition inside this one
   * as a *group* rather than a component instance. A nested group can't
   * be declared inline - build the group's geometry with a normal
   * `addComponentDefinition` first, then place it here. */
  addGroupInstance(definition, options = {}) {
    this.checkWritable("groups");
    this._skp._checkMaterialHandle(options.material, "material");
    this._skp._checkLayerHandle(options.layer);
    if (definition._skp !== this._skp) {
      throw new SkpWriteError(
        `component definition ${JSON.stringify(definition.name)} belongs to a different builder (a different create() call) - its slot number is meaningless here`
      );
    }
    if (definition === this) {
      throw new SkpWriteError(`component definition ${JSON.stringify(this.name)} cannot nest a group instance of itself`);
    }
    const matrix3x3 = resolveMatrix3x3(options.matrix3x3, options.rotation);
    const attributeDicts = attributeDictsFrom(options.attributes, options.attributeDictName ?? "attributes");
    this.newEntityCount += this._skp._definitionWriter().writeGroup(
      definition.slot,
      options.name ?? definition.name,
      options.translation ?? [0, 0, 0],
      matrix3x3,
      options.material ?? 0,
      options.layer ?? 0,
      attributeDicts,
      options.hidden ?? false
    );
    if (definition.groupFlagPos !== void 0) this._skp._patchDefinitionCount(definition.groupFlagPos, 1);
  }
  /** @internal called automatically once the defining callback (passed
   * to addComponentDefinition/addGroup) returns. */
  _close() {
    if (this.newEntityCount === 0) {
      throw new SkpWriteError(`component definition ${JSON.stringify(this.name)} has no geometry - add at least one face`);
    }
    const writer = this._skp._definitionWriter();
    this._skp._patchDefinitionCount(this.countPatchPos, this.newEntityCount);
    this.groupFlagPos = writer.writeDefinitionTail(this.name, this.groupPlacement !== void 0);
    this.closed = true;
    this._skp._clearOpenDefinition();
    if (this.groupPlacement !== void 0) {
      this._skp._pushPendingGroup(this, this.groupPlacement);
    }
  }
};
var SkpBuilder = class {
  constructor() {
    this.materialInsertPos = MATERIAL_INSERT_POS;
    this.base = BASE;
    this.layerCountPos = LAYER_COUNT_POS;
    this.origLayerCount = ORIG_LAYER_COUNT;
    this.layerInsertPos = LAYER_INSERT_POS;
    this.defCountPos = DEF_COUNT_POS;
    this.origDefCount = ORIG_DEF_COUNT;
    this.rootCountPos = ROOT_COUNT_POS;
    this.origRootCount = ORIG_ROOT_COUNT;
    this.tailPos = TAIL_POS;
    this.scaffoldNextSlot = SCAFFOLD_NEXT_SLOT;
    this.scaffoldClassSlot = { ...SCAFFOLD_CLASS_SLOT };
    /** Every material registered so far, by name - populated by
     * addMaterial/addTextureMaterial as a side effect. */
    this.materialsByName = /* @__PURE__ */ new Map();
    this.materialCount = 0;
    this.layerWriterBase = LAYER_WRITER_BASE;
    this.layerWriter = null;
    this.layerWriterStart = null;
    /** Every layer registered so far, by name - populated by addLayer. */
    this.layersByName = /* @__PURE__ */ new Map();
    this.layerCount = 0;
    this.definitionWriterInstance = null;
    this.definitionWriterStart = null;
    this.definitionCount = 0;
    this.openDefinition = null;
    this.pendingGroups = [];
    this.geometryWriter = null;
    this.vertexSlots = /* @__PURE__ */ new Map();
    this.edgeRegistry = /* @__PURE__ */ new Map();
    this.newEntityCount = 0;
    this.faceCount = 0;
    this.data = loadScaffold();
    this.materialWriter = new ArchiveWriter(this.base, {});
  }
  addMaterial(name, rgba, opacity) {
    if (this.geometryWriter !== null) throw new SkpWriteError("addMaterial must be called before any addFace calls");
    if (this.layerWriter !== null) throw new SkpWriteError("addMaterial must be called before any addLayer calls");
    if (this.definitionWriterInstance !== null) {
      throw new SkpWriteError("addMaterial must be called before any addComponentDefinition calls");
    }
    if (this.materialsByName.has(name)) return this.materialsByName.get(name);
    let full = rgba;
    if (full.length === 3) full = [...full, 255];
    if (full.length !== 4 || !full.every((c) => Number.isInteger(c) && c >= 0 && c <= 255)) {
      throw new SkpWriteError("rgba must be 3 or 4 integers in 0-255");
    }
    const slot = this.materialWriter.writeMaterial(name, full, opacity);
    this.materialsByName.set(name, slot);
    this.materialCount += 1;
    return slot;
  }
  /** Register an image-textured material and return a handle to pass as
   * addFace's `material` option. Unlike Python's `add_texture_material`
   * (which reads a file path), this takes the image bytes directly - a
   * deliberate adaptation since this package targets the browser as well
   * as Node, where there's no universal way to read an arbitrary file
   * path. `texturePath`, if given, is stored as-is in the material
   * record (SketchUp shows it as the texture's original file path); it
   * has no effect on the embedded image bytes themselves.
   *
   * `appliedHeight`/`appliedWidth`, if given, are the applied size in
   * INCHES - how much model space one tile of the image covers. Both
   * default to 1.0. A texture applied without positioning carries no
   * per-face UV record, so this pair IS its mapping - and see
   * writeTexturedMaterial's own comment for why it matters even for
   * addFace's `frontUv`/`backUv` pinning (a positioned mapping still
   * divides by it). `appliedWidth` and `opacity` sit after `appliedHeight`
   * (not alongside it) so an existing positional call passing
   * `appliedHeight` as the 4th argument keeps meaning what it always
   * meant. */
  addTextureMaterial(name, imageBytes, texturePath = "", appliedHeight, appliedWidth, opacity) {
    if (this.geometryWriter !== null) {
      throw new SkpWriteError("addTextureMaterial must be called before any addFace calls");
    }
    if (this.layerWriter !== null) {
      throw new SkpWriteError("addTextureMaterial must be called before any addLayer calls");
    }
    if (this.definitionWriterInstance !== null) {
      throw new SkpWriteError("addTextureMaterial must be called before any addComponentDefinition calls");
    }
    if (this.materialsByName.has(name)) return this.materialsByName.get(name);
    const subtype = detectImageSubtype(imageBytes);
    const slot = this.materialWriter.writeTexturedMaterial(
      name,
      imageBytes,
      texturePath,
      subtype,
      appliedHeight,
      appliedWidth,
      opacity
    );
    this.materialsByName.set(name, slot);
    this.materialCount += 1;
    return slot;
  }
  addLayer(name, options = {}) {
    if (this.geometryWriter !== null) throw new SkpWriteError("addLayer must be called before any addFace calls");
    if (this.definitionWriterInstance !== null) {
      throw new SkpWriteError("addLayer must be called before any addComponentDefinition calls");
    }
    if (this.layersByName.has(name)) return this.layersByName.get(name);
    let rgba;
    if (options.color !== void 0) {
      let c = options.color;
      if (c.length === 3) c = [...c, 255];
      if (c.length !== 4 || !c.every((v) => Number.isInteger(v) && v >= 0 && v <= 255)) {
        throw new SkpWriteError("color must be 3 or 4 integers in 0-255");
      }
      rgba = c;
    }
    if (this.layerWriter === null) {
      const materialShift = this.materialWriter.nextSlot - this.base;
      this.layerWriterStart = this.layerWriterBase + materialShift;
      this.layerWriter = new ArchiveWriter(this.layerWriterStart, this.materialShiftedClassSlot());
    }
    const slot = this.layerWriter.writeLayer(name, true, options.hidden ?? false, rgba);
    this.layersByName.set(name, slot);
    this.layerCount += 1;
    return slot;
  }
  /** @internal Reject a material/backMaterial option that isn't a handle
   * this builder's own addMaterial()/addTextureMaterial() actually
   * returned. Without this, a stray value - most commonly a layer handle
   * passed to the wrong option by mistake - gets written straight into
   * the file as a material reference: this project's own reader tolerates
   * the dangling reference silently, but real SketchUp rejects the whole
   * file as corrupt on open, with no indication of which call caused it. */
  _checkMaterialHandle(value, param) {
    if (value && ![...this.materialsByName.values()].includes(value)) {
      throw new SkpWriteError(
        `${param}=${value} is not a handle this builder's addMaterial()/addTextureMaterial() returned - passing an unrelated value (e.g. a layer handle by mistake) would silently write an invalid material reference that real SketchUp rejects on open`
      );
    }
  }
  /** @internal Reject a layer option that isn't a handle this builder's
   * own addLayer() actually returned - see `_checkMaterialHandle` for why
   * this matters. */
  _checkLayerHandle(value, param = "layer") {
    if (value && ![...this.layersByName.values()].includes(value)) {
      throw new SkpWriteError(
        `${param}=${value} is not a handle this builder's addLayer() returned - passing an unrelated value (e.g. a material handle by mistake) would silently write an invalid layer reference that real SketchUp rejects on open`
      );
    }
  }
  materialShiftedClassSlot() {
    const materialShift = this.materialWriter.nextSlot - this.base;
    const out = {};
    for (const [n, s] of Object.entries(this.scaffoldClassSlot)) out[n] = s + materialShift;
    return out;
  }
  layerShift() {
    if (this.layerWriter === null) return 0;
    return this.layerWriter.nextSlot - this.layerWriterStart;
  }
  postLayerClassSlot() {
    if (this.layerWriter !== null) return { ...this.layerWriter.classSlot };
    return this.materialShiftedClassSlot();
  }
  startDefinition(name, caller, groupPlacement, attributeDicts = []) {
    if (this.geometryWriter !== null) {
      throw new SkpWriteError(`${caller} must be called before any addFace/addInstance calls`);
    }
    if (this.openDefinition !== null) {
      throw new SkpWriteError(
        `component definition ${JSON.stringify(this.openDefinition.name)} is still open - close it before starting another`
      );
    }
    if (this.definitionWriterInstance === null) {
      this.definitionWriterStart = this.scaffoldNextSlot + (this.materialWriter.nextSlot - this.base) + this.layerShift();
      this.definitionWriterInstance = new ArchiveWriter(this.definitionWriterStart, this.postLayerClassSlot());
    }
    const [slot, countPatchPos] = this.definitionWriterInstance.writeDefinitionHeader(attributeDicts);
    this.definitionCount += 1;
    const comp = new ComponentDefinitionBuilder(this, slot, name, countPatchPos, groupPlacement);
    this.openDefinition = comp;
    return comp;
  }
  /** Start a new reusable component definition. `build` runs
   * synchronously; add geometry to the definition inside it (via
   * `.addFace` etc.) - the returned, already-closed builder can then be
   * passed to `addInstance` to place copies of it in the model.
   *
   * ```ts
   * const chair = builder.addComponentDefinition('Chair', (def) => {
   *   def.addFace([[0, 0, 0], [20, 0, 0], [20, 20, 0], [0, 20, 0]]);
   * });
   * builder.addInstance(chair, { translation: [100, 0, 0] });
   * ```
   *
   * Must be called before any addFace/addInstance call on the builder
   * itself - component definitions splice in after materials and
   * layers, before root-level geometry. */
  addComponentDefinition(name, build, options = {}) {
    const attributeDicts = attributeDictsFrom(options.attributes, options.attributeDictName ?? "attributes");
    const def = this.startDefinition(name, "addComponentDefinition", void 0, attributeDicts);
    build(def);
    def._close();
    return def;
  }
  /** Start a new group. `build` runs synchronously; add geometry inside
   * it - the group is placed at `translation`/`matrix3x3` automatically
   * once `build` returns, unlike `addComponentDefinition` there is no
   * separate placement call.
   *
   * ```ts
   * builder.addGroup((table) => {
   *   table.addFace([[0, 0, 0], [30, 0, 0], [30, 30, 0], [0, 30, 0]]);
   * }, { name: 'Table', translation: [50, 0, 0] });
   * ``` */
  addGroup(build, options = {}) {
    this._checkMaterialHandle(options.material, "material");
    this._checkLayerHandle(options.layer);
    const matrix3x3 = resolveMatrix3x3(options.matrix3x3, options.rotation);
    const attributeDicts = attributeDictsFrom(options.attributes, options.attributeDictName ?? "attributes");
    const placement = [
      options.translation ?? [0, 0, 0],
      matrix3x3,
      options.material ?? 0,
      options.layer ?? 0,
      attributeDicts,
      options.hidden ?? false
    ];
    const def = this.startDefinition(options.name ?? "Group", "addGroup", placement);
    build(def);
    def._close();
    return def;
  }
  definitionShift() {
    if (this.definitionWriterInstance === null) return 0;
    return this.definitionWriterInstance.nextSlot - this.definitionWriterStart;
  }
  postDefinitionClassSlot() {
    if (this.definitionWriterInstance !== null) return { ...this.definitionWriterInstance.classSlot };
    return this.postLayerClassSlot();
  }
  /** Place one instance of `definition` (from addComponentDefinition,
   * already closed) in the model. `rotation`, if given, is an
   * alternative to `matrix3x3` for the common case of a pure rotation. */
  addInstance(definition, options = {}) {
    this._checkMaterialHandle(options.material, "material");
    this._checkLayerHandle(options.layer);
    if (definition._skp !== this) {
      throw new SkpWriteError(
        `component definition ${JSON.stringify(definition.name)} belongs to a different builder (a different create() call) - its slot number is meaningless here`
      );
    }
    const matrix3x3 = resolveMatrix3x3(options.matrix3x3, options.rotation);
    this.ensureGeometryWriter();
    const attributeDicts = attributeDictsFrom(options.attributes, options.attributeDictName ?? "attributes");
    this.newEntityCount += this.geometryWriter.writeInstance(
      definition.slot,
      options.name ?? definition.name,
      options.translation ?? [0, 0, 0],
      matrix3x3,
      options.material ?? 0,
      options.layer ?? 0,
      attributeDicts,
      options.hidden ?? false
    );
    this.faceCount += 1;
  }
  /** Place a SketchUp Image entity (File > Import > Image) - a picture
   * placed as its own object, distinct from painting a texture material
   * onto an ordinary face (an Image gets its own Outliner classification
   * and explode behavior a plain textured face doesn't).
   *
   * `width`/`height` size the image's quad in inches; the image covers it
   * edge to edge, undistorted regardless of the source file's own pixel
   * aspect ratio (get the ratio right yourself if that matters). Unlike
   * `addTextureMaterial`, this takes the image bytes directly (browser
   * compatibility - see addTextureMaterial's own note).
   *
   * ```ts
   * builder.addImage(photoBytes, 48, 36, {
   *   translation: [0, 0, 40],
   *   rotation: { axis: [1, 0, 0], angleRadians: Math.PI / 2 },
   * });
   * ```
   *
   * Must be called before any addLayer/addComponentDefinition/addGroup/
   * addFace/addInstance call - like addTextureMaterial (which this calls
   * internally to register the image itself), it needs a material, and
   * this writer's file format requires every material to be registered
   * before any geometry section begins.
   *
   * The image's quad and UV mapping are pinned explicitly (addFace's
   * `frontUv`), not left to the default per-material tile-size projection
   * - the read-side UV formula divides by the material's applied height
   * even for a pinned mapping, and addTextureMaterial's default height
   * (1.0) makes that division a no-op against this method's own 0..1
   * pins.
   *
   * ⚠️ Unlike every other entity this writer produces, CImage's exact
   * binary schema version (see IMAGE_SCHEMA) is a best-effort guess, not
   * calibrated against a real SketchUp-authored Image entity - none was
   * available. This project's own reader round-trips the result
   * correctly, but real SketchUp's acceptance of the file is unverified
   * beyond the Python port's own real-SketchUp test (placement/
   * orientation/texture all confirmed correct there - see CHECKLIST.md). */
  addImage(imageBytes, width, height, options = {}) {
    this._checkLayerHandle(options.layer);
    const mat = this.addTextureMaterial(`__openskp_image_${this.materialCount}`, imageBytes, options.texturePath ?? "");
    const imageDef = this.addComponentDefinition(`Image${this.definitionCount}`, (def) => {
      def.addFace(
        [[0, 0, 0], [width, 0, 0], [width, height, 0], [0, height, 0]],
        {
          material: mat,
          frontUv: [
            [[0, 0, 0], [0, 0]],
            [[width, 0, 0], [1, 0]],
            [[0, height, 0], [0, 1]]
          ]
        }
      );
    });
    const matrix3x3 = resolveMatrix3x3(options.matrix3x3, options.rotation);
    this.ensureGeometryWriter();
    this.newEntityCount += this.geometryWriter.writeImage(
      imageDef.slot,
      options.translation ?? [0, 0, 0],
      matrix3x3,
      options.layer ?? 0,
      options.hidden ?? false
    );
    this.faceCount += 1;
  }
  ensureGeometryWriter() {
    if (this.geometryWriter !== null) return;
    if (this.openDefinition !== null) {
      throw new SkpWriteError(
        `component definition ${JSON.stringify(this.openDefinition.name)} is still open - close it before adding root-level geometry`
      );
    }
    const materialShift = this.materialWriter.nextSlot - this.base;
    this.geometryWriter = new ArchiveWriter(
      this.scaffoldNextSlot + materialShift + this.layerShift() + this.definitionShift(),
      this.postDefinitionClassSlot()
    );
    for (const [comp, [translation, matrix3x3, mat, layer, attributeDicts, hidden]] of this.pendingGroups) {
      this.newEntityCount += this.geometryWriter.writeGroup(comp.slot, comp.name, translation, matrix3x3, mat, layer, attributeDicts, hidden);
      this.faceCount += 1;
    }
    this.pendingGroups = [];
  }
  /** Add one planar face, defined by 3+ coplanar points (inches) forming
   * a closed polygon in order - do not repeat the first point. Vertices
   * and edges are automatically shared with previously-added faces
   * wherever a point's coordinates match exactly. */
  addFace(points, options = {}) {
    this._checkMaterialHandle(options.material, "material");
    this._checkMaterialHandle(options.backMaterial, "backMaterial");
    this._checkLayerHandle(options.layer);
    const pts = points.map(toPoint3);
    if (pts.length < 3) throw new SkpWriteError("a face needs at least 3 points");
    const holes = (options.holes ?? []).map((h) => h.map(toPoint3));
    this.ensureGeometryWriter();
    const attributeDicts = attributeDictsFrom(options.attributes, options.attributeDictName ?? "attributes");
    this.newEntityCount += writeFaceOrTriangulate({
      writer: this.geometryWriter,
      points: pts,
      vertexSlots: this.vertexSlots,
      edgeRegistry: this.edgeRegistry,
      material: options.material ?? 0,
      layer: options.layer ?? 0,
      backMaterial: options.backMaterial ?? 0,
      hidden: options.hidden ?? false,
      softEdges: options.softEdges ?? false,
      smoothEdges: options.smoothEdges ?? false,
      hiddenEdges: options.hiddenEdges ?? false,
      frontUv: options.frontUv,
      backUv: options.backUv,
      attributeDicts,
      autoTriangulate: options.autoTriangulate ?? false,
      holes
    });
    this.faceCount += 1;
  }
  /** Add one circular face - a true SketchUp circle (editable by radius,
   * re-tessellatable), not `numSegments` disconnected straight edges. */
  addCircle(center, normal, radius, options = {}) {
    this._checkMaterialHandle(options.material, "material");
    this._checkMaterialHandle(options.backMaterial, "backMaterial");
    this._checkLayerHandle(options.layer);
    const numSegments = options.numSegments ?? 24;
    if (!(numSegments >= 3 && numSegments <= 255)) {
      throw new SkpWriteError(`num_segments must be between 3 and 255, got ${numSegments}`);
    }
    const c = toPoint3(center);
    const n = normalize3(toPoint3(normal));
    this.ensureGeometryWriter();
    const [u, w] = circleBasis(n);
    const xaxis = [radius * u[0], radius * u[1], radius * u[2]];
    const curveParams = { center: c, normal: n, xaxis, startAngle: 0, endAngle: 2 * Math.PI, radius, numSegments };
    const points = circlePoints(c, radius, numSegments, u, w);
    const attributeDicts = attributeDictsFrom(options.attributes, options.attributeDictName ?? "attributes");
    this.newEntityCount += this.geometryWriter.writeFace(
      points,
      this.vertexSlots,
      this.edgeRegistry,
      options.material ?? 0,
      options.layer ?? 0,
      options.backMaterial ?? 0,
      options.hidden ?? false,
      false,
      false,
      false,
      options.frontUv,
      options.backUv,
      attributeDicts,
      curveParams
    );
    this.faceCount += 1;
  }
  /** Add one partial (open) arc - a genuine SketchUp arc entity, edges
   * only, no face. `startAngle`/`endAngle` (radians) measure the sweep
   * from an arbitrary but fixed reference direction in the arc's plane. */
  addArc(center, normal, radius, startAngle, endAngle, options = {}) {
    const numSegments = options.numSegments ?? 24;
    if (!(numSegments >= 3 && numSegments <= 255)) {
      throw new SkpWriteError(`num_segments must be between 3 and 255, got ${numSegments}`);
    }
    if (endAngle === startAngle) {
      throw new SkpWriteError("start_angle and end_angle must differ - use addCircle for a full circle");
    }
    const c = toPoint3(center);
    const n = normalize3(toPoint3(normal));
    this.ensureGeometryWriter();
    const [u, w] = circleBasis(n);
    const xaxis = [radius * u[0], radius * u[1], radius * u[2]];
    const curveParams = { center: c, normal: n, xaxis, startAngle, endAngle, radius, numSegments };
    const points = arcPoints(c, radius, numSegments, u, w, startAngle, endAngle);
    this.newEntityCount += this.geometryWriter.writeArc(
      points,
      this.vertexSlots,
      this.edgeRegistry,
      curveParams,
      options.hiddenEdges ?? false,
      options.softEdges ?? false,
      options.smoothEdges ?? false
    );
    this.faceCount += 1;
  }
  /** Add one freeform polyline curve - a chain of straight edges grouped
   * into one genuine SketchUp "Curve" entity, no face. */
  addPolyline(points, options = {}) {
    const pts = points.map(toPoint3);
    if (pts.length < 2) throw new SkpWriteError("a polyline needs at least 2 points");
    this.ensureGeometryWriter();
    this.newEntityCount += this.geometryWriter.writePolyline(
      pts,
      this.vertexSlots,
      this.edgeRegistry,
      options.closed ?? false,
      options.hiddenEdges ?? false,
      options.softEdges ?? false,
      options.smoothEdges ?? false
    );
    this.faceCount += 1;
  }
  /** Add a FREE linear dimension between two explicit points (inches,
   * world space). `offset` is the dimension line's offset from the
   * measured segment, in inches (signed). See ArchiveWriter.writeDimension
   * for the record's ground truth. */
  addDimension(p1, p2, offset = 10) {
    this.ensureGeometryWriter();
    this.geometryWriter.writeDimension(toPoint3(p1), toPoint3(p2), offset);
    this.newEntityCount += 1;
    this.faceCount += 1;
  }
  /** Add a leader text (SketchUp's Text tool) anchored at `point` (inches,
   * world space), with the label floating at `point + leader` and a
   * leader line joining them. See ArchiveWriter.writeText for the
   * record's ground truth. */
  addText(text, point, leader = [15, 15, 15]) {
    this.ensureGeometryWriter();
    this.geometryWriter.writeText(text, toPoint3(point), toPoint3(leader));
    this.newEntityCount += 1;
    this.faceCount += 1;
  }
  /** Add a construction/guide line (SketchUp's Construction Line tool).
   * Pass exactly one of `point2` (a bounded segment between `point` and
   * `point2`, matching `Entities#add_cline(p1, p2)`) or `direction` (an
   * unbounded guide line through `point`, matching
   * `Entities#add_cline(point, vector)`). See
   * ArchiveWriter.writeConstructionLine for the record's ground truth. */
  addConstructionLine(point, options = {}) {
    this.ensureGeometryWriter();
    this.geometryWriter.writeConstructionLine(
      toPoint3(point),
      options.point2 !== void 0 ? toPoint3(options.point2) : void 0,
      options.direction !== void 0 ? toPoint3(options.direction) : void 0
    );
    this.newEntityCount += 1;
    this.faceCount += 1;
  }
  /** Add a construction/guide point (SketchUp's Construction Point tool)
   * at `position` (inches, world space). See
   * ArchiveWriter.writeConstructionPoint for the record's ground truth. */
  addConstructionPoint(position) {
    this.ensureGeometryWriter();
    this.geometryWriter.writeConstructionPoint(toPoint3(position));
    this.newEntityCount += 1;
    this.faceCount += 1;
  }
  /** Add a section plane (SketchUp's Section Plane tool) through `point`
   * with the given `normal` (need not be unit length), matching
   * `Entities#add_section_plane([point, normal])`. See
   * ArchiveWriter.writeSectionPlane for the record's ground truth. */
  addSectionPlane(point, normal) {
    this.ensureGeometryWriter();
    this.geometryWriter.writeSectionPlane(toPoint3(point), toPoint3(normal));
    this.newEntityCount += 1;
    this.faceCount += 1;
  }
  /** Return the finished file's bytes. */
  toBytes() {
    if (this.pendingGroups.length > 0) {
      this.ensureGeometryWriter();
    }
    if (this.faceCount === 0) throw new SkpWriteError("no geometry added - call addFace at least once before saving");
    const materialShift = this.materialWriter.nextSlot - this.base;
    const layerShift = this.layerShift();
    const definitionShift = this.definitionShift();
    const geometryInitialSlot = this.scaffoldNextSlot + materialShift + layerShift + definitionShift;
    const geometryShift = this.geometryWriter.nextSlot - geometryInitialSlot;
    const newRootCount = this.origRootCount + this.newEntityCount;
    const parts = [];
    const out = {
      push: (part) => {
        parts.push(part instanceof Uint8Array ? part : Uint8Array.from(part));
      }
    };
    const layerPids = this.layerWriter ? this.layerWriter.nextPid - 1 : 0;
    const pidDelta = this.materialCount + layerPids;
    const prefix = Array.from(this.data.subarray(0, this.materialInsertPos - 4));
    if (pidDelta) {
      const u16 = readU16(prefix, PID_COUNTER_POS);
      writeU16At(prefix, PID_COUNTER_POS, u16 + pidDelta);
    }
    for (let i = 0; i < ISO_CAMERA_PREFIX_PATCH.length; i++) {
      prefix[ISO_CAMERA_PREFIX_OFFSET + i] = ISO_CAMERA_PREFIX_PATCH[i];
    }
    out.push(prefix);
    out.push(u32Bytes(this.materialCount));
    out.push(this.materialWriter.bytes.view());
    const middle1 = Array.from(this.data.subarray(this.materialInsertPos, this.layerInsertPos));
    const layerCountRel = this.layerCountPos - this.materialInsertPos;
    writeU32At(middle1, layerCountRel, this.origLayerCount + this.layerCount);
    out.push(middle1);
    if (this.layerWriter !== null) out.push(this.layerWriter.bytes.view());
    const middle2a = Array.from(this.data.subarray(this.layerInsertPos, this.defCountPos));
    if (materialShift) shiftRef(middle2a, ACTIVE_LAYER_ANCHOR_REL, materialShift);
    out.push(middle2a);
    out.push(u32Bytes(this.origDefCount + this.definitionCount));
    if (this.definitionWriterInstance !== null) out.push(this.definitionWriterInstance.bytes.view());
    out.push(this.data.subarray(this.defCountPos + 4, this.rootCountPos));
    out.push(u32Bytes(newRootCount));
    out.push(this.data.subarray(this.rootCountPos + 4, this.tailPos));
    out.push(this.geometryWriter.bytes.view());
    const tail = Array.from(this.data.subarray(this.tailPos));
    const totalTailShift = materialShift + layerShift + definitionShift + geometryShift;
    const isoPatches = new Map(ISO_CAMERA_TAIL_PATCHES);
    const actions = [
      ...TAIL_REF_POSITIONS.map((pos) => [pos, "ref"]),
      ...Array.from(isoPatches.keys()).map((pos) => [pos, "patch"])
    ].sort((a, b) => a[0] - b[0]);
    let growth = 0;
    for (const [pos, kind] of actions) {
      const here = pos + growth;
      if (kind === "ref") {
        growth += shiftRef(tail, here, totalTailShift);
      } else {
        const patch = isoPatches.get(pos);
        for (let i = 0; i < patch.length; i++) tail[here + i] = patch[i];
      }
    }
    out.push(tail);
    let total = 0;
    for (const part of parts) total += part.length;
    const result = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.length;
    }
    return result;
  }
  /** Write the finished file to `path` (Node.js only). */
  save(path) {
    if (typeof process === "undefined" || !process.versions || !process.versions.node) {
      throw new Error("SkpBuilder.save is only supported in Node.js environments - use toBytes() elsewhere");
    }
    const fs = require("fs");
    fs.writeFileSync(path, Buffer.from(this.toBytes()));
  }
  // -- internals used by ComponentDefinitionBuilder --
  /** @internal */
  _definitionWriter() {
    return this.definitionWriterInstance;
  }
  /** @internal */
  _patchDefinitionCount(countPatchPos, count) {
    const writer = this.definitionWriterInstance;
    writeU32At(writer.bytes.buf, countPatchPos, count);
  }
  /** @internal */
  _clearOpenDefinition() {
    this.openDefinition = null;
  }
  /** @internal */
  _pushPendingGroup(comp, placement) {
    this.pendingGroups.push([comp, placement]);
  }
};
function create() {
  return new SkpBuilder();
}

// src/edit.ts
function readFileToArrayBuffer(path) {
  if (typeof process === "undefined" || !process.versions || !process.versions.node) {
    throw new SkpWriteError(
      "a file-path source for openExisting is only supported in Node.js environments - pass an ArrayBuffer instead"
    );
  }
  const fs = require("fs");
  const buffer = fs.readFileSync(path);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}
function openExisting(source) {
  const buffer = typeof source === "string" ? readFileToArrayBuffer(source) : source;
  const head = new Uint8Array(buffer, 0, Math.min(512, buffer.byteLength));
  if (!isLegacy(head)) {
    throw new SkpWriteError(
      `${typeof source === "string" ? JSON.stringify(source) : "the given buffer"} is not a legacy-format (SketchUp 2013-2020) .skp file - create.ts only ever writes that format, so only a legacy-format source file can be rebuilt through it (see edit.ts's own module docstring for why an arbitrary existing file cannot simply be patched)`
    );
  }
  const model = parseSkp(buffer);
  const warnings = [];
  const builder = create();
  const materialSlots = replayMaterials(builder, model, warnings);
  const layerSlots = /* @__PURE__ */ new Map();
  for (const layer of model.layers) {
    layerSlots.set(layer.name, builder.addLayer(layer.name, { color: [layer.color.r, layer.color.g, layer.color.b], hidden: layer.hidden }));
  }
  const defBuilders = /* @__PURE__ */ new Map();
  for (const defId of definitionOrder(model)) {
    const defn = model.definitions.get(defId);
    const context = `definition ${JSON.stringify(defn.name || String(defId))}`;
    if (!definitionHasContent(defn, defBuilders)) {
      warnings.push(`${context}: skipped (no replayable geometry)`);
      continue;
    }
    const db = builder.addComponentDefinition(defn.name, (d) => {
      replayBody(d, defn, model, materialSlots, layerSlots, warnings, context, defBuilders);
    });
    defBuilders.set(defId, db);
  }
  replayBody(builder, model.root, model, materialSlots, layerSlots, warnings, "root", defBuilders);
  const definitionsByName = /* @__PURE__ */ new Map();
  for (const [defId, db] of defBuilders.entries()) {
    const name = model.definitions.get(defId).name;
    if (name) definitionsByName.set(name, db);
  }
  return { builder, warnings, definitions: definitionsByName };
}
function replayMaterials(builder, model, warnings) {
  const slots = /* @__PURE__ */ new Map();
  for (const mat of model.materials) {
    let slot;
    if (mat.texture !== null && mat.texture.data !== null) {
      slot = builder.addTextureMaterial(mat.name, mat.texture.data, mat.texture.filename || "texture", 1);
      if (mat.colorized) {
        warnings.push(`material ${JSON.stringify(mat.name)}: colorized tint not reproduced (base texture only)`);
      }
    } else {
      if (mat.texture !== null) {
        warnings.push(`material ${JSON.stringify(mat.name)}: texture image data missing - replayed as solid color`);
      }
      slot = builder.addMaterial(mat.name, [mat.color.r, mat.color.g, mat.color.b, mat.color.a]);
    }
    slots.set(mat, slot);
  }
  return slots;
}
function materialSlot(materialId, model, slots) {
  if (materialId === null) return void 0;
  const mat = model.materialsById.get(materialId);
  if (!mat) return void 0;
  return slots.get(mat);
}
function definitionOrder(model) {
  const visited = /* @__PURE__ */ new Set();
  const temp = /* @__PURE__ */ new Set();
  const order = [];
  function visit(defId) {
    if (visited.has(defId)) return;
    if (temp.has(defId)) {
      throw new SkpWriteError(`circular component-definition reference involving definition ${defId}`);
    }
    temp.add(defId);
    const defn = model.definitions.get(defId);
    if (defn) {
      for (const inst of defn.instances) {
        if (model.definitions.has(inst.refIdx)) visit(inst.refIdx);
      }
    }
    temp.delete(defId);
    visited.add(defId);
    order.push(defId);
  }
  for (const defId of model.definitions.keys()) visit(defId);
  return order;
}
function edgeMap(defn) {
  const m = /* @__PURE__ */ new Map();
  for (const e of defn.edges) m.set(e.id, [e.v1Id, e.v2Id]);
  return m;
}
function edgeById(defn) {
  const m = /* @__PURE__ */ new Map();
  for (const e of defn.edges) m.set(e.id, e);
  return m;
}
function definitionHasContent(defn, defBuilders) {
  const edges = edgeMap(defn);
  for (const face of defn.faces) {
    if (face.loops.length === 0) continue;
    if (reconstructLoopVertices(face.loops[0], edges).length >= 3) return true;
  }
  for (const inst of defn.instances) {
    if (defBuilders.has(inst.refIdx)) return true;
  }
  return false;
}
function replayBody(target, defn, model, materialSlots, layerSlots, warnings, context, defBuilders) {
  const edges = edgeMap(defn);
  const edgesById = edgeById(defn);
  const vertexById = new Map(defn.vertices.map((v) => [v.id, [v.x, v.y, v.z]]));
  for (const face of defn.faces) {
    replayFace(target, face, edges, edgesById, vertexById, model, materialSlots, warnings, context);
  }
  for (const inst of defn.instances) {
    replayInstance(target, inst, defBuilders, materialSlots, layerSlots, model, warnings, context);
  }
}
function replayFace(target, face, edges, edgesById, vertexById, model, materialSlots, warnings, context) {
  if (face.loops.length < 1) {
    warnings.push(`${context}: face ${face.id} has no loops - skipped`);
    return;
  }
  const vertIds = reconstructLoopVertices(face.loops[0], edges);
  if (vertIds.length < 3) {
    warnings.push(`${context}: face ${face.id} has fewer than 3 usable points - skipped`);
    return;
  }
  const points = vertIds.map((v) => vertexById.get(v));
  const holes = [];
  for (const holeLoop of face.loops.slice(1)) {
    const holeVertIds = reconstructLoopVertices(holeLoop, edges);
    if (holeVertIds.length < 3) {
      warnings.push(`${context}: face ${face.id} has a hole with fewer than 3 usable points - skipped`);
      return;
    }
    holes.push(holeVertIds.map((v) => vertexById.get(v)));
  }
  const loopEdges = face.loops[0].map((ce) => edgesById.get(ce.edgeId)).filter((e) => e !== void 0);
  const hiddenEdges = loopEdges.some((e) => e.hidden);
  const softEdges = loopEdges.some((e) => e.soft);
  const smoothEdges = loopEdges.some((e) => e.smooth);
  const material = materialSlot(face.materialId, model, materialSlots);
  const backMaterial = materialSlot(face.backMaterialId, model, materialSlots);
  const frontUv = replayUv(face.materialId, face.uvTransform, face.uvProjected, points, face.normal, model, warnings, context, "front");
  const backUv = replayUv(face.backMaterialId, face.uvTransformBack, face.uvProjectedBack, points, face.normal, model, warnings, context, "back");
  try {
    target.addFace(points, {
      material,
      backMaterial,
      hidden: face.hidden,
      softEdges,
      smoothEdges,
      hiddenEdges,
      frontUv,
      backUv,
      holes
    });
  } catch (exc) {
    if (exc instanceof SkpWriteError) {
      warnings.push(`${context}: face ${face.id} skipped (${exc.message})`);
    } else {
      throw exc;
    }
  }
}
function nonCollinearTriple(points) {
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      for (let k = j + 1; k < points.length; k++) {
        const [ax, ay, az] = points[i];
        const [bx, by, bz] = points[j];
        const [cx, cy, cz] = points[k];
        const e1 = [bx - ax, by - ay, bz - az];
        const e2 = [cx - ax, cy - ay, cz - az];
        const cross2 = [
          e1[1] * e2[2] - e1[2] * e2[1],
          e1[2] * e2[0] - e1[0] * e2[2],
          e1[0] * e2[1] - e1[1] * e2[0]
        ];
        const mag2 = cross2[0] * cross2[0] + cross2[1] * cross2[1] + cross2[2] * cross2[2];
        if (mag2 > 1e-9) return [points[i], points[j], points[k]];
      }
    }
  }
  return void 0;
}
function replayUv(materialId, uvTransform, projected, points, normal, model, warnings, context, side) {
  if (materialId === null) return void 0;
  const mat = model.materialsById.get(materialId);
  if (!mat || !mat.texture) return void 0;
  if (projected) {
    warnings.push(`${context}: ${side} texture is projected/draped - falls back to default projection`);
    return void 0;
  }
  const tileW = mat.texture.width || 1;
  const tileH = mat.texture.height || 1;
  const { xr, yr } = faceUvBasis(normal);
  const sample = nonCollinearTriple(points);
  if (!sample) return void 0;
  return sample.map((p) => {
    const [u, v] = computeFaceUv(p, xr, yr, uvTransform, tileW, tileH);
    return [p, [u, v]];
  });
}
function replayInstance(target, inst, defBuilders, materialSlots, layerSlots, model, warnings, context) {
  const defBuilder = defBuilders.get(inst.refIdx);
  if (!defBuilder) {
    warnings.push(`${context}: instance ${JSON.stringify(inst.name)} references unavailable definition - skipped`);
    return;
  }
  const matrix3x3 = inst.matrix.length >= 9 ? inst.matrix.slice(0, 9) : void 0;
  const translation = inst.matrix.length >= 12 ? inst.matrix.slice(9, 12) : [0, 0, 0];
  const material = materialSlot(inst.materialId, model, materialSlots);
  const layer = inst.layer ? layerSlots.get(inst.layer) : void 0;
  try {
    target.addInstance(defBuilder, {
      // inst.name unconditionally, not `inst.name || undefined` - an
      // explicit empty string is a real, valid instance name (SketchUp
      // shows the definition's own name in the Outliner as a UI-level
      // fallback only, without storing it) - `|| undefined` would omit
      // it, letting addInstance's own default silently substitute the
      // definition's name instead.
      name: inst.name,
      translation,
      matrix3x3,
      material,
      layer,
      hidden: inst.hidden,
      attributes: Object.keys(inst.properties).length > 0 ? inst.properties : void 0,
      attributeDictName: "dynamic_attributes"
    });
  } catch (exc) {
    if (exc instanceof SkpWriteError) {
      warnings.push(`${context}: instance ${JSON.stringify(inst.name)} skipped (${exc.message})`);
    } else {
      throw exc;
    }
  }
}

// src/index.ts
function parseToRaw(buffer, options) {
  const t0 = Date.now();
  const data = new Uint8Array(buffer);
  emitLog(options, "info", `Parsing buffer (${data.length} bytes)`);
  if (!(data.length >= 4 && data[0] === 255 && data[1] === 254 && data[2] === 255 && data[3] === 14)) {
    throw new SkpParseError("Not a valid SketchUp file (bad header magic)", { stage: "header" });
  }
  if (isLegacy(data)) {
    emitLog(options, "debug", "Detected legacy MFC container; routing to legacy walker");
    return parseLegacyToRaw(data, options);
  }
  let contents;
  try {
    contents = extractSkpContents(data, options);
  } catch (e) {
    throw new SkpParseError(`Failed to extract SKP contents: ${e.message}`, {
      stage: "zip_extract",
      cause: e
    });
  }
  const version = contents.version;
  const modelData = contents.modelData;
  const materialFiles = contents.materialFiles;
  emitLog(options, "debug", `Detected version ${version} (VFF/ZIP container)`);
  const units = contents.metaData ? readMetaUnits(contents.metaData) : null;
  const layerColors = /* @__PURE__ */ new Map();
  const layerHidden = /* @__PURE__ */ new Map();
  const materialsMap = /* @__PURE__ */ new Map();
  const materialsByFolder = /* @__PURE__ */ new Map();
  for (const [name, xmlBytes] of Object.entries(materialFiles)) {
    const lowerName = name.toLowerCase();
    if (lowerName.endsWith("material.xml") && lowerName.startsWith("materials/")) {
      try {
        const decoder = new TextDecoder("utf-8");
        const xmlText = decoder.decode(xmlBytes);
        const parsedMat = parseMaterialXml(xmlText);
        if (parsedMat) {
          const folderName = name.split("/")[1] || "";
          let texture = null;
          if (parsedMat.hasTexture) {
            const resolved = resolveTextureBytes(
              materialFiles,
              name,
              parsedMat.textureFilename,
              parsedMat.imagePath
            );
            texture = {
              filename: resolved.filename,
              width: parsedMat.xScale,
              height: parsedMat.yScale,
              data: resolved.data
            };
          }
          const matObj = {
            name: parsedMat.name,
            // The VFF material XML record has no alpha attribute - only a
            // separate transparency value (parsedMat.trans, above). Always
            // opaque here; real per-channel alpha only exists in the legacy
            // MFC record (see legacy.ts's own material color assignment).
            color: { r: parsedMat.r, g: parsedMat.g, b: parsedMat.b, a: 255 },
            transparency: parsedMat.trans,
            id: null,
            texture,
            colorized: parsedMat.colorized,
            colorizeType: parsedMat.colorizeType
          };
          materialsMap.set(parsedMat.name, matObj);
          if (folderName) {
            materialsByFolder.set(folderName, matObj);
          }
          if (parsedMat.name.startsWith("Layer_")) {
            layerColors.set(parsedMat.name.slice(6), [parsedMat.r, parsedMat.g, parsedMat.b]);
            layerHidden.set(parsedMat.name.slice(6), false);
          }
        }
      } catch (e) {
        emitLog(options, "debug", `Failed to parse material.xml ${name}: ${e.message}`);
      }
    }
  }
  const styles = [];
  for (const [name, xmlBytes] of Object.entries(materialFiles)) {
    const lowerName = name.toLowerCase();
    if (lowerName.startsWith("styles/") && lowerName.endsWith("style.xml")) {
      try {
        const decoder = new TextDecoder("utf-8");
        const xmlText = decoder.decode(xmlBytes);
        const parsedStyle = parseStyleXml(xmlText);
        if (parsedStyle) {
          styles.push({
            name: parsedStyle.name,
            frontColor: parsedStyle.frontColor,
            backColor: parsedStyle.backColor
          });
        }
      } catch (e) {
        emitLog(options, "debug", `Failed to parse style.xml ${name}: ${e.message}`);
      }
    }
  }
  const layerIdToName = /* @__PURE__ */ new Map();
  const materialIdToName = /* @__PURE__ */ new Map();
  function collectMaterialIds(nodes) {
    for (const el of nodes) {
      if (el.tag === "C832") {
        const dc05 = findChildTag(el.children, "DC05");
        const nameNode = findChildTag(el.children, "CC32");
        if (dc05 && nameNode) {
          const payload = dc05.payload;
          let mId;
          if (payload.length >= 6 && payload[0] === 222 && payload[1] === 5) {
            const de05Len = readU32(payload, 2);
            mId = parseVarInt(payload, 6, de05Len);
          } else {
            mId = parseVarInt(payload, 0, payload.length);
          }
          let mName = "";
          try {
            const decoder = new TextDecoder("utf-8");
            mName = decoder.decode(nameNode.payload);
          } catch (e) {
            emitLog(options, "debug", `Failed to decode material name for id ${mId}: ${e.message}`);
          }
          materialIdToName.set(mId, mName);
        }
      }
      if (el.children && el.children.length > 0) {
        collectMaterialIds(el.children);
      }
    }
  }
  emitLog(options, "debug", `Parsed ${materialsMap.size} materials, ${styles.length} styles`);
  const defsDict = /* @__PURE__ */ new Map();
  const rootBuilder = new GeometryBuilder();
  const vertexPositions = /* @__PURE__ */ new Map();
  const instanceWorld = /* @__PURE__ */ new Map();
  let pageNode = null;
  for (const { index, total, node: el } of iterTopLevelLazy(modelData, 0, modelData.length)) {
    try {
      collectLayers([el], layerIdToName, options, layerHidden);
      collectMaterialIds([el]);
      collectDefs([el], defsDict, options);
      scanVertexPositions(el, vertexPositions);
      scanInstanceTransforms(el, instanceWorld);
      if (pageNode === null) {
        pageNode = findPageNode(el);
      }
      if (el.tag === "F601") {
        extractGeometryFromNodes(el.children, rootBuilder, options);
      }
    } catch (e) {
      throw new SkpParseError(`Failed while processing top-level record: ${e.message}`, {
        stage: "tlv_walk",
        recordIndex: index,
        totalRecords: total,
        tag: el.tag,
        cause: e
      });
    }
    if (index % PROGRESS_INTERVAL === 0 || index === total - 1) {
      emitProgress(options, "tlv_walk", index + 1, total);
      emitLog(options, "debug", `Processed ${index + 1}/${total} top-level records`);
    }
  }
  emitLog(
    options,
    "info",
    `Parse complete: ${defsDict.size} defs (${((Date.now() - t0) / 1e3).toFixed(2)}s)`
  );
  if (!layerIdToName.has(1)) {
    layerIdToName.set(1, "Layer0");
  }
  if (!layerColors.has("Layer0")) {
    layerColors.set("Layer0", [136, 136, 136]);
  }
  if (!layerHidden.has("Layer0")) {
    layerHidden.set("Layer0", false);
  }
  defsDict.set("ROOT", {
    guid: "ROOT",
    name: "ROOT_MODEL",
    isImage: false,
    isGroup: false,
    alwaysFacesCamera: false,
    shadowsFaceSun: false,
    builder: rootBuilder
  });
  return {
    version,
    units,
    layerColors,
    layerHidden,
    layerIdToName,
    pages: parsePages(pageNode),
    dimensions: parseDimensions(modelData, vertexPositions, instanceWorld),
    materialIdToName,
    materialsMap,
    materialsByFolder,
    styles,
    defsDict
  };
}
function parseSkp(buffer, options) {
  return buildModelFromParsed(parseToRaw(buffer, options));
}
function buildScene(buffer, options) {
  return buildSceneFromParsed(parseToRaw(buffer, options), options);
}
function buildInstancedScene(buffer, options) {
  return buildInstancedSceneFromParsed(parseToRaw(buffer, options), options);
}
function createGlb2(json, binaryBuffer) {
  let jsonString = JSON.stringify(json);
  const jsonRemainder = jsonString.length % 4;
  if (jsonRemainder !== 0) {
    jsonString += " ".repeat(4 - jsonRemainder);
  }
  const jsonBuffer = new TextEncoder().encode(jsonString);
  let paddedBinaryBuffer = binaryBuffer;
  const binaryRemainder = binaryBuffer.length % 4;
  if (binaryRemainder !== 0) {
    const padLength = 4 - binaryRemainder;
    paddedBinaryBuffer = new Uint8Array(binaryBuffer.length + padLength);
    paddedBinaryBuffer.set(binaryBuffer);
  }
  const totalLength = 12 + 8 + jsonBuffer.length + 8 + paddedBinaryBuffer.length;
  const glb = new Uint8Array(totalLength);
  const view = new DataView(glb.buffer);
  view.setUint32(0, 1179937895, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonBuffer.length, true);
  view.setUint32(16, 1313821514, true);
  glb.set(jsonBuffer, 20);
  const binHeaderOffset = 20 + jsonBuffer.length;
  view.setUint32(binHeaderOffset, paddedBinaryBuffer.length, true);
  view.setUint32(binHeaderOffset + 4, 5130562, true);
  glb.set(paddedBinaryBuffer, binHeaderOffset + 8);
  return glb;
}
function stripTextureRefs2(materials) {
  let needsCopy = false;
  for (const mat of materials) {
    if (mat?.pbrMetallicRoughness?.baseColorTexture) {
      needsCopy = true;
      break;
    }
  }
  if (!needsCopy) return materials;
  return materials.map((mat) => {
    const pbr = mat?.pbrMetallicRoughness;
    if (!pbr?.baseColorTexture) return mat;
    const restPbr = { ...pbr };
    delete restPbr.baseColorTexture;
    return { ...mat, pbrMetallicRoughness: restPbr };
  });
}
function toGLB(scene, options) {
  const prims = scene.glbPrimitives || [];
  const gltfMaterials = scene.gltfMaterials || [];
  const sceneTextures = options?.textures ? scene.textures || [] : [];
  const encodedIndices = prims.map((prim) => encodeIndices(prim.indices));
  let totalBinaryLength = 0;
  for (let i = 0; i < prims.length; i++) {
    const prim = prims[i];
    totalBinaryLength += prim.positions.byteLength;
    totalBinaryLength += prim.normals.byteLength;
    totalBinaryLength += prim.uvs.byteLength;
    totalBinaryLength += encodedIndices[i].data.byteLength;
    totalBinaryLength += (4 - totalBinaryLength % 4) % 4;
  }
  const imagePlacements = [];
  for (const tex of sceneTextures) {
    totalBinaryLength += (4 - totalBinaryLength % 4) % 4;
    imagePlacements.push({ offset: totalBinaryLength, length: tex.data.length });
    totalBinaryLength += tex.data.length;
  }
  const binaryBuffer = new Uint8Array(totalBinaryLength);
  const bufferViews = [];
  const accessors = [];
  const gltfPrimitives = [];
  let byteOffset = 0;
  for (let primIndex = 0; primIndex < prims.length; primIndex++) {
    const prim = prims[primIndex];
    const posByteOffset = byteOffset;
    binaryBuffer.set(new Uint8Array(prim.positions.buffer, prim.positions.byteOffset, prim.positions.byteLength), posByteOffset);
    byteOffset += prim.positions.byteLength;
    const normByteOffset = byteOffset;
    binaryBuffer.set(new Uint8Array(prim.normals.buffer, prim.normals.byteOffset, prim.normals.byteLength), normByteOffset);
    byteOffset += prim.normals.byteLength;
    const uvByteOffset = byteOffset;
    binaryBuffer.set(new Uint8Array(prim.uvs.buffer, prim.uvs.byteOffset, prim.uvs.byteLength), uvByteOffset);
    byteOffset += prim.uvs.byteLength;
    const encoded = encodedIndices[primIndex];
    const indByteOffset = byteOffset;
    binaryBuffer.set(
      new Uint8Array(encoded.data.buffer, encoded.data.byteOffset, encoded.data.byteLength),
      indByteOffset
    );
    byteOffset += encoded.data.byteLength;
    byteOffset += (4 - byteOffset % 4) % 4;
    const posBufferViewIdx = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: posByteOffset,
      byteLength: prim.positions.byteLength,
      target: 34962
      // ARRAY_BUFFER
    });
    const normBufferViewIdx = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: normByteOffset,
      byteLength: prim.normals.byteLength,
      target: 34962
      // ARRAY_BUFFER
    });
    const uvBufferViewIdx = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: uvByteOffset,
      byteLength: prim.uvs.byteLength,
      target: 34962
      // ARRAY_BUFFER
    });
    const indBufferViewIdx = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: indByteOffset,
      byteLength: encoded.data.byteLength,
      target: 34963
      // ELEMENT_ARRAY_BUFFER
    });
    const posAccessorIdx = accessors.length;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < prim.positions.length; i += 3) {
      const x = prim.positions[i];
      const y = prim.positions[i + 1];
      const z = prim.positions[i + 2];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    if (minX === Infinity) {
      minX = minY = minZ = 0;
      maxX = maxY = maxZ = 0;
    }
    accessors.push({
      bufferView: posBufferViewIdx,
      byteOffset: 0,
      componentType: 5126,
      // FLOAT
      count: prim.positions.length / 3,
      type: "VEC3",
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ]
    });
    const normAccessorIdx = accessors.length;
    accessors.push({
      bufferView: normBufferViewIdx,
      byteOffset: 0,
      componentType: 5126,
      // FLOAT
      count: prim.normals.length / 3,
      type: "VEC3"
    });
    const uvAccessorIdx = accessors.length;
    accessors.push({
      bufferView: uvBufferViewIdx,
      byteOffset: 0,
      componentType: 5126,
      // FLOAT
      count: prim.uvs.length / 2,
      type: "VEC2"
    });
    const indAccessorIdx = accessors.length;
    accessors.push({
      bufferView: indBufferViewIdx,
      byteOffset: 0,
      componentType: encoded.componentType,
      count: prim.indices.length,
      type: "SCALAR"
    });
    gltfPrimitives.push({
      attributes: {
        POSITION: posAccessorIdx,
        NORMAL: normAccessorIdx,
        TEXCOORD_0: uvAccessorIdx
      },
      indices: indAccessorIdx,
      material: prim.materialIndex
    });
  }
  const gltfImages = [];
  const gltfTextures = [];
  for (let i = 0; i < sceneTextures.length; i++) {
    const tex = sceneTextures[i];
    const place = imagePlacements[i];
    binaryBuffer.set(tex.data, place.offset);
    const viewIdx = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset: place.offset, byteLength: place.length });
    gltfImages.push({ bufferView: viewIdx, mimeType: tex.mimeType });
    gltfTextures.push({ sampler: 0, source: gltfImages.length - 1 });
  }
  const gltfMeshes = [];
  if (gltfPrimitives.length > 0) {
    gltfMeshes.push({
      primitives: gltfPrimitives
    });
  }
  const gltfJson = {
    asset: {
      version: "2.0",
      generator: "OpenSKP TypeScript Exporter"
    },
    scene: 0,
    scenes: [
      {
        nodes: gltfMeshes.length > 0 ? [0] : []
      }
    ],
    nodes: gltfMeshes.length > 0 ? [
      {
        mesh: 0
      }
    ] : [],
    meshes: gltfMeshes,
    materials: sceneTextures.length > 0 ? gltfMaterials : stripTextureRefs2(gltfMaterials),
    buffers: [
      {
        byteLength: totalBinaryLength
      }
    ],
    bufferViews,
    accessors,
    ...gltfImages.length > 0 ? {
      images: gltfImages,
      textures: gltfTextures,
      samplers: [{ wrapS: 10497, wrapT: 10497 }]
      // REPEAT / REPEAT
    } : {}
  };
  return createGlb2(gltfJson, binaryBuffer);
}
function toJSON(model, scene) {
  const serializeInstance = (inst) => ({
    name: inst.name,
    ref_idx: inst.refIdx,
    guid: inst.guid,
    matrix: inst.matrix
  });
  const serializeDefinition = (defn) => ({
    id: defn.id,
    guid: defn.guid,
    name: defn.name,
    vertex_count: defn.vertices.length,
    edge_count: defn.edges.length,
    face_count: defn.faces.length,
    vertices: defn.vertices.map((v) => ({ id: v.id, x: v.x, y: v.y, z: v.z })),
    edges: defn.edges.map((e) => ({ id: e.id, v1_id: e.v1Id, v2_id: e.v2Id })),
    faces: defn.faces.map((f) => ({
      id: f.id,
      loops: f.loops.map(
        (loop) => loop.map((ce) => ({ edge_id: ce.edgeId, orientation: ce.orientation }))
      ),
      normal: f.normal
    })),
    instances: defn.instances.map(serializeInstance)
  });
  const definitionsObj = {};
  for (const [id, defn] of model.definitions.entries()) {
    definitionsObj[id] = serializeDefinition(defn);
  }
  const layersList = model.layers.map((l) => ({
    name: l.name,
    color: l.color,
    hidden: l.hidden
  }));
  const materialsList = model.materials.map((m) => ({
    name: m.name,
    color: m.color,
    transparency: m.transparency
  }));
  const serializeInstanceNode = (node) => {
    return {
      name: node.name,
      definition_name: node.definitionName,
      layer: node.layer,
      position_mm: node.positionMm,
      properties: node.properties,
      children: node.children.map(serializeInstanceNode)
    };
  };
  const serializeMeshMetadata = (m) => ({
    name: m.name,
    definition_name: m.definitionName,
    layer: m.layer,
    position_mm: m.positionMm,
    properties: m.properties,
    path: m.path
  });
  const meshIndexObj = {};
  if (scene) {
    for (const [name, m] of Object.entries(scene.meshIndex)) {
      meshIndexObj[name] = serializeMeshMetadata(m);
    }
  }
  return {
    format_version: "1.0",
    sketchup_version: model.version,
    units: model.units,
    total_definitions: model.definitions.size,
    total_layers: model.layers.length,
    total_meshes: scene ? Object.keys(scene.meshIndex).length : 0,
    root: serializeDefinition(model.root),
    definitions: definitionsObj,
    layers: layersList,
    materials: materialsList,
    mesh_index: meshIndexObj,
    scene_hierarchy: scene ? serializeInstanceNode(scene.sceneHierarchy) : null
  };
}
var SkpFile = class _SkpFile {
  constructor(buffer) {
    this.buffer = buffer;
  }
  static fromBuffer(buffer) {
    return new _SkpFile(buffer);
  }
  static open(filePath) {
    if (typeof process !== "undefined" && process.versions && process.versions.node) {
      const fs = require("fs");
      const path = require("path");
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      const ext = path.extname(filePath);
      if (ext.toLowerCase() !== ".skp") {
        throw new Error(`Expected a .skp file, got: ${ext}`);
      }
      const buffer = fs.readFileSync(filePath);
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      return new _SkpFile(arrayBuffer);
    } else {
      throw new Error("SkpFile.open is only supported in Node.js environment");
    }
  }
  /** Fast, memory-light parse: raw per-definition geometry, no scene-graph
   * instancing resolved. See {@link buildScene} for a triangulated,
   * world-space scene ready for rendering or GLB export.
   * @param options - Optional progress/log callbacks (see {@link ParseOptions}) */
  parse(options) {
    return parseSkp(this.buffer, options);
  }
  /** Bake every placed instance into world-space, triangulated mesh data.
   * Independent of parse() - re-parses the raw TLV data on its own rather
   * than reusing a prior parse() call, so calling only parse() never pays
   * for this heavier computation.
   * @param options - Optional progress/log callbacks (see {@link ParseOptions}) */
  buildScene(options) {
    return buildScene(this.buffer, options);
  }
  /** Build the placed scene graph with instancing PRESERVED: unique
   * geometry once, plus one transform per placement. See
   * {@link buildInstancedScene} for when to prefer this over buildScene().
   * @param options - Optional progress/log callbacks (see {@link ParseOptions}) */
  buildInstancedScene(options) {
    return buildInstancedScene(this.buffer, options);
  }
  /** Convert to ThatOpen Fragments (.frag) binary format.
   * @param options - Optional fragment export options (raw, doubleSided, modelId) */
  toFragments(options) {
    const scene = this.buildInstancedScene();
    return toFragments(scene, options);
  }
  /** The preview image SketchUp stored in the file, or null when it has
   * none. Cheap: reads container metadata only, never geometry.
   * @param options - Optional progress/log callbacks */
  thumbnail(options) {
    return extractThumbnail(this.buffer, options);
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ComponentDefinitionBuilder,
  METRES_TO_INCHES,
  PROGRESS_INTERVAL,
  SkpBuilder,
  SkpFile,
  SkpParseError,
  SkpWriteError,
  buildInstancedScene,
  buildModelFromParsed,
  buildScene,
  buildSceneFromParsed,
  classifyElement,
  computeFaceUv,
  create,
  emitLog,
  emitProgress,
  exportDXF,
  exportIFC,
  exportOBJ,
  exportPLY,
  exportSTL,
  extractThumbnail,
  faceUvBasis,
  fromFragments,
  generateIFCGUID,
  isDrawableEdge,
  openExisting,
  parseSkp,
  resolveMaterialFromMaps,
  sniffImageMime,
  toDXF,
  toFragments,
  toGLB,
  toIFC,
  toInstancedGLB,
  toJSON,
  toMTL,
  toOBJ,
  toPLYAscii,
  toPLYBinary,
  toSTLAscii,
  toSTLBinary,
  toTypeScriptCode
});
