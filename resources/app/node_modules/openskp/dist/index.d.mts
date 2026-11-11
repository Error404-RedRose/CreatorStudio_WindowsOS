/**
 * Optional progress/log hooks for long-running parses.
 *
 * openskp never logs or prints on its own - callers that want visibility
 * into a parse (progress through a large file, which stage is running, when
 * it completes) pass an {@link ParseOptions} with `onProgress`/`onLog`
 * callbacks that plug into whatever logging/monitoring the host application
 * already uses. Silent by default, matching {@link SkpParseError}'s "always
 * add context, never hide it" philosophy from the other side: this is how a
 * caller finds out *how far* a parse got before it got stuck, not just
 * *where*.
 */
type LogLevel = 'debug' | 'info';
interface ProgressInfo {
    /** Which pipeline stage is reporting progress, e.g. "tlv_walk",
     * "legacy_defs", "build_scene". */
    stage: string;
    /** Units completed so far (records, definitions, or instances,
     * depending on `stage`). */
    current: number;
    /** Total units expected for this stage. */
    total: number;
}
interface ParseOptions {
    /** Called periodically (every {@link PROGRESS_INTERVAL} units) during a
     * long walk, so a caller can report "N of M processed" without any extra
     * pass over the data. */
    onProgress?: (info: ProgressInfo) => void;
    /** Called for start/stage/completion messages. `level` is "debug" for
     * fine-grained detail, "info" for start/complete summaries - mirrors the
     * Python port's `logging.DEBUG`/`logging.INFO` split. */
    onLog?: (level: LogLevel, message: string) => void;
}
/** How often (in records/definitions/instances) to call `onProgress` during
 * a long walk - coarse enough that it costs nothing on a 300k-definition
 * file. Mirrors the Python port's `_PROGRESS_INTERVAL`. */
declare const PROGRESS_INTERVAL = 500;
declare function emitLog(options: ParseOptions | undefined, level: LogLevel, message: string): void;
declare function emitProgress(options: ParseOptions | undefined, stage: string, current: number, total: number): void;

interface TlvNode {
    offset: number;
    tag: string;
    size: number;
    children: TlvNode[];
    payload: Uint8Array;
}

/**
 * Storage for edges' D307 display-flag byte, keyed by edge id.
 *
 * The payload is a SINGLE BYTE per edge (base 0x06, plus 0x01 hidden,
 * 0x08 soft, 0x10 smooth), which a `Map<number, number>` stores at roughly
 * 30 bytes per entry - about 23x the data itself, once V8's boxed-number
 * and hash-bucket overhead is counted. On a large model that is tens of
 * megabytes spent on a value that fits in a `Uint8Array` slot.
 *
 * Backed by a `Uint8Array` indexed by `id - baseId`, grown geometrically.
 * Edge ids are not dense in real files (~39% across this repository's
 * fixtures), so the array is sized to the observed id SPAN rather than the
 * edge count - still far smaller than the Map it replaces, because one
 * slot costs one byte instead of a whole hash entry.
 *
 * Semantics match the `Map` exactly, including the distinction the legacy
 * (pre-2021 MFC) reader relies on: it only records an edge when its flags
 * are non-zero, so an id that was never written must read back as 0 and
 * report `has() === false`. A separate presence bitmap keeps that
 * observable difference intact rather than conflating "absent" with
 * "stored zero".
 */
declare class EdgeFlagStore {
    /** Flag byte per slot; index is `id - baseId`. */
    private flags;
    /** One bit per slot recording whether that id was ever written. */
    private present;
    /** Id that maps to slot 0. Set on first write. */
    private baseId;
    private initialized;
    private count;
    /** Highest slot ever handed out; slots above it hold nothing. */
    private highSlot;
    /** Number of ids actually stored. */
    get size(): number;
    private slotFor;
    /** Grow (and, for an id below `baseId`, shift) so `id` has a slot. */
    private ensureSlot;
    set(id: number, flags: number): void;
    /** The stored byte, or `undefined` when the id was never written -
     * matching `Map.prototype.get`, so callers' `?? 0` fallbacks behave
     * exactly as before. */
    get(id: number): number | undefined;
    has(id: number): boolean;
}

/**
 * Vertex coordinate storage.
 *
 * A `Map<number, [x, y, z]>` costs ~92 MB per million vertices: every
 * `[x, y, z]` is a separate JS array with its own object header, and every
 * Map entry adds hash-bucket overhead on top. The coordinates themselves
 * are 24 bytes. That overhead is the dominant term in this package's
 * memory use on large files.
 *
 * Coordinates move into one flat `Float64Array` (f64, not f32: the file
 * stores doubles and narrowing would silently change parsed geometry).
 * Ids are NOT dense in real files - measured across this repository's
 * fixtures, vertex ids are ~33% dense on aggregate and as low as 7.6%
 * within a single definition - so indexing the array by raw id would waste
 * more than it saves. An id -> index mapping is therefore mandatory, and
 * this module provides two implementations of it behind one interface so
 * they can be benchmarked against real files rather than chosen blind:
 *
 * - {@link MapVertexStore}: `Map<id, index>`. O(1) lookup, but the Map is
 *   then the dominant remaining cost (~57 MB/1M measured).
 * - {@link SortedVertexStore}: a sorted `Uint32Array` of ids plus binary
 *   search. O(log n) lookup, denser (~42 MB/1M measured).
 *
 * Both preserve insertion order for iteration, which the parsers and
 * `buildDefinition()` rely on.
 */
/** Read/write access to a definition's vertex coordinates, keyed by id. */
interface VertexStore {
    /** Number of stored vertices. */
    readonly size: number;
    /** Store (or overwrite) a vertex's coordinates. */
    set(id: number, xyz: [number, number, number]): void;
    /** Coordinates for `id`, or `undefined` when absent - matching
     * `Map.prototype.get`, so existing `!`/`?? ` handling is unchanged. */
    get(id: number): [number, number, number] | undefined;
    has(id: number): boolean;
    /** Ids and coordinates in insertion order. */
    entries(): IterableIterator<[number, [number, number, number]]>;
    /** Ids in insertion order. */
    ids(): IterableIterator<number>;
}

/**
 * Edge endpoint storage.
 *
 * A `Map<number, [v1, v2]>` costs ~100 bytes per edge: every `[v1, v2]` is
 * a separate JS array with its own object header, and every Map entry adds
 * hash-bucket overhead on top. The endpoints themselves are two vertex ids.
 * On a real 411 MB legacy file that is 0.24 GB of the 2.27 GB the reader
 * keeps alive after the walk (openskp#201).
 *
 * The endpoints move into one flat `Uint32Array` (`[v1, v2, v1, v2, ...]`
 * in insertion order), next to an insertion-ordered id list, as
 * `vertex-store.ts` does for coordinates. Like vertex ids, edge ids are not
 * dense in real files (~39% across this repository's fixtures, see
 * `edge-flags.ts`), so an id -> index mapping is needed, and this module
 * provides three behind one interface so they can be benchmarked rather
 * than chosen blind:
 *
 * - {@link MapEdgeStore}: `Map<id, index>`. O(1) lookup; the Map is the
 *   dominant remaining cost.
 * - {@link SortedEdgeStore}: a sorted `Uint32Array` of ids plus binary
 *   search. O(log n) lookup, denser.
 * - {@link DenseEdgeStore}: an `Int32Array` indexed by `id - baseId`, sized
 *   to the id span (like `EdgeFlagStore`). O(1) and the densest at real
 *   id densities, with a guard that falls back to a Map when the ids are
 *   too sparse for a span-sized array to pay off.
 *
 * All three preserve insertion order for iteration, which
 * `buildDefinition()` relies on, and reproduce the Map's values exactly:
 * an endpoint is a vertex id (u32 in both formats) or `null`. Anything else
 * - which neither reader produces today - is kept verbatim in a side Map
 * rather than narrowed, so the store can never silently change a value.
 */
/** An edge's endpoints, as the readers store them. */
type EdgeEnds = [number | null, number | null];
/** Read/write access to a definition's edges, keyed by edge id. */
interface EdgeStore {
    /** Number of stored edges. */
    readonly size: number;
    /** Store (or overwrite) an edge's endpoints. */
    set(id: number, ends: EdgeEnds): void;
    /** Endpoints for `id` as a fresh tuple, or `undefined` when absent -
     * matching `Map.prototype.get`. Allocates; hot paths use `v1`/`v2`. */
    get(id: number): EdgeEnds | undefined;
    has(id: number): boolean;
    /** First endpoint of `id`: a vertex id, `null`, or `undefined` when the
     * edge is absent. No allocation. */
    v1(id: number): number | null | undefined;
    /** Second endpoint of `id`, as {@link v1}. */
    v2(id: number): number | null | undefined;
    /** Ids and endpoints in insertion order. */
    entries(): IterableIterator<[number, EdgeEnds]>;
}

interface GeometryBuilderInstance {
    offset: number;
    refGuid: string;
    refIdx: number;
    name: string;
    matrix: number[];
    materialId: number | null;
    /** Layer ID this instance belongs to (D007 -> D207), or null. Internal -
     * used for scene-graph layer inheritance, not part of the public API. */
    layerId?: number | null;
    hidden?: boolean;
    children: TlvNode[];
    /** Dynamic Component properties precomputed for legacy (pre-2021 MFC)
     * instances (see legacy.ts's extractLegacyDynamicProperties) - VFF
     * instances don't set this, since their properties come from a lazy
     * D007/DC05 TLV walk over `children` instead (see model.ts). */
    properties?: Record<string, string>;
}
interface GeometryBuilderFace {
    loops: {
        edgeId: number;
        orientation: number;
    }[][];
    normal: [number, number, number];
    materialId?: number | null;
    backMaterialId?: number | null;
    uvTransform?: number[] | null;
    uvTransformBack?: number[] | null;
    uvProjected?: boolean;
    uvProjectedBack?: boolean;
    hidden?: boolean;
}
/** The analytic frame of a Curve that is one arc: the points
 * `center + cos(t) * xAxis + sin(t) * yAxis` for `t` from `startAngle` to
 * `endAngle`. */
interface ArcFrame {
    center: [number, number, number];
    normal: [number, number, number];
    xAxis: [number, number, number];
    yAxis: [number, number, number];
    startAngle: number;
    endAngle: number;
}
declare class GeometryBuilder {
    /** id -> [x, y, z]. Backed by a flat Float64Array rather than a Map of
     * boxed arrays: see vertex-store.ts for the memory rationale. */
    vertices: VertexStore;
    /** id -> [v1, v2]. Backed by flat typed arrays rather than a Map of
     * boxed pairs: see edge-store.ts for the memory rationale. */
    edges: EdgeStore;
    /** Edge id -> display flag byte (D307). Backed by a Uint8Array rather
     * than a Map: the value is one byte, and a Map entry costs ~30. */
    edgeFlags: EdgeFlagStore;
    /** Edge id -> the entity id of the Curve the edge belongs to (SketchUp's
     * `Edge#curve`). Absent means the edge belongs to no curve. */
    edgeCurves: Map<number, number>;
    /** Curve id -> its analytic arc, for the curves that are arcs. */
    arcCurves: Map<number, ArcFrame>;
    faces: Map<number, GeometryBuilderFace>;
    instances: GeometryBuilderInstance[];
    sectionPlanes: {
        plane: [number, number, number, number];
        name: string;
        label: string;
        hidden: boolean;
    }[];
    texts: {
        text: string;
        hidden: boolean;
    }[];
    dimensions: {
        text: string;
        hidden: boolean;
    }[];
    constructionLines: {
        point: [number, number, number];
        direction: [number, number, number];
        start: [number, number, number] | null;
        end: [number, number, number] | null;
    }[];
    constructionPoints: {
        position: [number, number, number];
    }[];
}
interface ParsedDefinition {
    guid: string;
    name: string;
    isImage: boolean;
    isGroup?: boolean;
    alwaysFacesCamera: boolean;
    shadowsFaceSun?: boolean;
    sectionPlanes?: {
        plane: [number, number, number, number];
        name: string;
        label: string;
        hidden: boolean;
    }[];
    texts?: {
        text: string;
        hidden: boolean;
    }[];
    dimensions?: {
        text: string;
        hidden: boolean;
    }[];
    constructionLines?: {
        point: [number, number, number];
        direction: [number, number, number];
        start: [number, number, number] | null;
        end: [number, number, number] | null;
    }[];
    constructionPoints?: {
        position: [number, number, number];
    }[];
    builder: GeometryBuilder;
}

