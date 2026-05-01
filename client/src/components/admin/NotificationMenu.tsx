import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { notificationApi } from "../../api";
import type { NotificationItem } from "../../api";
import { useI18n } from "../../i18n";
import { cx } from "../../lib/classNames";
import { Button, EmptyState, Icon } from "../ui";

function isUnread(item: NotificationItem) {
  return item.status !== "read";
}

function formatTime(value?: string | null) {
  if (!value) {
    return "";
  }

  return String(value).replace("T", " ").slice(0, 16);
}

function routeFor(item: NotificationItem) {
  if (item.document_id) {
    return `/admin/search?type=document&id=${item.document_id}`;
  }

  return "/admin/dashboard";
}

export function NotificationMenu() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"unread" | "all">("unread");
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const loadCount = useCallback(async () => {
    try {
      const result = await notificationApi.unreadCount();
      setCount(result.count);
    } catch {
      // Count is decorative; leave the previous value in place on transient errors.
    }
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await notificationApi.list({ limit: 30, status: tab === "unread" ? "unread" : undefined });
      setItems(tab === "unread" ? result.filter(isUnread) : result);
    } catch {
      setError(t("admin.notifications.error"));
    } finally {
      setLoading(false);
    }
  }, [tab, t]);

  useEffect(() => {
    void loadCount();
    const timer = window.setInterval(() => void loadCount(), 45_000);
    return () => window.clearInterval(timer);
  }, [loadCount]);

  useEffect(() => {
    if (open) {
      void loadItems();
      void loadCount();
    }
  }, [loadCount, loadItems, open]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  async function markRead(item: NotificationItem) {
    await notificationApi.markRead(item.id);
    await Promise.all([loadItems(), loadCount()]);
  }

  async function markAllRead() {
    await notificationApi.markAllRead();
    await Promise.all([loadItems(), loadCount()]);
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        aria-expanded={open}
        aria-label={t("admin.topbar.notifications")}
        className="relative grid h-10 w-10 place-items-center rounded-full text-[#061d49] transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#061d49]/15"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        {count ? (
          <span className="absolute end-0.5 top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-[#0b3c88] px-1 text-xs font-bold text-white">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
        <Icon className="h-6 w-6" name="bell" />
      </button>

      {open ? (
        <div className="absolute end-0 top-12 z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl shadow-slate-900/15">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="text-sm font-bold text-slate-950">{t("admin.notifications.title")}</h2>
              <p className="text-xs text-slate-500">{t("admin.notifications.subtitle", { count })}</p>
            </div>
            <Button className="px-3 py-1.5 text-xs" onClick={markAllRead}>{t("admin.notifications.markAllRead")}</Button>
          </div>

          <div className="flex border-b border-slate-200 p-1">
            {(["unread", "all"] as const).map((item) => (
              <button
                className={cx(
                  "flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition",
                  tab === item ? "bg-[#061d49] text-white" : "text-slate-600 hover:bg-slate-100"
                )}
                key={item}
                onClick={() => setTab(item)}
                type="button"
              >
                {item === "unread" ? t("admin.notifications.unread") : t("admin.notifications.all")}
              </button>
            ))}
          </div>

          <div className="max-h-[26rem] overflow-auto p-2">
            {loading ? (
              <div className="px-3 py-6 text-center text-sm text-slate-500">{t("admin.notifications.loading")}</div>
            ) : error ? (
              <div className="px-3 py-6 text-center text-sm text-red-600">{error}</div>
            ) : items.length ? (
              <div className="space-y-1">
                {items.map((item) => (
                  <div className={cx("rounded-lg border p-3", isUnread(item) ? "border-blue-100 bg-blue-50/60" : "border-transparent hover:bg-slate-50")} key={item.id}>
                    <div className="flex items-start gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-[#061d49] ring-1 ring-slate-200">
                        <Icon className="h-4 w-4" name="bell" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <Link className="block truncate text-sm font-bold text-slate-950 hover:underline" onClick={() => setOpen(false)} to={routeFor(item)}>
                          {item.title}
                        </Link>
                        {item.body ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{item.body}</p> : null}
                        <p className="mt-1 text-xs text-slate-400">{formatTime(item.created_at)}</p>
                      </div>
                    </div>
                    {isUnread(item) ? (
                      <button className="mt-2 text-xs font-semibold text-[#061d49] hover:underline" onClick={() => void markRead(item)} type="button">
                        {t("admin.notifications.markRead")}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState label={tab === "unread" ? t("admin.notifications.emptyUnread") : t("admin.notifications.empty")} />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
