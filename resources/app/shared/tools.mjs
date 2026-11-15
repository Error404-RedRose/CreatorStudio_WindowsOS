/**
 * TwiX scene tool definitions — single source of truth shared by the
 * OpenCode MCP bridge and the in-app tool documentation.
 */

const vec3 = {
  type: "object",
  properties: {
    x: { type: "number" },
    y: { type: "number" },
    z: { type: "number" },
  },
  additionalProperties: false,
};

const color = {
  type: "string",
  description: "Hex color, e.g. #c8a27a",
};

const objectId = {
  type: "string",
  description: "TwiX object id (from scene_inspect / object_inspect).",
};

export const tools = [
  {
    name: "scene_inspect",
    category: "inspect",
    mutating: false,
    description:
      "Inspect the whole scene: project units, object hierarchy, ids, meshes, materials, rigs, bounds and current selection. Call this before planning any work.",
    inputSchema: {
      type: "object",
      properties: {
        includeGeometry: {
          type: "boolean",
          description: "Include vertex/triangle counts (default true).",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "object_inspect",
    category: "inspect",
    mutating: false,
    description:
      "Inspect one object in detail: transform, dimensions, geometry stats, materials, UV status, hierarchy, skinning and warnings. Defaults to the current selection.",
    inputSchema: {
      type: "object",
      properties: {
        objectId: objectId,
      },
      additionalProperties: false,
    },
  },
  {
    name: "project_info",
    category: "inspect",
    mutating: false,
    description:
      "Get project name, units, workspace, asset list, material library and scene validation summary.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "scene_blueprint",
    category: "inspect",
    mutating: false,
    description:
      "Record the complete build blueprint before touching geometry. Call this once at the start of every build or scene edit with the site bounds, levels, zones, asset list (name, group, size, position, material and colour), material plan, colour swatches and build phases. The panel shows this blueprint as the job plan, and every later tool call must follow it exactly. For edits, inspect the existing scene first and include the unchanged context in the blueprint.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short name for the build, e.g. 'Two-storey brick cottage'." },
        summary: { type: "string", description: "What the finished scene will contain and how it will be laid out." },
        site: {
          type: "object",
          description: "Overall site and building envelope in metres.",
          properties: {
            width: { type: "number" },
            depth: { type: "number" },
            height: { type: "number" },
            notes: { type: "string" },
          },
          additionalProperties: true,
        },
        levels: {
          type: "array",
          description: "Floors/levels with elevations and heights in metres.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              elevation: { type: "number" },
              height: { type: "number" },
              notes: { type: "string" },
            },
            additionalProperties: true,
          },
        },
        zones: {
          type: "array",
          description: "Rooms, terraces, gardens or functional areas with world-space rectangles.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              purpose: { type: "string" },
              x: { type: "number" },
              y: { type: "number" },
              width: { type: "number" },
              depth: { type: "number" },
            },
            additionalProperties: true,
          },
        },
        openings: {
          type: "array",
          description:
            "Door, window and opening schedule. Every cutout must appear here with its wall/zone, exact position and size. For renovations, map each existing cutout instead of adding a second opening.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              kind: { type: "string", enum: ["door", "window", "opening", "garage", "arch"] },
              level: { type: "string" },
              wall: { type: "string", description: "Wall, room or zone name that owns this opening." },
              x: { type: "number" },
              y: { type: "number" },
              z: { type: "number", description: "Sill height for windows; 0 for doors." },
              width: { type: "number" },
              height: { type: "number" },
              sill: { type: "number" },
              head: { type: "number", description: "Top of the opening above finished floor." },
              exterior: { type: "boolean" },
              open: { type: "boolean", description: "True when the door leaf is modelled open." },
              notes: { type: "string" },
            },
            required: ["kind", "width", "height"],
            additionalProperties: true,
          },
        },
        circulation: {
          type: "array",
          description: "Paths and corridors that connect rooms to the front door, with clear widths.",
          items: {
            type: "object",
            properties: {
              from: { type: "string" },
              to: { type: "string" },
              width: { type: "number" },
              notes: { type: "string" },
            },
            additionalProperties: true,
          },
        },
        assets: {
          type: "array",
          description: "Every group/object to build with its final size and world position.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              group: { type: "string" },
              width: { type: "number" },
              depth: { type: "number" },
              height: { type: "number" },
              x: { type: "number" },
              y: { type: "number" },
              z: { type: "number" },
              material: { type: "string" },
              color: color,
            },
            additionalProperties: true,
          },
        },
        materials: {
          type: "array",
          description: "Material brush plan per target surface or group.",
          items: {
            type: "object",
            properties: {
              target: { type: "string" },
              material: { type: "string" },
              color: color,
              textureScale: { type: "number" },
            },
            additionalProperties: true,
          },
        },
        colorSwatches: {
          type: "array",
          description: "Named colours the build will use. Pass the same values to paint_palette.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              color: color,
            },
            required: ["color"],
            additionalProperties: true,
          },
        },
        phases: {
          type: "array",
          description: "Ordered build phases, e.g. site, shell, roof, openings, furniture, materials.",
          items: { type: "string" },
        },
        notes: { type: "string" },
      },
      required: ["title"],
      additionalProperties: true,
    },
  },
  {
    name: "paint_palette",
    category: "material",
    mutating: false,
    description:
      "Register the build's colour swatches in the Paint panel before painting anything. Pass every named hex colour the blueprint uses. The colours appear in the user's swatches and are returned as the approved palette; use only those exact hex values with sketch_paint_faces, object_style and other colour inputs.",
    inputSchema: {
      type: "object",
      properties: {
        colors: {
          type: "array",
          description: "Named colours to add to the Paint swatches.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              color: color,
            },
            required: ["color"],
            additionalProperties: true,
          },
        },
      },
      required: ["colors"],
      additionalProperties: false,
    },
  },
  {
    name: "selection_set",
    category: "scene",
    mutating: false,
    description:
      "Select objects in the viewport so the user can see what you are working on. Pass an empty array to clear selection.",
    inputSchema: {
      type: "object",
      properties: {
        objectIds: { type: "array", items: { type: "string" } },
      },
      required: ["objectIds"],
      additionalProperties: false,
    },
  },
  {
    name: "library_geometry",
    category: "inspect",
    mutating: false,
    description:
      "Load a 3D Library FBX/GLB/GLTF/OBJ as a reference and return its real vertex count, triangle count, Z-up bounds and up to 240 sampled world-space vertex points. Use this to learn the actual silhouette, proportions and vertex distribution of a tree, building, prop or character before generating a new model with sketch tools.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Library model name or relative path fragment, e.g. Tree or Baron." },
        relative: { type: "string", description: "Exact relative path from library_inspect." },
        limit: { type: "number", description: "Maximum sampled points (default 240)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "library_inspect",
    category: "inspect",
    mutating: false,
    description:
      "List the user's 3D Library models, textures and material sets with names, categories, subcategories, file paths and which PBR maps each material already has. Use architectural structure assets as proportion/style references before drawing with sketch_polygon. This does not import or modify any library file.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Maximum entries to return (default 150)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "library_material",
    category: "material",
    mutating: true,
    description:
      "Apply a Materialize PBR material set from the user's 3D Library to selected sketch faces or imported objects. The set includes base colour, normal, ambient occlusion, roughness and metallic maps. If any map is missing it is generated by the Materialize engine and saved beside the texture in the library before applying.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Material or base-colour texture name, e.g. Weathered Wood." },
        relative: { type: "string", description: "Exact base-colour relative path from library_inspect." },
        faceIds: { type: "array", items: { type: "string" }, description: "Sketch face ids. Defaults to the current face selection." },
        objectIds: { type: "array", items: { type: "string" }, description: "Imported object ids. Defaults to the current object selection." },
        slot: { type: "number", description: "Material slot index on an imported object, from library_inspect or the Material panel. Omit to apply to every slot." },
        textureScale: { type: "number", description: "World size in metres for one texture tile (default 1). Use 0.5 for small bricks, 2 for large stone." },
        materialize: { type: "boolean", description: "Generate missing normal/AO/roughness/metallic maps (default true)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "sketch_group",
    category: "modeling",
    mutating: true,
    description:
      "Group sketch faces into one named editable group. Use after building each separable object (house shell, table, chair, door frame) so later edits never weld separate objects together.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        faceIds: { type: "array", items: { type: "string" }, description: "Sketch face ids. Defaults to the current selection." },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "library_import",
    category: "modeling",
    mutating: true,
    description:
      "Import a 3D Library model as one grouped asset at an exact scene position. The imported FBX/GLB/OBJ keeps its own hierarchy and gets a base-centre pivot for snapping. Use library assets for furniture, vegetation and props when the library has a better model than procedural geometry.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Library model name or relative path." },
        position: vec3,
        rotation: vec3,
        scale: { type: "number", description: "Uniform scale (default 1)." },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "materialize_scene",
    category: "material",
    mutating: true,
    description:
      "Materialize every texture already used by the scene. It matches scene base-colour maps to 3D Library materials, generates missing normal/AO/roughness/metallic maps with the Materialize engine, then re-links the complete PBR set to each object. Use this when the user asks to materialize the scene.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "materialize_library",
    category: "material",
    mutating: true,
    description:
      "Generate missing normal/AO/roughness/metallic maps for 3D Library base-colour textures in this batch. Call repeatedly while remaining > 0 for the whole library. Use this when the user asks to materialize the library.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Textures per batch (default 8, max 24)." },
        force: { type: "boolean", description: "Regenerate maps even when they already exist." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "scene_organize",
    category: "scene",
    mutating: true,
    description:
      "Finish the scene hierarchy: group every loose top-level imported mesh under a named group, keep existing groups intact, and return the resulting group list. Call this at the end of an AI build so the editor can select and delete individual objects.",
    inputSchema: {
      type: "object",
      properties: {
        prefix: { type: "string", description: "Optional name prefix for newly created groups." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "sketch_polygon",
    category: "modeling",
    mutating: true,
    description:
      "Draw an exact editable face from explicit world-space points. Points are metres in the Z-up editor; order horizontal floor/roof points counter-clockwise viewed from above so the green normal faces +Z. Use this for precise architecture, stair profiles, lot boundaries, cut-out shapes and any structure where rectangle/circle are not enough. The point loop is closed automatically.",
    inputSchema: {
      type: "object",
      properties: {
        points: {
          type: "array",
          description: "World-space points in order; the loop closes back to the first point.",
          items: vec3,
        },
        face: { type: "boolean", description: "Create the filled face (default true). Set false for edges only." },
      },
      required: ["points"],
      additionalProperties: false,
    },
  },
  {
    name: "sketch_inspect",
    category: "inspect",
    mutating: false,
    description:
      "Inspect the editable SketchUp sketch document: face ids, edge ids with endpoints and hidden state, group ids, area, normal, centre, UV Wrap state and current selection. Call this before editing sketch geometry. The editor is Z-up: the ground is the XY plane and height runs along Z.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Maximum faces to return (default 120)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "sketch_rectangle",
    category: "modeling",
    mutating: true,
    description:
      "Draw an exact editable rectangle face, like the Rectangle tool. origin is one corner in metres. width runs along the plane U axis and depth along V. Optional normal selects the plane; omit it to draw on the ground (Z-up normal). The rectangle participates in splitting, push/pull, offset and painting.",
    inputSchema: {
      type: "object",
      properties: {
        origin: vec3,
        width: { type: "number", description: "Width in metres." },
        depth: { type: "number", description: "Depth in metres." },
        normal: vec3,
      },
      required: ["origin", "width", "depth"],
      additionalProperties: false,
    },
  },
  {
    name: "sketch_circle",
    category: "modeling",
    mutating: true,
    description:
      "Draw an exact editable circle or polygon face, like the Circle tool. Use 24+ sides for a smooth cylinder cap and lower counts for columns. Optional normal selects the drawing plane; omit it for the ground plane.",
    inputSchema: {
      type: "object",
      properties: {
        center: vec3,
        radius: { type: "number" },
        sides: { type: "number", description: "3-128 sides (default 24)." },
        normal: vec3,
      },
      required: ["center", "radius"],
      additionalProperties: false,
    },
  },
  {
    name: "sketch_push_pull",
    category: "modeling",
    mutating: true,
    description:
      "Push/Pull one sketch face by an exact distance along its normal. This is the tool that turns a rectangle or circle into a wall, column, door opening or solid. Positive values follow the face normal.",
    inputSchema: {
      type: "object",
      properties: {
        faceId: { type: "string", description: "Face id from sketch_inspect or a prior sketch_rectangle/sketch_circle call." },
        distance: { type: "number", description: "Distance in metres." },
      },
      required: ["faceId", "distance"],
      additionalProperties: false,
    },
  },
  {
    name: "sketch_offset",
    category: "modeling",
    mutating: true,
    description:
      "Offset one sketch face inward or outward by an exact distance, like the Offset tool. Use it to create door/window reveals, frames, trim and inset panels before push/pull.",
    inputSchema: {
      type: "object",
      properties: {
        faceId: { type: "string" },
        distance: { type: "number", description: "Metres; positive offsets inward." },
      },
      required: ["faceId", "distance"],
      additionalProperties: false,
    },
  },
  {
    name: "sketch_select_faces",
    category: "selection",
    mutating: false,
    description: "Select sketch faces by id so the user can see the target and later tools can act on the selection.",
    inputSchema: {
      type: "object",
      properties: {
        faceIds: { type: "array", items: { type: "string" } },
        additive: { type: "boolean", description: "Add to the current face selection instead of replacing it." },
      },
      required: ["faceIds"],
      additionalProperties: false,
    },
  },
  {
    name: "sketch_reverse_faces",
    category: "modeling",
    mutating: true,
    description:
      "Invert the normal direction of one or more sketch faces. Pass faceIds, or omit them to reverse the current face selection. This is the same multi-face invert used by the right-click menu.",
    inputSchema: {
      type: "object",
      properties: {
        faceIds: { type: "array", items: { type: "string" } },
      },
      additionalProperties: false,
    },
  },
  {
    name: "sketch_paint_faces",
    category: "material",
    mutating: true,
    description:
      "Paint sketch faces with a hex colour, roughness, metalness, opacity, shader or texture tile size. Applies directly to the face material paint. When editing texture density, pass textureScale so every PBR map repeats together.",
    inputSchema: {
      type: "object",
      properties: {
        faceIds: { type: "array", items: { type: "string" } },
        color: color,
        roughness: { type: "number" },
        metalness: { type: "number" },
        opacity: { type: "number" },
        shader: { type: "string", description: "Shader preset stored on the face material, for example creator-pbr or materialize-pbr." },
        textureScale: {
          type: "number",
          description: "World size in metres for one texture tile. Smaller values repeat the texture more often; 0.5 is fine brick, 2 is large stone.",
        },
        emissive: color,
        emissiveIntensity: { type: "number" },
      },
      required: ["faceIds"],
      additionalProperties: false,
    },
  },
  {
    name: "sketch_uv_wrap",
    category: "material",
    mutating: true,
    description:
      "Adaptively triangulate sketch faces for texture mapping, like the Paint > UV Wrap tool. Adds dense hidden triangles at the requested spacing without changing the editable face boundary. Omit faceIds to wrap the current face selection, or the whole object when nothing is selected.",
    inputSchema: {
      type: "object",
      properties: {
        faceIds: { type: "array", items: { type: "string" } },
        spacing: { type: "number", description: "Triangle edge target in metres (default 0.5)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "sketch_arc",
    category: "modeling",
    mutating: true,
    description:
      "Draw an editable arc from a start point, end point and bulge point. The arc cuts the face under it into new faces, matching the manual Arc tool. Higher sides values give a smoother curve.",
    inputSchema: {
      type: "object",
      properties: {
        start: vec3,
        end: vec3,
        bulge: vec3,
        sides: { type: "number", description: "Arc segments, 8-128 (default 24)." },
      },
      required: ["start", "end", "bulge"],
      additionalProperties: false,
    },
  },
  {
    name: "sketch_bevel_edges",
    category: "modeling",
    mutating: true,
    description:
      "Bevel selected sketch edges with a real quarter-circle profile. 1 segment is a chamfer; 3-8 segments give a round bevel. Use edge ids from sketch_inspect.",
    inputSchema: {
      type: "object",
      properties: {
        edgeIds: { type: "array", items: { type: "string" } },
        segments: { type: "number", description: "1-16 profile segments (default 4)." },
        amount: { type: "number", description: "Bevel width in metres." },
        outward: { type: "boolean", description: "Bevel outward instead of inward." },
      },
      required: ["edgeIds", "amount"],
      additionalProperties: false,
    },
  },
  {
    name: "sketch_edit_lines",
    category: "modeling",
    mutating: true,
    description:
      "Hide, show or erase specific sketch lines by edge id, using the same surface-preserving logic as the Hide Line and Erase tools. Erase also rebuilds the flat surface behind the removed lines. Read edge ids from sketch_inspect.",
    inputSchema: {
      type: "object",
      properties: {
        edgeIds: { type: "array", items: { type: "string" }, description: "Edge ids from sketch_inspect." },
        action: { type: "string", enum: ["erase", "hide", "show"], description: "erase removes the line, hide/show toggles visibility." },
      },
      required: ["edgeIds"],
      additionalProperties: false,
    },
  },
  {
    name: "sketch_make_face",
    category: "modeling",
    mutating: true,
    description:
      "Create one editable face from selected boundary lines. Pass a closed outer loop, or an outer loop plus inner loops (for example both sides of a wall perimeter) to create one surface with holes. This is the same kernel operation as the Make Face tool.",
    inputSchema: {
      type: "object",
      properties: {
        edgeIds: { type: "array", items: { type: "string" }, description: "Closed boundary edge ids from sketch_inspect." },
      },
      required: ["edgeIds"],
      additionalProperties: false,
    },
  },
  {
    name: "sketch_rebuild_surfaces",
    category: "modeling",
    mutating: true,
    description:
      "Reconnect coplanar faces after hidden or visible lines were erased. Uses shared boundary vertices, not deleted edge records, so a cleaned wall becomes one editable n-gon instead of leftover triangles. Omit faceIds to rebuild every group.",
    inputSchema: {
      type: "object",
      properties: {
        faceIds: { type: "array", items: { type: "string" }, description: "Optional faces to rebuild around." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "sketch_heal_faces",
    category: "modeling",
    mutating: true,
    description:
      "Heal coplanar triangle regions into safe editable n-gon faces. The same validation as the Heal Flat Faces tool rejects self-intersecting loops and restores any region that would clip. Omit faceIds to heal the current selection, or set all to heal the whole scene.",
    inputSchema: {
      type: "object",
      properties: {
        faceIds: { type: "array", items: { type: "string" } },
        all: { type: "boolean", description: "Heal the whole scene even when faces are selected." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "sketch_delete_hidden_lines",
    category: "modeling",
    mutating: true,
    description:
      "Delete every hidden line and rebuild the flat surfaces behind them. Works even when the hidden lines were erased one at a time earlier and no hidden edge records remain.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "object_create",
    category: "modeling",
    mutating: true,
    description:
      "Create a blockout primitive (box, sphere, cylinder, cone, torus, plane). Use primitives only for rough blockouts, scale references or hard-surface mechanical parts. For characters use humanoid_create; for curved/organic props use mesh_create or prop_create. Never build a humanoid from primitives.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        primitive: {
          type: "string",
          enum: ["box", "sphere", "cylinder", "cone", "torus", "plane"],
        },
        dimensions: vec3,
        position: vec3,
        rotation: vec3,
        color: color,
        parentId: { type: "string" },
      },
      required: ["name", "primitive"],
      additionalProperties: false,
    },
  },
  {
    name: "ai_model_generate",
    category: "modeling",
    mutating: true,
    description:
      "Generate a high-quality textured GLB with a configured local Hunyuan3D server, Meshy or Tripo (the same class of AI 3D service as Meshy/Tripo), then import it into the live scene. Use this for characters, creatures, props, weapons, furniture, vehicles, buildings and any organic detail that procedural surfaces cannot reach. A local Hunyuan3D api_server.py URL is configured in Settings > Providers; cloud use requires a Meshy or Tripo API key. Generation takes about 1-4 minutes. Prefer this when the user asks for a polished, realistic, game-ready model.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Detailed description of the model, including style, materials and silhouette." },
        provider: { type: "string", enum: ["local", "meshy", "tripo"], description: "Omit to use the configured local server first, then Meshy, then Tripo." },
        name: { type: "string", description: "Scene object name." },
        height: { type: "number", description: "Optional target height in metres; the imported model is scaled uniformly to match." },
        scale: { type: "number", description: "Extra import scale (default 1)." },
        texture: { type: "boolean", description: "Request textures/PBR (default true)." },
        model: { type: "string", description: "Provider model id, e.g. meshy-6 or v3.1-20260211." },
        polycount: { type: "number", description: "Target triangle budget for providers that support it (default 30000)." },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
  },
  {
    name: "humanoid_create",
    category: "humanoid",
    mutating: true,
    description:
      "Create a complete humanoid as ONE smooth, UV-mapped, lofted mesh with a real skeleton and skin weights. The body and face (eyes, brows, lips) share one skinned mesh with material slots; hair is an optional second skinned mesh. Includes continuous torso, neck and shaped head, deltoids, chest and glutes, arms, hands, individual fingers, legs, feet and toes. Use feminine 0..1, build 0.7..1.4, muscle 0..1 and age 0..1 for proportions, pose a/relaxed/t, and hairStyle short/long/bun/ponytail. Always prefer this for humans; add clothing with garment_create afterwards.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        height: { type: "number", description: "Total height in meters (default 1.78)." },
        build: { type: "number", description: "0.7 slim, 1 average, 1.4 heavy." },
        feminine: { type: "number", description: "0 masculine, 1 feminine." },
        muscle: { type: "number", description: "0..1 muscle definition." },
        age: { type: "number", description: "0..1; widens the waist and softens the jaw." },
        fingers: { type: "boolean", description: "Include individual fingers (default true)." },
        toes: { type: "boolean", description: "Include individual toes (default true)." },
        chest: { type: "boolean", description: "Add a subtle chest form." },
        skinColor: color,
        rig: { type: "boolean", description: "Build skeleton and skin weights (default true)." },
        hairStyle: { type: "string", enum: ["none", "short", "long", "bun", "ponytail"], description: "Optional separate hair mesh bound to the head bone." },
        hairColor: color,
        eyeColor: color,
        faceDetail: { type: "boolean", description: "Add eyes, eyebrows and lips as a skinned face mesh (default true)." },
        pose: { type: "string", enum: ["a", "relaxed", "t"], description: "a = A-pose (default), relaxed = arms down, t = T-pose." },
        segments: { type: "number", description: "Radial segments per ring (10-64, default 32)." },
        position: vec3,
        rotation: vec3,
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "prop_create",
    category: "modeling",
    mutating: true,
    description:
      "Create a finished smooth surface prop from a preset: vase, bottle, lamp, barrel, bowl, crate, pillar, table, chair, sword, axe, shield, rock. Output is one vertex-based mesh with UVs and smooth normals, not a pile of primitives.",
    inputSchema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["vase", "bottle", "lamp", "barrel", "bowl", "crate", "pillar", "table", "chair", "sword", "axe", "shield", "rock"],
        },
        name: { type: "string" },
        width: { type: "number" },
        height: { type: "number" },
        depth: { type: "number" },
        segments: { type: "number" },
        color: color,
        roughness: { type: "number" },
        metallic: { type: "number" },
        position: vec3,
        rotation: vec3,
      },
      required: ["kind"],
      additionalProperties: false,
    },
  },
  {
    name: "mesh_create",
    category: "modeling",
    mutating: true,
    description:
      "Build a real surface mesh from cross-sections. mode=loft takes sections [{y, rx, rz, x, z, shape}] where shape 0 is round and 1 is a rounded square. mode=revolve takes a profile [{y, r}]. mode=tube sweeps a radius along points [{x,y,z}]. Use this for organic, curved, sculpted and lathed forms instead of stacking primitives. UVs and smooth normals are generated.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        mode: { type: "string", enum: ["loft", "revolve", "tube"] },
        sections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              y: { type: "number" },
              rx: { type: "number" },
              rz: { type: "number" },
              x: { type: "number" },
              z: { type: "number" },
              shape: { type: "number" },
            },
            required: ["y", "rx"],
          },
        },
        profile: {
          type: "array",
          items: {
            type: "object",
            properties: { y: { type: "number" }, r: { type: "number" } },
            required: ["y", "r"],
          },
        },
        points: {
          type: "array",
          items: { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" } } },
        },
        radius: { type: "number" },
        radial: { type: "number" },
        tubular: { type: "number" },
        flat: { type: "number", description: "Squash the tube on one axis (1 = round)." },
        segments: { type: "number", description: "Radial segments (6-96)." },
        color: color,
        roughness: { type: "number" },
        metallic: { type: "number" },
        position: vec3,
        rotation: vec3,
      },
      required: ["name", "mode"],
      additionalProperties: false,
    },
  },
  {
    name: "object_update",
    category: "scene",
    mutating: true,
    description:
      "Update an object's name, transform (meters / degrees) or visibility. Only provided fields change.",
    inputSchema: {
      type: "object",
      properties: {
        objectId: objectId,
        name: { type: "string" },
        position: vec3,
        rotation: vec3,
        scale: vec3,
        visible: { type: "boolean" },
      },
      required: ["objectId"],
      additionalProperties: false,
    },
  },
  {
    name: "object_set_dimensions",
    category: "modeling",
    mutating: true,
    description:
      "Scale an object so its world-space bounding box matches exact dimensions in meters.",
    inputSchema: {
      type: "object",
      properties: {
        objectId: objectId,
        dimensions: vec3,
      },
      required: ["objectId", "dimensions"],
      additionalProperties: false,
    },
  },
  {
    name: "object_duplicate",
    category: "scene",
    mutating: true,
    description: "Duplicate an object (including children) and optionally rename the copy.",
    inputSchema: {
      type: "object",
      properties: { objectId: objectId, name: { type: "string" } },
      required: ["objectId"],
      additionalProperties: false,
    },
  },
  {
    name: "object_delete",
    category: "scene",
    mutating: true,
    description: "Delete one or more objects. Destructive — requires confirmation when enabled.",
    inputSchema: {
      type: "object",
      properties: { objectIds: { type: "array", items: { type: "string" } } },
      required: ["objectIds"],
      additionalProperties: false,
    },
  },
  {
    name: "scene_snapshot",
    category: "inspect",
    mutating: false,
    description:
      "Render a clean scene snapshot from the AI's own hidden camera without moving the user's editor camera. Choose eye/target in metres, perspective or orthographic projection, FOV, and a look such as shaded, textured, hidden, xrayhidden, normal or uv. The PNG is saved to the project references so the AI can inspect the build and placement between steps.",
    inputSchema: {
      type: "object",
      properties: {
        eye: vec3,
        target: vec3,
        fov: { type: "number", description: "Vertical FOV in degrees (12-100)." },
        projection: { type: "string", enum: ["perspective", "orthographic"] },
        look: { type: "string", description: "shaded, textured, hidden, xrayhidden, normal, uv, flat or wireframe." },
        width: { type: "number", description: "Snapshot width in pixels (default 768)." },
        height: { type: "number", description: "Snapshot height in pixels (default 432)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "object_group",
    category: "scene",
    mutating: true,
    description: "Group objects under a new empty parent, preserving world transforms.",
    inputSchema: {
      type: "object",
      properties: {
        objectIds: { type: "array", items: { type: "string" } },
        name: { type: "string" },
      },
      required: ["objectIds", "name"],
      additionalProperties: false,
    },
  },
  {
    name: "object_join",
    category: "modeling",
    mutating: true,
    description:
      "Join meshes into a single mesh with multiple material slots. Useful for consolidating a finished prop.",
    inputSchema: {
      type: "object",
      properties: {
        objectIds: { type: "array", items: { type: "string" } },
        name: { type: "string" },
      },
      required: ["objectIds", "name"],
      additionalProperties: false,
    },
  },
  {
    name: "object_separate",
    category: "modeling",
    mutating: true,
    description:
      "Split a multi-material mesh into named part objects, one per material. Returns the new part ids.",
    inputSchema: {
      type: "object",
      properties: { objectId: objectId, prefix: { type: "string" } },
      required: ["objectId"],
      additionalProperties: false,
    },
  },
  {
    name: "mesh_cleanup",
    category: "modeling",
    mutating: true,
    description:
      "Professional cleanup for imported or CAD meshes: weld coincident vertices at a tolerance, remove degenerate triangles, recompute normals and rebuild box UVs with 1 metre texture tiles. Use before finishing or exporting a CAD/building import.",
    inputSchema: {
      type: "object",
      properties: {
        objectId: objectId,
        tolerance: { type: "number", description: "Weld distance in metres (default 0.0001)." },
        uv: { type: "boolean", description: "Rebuild 1 m tiled box UVs (default true)." },
        tileSize: { type: "number", description: "Metres per texture tile (default 1)." },
      },
      required: ["objectId"],
      additionalProperties: false,
    },
  },
  {
    name: "mesh_set_smooth",
    category: "modeling",
    mutating: true,
    description: "Turn smooth (vertex) shading on or off for a mesh.",
    inputSchema: {
      type: "object",
      properties: { objectId: objectId, smooth: { type: "boolean" } },
      required: ["objectId", "smooth"],
      additionalProperties: false,
    },
  },
  {
    name: "mesh_decimate",
    category: "modeling",
    mutating: true,
    description:
      "Reduce a mesh's polygon count. ratio is the target fraction of vertices to keep (0.1-0.95). UVs and normals are preserved where possible.",
    inputSchema: {
      type: "object",
      properties: {
        objectId: objectId,
        ratio: { type: "number", description: "Target vertex fraction, e.g. 0.5." },
      },
      required: ["objectId"],
      additionalProperties: false,
    },
  },
  {
    name: "blend_shape_create",
    category: "modeling",
    mutating: true,
    description:
      "Add a blend shape (morph target) to a mesh or group. Kinds: smile, open, wing, damage, twist, bulge. Use for expressions, wing poses, openings, or damaged variants.",
    inputSchema: {
      type: "object",
      properties: {
        objectId: objectId,
        name: { type: "string" },
        kind: { type: "string", enum: ["smile", "open", "wing", "damage", "twist", "bulge"] },
        amount: { type: "number" },
      },
      required: ["objectId", "name", "kind"],
      additionalProperties: false,
    },
  },
  {
    name: "blend_shape_set",
    category: "modeling",
    mutating: true,
    description: "Set a blend shape influence from 0 to 1.",
    inputSchema: {
      type: "object",
      properties: {
        objectId: objectId,
        name: { type: "string" },
        value: { type: "number" },
      },
      required: ["objectId", "name", "value"],
      additionalProperties: false,
    },
  },
  {
    name: "blend_shape_inspect",
    category: "inspect",
    mutating: false,
    description: "List blend shapes and current influence values for an object.",
    inputSchema: {
      type: "object",
      properties: { objectId: objectId },
      required: ["objectId"],
      additionalProperties: false,
    },
  },
  {
    name: "mesh_generate_uv",
    category: "texture",
    mutating: true,
    description:
      "Generate UV coordinates for a mesh using box, planar or spherical projection. Reports if UVs already existed.",
    inputSchema: {
      type: "object",
      properties: {
        objectId: objectId,
        projection: { type: "string", enum: ["box", "planar", "spherical"] },
        scale: { type: "number" },
        tileSize: { type: "number", description: "Physical metres per texture tile (1 = one tile per metre). Use this on buildings and CAD imports so texture density stays constant across objects." },
      },
      required: ["objectId", "projection"],
      additionalProperties: false,
    },
  },
  {
    name: "material_create",
    category: "texture",
    mutating: true,
    description:
      "Create a PBR material in the project library. Optional procedural pattern: checker, noise, stripes, wood, fabric, none.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        baseColor: color,
        roughness: { type: "number" },
        metallic: { type: "number" },
        pattern: {
          type: "string",
          enum: ["none", "checker", "noise", "stripes", "wood", "fabric"],
        },
        patternScale: { type: "number" },
        secondaryColor: color,
        emissiveColor: color,
        emissiveIntensity: { type: "number" },
        transparent: { type: "boolean" },
        opacity: { type: "number" },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "material_assign",
    category: "texture",
    mutating: true,
    description:
      "Assign a library material to a whole object, or to one material slot (index) of a mesh.",
    inputSchema: {
      type: "object",
      properties: {
        objectId: objectId,
        materialId: { type: "string" },
        slot: { type: "number" },
      },
      required: ["objectId", "materialId"],
      additionalProperties: false,
    },
  },
  {
    name: "material_update",
    category: "texture",
    mutating: true,
    description: "Update material properties (color, roughness, metallic, name).",
    inputSchema: {
      type: "object",
      properties: {
        materialId: { type: "string" },
        name: { type: "string" },
        baseColor: color,
        roughness: { type: "number" },
        metallic: { type: "number" },
        emissiveColor: color,
        emissiveIntensity: { type: "number" },
        transparent: { type: "boolean" },
        opacity: { type: "number" },
      },
      required: ["materialId"],
      additionalProperties: false,
    },
  },
  {
    name: "material_list",
    category: "inspect",
    mutating: false,
    description: "List the project material library with ids, colors and texture map status.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "texture_generate",
    category: "texture",
    mutating: true,
    description:
      "Generate a procedural texture map for a material (baseColor, roughness, metalness, normal or ao) and store it in project assets. Source is recorded as 'procedural'.",
    inputSchema: {
      type: "object",
      properties: {
        materialId: { type: "string" },
        map: {
          type: "string",
          enum: ["baseColor", "roughness", "metalness", "normal", "ao", "emissive"],
        },
        pattern: {
          type: "string",
          enum: ["checker", "noise", "stripes", "wood", "fabric", "grunge"],
        },
        primary: color,
        secondary: color,
        size: { type: "number" },
        repeat: { type: "number" },
      },
      required: ["materialId", "map", "pattern"],
      additionalProperties: false,
    },
  },
  {
    name: "uv_inspect",
    category: "inspect",
    mutating: false,
    description:
      "Inspect UV layout for a mesh: has UVs, UV bounds, zero-area islands and overlap estimate.",
    inputSchema: {
      type: "object",
      properties: { objectId: objectId },
      required: ["objectId"],
      additionalProperties: false,
    },
  },
  {
    name: "building_create",
    category: "building",
    mutating: true,
    description:
      "Create an architectural component. Dimensions in meters. Walls/floors are centered on position unless noted. Windows/doors are cut-out frames with trim.",
    inputSchema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["wall", "floor", "roof", "window", "door", "column", "stairs"],
        },
        name: { type: "string" },
        width: { type: "number" },
        height: { type: "number" },
        depth: { type: "number" },
        position: vec3,
        rotation: vec3,
        color: color,
        repeat: { type: "number", description: "Repeat count for windows/columns." },
      },
      required: ["kind"],
      additionalProperties: false,
    },
  },
  {
    name: "foliage_create",
    category: "foliage",
    mutating: true,
    description:
      "Generate parametric vegetation: tree, bush, grass, vine or flower. Parameters control height, canopy, density, leaf size and variation. Output is organized as a group with instanced leaves.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["tree", "bush", "grass", "vine", "flower"] },
        name: { type: "string" },
        height: { type: "number" },
        canopy: { type: "number", description: "0..1 canopy width / fullness." },
        density: { type: "number", description: "0..1 branch or leaf density." },
        leafSize: { type: "number" },
        variation: { type: "number", description: "0..1 shape randomness." },
        position: vec3,
        color: color,
      },
      required: ["kind"],
      additionalProperties: false,
    },
  },
  {
    name: "humanoid_inspect",
    category: "humanoid",
    mutating: false,
    description:
      "Inspect an imported humanoid: meshes, armature, bone hierarchy, bind pose, skinned meshes and issues. Use before creating clothing.",
    inputSchema: {
      type: "object",
      properties: { objectId: objectId },
      additionalProperties: false,
    },
  },
  {
    name: "rig_create",
    category: "humanoid",
    mutating: true,
    description:
      "Create a procedural skeleton for a mesh or group and skin its meshes to the new bones. kind: chain (vertical) or wing (two side chains). Use for non-humanoid creatures, props and mechanical rigs.",
    inputSchema: {
      type: "object",
      properties: {
        objectId: objectId,
        kind: { type: "string", enum: ["chain", "wing"] },
        bones: { type: "number", description: "Bones per chain (2-8)." },
      },
      required: ["objectId"],
      additionalProperties: false,
    },
  },
  {
    name: "garment_create",
    category: "humanoid",
    mutating: true,
    description:
      "Create a fitted garment from the body's own surface (shirt, jacket, pants, skirt, collar, boots or hat). The shell copies the body skin weights and binds to the same skeleton, so it deforms with the character instead of floating around it. Use this before trying to model clothing from primitives.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        kind: {
          type: "string",
          enum: ["jacket", "shirt", "pants", "skirt", "cape", "sleeve", "collar", "hat", "boots"],
        },
        bodyObjectId: objectId,
        color: color,
        offset: { type: "number", description: "Fit offset in meters (default 0.02)." },
      },
      required: ["name", "kind", "bodyObjectId"],
      additionalProperties: false,
    },
  },
  {
    name: "garment_bind",
    category: "humanoid",
    mutating: true,
    description:
      "Bind a garment to a body armature using nearest-vertex weight transfer. Reports unweighted vertices and cleanup advice.",
    inputSchema: {
      type: "object",
      properties: { garmentId: objectId, bodyObjectId: objectId },
      required: ["garmentId", "bodyObjectId"],
      additionalProperties: false,
    },
  },
  {
    name: "weights_inspect",
    category: "humanoid",
    mutating: false,
    description:
      "Check skin weights on a garment or skinned mesh: unweighted vertices, max influences and bones used.",
    inputSchema: {
      type: "object",
      properties: { objectId: objectId },
      required: ["objectId"],
      additionalProperties: false,
    },
  },
  {
    name: "scene_add_light",
    category: "scene",
    mutating: true,
    description: "Add a light to the scene. Intensity is physical-ish; sun default 3.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["directional", "point", "spot", "ambient", "hemisphere"] },
        name: { type: "string" },
        color: color,
        intensity: { type: "number" },
        position: vec3,
      },
      required: ["type"],
      additionalProperties: false,
    },
  },
  {
    name: "scene_add_camera",
    category: "scene",
    mutating: true,
    description: "Add a named preview camera looking at a target point.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        position: vec3,
        target: vec3,
        fov: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "scene_set_environment",
    category: "scene",
    mutating: true,
    description: "Set background color, fog density, ground visibility and ambient intensity.",
    inputSchema: {
      type: "object",
      properties: {
        background: color,
        fog: { type: "number", description: "0 disables fog." },
        ground: { type: "boolean" },
        ambientIntensity: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "viewport_set",
    category: "view",
    mutating: false,
    description:
      "Move the user's camera. mode: perspective, front, back, left, right, top, bottom, iso. frame: selection, scene or object.",
    inputSchema: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          enum: ["perspective", "front", "back", "left", "right", "top", "bottom", "iso"],
        },
        fov: { type: "number" },
        frame: { type: "string", enum: ["selection", "scene", "object"] },
        objectId: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "checkpoint_create",
    category: "project",
    mutating: false,
    description:
      "Save a named checkpoint (version snapshot) of the project before or after important work.",
    inputSchema: {
      type: "object",
      properties: { label: { type: "string" } },
      required: ["label"],
      additionalProperties: false,
    },
  },
  {
    name: "scene_validate",
    category: "project",
    mutating: false,
    description:
      "Run asset validation: geometry, hierarchy, dimensions/units, UVs, materials, textures, rigs and export warnings. Always run before export.",
    inputSchema: {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["scene", "selection"] },
      },
      additionalProperties: false,
    },
  },
  {
    name: "export_scene",
    category: "project",
    mutating: false,
    description:
      "Export the scene or selection to the project's exports folder. FBX is static-mesh ASCII; GLB preserves skins and embedded textures. Returns written path and validation report.",
    inputSchema: {
      type: "object",
      properties: {
        format: { type: "string", enum: ["fbx", "glb", "obj", "stl"] },
        scope: { type: "string", enum: ["scene", "selection"] },
        fileName: { type: "string" },
        includeTextures: { type: "boolean" },
      },
      required: ["format"],
      additionalProperties: false,
    },
  },
  {
    name: "asset_list",
    category: "project",
    mutating: false,
    description: "List files in the project assets and references folders.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "reference_search",
    category: "project",
    mutating: false,
    description:
      "Search the learned global reference dictionary (local folders, files, linked pages and subpages) for related material. Use before guessing about references.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "reference_scan",
    category: "project",
    mutating: false,
    description:
      "Scan all global reference folders and links into the learned search dictionary. Use only when the index is empty or stale.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "reference_read",
    category: "project",
    mutating: false,
    description:
      "Read a text file from a configured global or workspace reference folder. Use reference_list first to get folder ids and file paths.",
    inputSchema: {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["global", "project"] },
        folderId: { type: "string" },
        path: { type: "string" },
      },
      required: ["folderId", "path"],
      additionalProperties: false,
    },
  },
  {
    name: "reference_fetch",
    category: "project",
    mutating: false,
    description:
      "Fetch readable text content from a user-provided http(s) reference link. Use only links supplied by the user or listed by reference_list. Returns a truncated page extract, not a full website index.",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    name: "reference_list",
    category: "project",
    mutating: false,
    description:
      "List workspace and global reference images/files and labelled web links. Use references to inform work; never modify source references.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "asset_import",
    category: "project",
    mutating: true,
    description:
      "Import an FBX, GLB, GLTF or OBJ file that already exists in the project references folder as an editable working copy. The original file is never modified.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path relative to project references/ (e.g. building.fbx)." },
        name: { type: "string" },
        scale: { type: "number" },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "project_set_units",
    category: "project",
    mutating: true,
    description:
      "Set display units and the project's meters-per-unit scale (used to correct imported files with uncertain scale).",
    inputSchema: {
      type: "object",
      properties: {
        units: { type: "string", enum: ["m", "cm", "mm", "ft", "in"] },
        metersPerUnit: { type: "number" },
      },
      required: ["units"],
      additionalProperties: false,
    },
  },
];

export const toolMap = new Map(tools.map((t) => [t.name, t]));

export const destructiveTools = new Set([
  "object_delete",
  "object_join",
  "object_separate",
  "export_scene",
  "project_set_units",
]);

export function toolsForWorkspace(workspace) {
  const byWorkspace = {
    prop: ["modeling", "humanoid", "texture", "scene", "inspect", "view", "project"],
    building: ["building", "modeling", "texture", "scene", "inspect", "view", "project"],
    humanoid: ["humanoid", "modeling", "texture", "scene", "inspect", "view", "project"],
    texture: ["texture", "inspect", "view", "project", "scene"],
    foliage: ["foliage", "texture", "scene", "inspect", "view", "project"],
    scene: ["scene", "view", "inspect", "project", "texture"],
  };
  const cats = byWorkspace[workspace] || byWorkspace.prop;
  return tools.filter((t) => cats.includes(t.category));
}

export function toolsMarkdown(workspace) {
  return toolsForWorkspace(workspace)
    .map((t) => `- \`twix_${t.name}\`: ${t.description}`)
    .join("\n");
}
