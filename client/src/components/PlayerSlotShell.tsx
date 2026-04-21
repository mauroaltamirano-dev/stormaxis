import type { ReactNode } from "react";

export function PlayerSlotShell({
  color,
  minHeight,
  children,
}: {
  color: string;
  minHeight?: number;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        minHeight,
        position: "relative",
        overflow: "hidden",
        border: `1px solid ${color}66`,
        background: `linear-gradient(180deg, ${color}0f, rgba(4,10,20,0.96) 24%, rgba(3,8,18,0.96))`,
        boxShadow: `
          inset 0 1px 0 rgba(255,255,255,0.05),
          0 0 0 1px ${color}1f,
          0 0 24px ${color}22
        `,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.65rem",
        padding: "1rem",
      }}
    >
      {children}
    </div>
  );
}