/**
 * VFF (2021+) scenes ("pages") and linear dimensions. Ported from Python's
 * _core.py (PR #190) - see that module's _scan_vertex_positions /
 * _scan_instance_transforms / _parse_dimensions / _find_page_node /
 * _parse_pages for the byte-format details this file mirrors.
 */

interface RawPage {
    name: string;
    eye: [number, number, number] | null;
    target: [number, number, number] | null;
    up: [number, number, number] | null;
    fov: number;
    parallel: boolean;
    orthoHeight: number;
    hiddenLayerIds: number[];
}
interface RawDimension {
    a: [number, number, number];
    b: [number, number, number];
    offset: number;
    planeX: [number, number, number] | null;
    normal: [number, number, number] | null;
    text: string;
}

interface SkpModel {
    version: string;
    definitions: Map<number, Definition>;
    /** The implicit top-level model definition: its `instances` are the
     * entities placed directly in the model (not inside any component/
     * group), and its `vertices`/`edges`/`faces` are geometry drawn directly
     * at the top level. Corresponds to .NET/Dart's `Root`/`root`. */
    root: Definition;
    layers: Layer[];
    /** The file's saved scenes, from VFF files and from classic pre-2021 files. */
    pages: Page[];
    /** Model-level linear dimensions with world-space endpoints (VFF
     * files). Legacy files surface text-only dimensions per definition
     * instead (`Definition.dimensions`). */
    dimensions: Dimension[];
    materials: Material[];
    materialsById: Map<number, Material>;
    styles: Style[];
    /** The model's unit-system string (e.g. "Millimeter"), read from
     * meta/meta.dat in modern (VFF) files. null for legacy (pre-2021 MFC)
     * files, which carry no equivalent container, or when the tag isn't
     * found. */
    units: string | null;
}
interface SectionPlane {
    plane: [number, number, number, number];
    name: string;
    label: string;
    hidden: boolean;
}
interface TextEntity {
    text: string;
    hidden: boolean;
}
/**
 * A linear dimension (SketchUp's Dimension tool).
 *
 * The legacy (pre-2021) reader recovers only `text`/`hidden`. The VFF
 * reader (2021+) recovers the full geometry - see `SkpModel.dimensions`
 * for the model-level, world-space list.
 */
interface Dimension {
    /** The displayed text. Empty when the dimension shows its auto-computed
     * measured value (the caller formats `|b - a|`). */
    text: string;
    hidden: boolean;
    /** First measured point [x, y, z] in inches (world space), or null when
     * only the text was recovered. */
    a: [number, number, number] | null;
    /** Second measured point. */
    b: [number, number, number] | null;
    /** Offset distance (inches) - how far the dimension line sits from the
     * a-b segment, along the in-plane perpendicular. */
    offset: number;
    /** Historical name: for a VFF dimension this is tag 5BCF, which is the plane NORMAL (SketchUp's SUDimensionLinearGetNormal equals it), or null. */
    planeX: [number, number, number] | null;
    /** Historical name: for a VFF dimension this is tag 5BD0, the plane's X axis, or null. */
    normal: [number, number, number] | null;
}
/**
 * A construction/guide line (SketchUp's Construction Line tool). Read from
 * both legacy (pre-2021) and VFF (2021+) files.
 *
 * Stored internally (and here, unchanged) as a point + normalized
 * direction + two signed distance parameters along that direction marking
 * where the visible segment starts/ends - the same shape
 * `Sketchup::ConstructionLine`'s own `start`/`end`/`direction` properties
 * expose. A parameter magnitude of `1e30` means unbounded in that
 * direction (SketchUp draws this as an infinite guide line through
 * `point`) - `start`/`end` come back null in that case, matching the real
 * API returning `nil`.
 */
interface ConstructionLine {
    /** A point on the line, in inches (world space) - matches the bounded
     * case's own `start`, or the anchor point given for an infinite line. */
    point: [number, number, number];
    /** The line's normalized direction vector. */
    direction: [number, number, number];
    /** The bounded segment's start point, or null if unbounded in this
     * direction. */
    start: [number, number, number] | null;
    /** The bounded segment's end point, or null if unbounded. */
    end: [number, number, number] | null;
}
/** A construction/guide point (SketchUp's Construction Point tool).
 * Legacy and VFF (2021+) files are both supported. */
interface ConstructionPoint {
    /** The point's position, in inches (world space). */
    position: [number, number, number];
}
/** A saved scene (SketchUp's "Scenes" tabs; "pages" in the SDK). */
interface Page {
    /** Scene name as shown on its tab. */
    name: string;
    /** Camera position [x, y, z] in inches, or null. */
    eye: [number, number, number] | null;
    /** Point the camera looks at, in inches. */
    target: [number, number, number] | null;
    /** Camera up vector. */
    up: [number, number, number] | null;
    /** Field of view in degrees (SketchUp default 35). */
    fov: number;
    /** True when the scene uses parallel (orthographic) projection; `fov`
     * still holds the stored perspective angle. */
    parallel: boolean;
    /** Visible height in inches when `parallel`. */
    orthoHeight: number;
    /** Names of the layers this scene hides. */
    hiddenLayers: string[];
}
interface Definition {
    id: number;
    guid: string;
    name: string;
    vertices: Vertex[];
    edges: Edge[];
    faces: Face[];
    instances: Instance[];
    sectionPlanes: SectionPlane[];
    texts: TextEntity[];
    dimensions: Dimension[];
    constructionLines: ConstructionLine[];
    constructionPoints: ConstructionPoint[];
    /** The analytic arc of every curve that is one, keyed by curve id - the
     * {@link Edge.curveId} of the edges that form it. A curve that is not an
     * arc (a freehand or polygon curve) has no entry. */
    arcs: Map<number, ArcCurve>;
    isImage: boolean;
    /** True when SketchUp made this definition for a group rather than a
     * component (what its own API reports as `SUComponentType_Group`). Groups
     * and component instances are both `Instance` placements of a `Definition`;
     * this is the only thing that tells them apart. It comes from the file
     * itself - the definition kind in a 2021+ file, a flag in the definition
     * record in an older one - not from how often the definition is placed. */
    isGroup: boolean;
    alwaysFacesCamera: boolean;
    shadowsFaceSun: boolean;
}
interface Vertex {
    id: number;
    x: number;
    y: number;
    z: number;
}
interface Edge {
    id: number;
    v1Id: number;
    v2Id: number;
    soft: boolean;
    smooth: boolean;
    hidden: boolean;
    /** SketchUp's own `Edge#curve` grouping: the id of the Curve this edge
     * belongs to, or null when it belongs to none. Edges sharing a `curveId`
     * were drawn as one continuous multi-segment line or arc; if the curve is
     * an arc, {@link Definition.arcs} has it under the same id. */
    curveId?: number | null;
}
/**
 * The analytic arc behind a curve: SketchUp's own `ArcCurve`.
 *
 * A curve SketchUp drew as an arc or a circle is a run of straight edges
 * ({@link Edge.curveId}) and also this exact description. The arc is the set
 * of points `center + cos(t) * xAxis + sin(t) * yAxis` for `t` from
 * `startAngle` to `endAngle`. For a circle `xAxis` and `yAxis` are
 * perpendicular and both of length `radius`; an arc scaled non-uniformly keeps
 * its arc identity and stores an affine image of a circle, where they are not
 * (then `radius` is the length of `xAxis` only). Arcs and circles that bound a
 * face are arcs too. Lengths are in the model's units (inches), in the
 * definition's local space, like {@link Vertex.x}.
 */
interface ArcCurve {
    center: [number, number, number];
    /** Unit normal of the arc's plane. */
    normal: [number, number, number];
    /** Vector from the centre to the arc's start (length = radius). */
    xAxis: [number, number, number];
    /** `normal x xAxis`. */
    yAxis: [number, number, number];
    /** Start parameter in radians. */
    startAngle: number;
    /** End parameter in radians. A full circle has `endAngle === startAngle`
     * in a classic (pre-2021) file and `startAngle + 2 pi` in a 2021+ file;
     * {@link ArcCurve.isFullCircle} covers both. */
    endAngle: number;
    /** Length of `xAxis`. */
    radius: number;
    isFullCircle: boolean;
}
interface Face {
    id: number;
    loops: CoEdge[][];
    normal: [number, number, number];
    /** Material of the face's FRONT side, or null. */
    materialId: number | null;
    /** Material of the face's BACK side, or null. */
    backMaterialId: number | null;
    /**
     * Per-face texture mapping for a positioned / photo-fitted texture
     * (SketchUp's pins), or null when the texture is untouched (default
     * projection applies). A 9-element array: a 3x3 row-major matrix mapping
     * texture space -> face plane. To compute the UV of a point p (inches):
     *
     * 1. Plane basis from the face normal n: xr = normalize(Z x n),
     *    yr = n x xr (for a vertical n: xr = X, yr = +-Y by the sign of n.Z).
     * 2. uvq = [p.xr, p.yr, 1] @ inv(M) (row-vector convention).
     * 3. u = uvq[0]/uvq[2] / tileW, v = uvq[1]/uvq[2] / tileH with the
     *    material texture's tile size in inches.
     *
     * When the texture is untouched (null), the default is
     * u = (p.xr)/tileW, v = (p.yr)/tileH. Distorted (4-pin) mappings are
     * projective: uvq[2] != 1.
     */
    uvTransform: number[] | null;
    /** Same for the face's back side, or null. */
    uvTransformBack: number[] | null;
    /** The texture is PROJECTED (e.g. the Add Location terrain drape): its
     * UVs run in the projection plane's frame, not the face frame. */
    uvProjected: boolean;
    /** Same for the face's back side. */
    uvProjectedBack: boolean;
    /** Whether the face is hidden (SketchUp's "Hide" on this specific face,
     * not a layer/tag visibility toggle). */
    hidden: boolean;
}
/**
 * Whether SketchUp itself would DRAW this edge.
 *
 * SketchUp hides three kinds of edge: `hidden` (explicitly hidden), and
 * `soft`/`smooth` (the smoothing flags that make a faceted surface read as
 * curved). The last two are why a rounded model carries far more edges
 * than it appears to: every curve is triangles stitched together by edges
 * that exist to define the shape and are never shown.
 *
 * The flags are parsed and exposed on {@link Edge}, but nothing in this
 * library acts on them - an edge-consuming consumer (a wireframe or
 * hidden-line renderer built on {@link parseSkp} output) has to make the
 * call itself, and `edge.soft || edge.smooth || edge.hidden` is not
 * obvious as "SketchUp does not draw this" unless you already know the
 * format. Hence this helper.
 *
 * Measured across this repository's fixtures, 27.3% of edges are
 * non-drawable on aggregate - but that ranges from 0.2% on a mostly-flat
 * model to 66.1% on a curved-surface one, so the saving is concentrated
 * exactly where geometry is heaviest.
 *
 * ```ts
 * const model = parseSkp(buffer);
 * const visible = model.root.edges.filter(isDrawableEdge);
 * ```
 */
