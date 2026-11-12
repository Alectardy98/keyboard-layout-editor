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

The plate workspace has **Add Alps Keys**, **Add MX Plate Mount**, **Add MX PCB Mount**,
**Add Topre Keys**, and **Add Other**. The normal KLE editor keeps its original Add Key menu.
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

### 5140 BAE

**5140 BAE** has a 2.25u × 1u lower section and a 1.5u-wide upper-right
extension reaching one row above it. The lower section remains centred on the
switch. Recognition requires both lower wire slots and the complete upper-right
barrel assembly (circle plus two square supports). A nearby circle alone is
not a stabilizer; the left mounting opening remains fixed. **Add Alps Keys →
5140 BAE** creates the same measured pattern. ZKB2 Enter keeps its narrower 1u upper
extension as a separate preset.

### DC2014 spacebar and Z150 Enter

The **9.75u — barrel stabilizer** preset includes both wire slots and the
three-part barrel support. **Z150 Enter** uses a 1u × 2u vertical section with a
2u × 1u lower section extending left. Its four wire slots and complete lower-left
barrel move together. Recognition requires every support opening, not merely a
nearby circle or a filename match.

A **vertical 2u** preset provides the same four-slot support as the Canon
vertical key with a 1u cap width. Since those cutouts alone do not distinguish
1u from 1.25u caps, recognition uses neighbouring key clearance to reject the
wider cap where it would overlap. Review cap dimensions when surrounding keys
are absent or their widths are uncertain.

### NCR80 multi-position openings

**Caps Multistep** represents the full elongated opening as a 1.75u cap, using
its rightmost Alps stem position as the reference centre. **2.75u multi stab**
includes both pairs of wire slots. Adjacent circular mounting holes are not part
of either key. Both patterns are available in **Add Alps Keys**.

New DXF imports use a padded, key-based KLE origin, so unrelated plate margins
no longer introduce arbitrary offsets into every X/Y field. This is a coordinate
transform only; actual drawing positions and gaps remain unchanged. Saved plate
projects retain their existing coordinate frame. The KLE canvas is centred, and
newly added keys snap to quarter units relative to the first key. Small measured
deviations in imported drawings are retained rather than rounding the holes onto
a different grid.

**7u all stabs** (NCR80 Plate1) includes twelve support openings: four wire
slots, two barrel assemblies (each a circle and two side supports), and the two
large outer rectangles. Nearby concentric mounting circles remain fixed. The
measured pattern preserves the source's asymmetric side-support contour rather
than replacing it with an idealized square. It is available in **Add Alps Keys**
and the Alps stabilizer-family selector.

### Reviewing nearby supports

Select one imported key to see **Nearby support openings**. Hover a row to
highlight its contour, then use **Include** to attach it or **Remove** to return
it to fixed geometry. These are proximity candidates, not confirmed stabilizers;
inspect circles carefully because they may be mounting holes. Large outlines,
unsupported contours, and openings already owned by another key are excluded.

Include supports before moving the key, with **Keep imported stabilizers**
applied. Included openings move/delete with the key and are saved in plate
projects; Undo restores ownership. Merely viewing or highlighting a candidate
changes nothing. Replacing a stabilizer pattern intentionally replaces its
included support openings too.

A complete measured bottom-row pattern can infer the common arrangement
**1.5u, 1u gap, 1.5u, 7u, 1.5u, 1u gap, 1.5u**. All four modifier centres must
match; no switch is moved and the gaps remain empty. The earlier misnamed
`alps-625-all` saved profile remains readable, but new presets use **7u all stabs**.

**7u all stabs flex** (Satisfaction75 Alps AT101) groups the four wire slots,
both three-part barrel assemblies, both narrow rectangular slots, both large
outer rectangles, and the curved oval flex opening: fifteen support contours.
For this explicitly identified pattern, the flex contour belongs to the key and
moves/deletes with it. This does not change how other plates' flex cuts are kept
fixed. The full measured assembly is available under **Add Alps Keys** and in
the Alps stabilizer-family selector.

