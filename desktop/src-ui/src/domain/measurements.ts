export function clampPrecision(precision: number): number {
  return Math.min(4, Math.max(1, Math.round(precision)));
}

export function formatDistance(value: number, precision: number, useSymbolUnits = false): string {
  const unit = useSymbolUnits ? 'Å' : 'A';
  return `${value.toFixed(clampPrecision(precision))} ${unit}`;
}

export function formatAngle(value: number, precision: number, useSymbolUnits = false): string {
  const unit = useSymbolUnits ? '°' : 'deg';
  return `${value.toFixed(clampPrecision(precision))}${unit}`;
}
