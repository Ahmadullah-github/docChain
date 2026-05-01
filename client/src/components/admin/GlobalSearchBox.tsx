import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { globalSearchApi } from "../../api";
import type { GlobalSearchResult } from "../../api";
import { useI18n } from "../../i18n";
import { cx } from "../../lib/classNames";
import { EmptyState, Icon, SearchInput, StatusBadge } from "../ui";

type Group = {
  key: string;
  label: string;
  rows: GlobalSearchResult[];
};

const entityLabels: Record<string, string> = {
  admin_page: "Pages",
  assignment: "Assignments",
  document: "Documents",
  document_type: "Document Types",
  organization: "Organizations",
  position: "Positions",
  unit: "Units",
  user: "Users"
};

function resultLabel(result: GlobalSearchResult) {
  return entityLabels[result.entityType] || result.entityType.replaceAll("_", " ");
}

function hrefFor(result: GlobalSearchResult, query: string) {
  if (result.entityType === "document") {
    return `/admin/search?q=${encodeURIComponent(query.trim())}&type=document&id=${encodeURIComponent(result.entityId)}`;
  }

  return result.routePath;
}

function groupsFor(results: GlobalSearchResult[]) {
  const map = new Map<string, GlobalSearchResult[]>();
  for (const result of results) {
    map.set(result.entityType, [...(map.get(result.entityType) || []), result]);
  }

  return Array.from(map.entries()).map<Group>(([key, rows]) => ({
    key,
    label: entityLabels[key] || key.replaceAll("_", " "),
    rows
  }));
}

export function GlobalSearchBox() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const cacheRef = useRef(new Map<string, GlobalSearchResult[]>());
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const groups = useMemo(() => groupsFor(results), [results]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    setActiveIndex(-1);
    setError(null);

    if (trimmed.length < 2) {
      requestRef.current?.abort();
      setLoading(false);
      setResults([]);
      return;
    }

    if (cacheRef.current.has(trimmed.toLowerCase())) {
      setResults(cacheRef.current.get(trimmed.toLowerCase()) || []);
      setOpen(true);
      return;
    }

    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    const timer = window.setTimeout(() => {
      setLoading(true);
      globalSearchApi.search({ limit: 12, q: trimmed }, controller.signal)
        .then((items) => {
          cacheRef.current.set(trimmed.toLowerCase(), items);
          setResults(items);
          setOpen(true);
        })
        .catch((caught) => {
          if ((caught as Error).name !== "AbortError") {
            setError(t("admin.search.error"));
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        });
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, t]);

  function goToSearch() {
    const trimmed = query.trim();
    if (trimmed) {
      setOpen(false);
      navigate(`/admin/search?q=${encodeURIComponent(trimmed)}`);
    }
  }

  function goToResult(result: GlobalSearchResult) {
    setOpen(false);
    navigate(hrefFor(result, query));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(results.length - 1, current + 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(-1, current - 1));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const active = activeIndex >= 0 ? results[activeIndex] : null;
      if (active) {
        goToResult(active);
      } else {
        goToSearch();
      }
    }
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <SearchInput
        aria-autocomplete="list"
        aria-expanded={open}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => query.trim().length >= 2 && setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={t("admin.topbar.searchPlaceholder")}
        value={query}
        wrapperClassName="mx-auto max-w-xl"
      />

      {open && query.trim().length >= 2 ? (
        <div className="absolute left-1/2 top-12 z-50 w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl shadow-slate-900/15">
          <div className="max-h-[28rem] overflow-auto p-2">
            {loading ? (
              <div className="px-3 py-6 text-center text-sm text-slate-500">{t("admin.search.loading")}</div>
            ) : error ? (
              <div className="px-3 py-6 text-center text-sm text-red-600">{error}</div>
            ) : results.length ? (
              <div className="space-y-2">
                {groups.map((group) => (
                  <div key={group.key}>
                    <p className="px-2 py-1 text-xs font-bold uppercase tracking-wide text-slate-500">{group.label}</p>
                    <div className="space-y-1">
                      {group.rows.map((result) => {
                        const index = results.indexOf(result);
                        return (
                          <button
                            className={cx(
                              "flex w-full min-w-0 items-start gap-3 rounded-lg px-3 py-2 text-start transition",
                              activeIndex === index ? "bg-blue-50 text-[#061d49]" : "hover:bg-slate-50"
                            )}
                            key={`${result.entityType}-${result.entityId}-${result.id}`}
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={() => goToResult(result)}
                            type="button"
                          >
                            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#061d49]">
                              <Icon className="h-4 w-4" name={result.entityType === "document" ? "document" : result.entityType === "user" ? "users" : result.entityType === "position" ? "briefcase" : result.entityType === "unit" ? "building" : "search"} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="truncate text-sm font-bold text-slate-950">{result.title}</span>
                                {result.status ? <StatusBadge>{result.status}</StatusBadge> : null}
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-slate-500">{result.subtitle || resultLabel(result)}</span>
                              {result.snippet ? <span className="mt-1 line-clamp-2 block text-xs leading-5 text-slate-600">{result.snippet}</span> : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState label={t("admin.search.empty")} />
            )}
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <span>{t("admin.search.keyboardHint")}</span>
            <Link className="font-semibold text-[#061d49] hover:underline" onClick={() => setOpen(false)} to={`/admin/search?q=${encodeURIComponent(query.trim())}`}>
              {t("admin.search.viewAll")}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
