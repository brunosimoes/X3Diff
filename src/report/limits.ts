// What each analysis view does not tell you. Each view keeps one short line in sight, the single
// most important limit, and folds the full text behind "Limits of this measurement". The
// printable report repeats the full text next to the numbers it quotes, so the two cannot drift.

export const SECTION_SHORT =
  'Outlines are cut where the objects sit in the file: nothing is aligned or converted to physical units.';
export const SURFACE_SHORT =
  'Distances are sampled once per triangle, so the true largest gap can be bigger.';
export const VOLUME_SHORT =
  'Volumes describe the space this one object occupies, not objects added or removed.';
export const MOTION_SHORT =
  'Paths follow one point of the object through declared animation; sensors and scripts are not run.';

/**
 * The short line plus the folded full text, as markup for a view. `extra` is further markup
 * for inside the disclosure. The texts are the constants of this file, never file content.
 */
export const limitsMarkup = (short: string, full: string, extra = '') =>
  `<p class="limit-line">${short}</p><details class="limits"><summary>Limits of this measurement</summary><p>${full}</p>${extra}</details>`;

export const SECTION_LIMITS =
  'World coordinates · Scene units · Static geometry · No automatic alignment. Curved primitives use tessellated surfaces. Section dimensions are extents, not surface distances.';

export const SURFACE_LIMITS =
  'Unsigned nearest-surface distance sampled once per triangle, at its centre. Each face has one colour. Mean and RMS are area-weighted; maximum is sampled, not an exact worst case. Inspect both directions. World coordinates; no automatic alignment.';

export const VOLUME_LIMITS =
  'World coordinates · Static geometry · No automatic alignment. Before/after-only regions describe occupied space, not objects removed or added. Equal lost and gained volume can indicate relocation.';

export const MOTION_LIMITS =
  'Paths follow one point of the object (named above) through declared animation under Group/Transform placement. An enabled TimeSensor drives a PositionInterpolator or OrientationInterpolator routed to a Transform, including animated parents. Clocks start at 0 s; declared start, stop, pause and resume times, sensors and scripts are not evaluated. Each revision uses its longest contributing clock interval and 240 sampling intervals; motion between samples can be missed. Unsupported geometry uses a unit box as a tracking reference. Distances are in scene units.';
