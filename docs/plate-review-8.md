# Plate recognition review 8

Recognition uses cutout geometry and neighbouring key pitch, not filenames or
key numbers. Imported geometry remains the export source.

| Example | Corrected inference |
| --- | --- |
| ORI CLS1 | Rounded PCB modifier windows, ANSI–ISO Enter, bottom-row modifiers and linked 6.25u + 1.25u compatibility pair. |
| Rule60 top gasket | 2u PCB window, split 2.75u Shift and 7u spacebar with tall supports; wide relief windows remain fixed. |
| Freya Full | ANSI–ISO Enter and 1.75u multistep Caps. |
| Kei Full | PCB modifier windows, 7u spacebar and 1.5u adjacent modifiers; curved reliefs remain separate. |
| Cycle7 FR4 | Linked 6.25u + 1.25u compatibility pair and aligned bottom-row modifier runs. Triangular reliefs remain unassigned. |
| Vega Universal | ANSI–ISO Enter and alternate-stem 1.25u bottom modifier. |

The two-cap spacebar assembly is accepted only when its caps and both modifier
runs fit without overlapping the other inferred caps. Moving either member
moves the combined geometry. An anchor on either member fixes the assembly.
No overlapping 7u keycap is drawn.

## Checks

- 128 unit tests, 34 browser tests and 28 upstream KLE tests.
- The six examples above load in the browser, have no inferred cap overlaps,
  and export unchanged byte for byte. ORI and Cycle7 were also visually checked
  in the rendered KLE view.
- The 884-file library rescan preserved 870 imports byte for byte. One large
  Rule60 drawing exceeded the concurrent audit's 60-second budget; a separate
  run completed in about 53 seconds and preserved all source bytes, bringing
  the verified total to 871. The other 13 files retain the previous size,
  complexity or invalid-coordinate limitations.
- The 30-file original sample set passed unchanged exports. Its 28 editable
  drawings passed conversion checks for 1,960 switch centres and 1,138 fixed
  records. Two files had no editable openings.
- These are geometry/preservation checks, not manufacturing certification or
  a claim that every file in the library is fully recognized. Ambiguous
  openings remain available for human review.

Saved projects before recognition version 8 retain their previous rules and key
identities. Reopen the source DXF to use the new inference.