declare function isDrawableEdge(edge: Pick<Edge, 'soft' | 'smooth' | 'hidden'>): boolean;
interface CoEdge {
    edgeId: number;
    orientation: number;
}
/** A placed instance (component or group) inside a Definition's own instance list. */
interface Instance {
    name: string;
    refIdx: number;
    guid: string;
    matrix: number[];
    /**
     * Material painted onto the instance itself (SketchUp's "paint the
     * component"), or null. Faces inside the placed definition whose own
     * Face.materialId is null inherit this material - consumers must resolve
     * that inheritance themselves, like the official SDK does on export.
     */
    materialId: number | null;
    /** Whether the instance itself is hidden (SketchUp's "Hide" on this
     * specific component/group placement, not a layer/tag visibility
     * toggle). */
    hidden: boolean;
    /** This instance's own explicit layer override, or `''` when it has
     * none. An instance without an explicit override inherits its
     * *placement's* layer, which can only be resolved once the scene graph
     * is flattened - see `buildScene`'s `InstanceNode.layer` for that
     * resolved value. Populated for legacy (pre-2021 MFC) files, where the
     * layer id is read directly off the instance's drawbase record and
     * resolved to a name here; always `''` for modern (VFF) files, which
     * this reader doesn't currently resolve a per-instance layer id for. */
    layer: string;
    /** Arbitrary key/value dynamic attributes attached directly to this
     * instance (SketchUp's Dynamic Components), or `{}`. Populated for
     * legacy (pre-2021 MFC) files (see legacy.ts's
     * extractLegacyDynamicProperties); always `{}` for modern (VFF) files,
     * whose per-instance properties are only resolved lazily during scene
     * baking (see buildScene's InstanceNode.properties) rather than at
     * parse time. */
    properties: Record<string, string>;
}
interface Layer {
    name: string;
    color: {
        r: number;
        g: number;
        b: number;
    };
    /** Whether the layer's visibility is switched off. Only populated for
     * legacy (pre-2021 MFC) files, where the byte is read directly from the
     * layer record - modern (VFF) files derive layers from
     * `Layer_<name>`-prefixed materials, which carry no visibility data, so
     * this is always `false` there. */
    hidden: boolean;
}
/** A material's texture image, extracted from the SKP container. */
interface Texture {
    filename: string;
    width: number;
    height: number;
    data: Uint8Array | null;
}
/** A rendering style bundled in the file (SketchUp's Styles browser). */
interface Style {
    name: string;
    frontColor: [number, number, number] | null;
    backColor: [number, number, number] | null;
}
interface Material {
    name: string;
    color: {
        r: number;
        g: number;
        b: number;
        a: number;
    };
    transparency: number;
    id: number | null;
    texture: Texture | null;
    colorized: boolean;
    colorizeType: number;
}
interface InstanceNode {
    name: string;
    /** Whether `name` is a synthetic fallback (SketchUp's own internal
     * index, e.g. "Component_5") rather than a real name from the source
     * file - see InstancedNode.nameIsGenerated (instanced.ts) for the full
     * fallback-order rationale; both resolve a node's display name
     * identically. */
    nameIsGenerated: boolean;
    definitionName: string;
    layer: string;
    positionMm: [number, number, number];
    properties: Record<string, string>;
    /** Every OTHER attribute dictionary this instance carries, keyed by the
     * dictionary's own name, values stringified the same way `properties`
     * already is - `properties` stays exactly SketchUp's own Dynamic
     * Components data (`dynamic_attributes`) for backward compatibility;
     * third-party plugins (BIM/steel-detailing tools, etc.) commonly attach
     * their own richer per-instance data under their own dictionary name
     * instead, which this project never surfaced before (openskp#285). */
    attributeDictionaries: Record<string, Record<string, string>>;
    /** Real SketchUp instance GUID (VFF/2021+ files only), or `''` when the
     * source file has none - see InstancedNode.guid (instanced.ts). */
    guid: string;
    children: InstanceNode[];
}
interface MeshMetadata {
    name: string;
    definitionName: string;
    layer: string;
    positionMm: [number, number, number];
    properties: Record<string, string>;
    /** See InstanceNode.attributeDictionaries. */
    attributeDictionaries: Record<string, Record<string, string>>;
    path: string;
}
/** One triangulated, world-space mesh: all faces (or, for a face whose
 * front/back colors genuinely differ, all *one side* of those faces)
 * sharing a single resolved color from one flattened scene-graph position.
 * Ready to hand straight to a GLB/glTF exporter or any other renderer. */
interface GlbPrimitive {
    /** Flat [x, y, z, x, y, z, ...] vertex positions, in metres, Y-up. */
    positions: Float32Array;
    /** Flat [x, y, z, ...] vertex normals, matching `positions` 1:1. */
    normals: Float32Array;
    /** Flat [u, v, u, v, ...] texture coordinates, matching `positions` 1:1.
     * Computed from each source face's `uvTransform` (or the default
     * face-plane projection when a face has none) - see `Face.uvTransform`'s
     * docs for the formula. A vertex shared by two faces that disagree on UV
     * is split, since indexed glTF meshes need position/normal/uv aligned
     * per vertex. Faces with a PROJECTED texture (terrain-drape textures,
     * e.g. Add Location) still use the face-plane formula here, since the
     * real projection-plane basis isn't captured in the parsed data - their
     * UVs will be approximate. */
    uvs: Float32Array;
    /** Triangle vertex indices into `positions`/`normals`/`uvs` (3 per
     * triangle). */
    indices: Uint32Array;
    /** Index into `gltfMaterials` for this primitive's resolved color. */
    materialIndex: number;
    /** Matches the corresponding key in `SkpScene.meshIndex`. */
    geomName: string;
}
/**
 * The result of baking a parsed file's placed instances into a flat,
 * world-space 3D scene: every instance's geometry triangulated and
 * transformed into its final position, ready for rendering or GLB export.
 *
 * This is deliberately a *separate*, opt-in step from {@link SkpModel} -
 * for a file with many repeated instances, baking the scene can produce far
 * more data than the file's raw (per-definition, un-instanced) geometry, so
 * callers who only need the raw model data never pay for it.
 */
/**
 * Axis-aligned bounds of a scene's geometry, in the same frame as the
 * vertex data it summarises: metres, glTF Y-up.
 */
interface SceneBounds {
    min: [number, number, number];
    max: [number, number, number];
    /** `max - min` per axis. The model's overall size, which is what a
     * catalogue listing or a fit-to-view camera actually wants. */
    size: [number, number, number];
    /** Midpoint of `min` and `max`. */
    center: [number, number, number];
}
interface SkpScene {
    /** The root of the world-space instance tree. */
    sceneHierarchy: InstanceNode;
    /** Metadata for every baked mesh, keyed the same as `glbPrimitives`'
     * `geomName`. */
    meshIndex: Record<string, MeshMetadata>;
    /** The actual triangulated mesh data, one entry per unique
     * (definition, resolved color) combination actually placed in the scene. */
    glbPrimitives: GlbPrimitive[];
    /** glTF PBR material definitions referenced by `GlbPrimitive.materialIndex`.
     * A material whose source had a texture image carries a `baseColorTexture`
     * whose `index` points into {@link SkpScene.textures}. */
    gltfMaterials: unknown[];
    /** Axis-aligned bounds over every baked primitive, metres and Y-up, or
     * `null` when the scene has no geometry. Computed during the bake, so
     * reading it costs nothing extra - every consumer previously had to walk
     * the position buffers itself to get the model's size. */
    bounds: SceneBounds | null;
    /** The distinct texture images the placed materials use, deduplicated by
     * source bytes. Empty when nothing placed in the scene is textured.
     *
     * Kept out of `gltfMaterials` so a caller can decide whether to pay for
     * them: {@link toGLB} embeds these only when asked, since a model with a
     * handful of photographic textures is several times larger with them than
     * without. */
    textures: SceneTexture[];
}
/** Options shared by {@link buildScene} and {@link buildInstancedScene}. */
interface SceneOptions {
    /**
     * Skip geometry SketchUp itself would not draw.
     *
     * Today this means faces carrying SketchUp's "Hide" flag. It does NOT
     * filter edges, because neither scene builder emits edges: their output
     * is face triangles, and an edge's soft/smooth/hidden flags never reach
     * it. For edge-level filtering - which is where the real saving lives on
     * curved models - use {@link isDrawableEdge} on {@link parseSkp} output
     * directly.
     *
     * Off by default: what SketchUp draws is a display policy, not a parsing
     * fact, and some consumers legitimately want every face regardless.
     */
    respectEdgeVisibility?: boolean;
    /**
     * Emit every face once, double-sided with its FRONT material, instead of
     * adding a reversed back-side copy when the face's two sides resolve to
     * different colours.
     *
     * For consumers that treat a face as one unoriented surface - modelers,
     * CAD and editing tools that rebuild topology from the mesh - where the
     * coincident reversed copy reads as a second face: it makes the shared
     * edges non-manifold and z-fights with the front. Back-side paint is lost.
     *
     * Off by default: a viewer wants each side's own colour.
     */
    frontSideOnly?: boolean;
}
/**
 * Image type from the file's magic bytes. glTF only carries PNG and JPEG, so
 * anything else (TIFF from older SketchUp, say) reports null and the material
 * keeps its flat colour instead of embedding an image no viewer would read.
 */
declare function sniffImageMime(data: Uint8Array): 'image/png' | 'image/jpeg' | null;
/** One texture image referenced by {@link SkpScene.gltfMaterials}. */
interface SceneTexture {
    /** The image file's raw bytes, exactly as they were stored in the .skp. */
    data: Uint8Array;
    /** Sniffed from the bytes, not from `filename`: SketchUp records the
     * authoring machine's path, whose extension can disagree with the content. */
    mimeType: 'image/png' | 'image/jpeg';
    /** The material's texture path as recorded in the file. Informational: it
     * is usually an absolute path on the machine that authored the model. */
    filename: string;
}
/** Raw parsed data, source-agnostic (populated by either the VFF/ZIP path
 * in index.ts or the legacy MFC walker in legacy.ts), that
 * {@link buildModelFromParsed} turns into the final public
 * {@link SkpModel} - including scene-hierarchy resolution and GLB
 * primitive building, which both formats share. */
interface ParsedRawData {
    version: string;
    /** The model's unit-system string (e.g. "Millimeter"), read from
     * meta/meta.dat. null for legacy files or when the tag isn't found. */
    units: string | null;
    layerColors: Map<string, [number, number, number]>;
    layerHidden: Map<string, boolean>;
    layerIdToName: Map<number, string>;
    pages: RawPage[];
    dimensions: RawDimension[];
    materialIdToName: Map<number, string>;
    materialsMap: Map<string, Material>;
    materialsByFolder: Map<string, Material>;
    styles: Style[];
    defsDict: Map<number | string, ParsedDefinition>;
}
declare function buildModelFromParsed(parsed: ParsedRawData): SkpModel;
/** Face-plane basis vectors (xr, yr) for UV projection, from a face
 * normal. See `Face.uvTransform`'s docs for the recipe this implements.
 * Exported for edit.ts's own UV replay, which needs the identical basis
 * a source face's uvTransform was computed against. */
