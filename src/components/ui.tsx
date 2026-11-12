import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Eye, EyeOff, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ───────── Button ───────── */
const BTN = {
  primary: "bg-brand text-white hover:bg-brand-dark shadow-sm",
  secondary: "bg-card border border-line text-fg hover:bg-raised",
  ghost: "text-muted hover:bg-raised hover:text-fg",
  danger: "bg-bad-soft text-bad hover:opacity-80",
  ok: "bg-ok-soft text-ok hover:opacity-80",
};
export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BTN;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}) {
  return (
    <button
      {...p}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-bold transition active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none",
        size === "sm" && "px-3 py-1.5 text-xs",
        size === "md" && "px-4 py-2.5 text-sm",
        size === "lg" && "px-5 py-4 text-base w-full",
        BTN[variant],
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

/* ───────── Form controls ───────── */
const CTRL =
  "w-full rounded-lg border border-line bg-raised px-3 py-2.5 text-sm text-fg outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-60";

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...p} className={cn(CTRL, p.className)} />
);
/** Password field with an eye button that shows or hides what was typed. */
export function PasswordInput({
  className,
  ...p
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        {...p}
        dir="ltr"
        type={shown ? "text" : "password"}
        className={cn(CTRL, "pr-10", className)}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
        aria-pressed={shown}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted hover:text-fg"
      >
        {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...p} className={cn(CTRL, "min-h-[84px] resize-y", p.className)} />
);
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...p} className={cn(CTRL, p.className)} />
);

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-bold text-muted">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

/* ───────── Card / Badge ───────── */
export const Card = ({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) => (
  <div
    className={cn("rounded-xl border border-line bg-card shadow-sm", className)}
  >
    {children}
  </div>
);

const TONE = {
  ok: "bg-ok-soft text-ok",
  bad: "bg-bad-soft text-bad",
  warn: "bg-warn-soft text-warn",
  info: "bg-info-soft text-info",
  brand: "bg-brand-soft text-brand-dark",
  gray: "bg-line text-muted",
};
export const Badge = ({
  tone = "gray",
  children,
}: {
  tone?: keyof typeof TONE;
  children: ReactNode;
}) => (
  <span
    className={cn(
      "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold",
      TONE[tone],
    )}
  >
    {children}
  </span>
);

export const Spinner = () => (
  <div className="flex justify-center p-10">
    <Loader2 className="h-6 w-6 animate-spin text-brand" />
  </div>
);

export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="p-10 text-center text-sm text-muted">{children}</div>
);

export const ErrorNote = ({ error }: { error: unknown }) =>
  error ? (
    <div className="rounded-lg bg-bad-soft p-3 text-sm font-semibold text-bad">
      {(error as Error).message}
    </div>
  ) : null;

/* ───────── Modal ───────── */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl bg-card shadow-xl sm:rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-extrabold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-lg p-1.5 text-muted hover:bg-raised"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────── Toast ───────── */
const ToastCtx = createContext<(msg: string, tone?: "ok" | "bad") => void>(
  () => {},
);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ msg: string; tone: "ok" | "bad" } | null>(null);
  const show = useCallback(
    (msg: string, tone: "ok" | "bad" = "ok") => setT({ msg, tone }),
    [],
  );
  useEffect(() => {
    if (!t) return;
    const id = setTimeout(() => setT(null), 3200);
    return () => clearTimeout(id);
  }, [t]);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && (
        <div
          role="status"
          className={cn(
            "fixed bottom-24 left-1/2 z-[60] -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-bold shadow-lg md:bottom-8",
            t.tone === "ok" ? "bg-fg text-bg" : "bg-bad text-white",
          )}
        >
          {t.msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

/* ───────── Table helpers ───────── */
export const Table = ({ children }: { children: ReactNode }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-sm">{children}</table>
  </div>
);
export const Th = ({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) => (
  <th
    className={cn(
      "whitespace-nowrap border-b-2 border-line bg-raised px-3.5 py-2.5 text-start text-[11px] font-extrabold text-muted",
      className,
    )}
  >
    {children}
  </th>
);
export const Td = ({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) => (
  <td
    className={cn("border-b border-line px-3.5 py-3 align-middle", className)}
  >
    {children}
  </td>
);
