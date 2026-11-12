# DXF plate editor

Open **Plate editor** in the menu, or **Open plate DXF** beside the normal JSON
buttons. A separate workspace shows the DXF above an editable KLE layout.
Drawing files are processed in the browser; opening, previewing and converting
them does not upload them to a server.

## Workflow

1. Open an **ASCII DXF**. Confirm units when the source has no unit declaration.
   The layer filter can isolate a plate from construction drawings.
2. Review the detected MX, Alps, universal and unknown openings. Labels and exact
   keycap widths cannot be recovered from plate holes alone. A 2u and 2.25u cap
   may use identical stabilizer geometry. Correct the estimated sizes in KLE.
3. Click openings or KLE keys to select them; Shift-click selects several.
   **Lock as anchor** fixes a key's switch centre and rotation. Several anchors
   are supported; the first detected key starts locked.
4. Select a switch and stabilizer pattern, then **Apply to selected keys** or
   **Apply to all editable keys**. Choosing options alone changes nothing.
5. Edit positions, sizes and legends in KLE. Resizing a keycap preserves its stem
   centre. Already-applied stabilizer spacing stays unchanged until Apply is
   pressed again. Undo/Redo covers geometry, profiles, anchors and exclusions.
6. Download the edited DXF. **Save plate project** also retains the original DXF,
   inferred layout, anchor choices, exclusions and applied patterns for reopening.

Use **Mark as fixed geometry** if an opening was incorrectly classified as a
key, for example a square mounting window. This keeps its original DXF entities
and removes its editable key representation. **Restore excluded openings** or
Undo reverses that choice. Deleting an ordinary, unlocked key intentionally
removes its associated switch/stabilizer cutouts.

To replace the layout with another KLE/Vial/VIA JSON, open it using the normal
JSON button. Pair its keys with the fixed anchors in the alignment panel. One
anchor supplies translation; two or more also determine rotation. Distances
must agree within 0.1 mm. Scaling is refused. Native KLE JSON remains compatible
with the original KLE; the separate `.plate.json` project stores CAD information.
GitHub's normal Save button saves the KLE layout, not the plate project.

## Stabilizer options

| Switch opening | Stabilizer choices | Orientation | MX mounting |
| --- | --- | --- | --- |
| MX | Keep imported, None, MX, Costar | North / South | Plate / PCB |
| Alps | Keep imported, None, native Alps, Costar, MX | North / South | Plate / PCB when MX is selected |

Native Alps offers AEK/common and AT101 presets, with measured spacing, slot
width, slot height and slot Y offset overrides. Key orientation can be horizontal,
vertical or inferred from the cap dimensions. **Stem offset** supports asymmetric
caps; set it explicitly when required. North/South rotates the stabilizer pattern
180° about the fixed stem, relative to the key. It does not move that stem.

Presets use the following nominal dimensions, in mm:

| Pattern | Dimensions / spacing |
| --- | --- |
| MX switch | 14 × 14 |
| Alps SKCL/SKCM switch | 15.5 × 12.8 |
| MX PCB-supported stabilizer clearance | 7 × 15 per housing |
| Costar slot | 3.3 × 14.2 |
| Native AEK slot | 2.67 × 5.21, Y = −6.48 in South orientation |
| Native AT101 slot | 2.5 × 4.8, Y = −6.4 in South orientation |
| MX stabilizer span for 2 / 2.25 / 2.75u | 23.8 |
| MX span for 6 / 6.25 / 6.5 / 7u | 95.25 / 100 / 104.76 / 114.3 |
| AEK span for 1.75 / 2 / 2.25 / 2.75u | 24 / 28 / 28 / 28 |
| AT101 span for 1.75 / 2 / 2.25 / 2.75u | 24 / 28 / 28 / 41 |

Native Alps starts at 1.75u; MX/Costar starts at 2u, unless **Force on short key**
is checked. An unsupported size requires measured custom spacing; the editor
does not silently substitute another keycap family. PCB-mounted stabilizers need
appropriate PCB support. These are nominal plate templates, not a model of the
PCB, wire, keycap underside, material thickness, laser kerf or manufacturing fit.
**Extra size** adds the entered amount to the total switch width and height.

## Coordinate and file preservation

- The imported physical coordinate frame stays immutable. KLE's Y-down key
  units are mapped to the original DXF's Y-up coordinates at 19.05 mm/u. This
  conversion does not snap imported switch positions to a grid.
- Source outline, mounting and unrelated entities are preserved as their original
  records. The outline is never regenerated from the key bounding box. Only
  explicitly edited key entities are rewritten. Recognition is a proposal: mark
  any misidentified fixed feature before bulk editing.
- A no-op export is byte-for-byte identical, including CRLF and legacy code-page
  text. Unsupported entities, blocks, layers and annotations remain in the file.
- Rigid key moves retain original LINE/ARC/CIRCLE/POLYLINE/LWPOLYLINE records,
  bulges and radii, changing only the applicable coordinates/angles.
