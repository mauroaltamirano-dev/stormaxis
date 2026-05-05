import { cn } from "../../lib/cn";

export type UiActionVariant = "primary" | "secondary" | "ghost" | "danger";
export type UiActionSize = "sm" | "md" | "lg";

export type UiActionClassOptions = {
  variant?: UiActionVariant;
  size?: UiActionSize;
  disabled?: boolean;
  className?: string;
};

export function buildActionClassName({
  variant = "primary",
  size = "md",
  disabled = false,
  className,
}: UiActionClassOptions = {}) {
  return cn(
    "sx-action",
    `sx-action--${variant}`,
    `sx-action--${size}`,
    disabled ? "sx-action--disabled" : "nx-interactive",
    className,
  );
}

export type UiPanelTone = "default" | "accent" | "danger" | "muted";
export type UiPanelPadding = "sm" | "md" | "lg";

export type UiPanelClassOptions = {
  tone?: UiPanelTone;
  padding?: UiPanelPadding;
  className?: string;
};

export function buildPanelClassName({ tone = "default", padding = "md", className }: UiPanelClassOptions = {}) {
  return cn("sx-panel", `sx-panel--${tone}`, `sx-panel--pad-${padding}`, className);
}
