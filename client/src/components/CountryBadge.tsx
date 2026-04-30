import type { CSSProperties } from "react";
import { getCountryFlagIconUrl, getCountryFlagWithCode, getCountryName } from "../lib/countries";

type CountryBadgeProps = {
  countryCode?: string | null;
  textColor?: string;
  compact?: boolean;
};

export function CountryBadge({ countryCode, textColor = "#e2e8f0", compact = false }: CountryBadgeProps) {
  const code = getCountryFlagWithCode(countryCode);
  const flagSrc = getCountryFlagIconUrl(countryCode);
  const size = compact ? 14 : 16;

  return (
    <span style={{ ...styles.row, color: textColor }} title={getCountryName(countryCode)}>
      <span style={{ ...styles.flagWrap, width: size + 4, height: size }}>
        {flagSrc ? (
          <img
            src={flagSrc}
            alt={code}
            loading="lazy"
            decoding="async"
            style={{ width: size + 4, height: size, objectFit: "cover", display: "block" }}
          />
        ) : (
          <span style={styles.fallback}>{code}</span>
        )}
      </span>
    </span>
  );
}

const styles: Record<string, CSSProperties> = {
  row: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.28rem",
    lineHeight: 1,
    fontWeight: 800,
  },
  flagWrap: {
    display: "inline-grid",
    placeItems: "center",
    border: "1px solid rgba(148,163,184,0.35)",
    overflow: "hidden",
    background: "rgba(2,6,23,0.85)",
  },
  fallback: { fontSize: "0.65rem", letterSpacing: "0.04em", fontWeight: 900 },
};