declare function faceUvBasis(n: [number, number, number]): {
    xr: [number, number, number];
    yr: [number, number, number];
};
/** UV of point p (inches, local/object space) on a face with the given
 * plane basis, per-face uvTransform (or null for the default projection),
 * and material tile size (inches). Exported for edit.ts's own UV replay. */
declare function computeFaceUv(p: [number, number, number], xr: [number, number, number], yr: [number, number, number], uvTransform: number[] | null | undefined, tileW: number, tileH: number): [number, number];
/**
 * Bake every instance actually placed in the model into world-space,
 * triangulated mesh data - SketchUp's component/group nesting fully
 * resolved and flattened, ready for a GLB export or any other renderer.
 *
 * This walks the *entire* placed scene graph, so for a file that reuses a
 * handful of definitions across many thousands of instances, the output
 * here can be far larger than the file's raw (un-instanced) geometry -
 * that's why it's a separate, opt-in step from {@link buildModelFromParsed}
 * rather than something every parse() pays for.
 */
declare function buildSceneFromParsed(parsed: ParsedRawData, options?: ParseOptions & SceneOptions): SkpScene;
declare function resolveMaterialFromMaps(matId: number | null | undefined, materialIdToName: Map<number, string>, materialsMap: Map<string, Material>, materialsByFolder: Map<string, Material>): Material | undefined;

/**
 * One reusable, DEFINITION-LOCAL triangulated mesh: the instanced
 * counterpart of {@link GlbPrimitive}, minus the world transform.
 *
 * Positions and normals stay in the definition's own local frame, so N
 * placements of the same definition share this one buffer set instead of
 * getting N transformed copies of it.
 *
 * Coordinates here are already converted to glTF conventions - metres,
 * Y-up - exactly like {@link GlbPrimitive}, so a consumer applies
 * {@link InstancedNode.matrix} (also glTF-space) and nothing else. The
 * SketchUp-space (inches, Z-up) values are never exposed on this type.
 */
interface LocalPrimitive {
    /** Flat [x, y, z, ...] positions in DEFINITION-LOCAL space, metres, Y-up. */
    positions: Float32Array;
    /** Flat [x, y, z, ...] local-space vertex normals, matching `positions` 1:1.
     *
     * Local, i.e. NOT transformed by any instance matrix: normal
     * transformation is deferred to the consumer/renderer, which derives it
     * from the node transform the same way glTF requires (inverse-transpose
     * of the upper-left 3x3). That is what keeps non-uniform and mirrored
     * scales correct without baking a per-instance copy of the buffer. */
    normals: Float32Array;
    /** Flat [u, v, ...] texture coordinates, matching `positions` 1:1.
     * Identical to the baked path's, since UVs are computed in local space
     * and an instance transform never changes them. */
    uvs: Float32Array;
    /** Triangle vertex indices (3 per triangle). */
    indices: Uint32Array;
    /** Index into {@link InstancedScene.gltfMaterials}. */
    materialIndex: number;
}
/**
 * A definition's geometry, resolved for one specific rendering context and
 * ready to be referenced by any number of {@link InstancedNode}s.
 *
 * One SketchUp definition can yield MORE than one resource: the same
 * component painted with two different materials, or placed on two layers
 * with different fallback colours, renders differently and therefore needs
 * a separate variant. See {@link InstancedMeshResource.variantKey}.
 */
interface InstancedMeshResource {
    /** Stable, deterministic id (`mesh_<n>`), assigned in first-encounter
     * order of the scene walk. Referenced by {@link InstancedNode.meshResourceId}. */
    id: string;
    /** The source definition's key in the parsed model (`'ROOT'` for
     * top-level loose geometry). */
    definitionId: number | string;
    definitionName: string;
    /** The rendering context that produced this variant - the effective
     * inherited material and layer fallback colour. Two placements sharing
     * this key share the resource; two that differ get separate variants.
     * Exposed for debugging and for callers that want to reason about why a
     * definition produced more than one resource. */
    variantKey: string;
    /** One entry per resolved material within the definition, mirroring the
     * baked path's per-(definition, colour) primitive split. */
    primitives: LocalPrimitive[];
}
/**
 * One placed node in the instanced scene graph.
 *
 * Carries the transform that places its {@link meshResourceId} (and its
 * whole subtree) into the scene, instead of that transform having been
 * baked into vertex data.
 */
interface InstancedNode {
    /** The instance's own name, `''` when unnamed (`'ROOT'` for the root). */
    name: string;
    /** Whether `name` is a synthetic fallback (SketchUp's own internal
     * index, e.g. "Component_5") rather than a real name from the source
     * file - no attribute-dictionary name/label/code override, no explicit
     * instance name, and no non-generic definition name were found. Lets a
     * consumer (e.g. Fragments export) avoid presenting a placeholder as if
     * it were real data. Mirrors Python's/C++'s own field of the same name. */
    nameIsGenerated: boolean;
    definitionName: string;
    /** Effective layer, with SketchUp's inheritance already resolved. */
    layer: string;
    /** The layer the instance carries itself, absent when it has none and
     * {@link layer} is inherited from its parent. Tells apart a child that
     * inherits its parent's layer from one explicitly assigned the same
     * layer, which `layer` alone cannot. */
    ownLayer?: string;
    /**
     * This node's transform RELATIVE TO ITS PARENT, as a 16-element
     * column-major glTF matrix (metres, Y-up) - directly usable as a glTF
     * node `matrix`, or as THREE.Matrix4.fromArray().
     *
     * Relative, not absolute: a consumer composes the chain by walking the
     * tree, exactly as glTF and every scene graph already do. The root node's
     * matrix is the identity.
     *
     * This is the ONLY place an instance's placement lives - the geometry it
     * points at stays in definition-local space.
     */
    matrix: number[];
    /** Absolute world position in millimetres, SketchUp axes (Z-up), rounded
     * to 2 decimals - the same value, in the same frame, that the baked
     * path's `InstanceNode.positionMm` reports, so metadata comparisons
     * between the two APIs line up. */
    positionMm: [number, number, number];
    /** Dynamic Component attributes attached to this instance, or `{}`. */
    properties: Record<string, string>;
    /** See model.ts's InstanceNode.attributeDictionaries - every OTHER
     * attribute dictionary this instance carries, keyed by the dictionary's
     * own name (openskp#285). */
    attributeDictionaries: Record<string, Record<string, string>>;
    /** Real SketchUp instance GUID (VFF/2021+ files only - legacy pre-2021
     * files carry no per-instance GUID here), or `''` when the source file
     * has none. Mirrors Python's/C++'s own field; a consumer keying on this
     * (e.g. Fragments export) is responsible for its own collision handling -
     * see openskp#290's rationale in fragments.ts for why a duplicated real
     * GUID needs the same synthetic-fallback treatment as a missing one. */
    guid: string;
    /** The mesh resource this node renders, or undefined for a node that
     * only groups children. */
    meshResourceId?: string;
    children: InstancedNode[];
}
/**
 * The result of {@link buildInstancedScene}: the placed scene graph with
 * SketchUp's instancing PRESERVED rather than baked out.
 *
 * Where {@link SkpScene} emits one world-space vertex buffer per placement,
 * this emits each distinct definition+context once ({@link meshResources})
 * and refers to it from every placement ({@link sceneHierarchy}). Scene
 * size therefore scales with *unique geometry + instance transforms*
 * instead of *definition geometry x placement count*.
 *
 * This is lossless: no decimation, quantisation or geometry approximation
 * of any kind. The triangles are the same triangles the baked path
 * produces, just stored once and referenced N times.
 */
interface InstancedScene {
    /**
     * Axis-aligned bounds of the scene as PLACED, metres and Y-up, or `null`
     * when nothing is placed.
     *
     * Computed by walking the node tree and transforming each referenced
     * resource's corners, so it describes where the model actually sits -
     * not the union of the local-space resources, which would be meaningless
     * as a model size. Matches {@link SkpScene.bounds} for the same file.
     */
    bounds: SceneBounds | null;
    /** Root of the placed instance tree (identity transform). */
    sceneHierarchy: InstancedNode;
    /** Every distinct (definition, rendering-context) mesh actually placed,
     * in deterministic first-encounter order. */
    meshResources: InstancedMeshResource[];
    /** glTF PBR materials referenced by {@link LocalPrimitive.materialIndex}.
     * Same shape and construction as {@link SkpScene.gltfMaterials}. */
    gltfMaterials: unknown[];
    /** Distinct texture images, deduplicated by source bytes - same as
     * {@link SkpScene.textures}. */
    textures: SceneTexture[];
    /** The source file's own per-layer visibility (VFF/2021+ only - see
     * `ParsedRawData.layerHidden`'s own comment on why legacy files default
     * every layer to visible), read straight from the raw parse. Mirrors
     * Python's/C++'s own field of the same name. */
    layerHidden: Record<string, boolean>;
    /** Every layer the file defines - used by a placement or not - with its
     * RGB colour (0-255), read straight from the raw parse. Lets a consumer
     * rebuild the file's tag list next to {@link InstancedNode.layer} and
     * {@link layerHidden} without a second, full `parseSkp` pass. Absent on
     * a scene read back with `fromFragments`, whose format carries no layer
     * colours. */
    layerColors?: Record<string, [number, number, number]>;
}

/**
 * The preview image SketchUp saves inside the file itself.
 *
 * Every model saved by SketchUp carries a rendered thumbnail, so a catalogue
 * or asset browser can show what a `.skp` contains without parsing its
 * geometry, spinning up a renderer, or generating a preview offline.
 */
interface SkpThumbnail {
    /** The image file's raw bytes, exactly as stored in the `.skp`. */
    data: Uint8Array;
    /** Sniffed from the bytes rather than the entry name. */
    mimeType: 'image/png' | 'image/jpeg';
    width: number;
    height: number;
    /**
     * Which stored image this came from.
     *
     * `model` is the model on a clean background - the one to show in a
     * catalogue. `preview` is the same view WITH SketchUp's red/green/blue
     * axis lines drawn in, which reads as clutter on a product card. `model`
     * is preferred and `preview` is only a fallback for a file that somehow
     * lacks it.
     */
    source: 'model' | 'preview';
}
/**
 * Extract the preview image SketchUp stored in a `.skp`.
 *
 * Cheap by design: this reads the container's own metadata entries and
 * never touches geometry, so listing a directory of models costs nothing
 * like {@link parseSkp} or {@link buildScene}.
 *
 * Returns `null` rather than throwing when the file simply has no usable
 * thumbnail, which includes two real cases:
 *
 * - **Legacy (pre-2021 MFC) files.** Those carry embedded PNGs too, but the
 *   container has no entry names, so a thumbnail cannot be told apart from
 *   a material's texture image without guessing. Returning `null` is
 *   honest; handing back a texture and calling it a preview would not be.
 * - **Modern files with no thumbnail entry**, e.g. one written by a tool
 *   other than SketchUp.
 *
 * A malformed container still throws {@link SkpParseError}, matching the
 * rest of the library.
 *
 * @param buffer - The raw file contents
 * @param options - Optional progress/log callbacks
 */
declare function extractThumbnail(buffer: ArrayBuffer, options?: ParseOptions): SkpThumbnail | null;

