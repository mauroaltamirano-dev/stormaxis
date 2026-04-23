import type { CSSProperties } from "react";

interface Props {
  progressPct: number;
  pointsToNextLevel: number | null;
  rankColor: string;
  nextRankColor?: string;
  subtitle?: string;
}

export function RankProgressBar({
  progressPct,
  pointsToNextLevel,
  rankColor,
  nextRankColor,
  subtitle,
}: Props) {
  const fillBackground = nextRankColor
    ? `linear-gradient(90deg, ${rankColor}, ${nextRankColor})`
    : rankColor;

  return (
    <div style={wrapStyle}>
      <div style={headerStyle}>
        <span>Progreso al próximo rango</span>
        <strong style={{ color: rankColor }}>
          {pointsToNextLevel == null ? "Rango máximo" : `+${pointsToNextLevel}`}
        </strong>
      </div>
      <div style={trackStyle}>
        <div
          style={{
            ...fillStyle,
            width: `${progressPct}%`,
            background: fillBackground,
          }}
        />
        <div style={gridStyle} />
      </div>
      {subtitle != null && <div style={subtitleStyle}>{subtitle}</div>}
    </div>
  );
}

const wrapStyle: CSSProperties = {
  display: "grid",
  gap: "8px",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  color: "rgba(232,244,255,0.42)",
  fontSize: "11px",
  fontWeight: 900,
  letterSpacing: "1px",
  textTransform: "uppercase",
};

const trackStyle: CSSProperties = {
  position: "relative",
  height: "10px",
  overflow: "hidden",
  border: "1px solid rgba(232,244,255,0.07)",
  background: "rgba(2,6,14,0.8)",
};

const fillStyle: CSSProperties = {
  position: "absolute",
  inset: "0 auto 0 0",
  height: "100%",
};

const gridStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  backgroundImage:
    "linear-gradient(90deg, rgba(2,6,14,0.35) 1px, transparent 1px)",
  backgroundSize: "14px 100%",
};

const subtitleStyle: CSSProperties = {
  color: "var(--nexus-muted)",
  fontSize: "12px",
};