### Add a key from unidentified shapes

Click an unidentified switch opening in the drawing to reveal **Map to new key**.
A normal click replaces the selection and clears selected keys. Shift-click
additional source shapes to include or deselect them. Set the name and cap width/height, then **Map to new key**. The first
opening's bounding-box centre defines the key reference; the chosen cap size is
visual and does not resize the imported cuts. Review that reference for irregular
openings before moving the new key.

Only unassigned, editable closed contours can be selected. Plate outlines
surrounding existing keys, unsupported geometry and already-owned openings are
excluded. The complete selected geometry moves/deletes together and survives
plate-project saving and Undo/Redo. Creating the key alone leaves DXF output
byte-for-byte unchanged.

Anchor outlines are blue. When a closed outer contour surrounds the switches,
cap-width inference stays inside it. Manual KLE sizing remains unrestricted so
edge and stepped caps can be corrected. Resizing keeps the switch centre fixed
and does not resize cutouts or the plate outline.
Planar, non-rational degree 1–3 splines can join lines into closed openings;
rigid moves preserve their original spline records. Caps Multistep recognition
accepts the small rounded-corner variation in Satisfaction75.

Cap inference also uses aligned row ends established by 1u runs or supported
end keys. It propagates quarter-unit widths between those edges and neighbours,
including spacebars, without moving switch centres. A 0.6 mm per-side preview
clearance avoids treating nominal KLE spacing cells as physical cap edges.
These are layout guesses, not manufacturing dimensions; manual correction
remains available and known bottom-row gaps are preserved.

Unidentified shapes also offer **Delete** and **Map to existing**. Delete removes
the selected source contours from the drawing/export; Undo restores them.
Map to existing waits for a destination key clicked in either view (Cancel
exits). Bound shapes keep their current positions when attached, then follow
that key’s movement, rotation and deletion. They survive project saving and
remain independent of switch/stabilizer profile replacements.

## MX plate-mount and PCB-mount workflow

**Add MX Keys** offers 29 presets: 1–1.75u unstabilized keys, stepped and
multi-position Caps, 2/2.25/2.75/3u keys, 6/6.25/7/8u spacebars, vertical 2u,
ISO Enter and offset-stem 6u. Stabilized presets have separate plate and PCB
mount variants. ISO has a 1.25u × 2u primary rectangle and a 1.5u upper arm.
Caps Multistep is an Add Key preset, not a general switch-opening option.

- **Plate mount / Cherry nominal** generates housing clip ledges and wire
  clearance. Short keys use the broad connecting opening; long keys use the
  narrow wire channel. New presets use this template. The previous template
  remains available for existing projects: a missing `mxPattern` retains the
  previous geometry, so reopening a project does not silently change its cuts.
- **PCB mount** creates clearance openings in the plate, not holes in a PCB.
  Width, height, Y offset and corner radius can be adjusted independently.
  Defaults remain 7 × 15 mm, Y −1.5 mm, square corners. 7 × 16 mm clearance
  variants are also recognized. Such rectangles are not clip-in ledges.
- North/South and horizontal/vertical axes work independently of switch rotation.
  The spacing menu distinguishes Cherry's 23.8 mm from the 23.876 mm convention
  used by some generators; arbitrary measured spacing remains available.
  Offset-stem 6u presets use 95.25 mm span with 9.525 mm offset.
- MX and Alps switch corners can be rounded; **Extra size** changes the total
  width and height, not a per-side allowance or automatic kerf compensation.
  **MX + Alps shared opening** unions the two switch footprints. This trades
  retention area for compatibility; it is not a guarantee for every housing.
- Settings only replace geometry after Apply. Presets, controls, project saves
  and Undo use the same geometry implementation.

