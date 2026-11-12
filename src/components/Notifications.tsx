import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  BellRing,
  CheckCheck,
  Receipt,
  TriangleAlert,
  ClipboardList,
  MessageSquare,
  Newspaper,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useMarkRead, useNotifications } from "@/hooks/useData";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PushToggle } from "@/components/PushToggle";

const ICON = {
  expense: Receipt,
  report: ClipboardList,
  budget: TriangleAlert,
  client: MessageSquare,
  reply: MessageSquare,
  update: Newspaper,
} as const;

/** Bell for admin / project manager. Live via Supabase Realtime. */
export function NotificationBell() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const { data = [] } = useNotifications(profile?.id);
  const mark = useMarkRead();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const unread = data.filter((n) => !n.is_read).length;

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const go = (id: string, link: string | null, read: boolean) => {
    if (!read) mark.mutate([id]);
    setOpen(false);
    if (link) nav(link);
  };

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`الإشعارات${unread ? ` (${unread} غير مقروء)` : ""}`}
        className="relative rounded-lg p-2 text-muted hover:bg-raised"
      >
        {unread ? (
          <BellRing className="h-5 w-5 text-brand" />
        ) : (
          <Bell className="h-5 w-5" />
        )}
        {unread > 0 && (
          <span className="absolute -end-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] font-black text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-16 z-50 overflow-hidden rounded-xl border border-line bg-card shadow-xl sm:absolute sm:inset-x-auto sm:end-0 sm:top-full sm:mt-2 sm:w-96">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <span className="text-sm font-extrabold">الإشعارات</span>
            {unread > 0 && (
              <button
                onClick={() => mark.mutate("all")}
                className="flex items-center gap-1 text-xs font-bold text-brand"
              >
                <CheckCheck className="h-3.5 w-3.5" /> تحديد الكل كمقروء
              </button>
            )}
          </div>
          <ul className="max-h-[65vh] divide-y divide-line overflow-y-auto">
            {!data.length && (
              <li className="p-6 text-center text-sm text-muted">
                لا توجد إشعارات.
              </li>
            )}
            {data.map((n) => {
              const Icon = ICON[n.kind as keyof typeof ICON] ?? Bell;
              return (
                <li key={n.id}>
                  <button
                    onClick={() => go(n.id, n.link, n.is_read)}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3.5 text-start hover:bg-raised",
                      !n.is_read && "bg-brand-soft/50",
                    )}
                  >
                    <Icon
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        n.kind === "budget" ? "text-bad" : "text-brand",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-extrabold leading-6">
                        {n.title}
                      </span>
                      {n.body && (
                        <span className="mt-0.5 block whitespace-pre-line break-words text-sm leading-6 text-fg">
                          {n.body}
                        </span>
                      )}
                      <span className="num mt-1 block text-xs text-muted">
                        {fmtDateTime(n.created_at)}
                      </span>
                    </span>
                    {!n.is_read && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <PushToggle />
        </div>
      )}
    </div>
  );
}
