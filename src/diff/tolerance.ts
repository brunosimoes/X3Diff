import type { ToleranceConfig } from '../report/schema';
export const DEFAULT_TOLERANCE: ToleranceConfig = {
  floatAbs: 1e-6,
  floatRel: 1e-6,
  vectorAbs: 1e-5,
  rotationRadians: 1e-5,
  colorAbs: 1e-4,
};
