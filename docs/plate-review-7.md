# Plate recognition review 7

This review replaces uncertain guesses with explicit import-review findings.
Recognition uses geometry and neighbouring pitch, never filenames or key IDs.
The reference sources and rules are described in [the editor guide](plate-editor.md#evidence-and-human-review).

## Corrected examples

| Drawing | Result |
| --- | --- |
| h2h2 | Repeated Topre housings; two 2.25u modifiers; 6.25u spacebar with both side supports; four neighbouring 1.25u modifiers. |
| 75N-plate file | Missing 2u and 2.25u PCB compatibility cuts; full ANSI–ISO cap without overlapping the neighbouring caps. A duplicate partial LINE had hidden the left Shift outline. |
| HMKB-75-PLT-ISO-STD | Continuous 6u plate-mounted spacebar and ISO Enter. The preset menu includes the alternate-stem 6u cut. |

## Validation

- 121 unit tests, 33 browser tests and 28 original KLE tests passed (182 total).
- All 884 downloaded/conversion-library DXFs were rescanned. 871 imported and
  exported unchanged **byte for byte**; 13 retained the existing size, complexity
  or invalid-coordinate limitations. This is a preservation check, not a claim
  that every switch was recognized.
- 542 imported drawings contain conservative review flags. 179 have no detected
  keys (the library includes other CAD content and unsupported representations).
- The separate 30-file original sample set passed byte-exact no-op export;
  28 editable drawings passed conversion checks for 1,960 switch centres and
  1,138 fixed source records. Two had no editable openings.
- The three corrected examples were checked in the browser. A further 25
  representative flagged examples were inspected as drawing/cap contact sheets.
  This is not a claim of individual visual approval for all 884 files.
- A dense Monsgeek drawing exposed an all-pairs duplicate-LINE search regression.
  Direction/offset indexing restored its audit to about 15 seconds locally,
  without deleting original entities. It still has no recognized keys.

## What remains uncertain

The published review list is intentionally conservative. It can flag mounting
windows and legitimate alternate layouts as well as actual recognition errors.
It records import findings and does not automatically certify manual edits.

| Evidence | Research conclusion | Remaining decision |
| --- | --- | --- |
| Short MX wire with unclear neighbours | Standard generators use the same short span for multiple cap widths. | Select the intended cap; disagreement between neighbours remains flagged. |
| Universal ANSI/ISO or alternate spacebar window | [ai03 Vega](https://ai03.com/projects/vega/) documents separate universal and single-layout choices; the drawing alone need not encode one intended configuration. | Choose which alternate layout to represent. |
| Triangular, narrow or partial repeated openings | These do not form the complete researched MX footprint. Repetition alone is insufficient. | Treat as fixed/clearance unless additional evidence establishes a switch. |
| Curved flex merged with a spacebar support | Neither a bounding box nor standard stabilizer dimensions establishes ownership of the extra curve. | Decide which geometry follows the key and which stays fixed. |
| Unknown housing or combined cut | [Topre documentation](https://github.com/tomsmalley/custom-topre-guide#hole-sizes) demonstrates why a rectangular opening alone cannot identify the family. | Confirm family, stem and associated supports. |
| Overlapping inferred caps | An overlap can indicate incorrect size, rotation, duplicate candidates or alternate positions. | Review the conflicting caps rather than silently shrinking or deleting them. |

Original drawings are unchanged. Old saved projects retain their earlier
recognition rules; reopen the original DXF for version 7 recognition. The local
full audit, reason lists and previews are in Desktop/mx plates/review7-final-*;
a deduplicated human-review shortlist is in Desktop/mx plates/manual-review-7.
