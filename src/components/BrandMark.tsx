import type { BrandSpec } from "../lib/brand";
import "./brand-mark.css";

export function BrandMark({
  brand,
  size = 16,
  className,
}: {
  brand: BrandSpec | null;
  size?: number;
  className?: string;
}) {
  const classes = `brand-mark${className ? ` ${className}` : ""}`;
  if (!brand) {
    return (
      <span
        className={`${classes} brand-mark-fallback`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.6) }}
        aria-hidden="true"
      >
        ?
      </span>
    );
  }
  if (!brand.path) {
    return (
      <span
        className={classes}
        style={{ width: size, height: size, background: brand.hex, color: brand.fg, fontSize: Math.round(size * 0.56) }}
        aria-hidden="true"
      >
        {brand.letter}
      </span>
    );
  }
  return (
    <span
      className={classes}
      style={{ width: size, height: size, background: brand.hex, color: brand.fg }}
      title={brand.title}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" width={Math.round(size * 0.64)} height={Math.round(size * 0.64)}>
        <path d={brand.path} fill="currentColor" />
      </svg>
    </span>
  );
}
