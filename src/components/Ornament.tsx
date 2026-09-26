import "./ornament.css";

export function OrnamentRule({
  width = 240,
  className,
}: {
  width?: number;
  className?: string;
}) {
  const height = Math.round((width * 11) / 240);
  return (
    <svg
      className={`ornament${className ? ` ${className}` : ""}`}
      width={width}
      height={height}
      viewBox="0 0 240 11"
      aria-hidden="true"
      focusable="false"
    >
      <line x1="0" y1="5.5" x2="106" y2="5.5" stroke="currentColor" strokeWidth="0.75" />
      <line x1="134" y1="5.5" x2="240" y2="5.5" stroke="currentColor" strokeWidth="0.75" />
      <path d="M120 1.4 124.6 5.5 120 9.6 115.4 5.5Z" fill="none" stroke="currentColor" strokeWidth="0.9" />
      <path d="M111.6 4.2 113.4 5.5 111.6 6.8 109.8 5.5Z" fill="currentColor" />
      <path d="M128.4 4.2 130.2 5.5 128.4 6.8 126.6 5.5Z" fill="currentColor" />
    </svg>
  );
}

export function Monogram({
  size = 64,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={`ornament${className ? ` ${className}` : ""}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="32" cy="32" r="30" fill="none" stroke="currentColor" strokeWidth="0.9" opacity="0.6" />
      <circle cx="32" cy="32" r="25.5" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.35" />
      <text
        x="32"
        y="42.5"
        textAnchor="middle"
        fontFamily="Vellum Display, Georgia, serif"
        fontWeight="600"
        fontSize="30"
        fill="currentColor"
      >
        V
      </text>
      <path d="M32 2.6 33.7 5.5 32 8.4 30.3 5.5Z" fill="currentColor" />
      <path d="M32 55.6 33.7 58.5 32 61.4 30.3 58.5Z" fill="currentColor" />
    </svg>
  );
}
