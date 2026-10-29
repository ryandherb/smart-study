import clsx from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-accent-500 text-on-accent hover:bg-accent-400",
  secondary:
    "border border-study-line bg-study-surface text-study-text hover:bg-study-raised",
  ghost: "text-study-muted hover:bg-study-raised hover:text-study-text",
  danger:
    "text-danger hover:bg-danger dark:text-danger dark:hover:bg-danger/10",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <button
      {...props}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        size === "sm" && "h-[34px] px-3 text-[13px]",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-6 text-base",
        variants[variant],
        className,
      )}
    />
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md border border-current/20 px-1.5 py-0.5 font-mono text-[10px] leading-none opacity-70">
      {children}
    </kbd>
  );
}

export function ThinkingDots({ label = "Thinking" }: { label?: string }) {
  return (
    <span
      role="status"
      className="inline-flex items-center gap-2 text-sm text-study-muted"
    >
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 rounded-full bg-accent-500"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </span>
      {label}
    </span>
  );
}

export function ThemeToggle() {
  const toggle = () => {
    const dark = document.documentElement.classList.toggle("dark");
    localStorage.theme = dark ? "dark" : "light";
  };
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      title="Toggle theme"
      aria-label="Toggle theme"
    >
      <svg
        viewBox="0 0 24 24"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>
    </Button>
  );
}