- Explicit pattern replacement uses polygon operations on the affected cutout.
  Curves in regenerated compound openings are sampled to 0.005 mm sagitta;
  boolean inputs share a 0.00001 mm numerical grid. Unedited curves stay exact.
- R14+ replacements use closed LWPOLYLINE entities. R12 uses LINE edges.
  Existing handles stay intact; new handles and HANDSEED are managed separately.
  Handle-free legacy drawings remain handle-free.

## Limits and review

ASCII DXF up to 16 MiB, plate projects up to 32 MiB, at most 2,000 candidate keys,
100,000 entities and 250,000 preview points. Recognition uses geometric core
edges, not filenames. Combined switch/stabilizer openings use the switch core
centre, which can differ from the overall cutout's bounding-box centre.

Open/branched contours, shared or duplicate entities, 3D/offset planes, nonzero
polyline width/thickness and block instances may be uneditable. Resolve these in
CAD first (explode/flatten, or set contour width to zero). Non-XY extrusion,
TEXT and unsupported entities are retained but may not be drawn in the preview;
spline/ellipse previews are approximate. No complete mechanical collision/fit
check is performed. Review the exported drawing and actual components before
manufacturing. Plate geometry cannot establish PCB compatibility by itself.

## Engineering references

- [CHERRY MX series manufacturer drawing, “Metal Frame Cutout Dimensions”,
  printed page 10-4](https://media.digikey.com/pdf/Data%20Sheets/Cherry%20PDFs/MX%20Series.pdf).
- [Alps SKCL/SKCM manufacturer datasheet (1998), panel drawing on physical page 2,
  preserved at Telcontar](https://telcontar.net/KBK/Alps/docs/Alps%20SKCL-SKCM%20Series%20datasheet%20(1998).pdf).
- [Autodesk LWPOLYLINE group codes](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-748FC305-F3F2-4F74-825A-61F04D757A50.htm),
  [DXF HEADER variables / INSUNITS](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-A85E8E67-27CD-4C59-BE61-4DC9FADBE74A.htm).
- Stabilizer dimension cross-checks: [swill/kad, key.go at
  102c24278d433488a1747ef0e5bf78a23f421299](https://github.com/swill/kad/blob/102c24278d433488a1747ef0e5bf78a23f421299/key.go)
  and [ai03's cutout reference definitions](https://github.com/ai03-2725/yet-another-keyboard-builder/tree/main/src/cutouts).
  Geometry here is independently constructed from the dimensional facts; no
  generator code from those projects is included.
- Runtime libraries: [dxf-parser](https://github.com/gdsestimating/dxf-parser)
  and [polygon-clipping](https://github.com/mfogel/polygon-clipping), with their
  redistribution notices included in the static build.

## Source structure and validation

`plate/geometry.js` contains mm geometry; `dxf.js` handles source records and
export; `recognize.js` proposes switch cores and nearby stabilizers; `profiles.js`
holds replaceable dimension templates. `document.js` owns the fixed frame and
per-key settings. `editor.js`, `workspace.html` and `editor.css` form the UI.
The normal KLE controller has only bounded hooks for transactions, undo and
opening/alignment. The build generates `plate.html` from the existing KLE shell;
the normal page loads only the small UI/file-transfer adapter, without the DXF
parser, polygon library or plate geometry engine.

Run the normal unit, upstream and browser suites in the README. An optional local
sample audit is available without bundling or modifying those drawings:

```sh
node scripts/check-plates.mjs "/path/to/plate/files" --units mm
```

The development corpus contained 27 DXFs: all 27 passed exact no-op export; 25
contained editable candidate openings and passed conversion-centre and fixed
record checks (1,740 centres and 1,256 fixed records). The other two drawings
contain 3D geometry or block/stroked contours and remain unchanged.
Independent ezdxf 1.4.5 read/audit found no additional errors or warnings in the
27 exported files compared with their originals. Three additional real MX plate
references also passed MX-to-Alps centre-preservation checks. These tests verify
file/geometry handling, not physical fit or manufacturing acceptance.

## Alps key and encoder presets

The plate workspace has **Add Alps Keys**, **Add MX Keys** (reserved for future
presets), and **Add Other**. The normal KLE editor keeps its original Add Key menu.
Alps includes 1u, 1.25u, 1.5u, stepped 1.5u left/right, optional-stabilizer 1.75u,
stepped 1.75u with a 1.25u or 1.5u raised area, 2u, 2.25u and 5.5u. Stepped 1.5u
presets use a 1u raised area. The primary KLE rectangle is that raised area; the
secondary rectangle is the full footprint. The cutout is centred on the raised
area. These choices do not assume that every vintage stepped cap has that stem.

**Alps default** uses the user-supplied `rama_zenith_alps.dxf` measurements:
Key 63 has 24 mm stabilizer spacing; Keys 16 and 52 use 28 mm, despite their
different 2u and 2.25u cap widths. Slots are 2.67 × 5.21 mm at Y = −6.48 mm.
Key 71 is 5.5u with four 2.6 × 5.1 mm slots at X = ±38.45, Y = ±6.45 mm,
plus the three measured pole-support openings. All seven supports belong to the
spacebar and move/delete with it. Original records remain intact until edited.
North rotates the entire pattern. This is a measured preset, not a promise of
compatibility with every Alps spacebar.

**Add Other → EC11** reproduces the measured Zenith clearance contour, including
its reliefs. Recognition requires the matching contour, not merely a similar
bounding rectangle. Other EC11 mounting arrangements may need a different cutout.

Cap sizes use **0.25u increments**, where **1u = 19.05 mm** for both MX and Alps.
Recognition uses supported neighbouring cap widths to infer coherent rows without
moving measured stems or forcing every gap closed. Intentional cluster gaps remain
possible. Two-unit-and-larger Alps addition presets include stabilizers; 1.75u has
explicit with/without choices. Choosing a preset adds both the cap and its cutouts
in one undoable action. Older saved projects preserve newly recognized openings as
fixed geometry until “Restore excluded openings” is used.

### ZKB2 Enter

`rama-zenith-5140_Zenith_BAE.dxf` supplies the measured **ZKB2 Enter** pattern.
Recognition requires the Alps opening, both lower wire slots and the complete upper
barrel assembly (a 6.25 mm circle plus two 2.2 mm square holes). All five support
openings belong to Enter, so moving or deleting it cannot leave its barrel behind.
A partial assembly or an unrelated mounting circle does not trigger recognition.

The cap matches the [Zenith reference KLE](https://keebal.com/kle/#/gists/adbf3023fd999e77b4d713f066977768):
a 2.25u lower section and a 1u upper-right section. Internally, the lower rectangle
is primary to keep its centre on the real switch; the secondary rectangle is 1×2u
at (+1.25u, −1u). This draws the same outline as the reference's 1×2u primary and
2.25×1u secondary at (−1.25u, +1u). No switch or plate geometry is repositioned.
The **Add Alps Keys → ZKB2 Enter** preset includes the entire assembly.

### FC660M 6.25u with two barrels

The `fc660m_alps_v17.dxf` spacebar is labelled **6.25u** when its complete measured
pattern is present: two wire slots (83.7181 mm centre spacing) and two barrel
assemblies. Each barrel comprises a 6.25 mm circle and two 2.2 mm square retaining
holes. Barrel centres are approximately ±28.5 mm from the switch; retaining holes
are ±5.975 mm from each barrel. All eight support openings move/delete with the
spacebar. Recognition requires the full pattern, supports North/South orientation,
and leaves isolated or incomplete assemblies unclaimed. The **Add Alps Keys →
6.25u — two barrel stabilizers** preset reproduces these measured cutouts; it does
not replace other 6.25u stabilizer standards.

The original FC660M file contains two slightly different, overlapping outlines at
the spacebar switch. The imported key therefore remains protected from geometric
editing under the existing duplicate-geometry rule. Recognition still groups and
labels its complete assembly. The new 6.25u preset is editable; clean up the duplicate
switch outlines in CAD before editing that imported key. No source outlines are
silently discarded.

### Canon GA15 support assemblies

In `GA15_alps_canon.dxf`, Key 59 is **8u**, with eight wire-stabilizer slots
(two spans, above and below) and two barrel assemblies (each a circular opening
and two retaining holes): 14 support openings in total. Key 43 is labelled
**cannon vertical 2u** (1.25u wide × 2u tall), with a rotated Alps switch and all four stabilizer slots.
Recognition requires each complete measured assembly, independently of filename
or key numbering. Switch centres remain unchanged. Mounting holes and the long
plate-relief slots stay fixed and are not part of either key. Both measured patterns
are available under **Add Alps Keys** and as explicit Alps stabilizer profiles.

## Intersecting openings (probable keys)

Recognition uses switch-sized edge pairs and interior samples, not filenames or
an inventory of combined cutouts. Multiple switches sharing a contour and
switch notches in an enclosing plate outline appear as **probable keys**.
Select and inspect them, then choose **Confirm recovered geometry** before
moving, removing or converting them. Confirmation is saved in plate projects.

Shared contours are rebuilt once as a group. The neighbouring switches stay in
place. Surviving circular arcs and paired straight channel edges identify fixed
mounting openings and flex slots; inferred portions are clipped to the original
opening so they cannot invent additional cuts. Untouched drawings still export
byte for byte, including after confirmation alone.

This is geometric inference, not guaranteed reconstruction of the original CAD.
It needs evidence on all four switch sides; a completely missing edge, an
unusual switch, insufficient surrounding keys to identify plate material, or
an unrecognizable intersecting shape may require manual CAD work. Hidden
boundaries cannot always be recovered uniquely. Inspect the regenerated shared
contour before manufacture; confirmation means accepting that interpretation.
