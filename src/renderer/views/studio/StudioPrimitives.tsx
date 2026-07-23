import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { fadeUp, modalPop, spring, useReducedMotionSafe } from "../../motion";
import { useSpotlight } from "../../hooks/useSpotlight";

/**
 * Overlays render into the `.studio-app` root (not the caller's position in the
 * tree) so `position: fixed` resolves against the viewport — the app shell adds
 * backdrop-filter to inner panes, which would otherwise trap fixed children.
 * The root still provides the theme tokens the overlay CSS relies on.
 */
function StudioPortal({ children }: { children: ReactNode }) {
  const target =
    (typeof document !== "undefined" && document.querySelector(".studio-app")) ||
    (typeof document !== "undefined" ? document.body : null);
  if (!target) return <>{children}</>;
  return createPortal(children, target);
}

export function StudioButton({
  children,
  onClick,
  variant = "secondary",
  disabled,
  type = "button",
  className = "",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  title?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`studio-button studio-button--${variant} ${className}`}
    >
      {children}
    </button>
  );
}

export function StudioBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "success" | "warning";
}) {
  return <span className={`studio-badge studio-badge--${tone}`}>{children}</span>;
}

export function StudioPage({
  eyebrow,
  title,
  description,
  actions,
  children,
  compact = false,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <section className={`studio-page ${compact ? "studio-page--compact" : ""}`}>
      <header className="studio-page__header">
        <div className="studio-page__heading">
          {eyebrow && <div className="studio-eyebrow">{eyebrow}</div>}
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="studio-page__actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function StudioCard({
  children,
  className = "",
  interactive = false,
  spotlight,
  animate = true,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  spotlight?: boolean;
  animate?: boolean;
}) {
  const { variants, hoverLift } = useReducedMotionSafe();
  const useSpot = spotlight ?? interactive;
  const spot = useSpotlight<HTMLDivElement>();

  return (
    <motion.div
      ref={useSpot ? spot.ref : undefined}
      onMouseMove={useSpot ? spot.onMouseMove : undefined}
      className={[
        "studio-card",
        interactive ? "studio-card--interactive" : "",
        useSpot ? "studio-card--spotlight" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      variants={animate ? variants(fadeUp) : undefined}
      initial={animate ? "hidden" : false}
      animate={animate ? "show" : undefined}
      whileHover={interactive ? hoverLift() : undefined}
      transition={spring.soft}
    >
      {children}
    </motion.div>
  );
}

export function StudioEmpty({
  label,
  detail,
  action,
}: {
  label: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="studio-empty">
      <div className="studio-empty__mark" aria-hidden="true" />
      <strong>{label}</strong>
      <p>{detail}</p>
      {action}
    </div>
  );
}

export function StudioModal({
  title,
  children,
  footer,
  onClose,
  width = "medium",
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  width?: "small" | "medium" | "large";
}) {
  return <StudioModalInner title={title} footer={footer} onClose={onClose} width={width}>{children}</StudioModalInner>;
}

function StudioModalInner({
  title,
  children,
  footer,
  onClose,
  width,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  width: "small" | "medium" | "large";
}) {
  const { variants } = useReducedMotionSafe();
  return (
    <StudioPortal>
      <motion.div
        className="studio-modal-layer"
        role="presentation"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.16 }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <motion.section
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={`studio-modal studio-modal--${width}`}
          variants={variants(modalPop)}
          initial="hidden"
          animate="show"
        >
          <header className="studio-modal__header">
            <h2>{title}</h2>
            <button type="button" className="studio-icon-button" onClick={onClose} aria-label="Close">
              ×
            </button>
          </header>
          <div className="studio-modal__body">{children}</div>
          {footer && <footer className="studio-modal__footer">{footer}</footer>}
        </motion.section>
      </motion.div>
    </StudioPortal>
  );
}

export function StudioSegmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className="studio-segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          onClick={() => onChange(option.value)}
          className={value === option.value ? "is-active" : ""}
          aria-pressed={value === option.value}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

