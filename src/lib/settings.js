// Fixed analysis settings — they change how numbers are judged, never the data.
// There is no Settings page (removed on user request); change values here and redeploy.

export const DEFAULT_SETTINGS = Object.freeze({
  /** |deviation| (percentage points) at or below this is OK */
  minorTolerance: 1,
  /** |deviation| above this is Major; between minor and major is Minor */
  majorTolerance: 3,
  /** 'mix' = share of the batch's total RM (normalised to 100); 'fg' = RM qty ÷ FG qty × 100 */
  basis: 'mix',
  /** RM total ÷ FG outside 100 ± this (%) raises a yield / entry-gap finding */
  yieldTolerance: 10,
  /** Convert RM entries that are clearly in kg (≈1000× expected MT) to MT before comparing */
  autoUnitFix: true,
  /** Rows whose material name contains any of these words are packaging, not mix ingredients */
  packagingKeywords: Object.freeze(['bag', 'pp bag', 'ton bag', 'jumbo', 'packing', 'liner']),
})