/** Options for {@link toFragments}. */
interface FragmentExportOptions {
    /** Model GUID / identifier. Default: "00000000-0000-0000-0000-000000000000". */
    modelId?: string;
    /** If true, returns raw uncompressed FlatBuffers buffer instead of zlib-deflated. Default: false. */
    raw?: boolean;
    /** Whether to set materials to double-sided. Default: false. */
    doubleSided?: boolean;
}
/**
 * Export an {@link InstancedScene} (from {@link buildInstancedScene}) directly to
 * ThatOpen Fragments (.frag) binary format.
 *
 * Uses official FlatBuffers bindings generated from ThatOpen's index.fbs schema,
 * with TRS matrix decomposition and scale/mirror geometry baking for full visual parity.
 *
 * @param scene - The instanced scene from buildInstancedScene()
 * @param options - Fragment export options
 * @returns Binary .frag file as Uint8Array (zlib deflated or raw FlatBuffers)
 */
declare function toFragments(scene: InstancedScene, options?: FragmentExportOptions): Uint8Array;
/**
 * Parse a real `.frag` file's bytes into an {@link InstancedScene} - the
 * mirror of {@link toFragments}. Accepts either the zlib-compressed wire
 * format (the default `toFragments`/real loader convention) or raw,
 * uncompressed FlatBuffers bytes; detected automatically the same way the
 * real `@thatopen/fragments` loader does, by attempting zlib inflation
 * first.
 *
 * Known gaps, matching Python's own read-side exactly (not independently
 * improved on here - see openskp#285): `positionMm`/`properties`/
 * `attributeDictionaries` on each node are left at their defaults, since
 * the Fragments format itself doesn't carry them separately from the
 * `Name` attribute this function does extract.
 */
declare function fromFragments(data: Uint8Array): InstancedScene;

/** Options for {@link toInstancedGLB}. */
interface InstancedGlbOptions {
    /** Embed the scene's texture images in the GLB and point each textured
     * material's `baseColorTexture` at them. Off by default, matching
     * {@link toGLB}: photographic textures can multiply the file size, and
     * the geometry alone is what most callers are after. */
    textures?: boolean;
}
/**
 * Export an {@link InstancedScene} to GLB (binary glTF 2.0), PRESERVING
 * instancing: each mesh resource is written to the binary buffer exactly
 * once, and every placement is a glTF node whose `mesh` points at it.
 *
 * This is what {@link toGLB} cannot do from a baked {@link SkpScene}, whose
 * primitives already have the world transform folded into their vertex
 * data - there is nothing left to share. Here, a component placed 1,000
 * times contributes one copy of its vertex/index buffers plus 1,000 node
 * transforms.
 *
 * A definition that resolves to several materials becomes ONE glTF mesh
 * with several primitives (the normal glTF representation), not several
 * nodes.
 *
 * {@link toGLB} is untouched and still produces exactly what it always has.
 *
 * @param scene - The result of {@link buildInstancedScene}
 * @param options - See {@link InstancedGlbOptions}
 * @returns GLB file as Uint8Array
 */
declare function toInstancedGLB(scene: InstancedScene, options?: InstancedGlbOptions): Uint8Array;

/**
 * Structured parse errors.
 *
 * {@link SkpParseError} carries *where* a parse failed - which stage, which
 * top-level record (and how many total), which TLV tag, which definition -
 * so a stuck or failed model in a production pipeline can be traced back to
 * an exact location instead of a bare stack trace.
 *
 * The original error is always preserved as `.cause`, so inspecting the
 * failure never loses information, it only adds context.
 */
type SkpParseStage = 'header' | 'zip_extract' | 'materials' | 'tlv_walk' | 'legacy_walk' | 'legacy_defs' | 'build_scene';
interface SkpParseErrorContext {
    stage?: SkpParseStage;
    recordIndex?: number;
    totalRecords?: number;
    tag?: string;
    offset?: number;
    definitionId?: number | string;
    cause?: unknown;
}
declare class SkpParseError extends Error {
    readonly stage?: SkpParseStage;
    readonly recordIndex?: number;
    readonly totalRecords?: number;
    readonly tag?: string;
    readonly offset?: number;
    readonly definitionId?: number | string;
    /** The original error that triggered this one, if any. */
    readonly cause?: unknown;
    constructor(message: string, context?: SkpParseErrorContext);
}

/**
 * Serialize a baked SkpScene's materials into Wavefront MTL text format.
 * Names are case-sensitive. Collisions gain _<1-based material index>
 * and, when needed, an additional _<n> suffix. Other names stay unchanged.
 *
 * @param scene The result of SkpFile.buildScene()
 * @returns The formatted MTL text string.
 */
declare function toMTL(scene: SkpScene): string;
/**
 * Serialize a baked SkpScene into Wavefront OBJ text format.
 * Names are case-sensitive. Collisions gain _<1-based material index>
 * and, when needed, an additional _<n> suffix. Other names stay unchanged.
 *
 * @param scene The result of SkpFile.buildScene()
 * @param mtlFilename Optional companion .mtl filename to reference.
 * @returns The formatted OBJ text string.
 */
declare function toOBJ(scene: SkpScene, mtlFilename?: string): string;
/**
 * Export a baked SkpScene directly to a Wavefront OBJ file and optional companion .mtl file.
 * Node.js environment only.
 *
 * @param scene The result of SkpFile.buildScene()
 * @param outputPath Destination file path (.obj)
 * @param exportMtl Whether to export companion .mtl file alongside .obj
 */
declare function exportOBJ(scene: SkpScene, outputPath: string, exportMtl?: boolean): void;

/**
 * Serialize a baked SkpScene into ASCII STL text format.
 *
 * @param scene The result of SkpFile.buildScene()
 * @param scale Optional scale factor (e.g. 1000.0 for mm)
 * @returns The formatted ASCII STL string.
 */
declare function toSTLAscii(scene: SkpScene, scale?: number): string;
/**
 * Serialize a baked SkpScene into Little-Endian Binary STL format.
 *
 * @param scene The result of SkpFile.buildScene()
 * @param scale Optional scale factor (e.g. 1000.0 for mm)
 * @returns Packed Little-Endian Uint8Array.
 */
declare function toSTLBinary(scene: SkpScene, scale?: number): Uint8Array;
/**
 * Export a baked SkpScene directly to an STL file.
 * Node.js environment only.
 *
 * @param scene The result of SkpFile.buildScene()
 * @param outputPath Destination file path (.stl)
 * @param options Export options (binary format flag, scale multiplier)
 */
declare function exportSTL(scene: SkpScene, outputPath: string, options?: {
    binary?: boolean;
    scale?: number;
}): void;

/**
 * Serialize a baked SkpScene into ASCII PLY text format.
 *
 * @param scene The result of SkpFile.buildScene()
 * @returns The formatted ASCII PLY string.
 */
declare function toPLYAscii(scene: SkpScene): string;
/**
 * Serialize a baked SkpScene into Little-Endian Binary PLY format.
 *
 * @param scene The result of SkpFile.buildScene()
 * @returns Packed Little-Endian Uint8Array.
 */
declare function toPLYBinary(scene: SkpScene): Uint8Array;
/**
 * Export a baked SkpScene directly to a PLY file.
 * Node.js environment only.
 *
 * @param scene The result of SkpFile.buildScene()
 * @param outputPath Destination file path (.ply)
 * @param options Export options (binary format flag)
 */
declare function exportPLY(scene: SkpScene, outputPath: string, options?: {
    binary?: boolean;
}): void;

declare const METRES_TO_INCHES = 39.37007874015748;
/**
 * Serialize a baked SkpScene into AutoCAD R2000 (AC1015) 3D ASCII DXF format.
 * Uses the AutoCAD 100% compliant template scaffold with Windows CRLF (\r\n) line endings.
 *
 * @param scene The result of SkpFile.buildScene()
 * @param scale Scale factor for vertex coordinates (default: METRES_TO_INCHES)
 * @param mode Export mode ('3dface' or 'polyface', default: '3dface')
 * @returns Formatted ASCII DXF text string with Windows CRLF newlines.
 */
declare function toDXF(scene: SkpScene, scale?: number, mode?: '3dface' | 'polyface'): string;
/**
 * Export a baked SkpScene directly to an AutoCAD R2000 3D DXF file.
 * Node.js environment only.
 *
 * @param scene The result of SkpFile.buildScene()
 * @param outputPath Destination file path (.dxf)
 * @param scale Scale factor for vertex coordinates (default: METRES_TO_INCHES)
 * @param mode Export mode ('3dface' or 'polyface', default: 'polyface')
 */
declare function exportDXF(scene: SkpScene, outputPath: string, scale?: number, mode?: '3dface' | 'polyface'): void;

declare function generateIFCGUID(): string;
/**
 * Map a geometry/component name to an IFC4 entity type and constructor.
 *
 * Tries the component's own name first, then falls back to `layerName`
 * (many SketchUp-for-BIM workflows organize by tag/layer - "Walls",
 * "Doors" - even when individual components are never renamed away from
 * SketchUp's own defaults like "Component#109415"), then falls back to a
 * generic, untyped element if neither matches.
 */
declare function classifyElement(geomName: string, layerName?: string): [string, string];
/**
 * Serialize a baked SkpScene to ISO-10303-21 STEP ASCII IFC4 format.
 *
 * @param classifier - Optional override for {@link classifyElement}, called
 * as `classifier(geomName, layerName)` and expected to return the same
 * `[STEP_ENTITY_TYPE, IFC_CLASS_NAME]` tuple - use this to supply your own
 * naming convention or metadata-driven typing instead of the built-in
 * keyword/layer heuristic.
 */
declare function toIFC(scene: SkpScene, scale?: number, schema?: string, classifier?: (geomName: string, layerName: string) => [string, string]): string;
/**
 * Export a baked SkpScene to an IFC4 file.
 */
declare function exportIFC(scene: SkpScene, outputPath: string, scale?: number, schema?: string, classifier?: (geomName: string, layerName: string) => [string, string]): void;

/**
 * Generate TypeScript source that, when run, rebuilds `model` from scratch
 * via `create()`/`SkpBuilder` - a faithful, human-readable, re-runnable
 * transcript of the model as writer API calls, not a serialized dump.
 *
 * Handles: materials (solid and textured, including default-projection and
 * explicitly-pinned UVs), layers, component/group definitions (built in
 * dependency order), faces (front/back material, holes), instances
 * (transform, instance-level paint, instance-level name).
 *
 * Found and fixed via diffing a real, large file (jeff.skp: 2713
 * definitions, 113643 faces) against its own regenerated output - an
 * earlier prototype this module replaced silently dropped instance-level
 * paint (95% of that file's instances) and every instance's own name
 * entirely, and never emitted textured materials at all.
 *
 * Only reproduces geometry reachable by walking faces (`Definition.faces`)
 * - a real file's standalone/construction edges and curves that don't
 * bound any face are NOT reproduced (found via the same real-fixture
 * diffing: one real file's "shelf2B" definition turned out to be 4088 of
 * its 5196 edges loose reference geometry, none of it visible surface
 * area). This does not affect materials, textures, instance paint, or any
 * face/surface geometry - only invisible construction/reference lines.
 *
 * Also not yet handled (matching this project's established disclosure
 * pattern for known gaps): colorized material tint, per-face
 * hidden/soft/smooth edge flags, section planes, text/dimension entities.
 * A model using any of these round-trips its geometry/materials/instances
 * correctly; those specific facts are silently dropped.
 *
 * A face a few millionths of an inch off its own fitted plane (common in
 * real files - floating-point noise, not a modeling error) is
 * auto-triangulated rather than rejected, mirroring real SketchUp's own
 * tolerance - matches the input's face count unless triangulation was
 * actually needed, in which case one input face becomes 2+ (visually
 * identical, more triangles internally).
 *
 * Every textured face is emitted with explicit `frontUv`/`backUv` (3 real
 * vertices + their actual rendered UV, via `computeFaceUv`/`faceUvBasis` -
 * the same formula the reader/renderer use), never left to the writer's
 * default projection - this reproduces the source file's rendering exactly
 * regardless of whether it originally used a pin or the default
 * projection, and sidesteps `addTextureMaterial`'s default applied-height
 * sentinel corrupting the result (see `addTextureMaterial`'s own note in
 * create.ts). A 4-pin *projective* (non-affine) source mapping can't be
 * reproduced exactly this way - front_uv is an affine (3-point) fit, the
 * same limitation the writer itself already has.
 */
