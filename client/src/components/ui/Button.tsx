import type { ButtonHTMLAttributes, ReactNode } from "react";
import { buildActionClassName, type UiActionSize, type UiActionVariant } from "./uiPrimitives";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: UiActionVariant;
  size?: UiActionSize;
  leadingIcon?: ReactNode;
};

export function Button({ variant = "primary", size = "md", leadingIcon, className, disabled, children, type = "button", ...props }: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled}
      className={buildActionClassName({ variant, size, disabled, className })}
    >
      {leadingIcon ? <span className="sx-action__icon" aria-hidden="true">{leadingIcon}</span> : null}
      <span className="sx-action__label">{children}</span>
    </button>
  );
}
