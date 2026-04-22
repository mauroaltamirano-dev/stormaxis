import type { ReactNode } from "react";

export function PlayerSlotShell({
  color,
  minHeight,
  children,
  isYou,
}: {
  color: string;
  minHeight?: number;
  children: ReactNode;
  isYou?: boolean;
}) {
  return (
    <div
      style={{
        minHeight,
        position: "relative",
        overflow: "hidden",
        border: `1px solid ${color}${isYou ? "99" : "66"}`,
        background: isYou
          ? `linear-gradient(160deg, ${color}1c, rgba(4,10,20,0.97) 30%, rgba(3,8,18,0.97))`
          : `linear-gradient(180deg, ${color}0f, rgba(4,10,20,0.96) 24%, rgba(3,8,18,0.96))`,
        boxShadow: isYou
          ? `inset 0 1px 0 rgba(255,255,255,0.08), 0 0 0 1px ${color}28, 0 0 52px ${color}2e, inset 0 0 48px ${color}0b`
          : `inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 1px ${color}1f, 0 0 24px ${color}22`,
        clipPath: isYou
          ? "polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px))"
          : undefined,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.65rem",
        padding: "1rem",
      }}
    >
      {isYou && (
        <>
          {/* Scanline sweep */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "1px",
              background: `linear-gradient(90deg, transparent, ${color}70, transparent)`,
              animation: "scanDown 7s linear infinite",
              pointerEvents: "none",
              zIndex: 2,
            }}
          />
          {/* Corner marks */}
          <div style={{ position: "absolute", top: 8, left: 8, width: 13, height: 13, borderTop: `2px solid ${color}bb`, borderLeft: `2px solid ${color}bb`, pointerEvents: "none" }} />
          <div style={{ position: "absolute", top: 8, right: 8, width: 13, height: 13, borderTop: `2px solid ${color}bb`, borderRight: `2px solid ${color}bb`, pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: 8, left: 8, width: 13, height: 13, borderBottom: `2px solid ${color}bb`, borderLeft: `2px solid ${color}bb`, pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: 8, right: 8, width: 13, height: 13, borderBottom: `2px solid ${color}bb`, borderRight: `2px solid ${color}bb`, pointerEvents: "none" }} />
          {/* Diagonal border overlays for cut corners */}
          <div
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: "16px",
              height: "16px",
              background: `linear-gradient(to bottom right, transparent calc(50% - 0.6px), ${color}aa 50%, transparent calc(50% + 0.6px))`,
              pointerEvents: "none",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              width: "16px",
              height: "16px",
              background: `linear-gradient(to bottom right, transparent calc(50% - 0.6px), ${color}aa 50%, transparent calc(50% + 0.6px))`,
              pointerEvents: "none",
            }}
          />
        </>
      )}
      {children}
    </div>
  );
}