declare function toTypeScriptCode(model: SkpModel): string;

type Point3 = [number, number, number];
/** Row-major 3x3 matrix, 9 values: [m00,m01,m02, m10,m11,m12, m20,m21,m22]. */
type Matrix3x3 = [number, number, number, number, number, number, number, number, number];
/** A (world point, (u, v)) correspondence for explicit texture positioning
 * - see `addFace`'s `frontUv`/`backUv` options. */
type UvPair = [Point3, [number, number]];
/** An alternative to a hand-derived `matrix3x3` for the common case of a
 * pure rotation - see `_rotationMatrix3x3`. */
interface Rotation {
    axis: Point3;
    angleRadians: number;
}
/** Custom key/value metadata value - the same mechanism SketchUp's own
 * "dynamic component" attributes use. A whole-number value within signed
 * 32-bit range is stored as a compact int32; any other number (including
 * a large integer, matching what Python's writer would reject as an
 * out-of-range `int`) is stored as a float64. TypeScript has no
 * runtime-visible int/float distinction the way Python does, so unlike
 * Python's writer (which raises for an out-of-range `int` rather than
 * silently widening it) this widens instead - a deliberate, documented
 * judgment call. */
type AttributeValue = string | number;
type AttributeDict = Record<string, AttributeValue>;
/** Raised when a `.skp` file cannot be constructed. */
declare class SkpWriteError extends Error {
    constructor(message: string);
}
/**
 * Growable byte buffer for the archive writers. A plain `number[]` costs
 * about 9 bytes of heap per file byte (one boxed element each) and
 * `toBytes()` then copied the whole archive twice more, so a 60 MB write
 * needed ~1.7 GB of transient heap. A `Uint8Array` that doubles on demand
 * keeps it at file size, with identical output.
 *
 * `push(...values)` is for the record writers' few-byte writes (a u32, an
 * f64, a string header). Whole buffers go through `append`: spreading a
 * large buffer into a call blows the engine's argument limit (~100k,
 * engine-dependent), the real bug the old `appendAll` loop existed to
 * avoid when `toBytes()` spliced multi-hundred-KB buffers together.
 */
declare class GrowableBytes {
    buf: Uint8Array;
    length: number;
    constructor(capacity?: number);
    private reserve;
    push(...values: number[]): void;
    append(src: ArrayLike<number>): void;
    /** The bytes written so far, without copying. */
    view(): Uint8Array;
}
interface CurveParams {
    center: Point3;
    normal: Point3;
    xaxis: Point3;
    startAngle: number;
    endAngle: number;
    radius: number;
    numSegments: number;
}
/** Write-side mirror of legacy.ts's archive slot/class-ref bookkeeping -
 * emits the same MFC CArchive tag protocol (0xFFFF new-class,
 * 0x8000|slot short class-ref, plain u16 back-ref) that legacy.ts
 * decodes, inverted for writing. */
declare class ArchiveWriter {
    nextSlot: number;
    classSlot: Record<string, number>;
    nextPid: number;
    bytes: GrowableBytes;
    private dimFontSlot;
    constructor(nextSlot: number, classSlot: Record<string, number>, nextPid?: number);
    get length(): number;
    private alloc;
    private allocPid;
    private pushU8;
    private pushU16;
    private pushU32;
    private pushI32;
    private pushF64;
    private pushBytes;
    private pushZeros;
    private patchU32;
    newOfKnownClass(className: string, schema?: number): number;
    private writeNull;
    writeBackref(slot: number): void;
    private encodePid;
    preamble(pid?: number, realAttrs?: boolean): void;
    preambleWithRealAttrs(frontMatrix?: readonly number[], backMatrix?: readonly number[], attributeDicts?: ReadonlyArray<[string, AttributeDict]>, pid?: number): void;
    /** Shares writeAttributeDict's own exact validation rules so a caller
     * can check every attribute dict a multi-part write will need BEFORE
     * that write starts mutating this.bytes. */
    validateAttributeEntries(entries: AttributeDict): void;
    writeAttributeDict(dictName: string, entries: AttributeDict): void;
    /** Write one CFaceTextureCoords record. `frontMatrix`/`backMatrix` are
     * the 9-value row-major UV-to-world affine matrices from
     * uvMatrixForFace, or undefined for a side that isn't explicitly
     * positioned (written as identity). */
    writeFaceTextureCoords(frontMatrix?: readonly number[], backMatrix?: readonly number[]): void;
    private drawbase;
    private writeVertex;
    /** Write one CArcCurve record and return its slot - the shared
     * geometric-parameter object a circle/arc's straight CEdge segments
     * each carry a backref to. `xaxis` is the arc's own fixed 0-angle
     * reference direction (a unit vector times radius, in the plane
     * perpendicular to normal) - startAngle/endAngle are offsets from it. */
    writeArcCurve(p: CurveParams): number;
    /** Write one CCurve record and return its slot - a freeform polyline
     * curve grouping: a labeled set of already-straight CEdge segments,
     * with no geometric data of its own beyond how many edges share it. */
    writeCurve(numEdges: number): number;
    private writeStr;
    /** Write the first dimension/text's CSkFont record inline, or back-ref
     * the one already written earlier in this file - shared 1-per-file
     * state, same as create.py's own `_dim_font_slot`. */
    private writeDimFontRef;
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
    writeDimension(p1: Point3, p2: Point3, offset?: number): void;
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
    writeText(text: string, point: Point3, leader?: Point3): void;
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
    writeConstructionLine(point: Point3, point2?: Point3, direction?: Point3): void;
    /** Add a construction/guide point (SketchUp's Construction Point tool)
     * at `position` (inches, world space).
     *
     * Ground truth (real SketchUp 2025, SDK/Ruby cross-checked): a second,
     * always-zero 3-double block and a trailing zero byte follow the
     * position - reserved/unused, written as zero to match every real-file
     * sample seen. */
    writeConstructionPoint(position: Point3): void;
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
    writeSectionPlane(point: Point3, normal: Point3): void;
    /** Write one solid-color CMaterial record and return its slot. */
    writeMaterial(name: string, rgba: readonly [number, number, number, number], opacity?: number): number;
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
    writeTexturedMaterial(name: string, imageBytes: Uint8Array, texturePath: string, subtype: number, appliedHeight?: number, appliedWidth?: number, opacity?: number): number;
    /** Write one CLayer record and return its slot. Ground truth shows
     * each top-level layer record contains a second, embedded pid - so
     * each layer consumes 2 pids, not 1. `withPids=false` (used only for
     * the layer a component definition embeds internally) omits both. */
    writeLayer(name: string, withPids?: boolean, hidden?: boolean, rgba?: readonly [number, number, number, number]): number;
    /** Write a CThumbnail with a default camera and no image - ground
     * truth shows the image itself is optional. */
    writeThumbnail(): void;
    /** Begin a CComponentDefinition record - everything up to (not
     * including) its internal entity list. Returns [definitionSlot,
     * countPatchPos]. */
    writeDefinitionHeader(attributeDicts?: ReadonlyArray<[string, AttributeDict]>): [number, number];
    /** Close out a CComponentDefinition record: relationship count, GUID,
     * name, timestamp, behavior flags, and a default thumbnail. */
    writeDefinitionTail(name: string, isGroup?: boolean): number;
    private writeInstanceLike;
    /** Write one CComponentInstance placing a copy of `definitionSlot` and
     * return how many new root-entity-list slots it consumed (always 1). */
    writeInstance(definitionSlot: number, name: string, translation?: Point3, matrix3x3?: Matrix3x3, instanceMaterial?: number, instanceLayer?: number, attributeDicts?: ReadonlyArray<[string, AttributeDict]>, hidden?: boolean): number;
    /** Write one CGroup placing a copy of `definitionSlot` - structurally
     * almost identical to writeInstance; the real differences are its
     * class name/schema and its attribute pointer: unlike CComponentInstance
     * (which always carries a real, if often empty, CAttributeContainer), a
     * group only gets one when `attributeDicts` is actually given - matching
     * writeFace's conditional pattern instead. A real production Group WITH
     * attributes (SketchUp 2020 export, ground truth) carries a genuine
     * CAttributeContainer at this exact schema; a never-attributed group
     * still correctly gets a null pointer either way (openskp#261). */
    writeGroup(definitionSlot: number, name: string, translation?: Point3, matrix3x3?: Matrix3x3, groupMaterial?: number, groupLayer?: number, attributeDicts?: ReadonlyArray<[string, AttributeDict]>, hidden?: boolean): number;
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
    writeImage(definitionSlot: number, translation?: Point3, matrix3x3?: Matrix3x3, imageLayer?: number, hidden?: boolean): number;
    /** Write a chain of straight CEdge records connecting `points` in
     * order, sharing vertices/edges via `vertexSlots`/`edgeRegistry`.
     * `closed=true` also connects the last point back to the first.
     * Returns [edgeSlots, edgeSenses, newEntities]. At most one of
     * `curveParams`/`polylineNumEdges` should be given - ground truth
     * shows the shared curve object is declared inline as the FIRST
     * newly-declared edge's own "curve" field. */
    private writeEdgeChain;
    /** Write a partial (open) arc as a chain of straight CEdge records - no
     * face. Returns how many new root-entity-list slots were consumed. */
    writeArc(points: readonly Point3[], vertexSlots: Map<string, number>, edgeRegistry: Map<string, [number, number]>, curveParams: CurveParams, hiddenEdges?: boolean, softEdges?: boolean, smoothEdges?: boolean): number;
    /** Write a freeform polyline curve - a chain of straight CEdge records
     * connecting `points` in order, all sharing one CCurve grouping, no
     * face. Returns how many new root-entity-list slots were consumed. */
    writePolyline(points: readonly Point3[], vertexSlots: Map<string, number>, edgeRegistry: Map<string, [number, number]>, closed?: boolean, hiddenEdges?: boolean, softEdges?: boolean, smoothEdges?: boolean): number;
    /** Write one planar face and return how many new root-entity-list
     * slots it consumed (edges newly declared, plus the face itself).
     * `points` form a closed polygon in order (do not repeat the first
     * point). `holes`, if given, cuts out independent closed polygons -
     * ground truth (an SDK-authored window-in-a-wall face) shows a hole is
     * just another CLoop, distinguished only by its first flag byte (0
     * instead of 1). */
    writeFace(points: readonly Point3[], vertexSlots: Map<string, number>, edgeRegistry: Map<string, [number, number]>, faceMaterial?: number, faceLayer?: number, backMaterial?: number, hidden?: boolean, softEdges?: boolean, smoothEdges?: boolean, hiddenEdges?: boolean, frontUv?: readonly UvPair[], backUv?: readonly UvPair[], attributeDicts?: ReadonlyArray<[string, AttributeDict]>, curveParams?: CurveParams, holes?: ReadonlyArray<readonly Point3[]>): number;
}
interface AddFaceOptions {
    material?: number;
    layer?: number;
    backMaterial?: number;
    hidden?: boolean;
    softEdges?: boolean;
    smoothEdges?: boolean;
    hiddenEdges?: boolean;
    /** Explicitly position the front side's texture instead of the
     * default planar projection: exactly 3 (point, (u, v)) pairs. */
    frontUv?: UvPair[];
    backUv?: UvPair[];
    attributes?: AttributeDict;
    attributeDictName?: string;
    /** Fan-triangulate a non-coplanar polygon instead of throwing. */
    autoTriangulate?: boolean;
    holes?: Point3[][];
}
interface AddCircleOptions {
    numSegments?: number;
    material?: number;
    layer?: number;
    backMaterial?: number;
    hidden?: boolean;
    frontUv?: UvPair[];
    backUv?: UvPair[];
    attributes?: AttributeDict;
    attributeDictName?: string;
}
interface AddArcOptions {
    numSegments?: number;
    hiddenEdges?: boolean;
    softEdges?: boolean;
    smoothEdges?: boolean;
}
interface AddPolylineOptions {
    closed?: boolean;
    hiddenEdges?: boolean;
    softEdges?: boolean;
    smoothEdges?: boolean;
}
interface AddInstanceOptions {
    name?: string;
    translation?: Point3;
    matrix3x3?: Matrix3x3;
    rotation?: Rotation;
    material?: number;
    layer?: number;
    attributes?: AttributeDict;
    attributeDictName?: string;
    hidden?: boolean;
}
interface AddImageOptions {
    translation?: Point3;
    matrix3x3?: Matrix3x3;
    rotation?: Rotation;
    layer?: number;
    hidden?: boolean;
    /** Stored as-is in the image material's own texture-path field (SketchUp
     * shows it as the source file's original path); has no effect on the
     * embedded image bytes themselves. */
    texturePath?: string;
}
interface AddGroupInstanceOptions {
    name?: string;
    translation?: Point3;
    matrix3x3?: Matrix3x3;
    rotation?: Rotation;
    material?: number;
    layer?: number;
    attributes?: AttributeDict;
    attributeDictName?: string;
    hidden?: boolean;
}
interface AddComponentDefinitionOptions {
    attributes?: AttributeDict;
    attributeDictName?: string;
}
interface AddGroupOptions {
    name?: string;
    translation?: Point3;
    matrix3x3?: Matrix3x3;
    rotation?: Rotation;
    material?: number;
    layer?: number;
    attributes?: AttributeDict;
    attributeDictName?: string;
    hidden?: boolean;
}
type GroupPlacement = [Point3, Matrix3x3 | undefined, number, number, ReadonlyArray<[string, AttributeDict]>, boolean];
/**
 * Accumulates one component/group definition's geometry. Construct via
 * `SkpBuilder.addComponentDefinition`/`SkpBuilder.addGroup`, not
 * directly - the build callback runs synchronously; use the returned
 * (already-closed) builder for `addInstance`.
 *
 * ```ts
 * const chair = builder.addComponentDefinition('Chair', (def) => {
 *   def.addFace([[0, 0, 0], [20, 0, 0], [20, 20, 0], [0, 20, 0]]);
 * });
 * builder.addInstance(chair, { translation: [100, 0, 0] });
 * ```
 */
