import { useState } from "react";
import { getRankMeta } from "../lib/ranks";

type RankBadgeProps = {
  level: number;
  mmr?: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  showMmr?: boolean;
  align?: "left" | "center";
  glow?: "off" | "soft" | "medium" | "strong";
  pulseHighRank?: boolean;
};

const SIZE_MAP = {
  sm: { icon: 38, title: "0.78rem", sub: "0.62rem", gap: "0.45rem" },
  md: { icon: 56, title: "0.92rem", sub: "0.72rem", gap: "0.55rem" },
  lg: { icon: 96, title: "1.02rem", sub: "0.76rem", gap: "0.7rem" },
} as const;

const GLOW_MAP = {
  off: { haloInset: 0, haloOpacity: 0, haloBlur: 0, shadow: 0, imgShadow: 0 },
  soft: { haloInset: 5, haloOpacity: 0.22, haloBlur: 8, shadow: 6, imgShadow: 7 },
  medium: { haloInset: 6, haloOpacity: 0.34, haloBlur: 10, shadow: 8, imgShadow: 9 },
  strong: { haloInset: 8, haloOpacity: 0.48, haloBlur: 14, shadow: 11, imgShadow: 12 },
} as const;

export function RankBadge({
  level,
  mmr,
  size = "md",
  showLabel = true,
  showMmr = true,
  align = "left",
  glow = "medium",
  pulseHighRank = true,
}: RankBadgeProps) {
  const [iconFailed, setIconFailed] = useState(false);
  const meta = getRankMeta(level);
  const sizing = SIZE_MAP[size];
  const glowMeta = GLOW_MAP[glow];
  const isHighRank = meta.level >= 9;
  const haloOpacity = glow === "off" ? 0 : glowMeta.haloOpacity + (meta.level >= 7 ? 0.08 : 0);
  const haloInset = glowMeta.haloInset + (meta.level >= 9 ? 1 : 0);
  const haloBlur = glowMeta.haloBlur + (meta.level >= 9 ? 2 : 0);
  const shadowSize = glowMeta.shadow + Math.max(0, meta.level - 7) * 2;
  const imgShadowSize = glowMeta.imgShadow + Math.max(0, meta.level - 7) * 2;
  const shouldPulse = glow !== "off" && pulseHighRank && isHighRank;

  return (
    <div
      style={{
        display: "grid",
        justifyItems: align === "center" ? "center" : "start",
        gap: sizing.gap,
        textAlign: align,
      }}
    >
      <div
        style={{
          position: "relative",
          display: "inline-grid",
          placeItems: "center",
          width: sizing.icon,
          height: sizing.icon,
          isolation: "isolate",
        }}
      >
        {glow !== "off" && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: `${-haloInset}px`,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${meta.color}, transparent 70%)`,
              opacity: haloOpacity,
              zIndex: -1,
              filter: `blur(${haloBlur}px)`,
              animation: shouldPulse ? "pulseGlow 2s infinite ease-in-out" : undefined,
            }}
          />
        )}
        {iconFailed ? (
          <div
            style={{
              width: sizing.icon,
              height: sizing.icon,
              borderRadius: "18px",
              border: `1px solid ${meta.color}55`,
              background: `radial-gradient(circle at 50% 30%, ${meta.color}30, rgba(2,6,14,0.92) 68%)`,
              display: "grid",
              placeItems: "center",
              color: meta.color,
              fontFamily: "var(--font-display)",
              fontWeight: 900,
              fontSize: size === "lg" ? "1.15rem" : "0.9rem",
              boxShadow: `0 0 ${Math.max(14, shadowSize * 2)}px ${meta.color}26`,
            }}
          >
            {meta.level}
          </div>
        ) : (
          <img
            src={meta.iconSrc}
            alt={meta.label}
            onError={() => setIconFailed(true)}
            style={{
              width: sizing.icon,
              height: sizing.icon,
              objectFit: "contain",
              filter:
                glow === "off"
                  ? "none"
                  : `drop-shadow(0 0 ${imgShadowSize}px ${meta.color})`,
            }}
          />
        )}
      </div>

      {(showLabel || showMmr) && (
        <div style={{ display: "grid", gap: "0.12rem" }}>
          {showLabel && (
            <div
              style={{
                color: meta.color,
                fontFamily: "var(--font-display)",
                fontSize: sizing.title,
                fontWeight: 900,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              {meta.label}
            </div>
          )}
          {showMmr && typeof mmr === "number" && (
            <div
              style={{
                color: "#f8fafc",
                fontFamily: "var(--font-display)",
                fontSize: sizing.sub,
                fontWeight: 800,
                letterSpacing: "0.06em",
              }}
            >
              {mmr.toLocaleString("es-AR")} MMR
            </div>
          )}
        </div>
      )}
    </div>
  );
}