Recognition uses complete contour matches for broad compatibility windows and
symmetric, rectangular housing pairs at known spans. Offset 6u is a separately
bounded exception. A nearby main typing row distinguishes ISO from a rectangular
numpad Enter; an isolated 2u hole cannot reliably prove an ISO cap. Supports are
owned by only one key. No1Rev2's 2u/2.25u compatibility windows and 1.75u Caps
opening are preserved exactly on import. The 2u, 2.25u and ISO assemblies
are labelled PCB mount, matching their rectangular housing clearances.
New plate-mount presets instead generate the clip-in template.
Unmatched alternate layout windows and flex/mounting features remain unchanged.

### References and verification

- [Cherry switch catalogue, 2010](https://telcontar.net/KBK/Cherry/docs/Cherry%20switch%20catalogue%20%282010%29.pdf),
  printed pp. 70–71: nominal switch, stabilizer span and clip-in frame drawings.
  The frame drawing was inspected as an image, not reconstructed from OCR.
- [ai03's plate generator](https://github.com/ai03-2725/yet-another-keyboard-builder),
  `StabilizerMXBasic`, `StabilizerMXSmall`, `StabilizerMXSpec`: cross-checks for
  clearance families, offset 6u and the 23.876 mm spacing convention. Generator
  code is not bundled or copied into this project.
- [Swill's feature guide](https://builder-docs.swillkb.com/features/): independent
  rotation, shared MX/Alps openings and the distinction between kerf and fit.
- [KBD8X MKII designer downloads](https://ai03.com/projects/kbd8x-mkii/) and
  [Keebio FoldKB plates](https://github.com/keebio/foldkb-case): downloaded for
  local regression checks, not bundled or republished in the site.

The local Calibre database was unavailable during this investigation. The
manufacturer PDF was obtained directly from the linked archive. These are
nominal templates and geometry tests, not physical fit certification. Check
actual stabilizers, PCB compatibility, plate thickness and the fabricator's
corner/kerf requirements before cutting material. Unusual wire spans require
measurement instead of inferring compatibility from keycap width alone.

Validation includes generated plate/PCB patterns, north/south orientation,
offset and vertical cases, ISO context, invalid controls, unchanged saved
profiles, source-byte preservation, conversions, and browser Apply/Undo/project
saving. Local corpus checks also cover the original Alps files and No1Rev2
variants. The FoldKB right plate contains non-editable imported geometry; it
is preserved and previewed rather than rewritten automatically.

The **2.75u dual opening PCB mount** preset preserves both measured No1Rev2
right-Shift openings as one key. Detection requires the complete pair at the
correct relative positions. Moving, rotating or deleting the key handles both
openings together; no-op export leaves their original records unchanged.

## Keyhub library audit

The Keyhub corpus was checked against source snapshot
`naraku010/keyboard_layout@fca16cf5134b5bf37076bc5aad95b735f39f563c`.
The audit covers 429 original DXFs and 455 DWGs converted separately to ASCII
DXF with ODA File Converter (build 27.10.0.151591, ACAD2018, audit/repair off).
Original files are never rewritten. Two catalog entries incorrectly name
Cloudnine DWGs; the repository supplies their DXF counterparts.

Recognition now supports joined PCB compatibility windows with a 14 mm switch
band and two 7 mm clearance slots at 23.876 mm spacing. The full contour must
match, including both pieces of a split opening. Four recipes are available in
**Add MX Keys**: 2u, 2.25u and 2.75u wide PCB compatibility, and 2.75u split PCB
compatibility. These are PCB clearance patterns, not plate-mount clip shapes.
Imported fillets and clearance variations stay unchanged until explicitly
replaced; the generated recipes are nominal square-corner versions.

Taller paired PCB clearances are associated only at a known stabilizer span.
The adjacent row pitch distinguishes 2u, 2.25u and 2.75u caps sharing a short
wire; this does not fill arbitrary gaps or move physical switch centres.

Negative-Z planar OCS entities are now interpreted correctly instead of
skipping their arcs. This follows Autodesk's [OCS definition](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-D99F1509-E4E4-47A3-8691-92EA07DC88F5.htm)
and [arbitrary-axis algorithm](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-E19E5B42-0CC7-4EBA-B29F-5E1D595149EE.htm):
negative-Z OCS reverses X, while LINE coordinates remain in WCS. Rigid edits
are transformed back to the original entity coordinates, including arc angles.
Tilted planes remain unsupported; block geometry remains preview-only.
Older saved projects retain their original coordinate interpretation through
`coordinateVersion`; reopen the original DXF to use the new recognition.

Automated corpus results: 871/884 files parsed and passed byte-exact no-op
export; 13 were rejected for size/detail limits or an invalid coordinate.
There were 1,783 net additional detected openings and 119 changed cap dimensions
at existing centres. These are automated comparisons, not a claim that every
inferred key or universal plate configuration is correct. Some files contain
case panels, half plates, multiple layouts, unsupported geometry or no reliable
switches; remaining orange openings need review. No fixed outline or mounting
record is changed by recognition.

To repeat a read-only audit, including an HTML/SVG review gallery:

```sh
node scripts/audit-plates.mjs /path/to/dxf-library /path/to/report
```

Each worker has bounded memory and a 60-second timeout. Reports list errors,
possible gaps and unassigned openings separately. A gap is not evidence of a
missing key. Regression coverage includes negative-Z movement/rotation,
rotated and split PCB windows, false-positive rejection, source preservation,
new preset export and saved-project reload.

### Reviewed Topre and MX families

The MX menus separate plate-mounted and PCB-mounted stabilizers. Generic switch
openings appear in both. Topre has its own menu before **Add Other**, with the
reviewed rounded 1u opening, right-hole and dual-hole modifier footprints, a
mirrored modifier, and the 7u spacebar with its two square supports. Modifier
cutouts stay the same size when the inferred cap grows to 2.25u or 2.75u.

The reviewed MX additions include PCB mount ANSI-ISO (an L-shaped cap), bottom-row
1.25u, 6.25u with Left stab, 1.75u multistep and 2.25u PCB mount option 2. These
are measured patterns from reviewed drawings, not universal replacements for
every manufacturer's footprint. Detection checks relative geometry and, for
ambiguous widths, neighbouring switch spacing; it never checks a filename or
key number. Nearby flex cuts and mounting openings remain separate.

Some exports contain overlong corner arcs at otherwise complete 14mm switch
openings. The importer can recognize these when all four sides and four corner
joins agree. Import and movement preserve their original entities; replacing
the opening regenerates its contour. Review the warning before manufacturing.
Closed unrecognized outlines assembled from separate LINE/ARC entities can now
be selected by clicking inside them, then mapped, deleted or attached to a key.

New plate projects record recognition version 11. Older saved projects keep their
previous interpretation so new detections do not silently reassign existing
key edits. Open the original DXF afresh to use the new recognition rules.

The Manta-style alternate-stem bottom row is resolved as
1.25 / 1.25 / 1.25 / 6.25 / 1.25 / 1.25 when the complete pattern agrees.
This changes inferred cap positions, not the imported cuts. Version 3 projects
retain their previous positions and profile templates. The combined 2u PCB
opening also recognizes split-keyboard rotations; 7 × 15 mm stabilizer slots
with complete but overshooting corner joins can be recovered as supports.


The option-2 plate-mounted short-wire opening has 2u, 2.25u, 2.75u and
vertical 2u presets. Horizontal cap width uses neighboring switch spacing;
these sizes share a cutout, so isolated geometry cannot distinguish every cap.
The PCB menu also includes the three-rectangle 6.25u spacebar option 2.
ANSI–ISO variants retain their full L-shaped cap and belong in the PCB menu.

Recognition simplifies dense, collinear CAD vertices without modifying the
source drawing. Mixed-layer LINE/ARC chains are joined only when their endpoints
form an unambiguous closed loop; original entity layers survive export. This
also makes otherwise unrecognized closed openings available for manual mapping.
A single-layer filter does not claim a loop that needs edges from other layers.
Version 4 projects retain their previous assembly rules. Open the original DXF
again to apply these new detections.

Repeated modifier pairs next to a recognized wide cap can now inherit a
quarter-unit size when both the cap boundary and the pair's centre pitch agree.
A lone key, unequal spacing or overlap with another row does not qualify. This
changes only inferred caps, not switch centres or DXF cuts. Version 5 projects
retain their previous cap inference; reopen the DXF to use this rule.


### Evidence and human review

The importer separates three questions: the physical switch opening, which
supports belong to it, and the cap's inferred size/shape. `plate/refine.js`
checks complete assemblies, repeated housing geometry and neighbouring row
spacing after initial recognition. It does not use filenames or key numbers.
Quarter-unit cap sizes mean **0.25u**, not 0.25mm; standard pitch remains 19.05mm.

Selecting a flagged key or unassigned opening shows its import-review notes in
the Reference keys bar. These report unknown switch families, incompatible cap
overlap, unresolved cap widths/stem positions, and possible shared clearance
or mounting features. The global human-review count banner is not shown.
These are conservative review candidates, not confirmed errors; import findings
do not certify later manual edits or clear themselves when a cap is adjusted.
Use **Map to new key**, **Map to existing**, or **Mark as fixed geometry** after
reviewing the actual cutout. Unassigned geometry remains in the exported DXF.

Research informs the built-in geometric rules; the browser does not upload a
plate to an online search or perform a live web search. Unresolved geometry is
left for human review rather than being assigned a convenient-looking profile.

Reference implementations and documentation reviewed:

- [ai03's plate generator](https://github.com/ai03-2725/yet-another-keyboard-builder/blob/master/src/cutouts/StabilizerMXBasic.js):
  MX wire spans and alternate 6u stem alignment. Short wires do not establish
  whether the cap is 2u, 2.25u or 2.75u.
- [Custom Topre guide](https://github.com/tomsmalley/custom-topre-guide#hole-sizes):
  nominal 14.6 × 14mm single and 32.4 × 14mm wide housings, corner relief and
  Realforce/clone differences. A square opening alone cannot prove Topre.
- [Swill plate-builder features](https://builder-docs.swillkb.com/features/):
  combined stabilizer compatibility and deliberately modified cutouts. A
  compatibility window can represent several mutually exclusive layouts.

Version 7 adds repeated chamfered Topre housing detection, 6.25u Topre support
ownership corroborated by both neighbouring modifier pairs, continuous MX clip
spacebars including 6u alternate-stem openings, and two-row ANSI–ISO inference.
Small fully-contained duplicate LINE entities may be ignored for topology only;
all original records remain attached and survive unedited export and movement.
Real branches and incomplete assemblies are not closed by inventing edges.
Repeated narrow or triangular openings on an otherwise recognized MX plate are
flagged instead of being treated as ordinary switches.

Older saved projects retain their previous recognition rules and key IDs.
Reopen the original DXF to use the new rules; do not reinterpret a saved project
in place. Import/export tests verify preservation, not manufacturing suitability.


### PCB compatibility assemblies (recognition version 8)

PCB clearance openings are checked against complete switch bands, support
slots and neighbouring rows. Rounded corners alone no longer reject a matching
opening. ANSI–ISO compatibility caps use both rows of neighbouring keys; their
missing corner is preserved in the inferred layout.

The combined **PCB mount 6.25u and 7u** assembly displays **two caps: a 6.25u
spacebar and an adjacent 1.25u key**. Both modifier runs must agree, and the
proposed caps must fit without overlapping other inferred keys. Extra 7u
support geometry does not create an overlapping 7u cap. Long relief windows
remain independent fixed geometry.

These two caps form one rigid cutout assembly: moving or rotating either moves
both; deleting either removes both unless an anchor prevents it. Resizing keeps
the stems in place. Anchor either member to fix the assembly. Mark both members
as fixed together when excluding them from editing. Saved plate projects retain
this relationship; plain KLE JSON remains a visual layout only.

Version 7 and older saved plate projects keep their existing interpretation.
Open the original DXF again to apply the new recognition rules. Unresolved
geometry remains selectable and flagged for review, rather than being forced
into an apparently complete layout.


Recognition version 9 also matches densely tessellated rounded MX openings.
Row-leading modifiers must agree with neighbouring pitch and the established
row edge. Existing 6.25u spacebar assemblies can acquire the notched 1.25u/7u
support companion even where only one modifier follows it. All inferred caps
are checked for fit before that association is accepted.

ORBIT contains a mixture of Z=0 splines and offset-Z records in its spacebar
supports/companion. These are recognized for the layout but remain fixed under
the existing non-XY editing restrictions; recognition does not flatten them.
An assembly containing a fixed member cannot move partially. Untouched export
preserves all original source bytes. Version 8 projects retain their old rules.


Recognition version 10 supports the wider, alternate-stem 1.25u companion in
6.25u/7u assemblies. The following 18.7625 × 14 mm opening is classified as
**1.25u bottom row larger variant** only when its notched neighbour and two
following modifier windows establish the bottom-row run. The named footprint
is also available under **Add MX PCB Mount**. The spacebar and companion remain
a linked pair; the following modifier is independently editable. Original cuts
and fixed drawing geometry are preserved. Earlier saved projects keep their
existing recognition rules and key identities.

The PCB preset menu also includes **2u vertical horizontal** and **2u reversed
vertical horizontal**. These preserve the complete measured continuous
vertical/horizontal clearance opening and show mirrored L-shaped caps: a 1×2
primary cap plus a 2×1 lower portion. Their missing upper corner stays empty.
Automatic matching currently uses the upright orientation to distinguish the
mirrored names; the added presets can still be rotated in the editor.

Recognition version 11 labels linked PCB assemblies **6.25u-7u** and their
companion **1.25u with 7u mount**, with both footprints available in Add MX PCB
Mount. A companion already recognized as a plain modifier is reused, not
added twice. Fixed ISO support rectangles can be associated with their switch
when neighbouring stems confirm the ISO shape; non-XY geometry stays fixed.

Topre WKL rows now recognize the 114.3 mm support span together with symmetric
modifier positions: a 7u cap and adjacent 1.5u caps. Deliberate blocker gaps
remain empty. Both supports and both neighbours are required, and inferred
caps must not overlap other keys. Existing version-10 projects retain their
previous recognition; reopen the source DXF for the updated inference.

The Stabilizers category selector contains exactly **Alps**, **MX PCB Mount**,
**MX Plate Mount**, and **Topre**. Choose a pattern within the category; Costar
is grouped with Alps options. Keep imported and Remove are separate actions.
Category or pattern changes are only applied when you press Apply. The stored
profile IDs are unchanged, so existing project files remain compatible.
Measured patterns retain their complete support geometry and fixed dimensions;
standard MX and Alps patterns retain the adjustable controls.

### Switches and stabilizer patterns

Selecting an imported key now populates two independent classifications:

- **Switch type**: MX, Alps or Topre, identified around the physical stem.
- **Stabilizer pattern**: the associated supports and compatibility openings,
  grouped under Alps, MX PCB Mount, MX Plate Mount or Topre.

Named compound openings (ANSI–ISO, multistep, split Shift, alternate spacebar
stems and other measured variants) live in the pattern selector, not the switch
selector. Joined openings remain complete templates; the editor does not split
them into guessed rectangles. Applying an incompatible switch technology to a
joined pattern is rejected rather than silently cutting the wrong footprint.

Plain MX openings do not prove a PCB/plate mounting type. Unknown openings or
unclassified extensions keep their imported geometry. Recognized simple keys
without supports show None. Selecting a key never writes geometry; applying
unchanged detected values also preserves the original DXF records byte-for-byte.
Old saved profile IDs still load, and reapplying an unchanged saved profile
keeps its existing generated geometry. KLE cap sizes remain independent of the
switch centre and stabilizer pattern. EC11 and custom openings remain available.

The plate workspace places units and recognition-layer controls at the top
right, Reference keys across the top of the drawing, switch/support controls
on its right, and stabilizer settings across the bottom. These rows wrap on
smaller screens. The inferred KLE remains below the drawing controls.