declare class ComponentDefinitionBuilder {
    readonly slot: number;
    readonly name: string;
    /** @internal */
    _skp: SkpBuilder;
    private countPatchPos;
    private vertexSlots;
    private edgeRegistry;
    private newEntityCount;
    private closed;
    private groupPlacement?;
    private groupFlagPos?;
    /** @internal */
    constructor(skp: SkpBuilder, slot: number, name: string, countPatchPos: number, groupPlacement?: GroupPlacement);
    private checkWritable;
    addFace(points: readonly Point3[], options?: AddFaceOptions): void;
    addCircle(center: Point3, normal: Point3, radius: number, options?: AddCircleOptions): void;
    addArc(center: Point3, normal: Point3, radius: number, startAngle: number, endAngle: number, options?: AddArcOptions): void;
    addPolyline(points: readonly Point3[], options?: AddPolylineOptions): void;
    /** Place one instance of another, already-closed component definition
     * inside this one - the same nesting real SketchUp supports.
     * `definition` must come from this same builder, and be a different,
     * already-closed definition (never `this`). */
    addInstance(definition: ComponentDefinitionBuilder, options?: AddInstanceOptions): void;
    /** Place another, already-closed component definition inside this one
     * as a *group* rather than a component instance. A nested group can't
     * be declared inline - build the group's geometry with a normal
     * `addComponentDefinition` first, then place it here. */
    addGroupInstance(definition: ComponentDefinitionBuilder, options?: AddGroupInstanceOptions): void;
    /** @internal called automatically once the defining callback (passed
     * to addComponentDefinition/addGroup) returns. */
    _close(): void;
}
/**
 * Accumulates geometry and writes it into a new legacy-format (v17)
 * `.skp` file. Construct via `create()`, not directly.
 */
declare class SkpBuilder {
    private data;
    private materialInsertPos;
    private base;
    private layerCountPos;
    private origLayerCount;
    private layerInsertPos;
    private defCountPos;
    private origDefCount;
    private rootCountPos;
    private origRootCount;
    private tailPos;
    private scaffoldNextSlot;
    private scaffoldClassSlot;
    private materialWriter;
    /** Every material registered so far, by name - populated by
     * addMaterial/addTextureMaterial as a side effect. */
    readonly materialsByName: Map<string, number>;
    private materialCount;
    private layerWriterBase;
    private layerWriter;
    private layerWriterStart;
    /** Every layer registered so far, by name - populated by addLayer. */
    readonly layersByName: Map<string, number>;
    private layerCount;
    private definitionWriterInstance;
    private definitionWriterStart;
    private definitionCount;
    private openDefinition;
    private pendingGroups;
    private geometryWriter;
    private vertexSlots;
    private edgeRegistry;
    private newEntityCount;
    private faceCount;
    constructor();
    addMaterial(name: string, rgba: readonly number[], opacity?: number): number;
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
    addTextureMaterial(name: string, imageBytes: Uint8Array, texturePath?: string, appliedHeight?: number, appliedWidth?: number, opacity?: number): number;
    addLayer(name: string, options?: {
        color?: readonly number[];
        hidden?: boolean;
    }): number;
    /** @internal Reject a material/backMaterial option that isn't a handle
     * this builder's own addMaterial()/addTextureMaterial() actually
     * returned. Without this, a stray value - most commonly a layer handle
     * passed to the wrong option by mistake - gets written straight into
     * the file as a material reference: this project's own reader tolerates
     * the dangling reference silently, but real SketchUp rejects the whole
     * file as corrupt on open, with no indication of which call caused it. */
    _checkMaterialHandle(value: number | undefined, param: string): void;
    /** @internal Reject a layer option that isn't a handle this builder's
     * own addLayer() actually returned - see `_checkMaterialHandle` for why
     * this matters. */
    _checkLayerHandle(value: number | undefined, param?: string): void;
    private materialShiftedClassSlot;
    private layerShift;
    private postLayerClassSlot;
    private startDefinition;
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
    addComponentDefinition(name: string, build: (def: ComponentDefinitionBuilder) => void, options?: AddComponentDefinitionOptions): ComponentDefinitionBuilder;
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
    addGroup(build: (def: ComponentDefinitionBuilder) => void, options?: AddGroupOptions): ComponentDefinitionBuilder;
    private definitionShift;
    private postDefinitionClassSlot;
    /** Place one instance of `definition` (from addComponentDefinition,
     * already closed) in the model. `rotation`, if given, is an
     * alternative to `matrix3x3` for the common case of a pure rotation. */
    addInstance(definition: ComponentDefinitionBuilder, options?: AddInstanceOptions): void;
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
    addImage(imageBytes: Uint8Array, width: number, height: number, options?: AddImageOptions): void;
    private ensureGeometryWriter;
    /** Add one planar face, defined by 3+ coplanar points (inches) forming
     * a closed polygon in order - do not repeat the first point. Vertices
     * and edges are automatically shared with previously-added faces
     * wherever a point's coordinates match exactly. */
    addFace(points: readonly Point3[], options?: AddFaceOptions): void;
    /** Add one circular face - a true SketchUp circle (editable by radius,
     * re-tessellatable), not `numSegments` disconnected straight edges. */
    addCircle(center: Point3, normal: Point3, radius: number, options?: AddCircleOptions): void;
    /** Add one partial (open) arc - a genuine SketchUp arc entity, edges
     * only, no face. `startAngle`/`endAngle` (radians) measure the sweep
     * from an arbitrary but fixed reference direction in the arc's plane. */
    addArc(center: Point3, normal: Point3, radius: number, startAngle: number, endAngle: number, options?: AddArcOptions): void;
    /** Add one freeform polyline curve - a chain of straight edges grouped
     * into one genuine SketchUp "Curve" entity, no face. */
    addPolyline(points: readonly Point3[], options?: AddPolylineOptions): void;
    /** Add a FREE linear dimension between two explicit points (inches,
     * world space). `offset` is the dimension line's offset from the
     * measured segment, in inches (signed). See ArchiveWriter.writeDimension
     * for the record's ground truth. */
    addDimension(p1: Point3, p2: Point3, offset?: number): void;
    /** Add a leader text (SketchUp's Text tool) anchored at `point` (inches,
     * world space), with the label floating at `point + leader` and a
     * leader line joining them. See ArchiveWriter.writeText for the
     * record's ground truth. */
    addText(text: string, point: Point3, leader?: Point3): void;
    /** Add a construction/guide line (SketchUp's Construction Line tool).
     * Pass exactly one of `point2` (a bounded segment between `point` and
     * `point2`, matching `Entities#add_cline(p1, p2)`) or `direction` (an
     * unbounded guide line through `point`, matching
     * `Entities#add_cline(point, vector)`). See
     * ArchiveWriter.writeConstructionLine for the record's ground truth. */
    addConstructionLine(point: Point3, options?: {
        point2?: Point3;
        direction?: Point3;
    }): void;
    /** Add a construction/guide point (SketchUp's Construction Point tool)
     * at `position` (inches, world space). See
     * ArchiveWriter.writeConstructionPoint for the record's ground truth. */
    addConstructionPoint(position: Point3): void;
    /** Add a section plane (SketchUp's Section Plane tool) through `point`
     * with the given `normal` (need not be unit length), matching
     * `Entities#add_section_plane([point, normal])`. See
     * ArchiveWriter.writeSectionPlane for the record's ground truth. */
    addSectionPlane(point: Point3, normal: Point3): void;
    /** Return the finished file's bytes. */
    toBytes(): Uint8Array;
    /** Write the finished file to `path` (Node.js only). */
    save(path: string): void;
    /** @internal */
    _definitionWriter(): ArchiveWriter;
    /** @internal */
    _patchDefinitionCount(countPatchPos: number, count: number): void;
    /** @internal */
    _clearOpenDefinition(): void;
    /** @internal */
    _pushPendingGroup(comp: ComponentDefinitionBuilder, placement: GroupPlacement): void;
}
/**
 * Start building a new legacy-format (v17) `.skp` file from scratch.
 *
 * ```ts
 * const builder = create();
 * const red = builder.addMaterial('Red', [255, 0, 0]);
 * const roof = builder.addLayer('Roof');
 * builder.addFace([[0, 0, 0], [100, 0, 0], [100, 100, 0], [0, 100, 0]], { material: red, layer: roof });
 * builder.save('output.skp');
 * ```
 *
 * See this module's own docstring for the current scope and limitations
 * (no inline-declared nested groups; inches only).
 */
