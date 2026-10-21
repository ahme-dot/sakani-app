/** Sakani building mark for generated images (app icons, social previews). Plain inline SVG — no client code. */
export function BrandMark({ size, radius, inverted = false }: { size: number; radius: number; inverted?: boolean }) {
  const tile = inverted ? "#ffffff" : "#246b53";
  const stroke = inverted ? "#246b53" : "#ffffff";
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: tile,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
        <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
        <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
        <path d="M10 6h4" />
        <path d="M10 10h4" />
        <path d="M10 14h4" />
        <path d="M10 18h4" />
      </svg>
    </div>
  );
}
