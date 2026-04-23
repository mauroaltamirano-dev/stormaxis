import type { CSSProperties } from "react";
import { ROLE_META, type PlayerRoleKey } from "../lib/roles";

interface Props {
  label: string;
  value: PlayerRoleKey | null;
  onChange: (value: PlayerRoleKey | null) => void;
}

type Option = {
  value: PlayerRoleKey | null;
  label: string;
  accent: string;
  icon?: string;
};

const OPTIONS: Option[] = [
  { value: null, label: "Sin definir", accent: "rgba(255,255,255,0.22)" },
  ...Object.entries(ROLE_META).map(([key, meta]) => ({
    value: key as PlayerRoleKey,
    label: meta.label,
    accent: meta.accent,
    icon: meta.icon,
  })),
];

export function RolePicker({ label, value, onChange }: Props) {
  return (
    <div style={{ display: "grid", gap: "8px" }}>
      <span style={labelStyle}>{label}</span>
      <div style={gridStyle}>
        {OPTIONS.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value ?? "none"}
              type="button"
              onClick={() => onChange(option.value)}
              style={optionStyle(option.accent, selected)}
            >
              {option.icon ? (
                <img
                  src={option.icon}
                  alt=""
                  style={iconStyle}
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <span style={noIconStyle}>—</span>
              )}
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 800,
                  letterSpacing: "0.6px",
                  textTransform: "uppercase",
                  color: selected ? option.accent : "rgba(232,244,255,0.65)",
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {option.label}
              </span>
              {selected && (
                <div
                  style={{
                    width: "5px",
                    height: "5px",
                    borderRadius: "50%",
                    background: option.accent,
                    flexShrink: 0,
                    boxShadow: `0 0 6px ${option.accent}`,
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function optionStyle(accent: string, selected: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 10px",
    border: selected ? `1px solid ${accent}88` : "1px solid rgba(255,255,255,0.06)",
    background: selected ? `${accent}18` : "rgba(255,255,255,0.02)",
    boxShadow: selected ? `inset 0 0 0 1px ${accent}22, 0 0 12px ${accent}18` : "none",
    cursor: "pointer",
    textAlign: "left",
    transition: "none",
  };
}

const labelStyle: CSSProperties = {
  fontSize: "11px",
  fontWeight: 800,
  letterSpacing: "1px",
  textTransform: "uppercase",
  color: "var(--nexus-faint)",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "4px",
};

const iconStyle: CSSProperties = {
  width: "18px",
  height: "18px",
  objectFit: "contain",
  flexShrink: 0,
};

const noIconStyle: CSSProperties = {
  width: "18px",
  height: "18px",
  display: "grid",
  placeItems: "center",
  fontSize: "14px",
  color: "rgba(255,255,255,0.28)",
  flexShrink: 0,
};