declare function create(): SkpBuilder;

/**
 * Parse `source` (a legacy-format `.skp` file - either a filesystem path,
 * Node.js only, or an already-loaded `ArrayBuffer`, which works in the
 * browser too) and rebuild it as a new `SkpBuilder`, replaying materials,
 * layers, every component definition, and all root-level geometry/
 * instances.
 *
 * Returns `{ builder, warnings, definitions }`:
 *
 * - `builder` is ready for more addFace/addCircle/addInstance/etc. calls
 *   before `builder.toBytes()`/`builder.save()`. Every material and layer
 *   the source file had is already reachable via `builder.materialsByName`/
 *   `builder.layersByName` - reuse one as e.g. `addFace(points, {material:
 *   builder.materialsByName.get('Walnut')})`. A file-format ordering
 *   requirement this writer has always had (materials/layers/definitions
 *   must be finalized before any geometry is written) means a genuinely
 *   NEW material/layer/definition/group can no longer be added to
 *   `builder` at this point, since replaying the source's own root-level
 *   geometry already finalized all of those sections - build anything new
 *   into a SEPARATE `create()` builder instead.
 * - `warnings` lists anything from the source file that couldn't be
 *   faithfully reproduced (see this module's own docstring for the exact,
 *   deliberately-scoped gaps this draws from).
 * - `definitions` maps each replayed component definition's own name to
 *   its (already-closed) `ComponentDefinitionBuilder`, so the caller can
 *   place additional instances of something the source file already
 *   defined via `builder.addInstance(definitions.get('Wheel')!, {
 *   translation: ... })`. If two source definitions share a name, the
 *   later one wins - real SketchUp allows duplicate component names, this
 *   package's writer doesn't need them to be unique, only this
 *   convenience lookup does.
 *
 * @throws SkpWriteError if `source` isn't a legacy-format file.
 */
declare function openExisting(source: string | ArrayBuffer): {
    builder: SkpBuilder;
    warnings: string[];
    definitions: Map<string, ComponentDefinitionBuilder>;
};

/**
 * Parse a SketchUp (.skp) file from an ArrayBuffer.
 *
 * Transparently handles both the modern VFF/ZIP container (SketchUp 2021+)
 * and the classic pre-2021 MFC CArchive container (SketchUp 2013-2020).
 *
 * Fast and memory-light regardless of file size: this returns each
 * definition's raw geometry exactly once, with no scene-graph instancing
 * resolved. For a flattened, triangulated, world-space scene ready for
 * rendering or GLB export, see {@link buildScene} - a separate, opt-in
 * step, since baking every placed instance can produce far more data than
 * the file's raw geometry.
 *
 * @param buffer - The raw file contents as an ArrayBuffer
 * @param options - Optional progress/log callbacks (see {@link ParseOptions})
 * @returns Parsed SkpModel with full geometry and metadata
 */
declare function parseSkp(buffer: ArrayBuffer, options?: ParseOptions): SkpModel;
/**
 * Bake every instance actually placed in the model into world-space,
 * triangulated mesh data, ready for a GLB export or any other renderer.
 * See {@link buildSceneFromParsed} for the full explanation of why this is
 * separate from {@link parseSkp}.
 *
 * Independent of parseSkp(): calling both re-parses the raw TLV data once
 * per call rather than sharing it, trading a bit of extra CPU time for
 * keeping each call's memory footprint no larger than what it actually
 * needs.
 *
 * @param options - Optional progress/log callbacks (see {@link ParseOptions})
 */
declare function buildScene(buffer: ArrayBuffer, options?: ParseOptions & SceneOptions): SkpScene;
/**
 * Build the placed scene graph with SketchUp's INSTANCING PRESERVED: each
 * distinct definition is triangulated once, in its own local space, and
 * every placement is a node carrying the transform that puts it there.
 *
 * Use this instead of {@link buildScene} when a model reuses components:
 * buildScene() bakes each placement into its own world-space vertex
 * buffers, so its output grows with `definition geometry x placement
 * count`, while this grows with `unique geometry + instance transforms`. A
 * chair placed 1,000 times costs one copy of the chair here.
 *
 * Losslessly: this performs NO decimation, quantisation or any other
 * approximation. The triangles, UVs, normals, materials and metadata are
 * the ones {@link buildScene} produces - stored once and referenced, rather
 * than copied per placement.
 *
 * Units and axes match {@link buildScene}'s GLB output: geometry and node
 * matrices are in metres, glTF Y-up (`InstancedNode.matrix` is a
 * 16-element column-major, parent-relative glTF matrix). The one exception
 * is `positionMm`, kept in millimetres on SketchUp's Z-up axes so it lines
 * up with the baked path's own metadata field.
 *
 * Independent of {@link parseSkp} and {@link buildScene}: this re-parses the
 * raw TLV data, consistent with the existing two-tier API, so callers who
 * never ask for it never pay for it.
 *
 * @param buffer - The raw file contents as an ArrayBuffer
 * @param options - Optional progress/log callbacks (see {@link ParseOptions})
 */
declare function buildInstancedScene(buffer: ArrayBuffer, options?: ParseOptions & SceneOptions): InstancedScene;
/**
 * Export a baked SkpScene (see {@link buildScene}) to GLB (binary glTF 2.0)
 * format.
 *
 * @param scene - The result of buildScene()
 * @returns GLB file as Uint8Array
 */
/** Options for {@link toGLB}. */
interface GlbOptions {
    /** Embed the scene's texture images in the GLB and point each textured
     * material's `baseColorTexture` at them.
     *
     * Off by default because it is not free: a model with photographic
     * textures can be several times larger with the images than without, and
     * the geometry alone is what most callers are after. When off, textured
     * materials fall back to their averaged base colour, which is what this
     * exporter has always produced.
     */
    textures?: boolean;
}
declare function toGLB(scene: SkpScene, options?: GlbOptions): Uint8Array;
/**
 * openskp's canonical JSON export schema, shared with the Python port's
 * `to_dict` (and, from there, Dart/.NET/C++). It used to diverge from
 * Python's in two real ways: this function never included `root` or any
 * per-definition `instances` tree at all, while Python kept only
 * vertex/edge/face *counts*, dropping the full `edges`/`faces` arrays
 * this function always included - so a consumer switching between the
 * two ports got a genuinely different shape, not just missing/extra
 * fields. Both now match this one schema (snake_case keys throughout,
 * including `scene_hierarchy`/`mesh_index` entries, which this function
 * used to emit in TS's own camelCase instead).
 *
 * Note `Instance.layer`/`Instance.properties`/`Instance.children` on the
 * *raw* (pre-bake) `instances` list are deliberately not part of this
 * schema at all - TypeScript's `Instance` type doesn't declare any of
 * them (a definition's placed instances are always a flat list at parse
 * time here), and they're always empty defaults in Python's/Dart's/
 * .NET's parsed model too (never assigned during parsing; only C++
 * actually populates layer/properties - see item 17). The *resolved*,
 * genuinely nested per-instance tree (with correct layer/properties) is
 * available via `scene_hierarchy` (pass the result of {@link buildScene}
 * as `scene`).
 *
 * Export a parsed SkpModel to a metadata JSON object. Pass the result of
 * {@link buildScene} as `scene` to also include mesh/scene-hierarchy data;
 * omit it for a lighter summary covering just the raw model.
 *
 * @param model - Parsed SkpModel
 * @param scene - Optional result of buildScene()
 * @returns Metadata object
 */
declare function toJSON(model: SkpModel, scene?: SkpScene): Record<string, unknown>;
/**
 * SkpFile wrapper class.
 */
declare class SkpFile {
    private buffer;
    constructor(buffer: ArrayBuffer);
    static fromBuffer(buffer: ArrayBuffer): SkpFile;
    static open(filePath: string): SkpFile;
    /** Fast, memory-light parse: raw per-definition geometry, no scene-graph
     * instancing resolved. See {@link buildScene} for a triangulated,
     * world-space scene ready for rendering or GLB export.
     * @param options - Optional progress/log callbacks (see {@link ParseOptions}) */
    parse(options?: ParseOptions): SkpModel;
    /** Bake every placed instance into world-space, triangulated mesh data.
     * Independent of parse() - re-parses the raw TLV data on its own rather
     * than reusing a prior parse() call, so calling only parse() never pays
     * for this heavier computation.
     * @param options - Optional progress/log callbacks (see {@link ParseOptions}) */
    buildScene(options?: ParseOptions & SceneOptions): SkpScene;
    /** Build the placed scene graph with instancing PRESERVED: unique
     * geometry once, plus one transform per placement. See
     * {@link buildInstancedScene} for when to prefer this over buildScene().
     * @param options - Optional progress/log callbacks (see {@link ParseOptions}) */
    buildInstancedScene(options?: ParseOptions & SceneOptions): InstancedScene;
    /** Convert to ThatOpen Fragments (.frag) binary format.
     * @param options - Optional fragment export options (raw, doubleSided, modelId) */
    toFragments(options?: FragmentExportOptions): Uint8Array;
    /** The preview image SketchUp stored in the file, or null when it has
     * none. Cheap: reads container metadata only, never geometry.
     * @param options - Optional progress/log callbacks */
    thumbnail(options?: ParseOptions): SkpThumbnail | null;
}

export { ComponentDefinitionBuilder, METRES_TO_INCHES, PROGRESS_INTERVAL, SkpBuilder, SkpFile, SkpParseError, SkpWriteError, buildInstancedScene, buildModelFromParsed, buildScene, buildSceneFromParsed, classifyElement, computeFaceUv, create, emitLog, emitProgress, exportDXF, exportIFC, exportOBJ, exportPLY, exportSTL, extractThumbnail, faceUvBasis, fromFragments, generateIFCGUID, isDrawableEdge, openExisting, parseSkp, resolveMaterialFromMaps, sniffImageMime, toDXF, toFragments, toGLB, toIFC, toInstancedGLB, toJSON, toMTL, toOBJ, toPLYAscii, toPLYBinary, toSTLAscii, toSTLBinary, toTypeScriptCode };
export type { AddArcOptions, AddCircleOptions, AddComponentDefinitionOptions, AddFaceOptions, AddGroupInstanceOptions, AddGroupOptions, AddImageOptions, AddInstanceOptions, AddPolylineOptions, ArcCurve, AttributeDict, AttributeValue, CoEdge, ConstructionLine, ConstructionPoint, Definition, Dimension, Edge, Face, FragmentExportOptions, GlbOptions, GlbPrimitive, Instance, InstanceNode, InstancedGlbOptions, InstancedMeshResource, InstancedNode, InstancedScene, Layer, LocalPrimitive, LogLevel, Material, Matrix3x3, MeshMetadata, Page, ParseOptions, ParsedRawData, Point3, ProgressInfo, Rotation, SceneBounds, SceneOptions, SceneTexture, SectionPlane, SkpModel, SkpParseErrorContext, SkpParseStage, SkpScene, SkpThumbnail, Style, TextEntity, Texture, UvPair, Vertex };
