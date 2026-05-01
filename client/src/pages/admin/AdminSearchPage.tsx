import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { globalSearchApi } from "../../api";
import type { GlobalSearchEntityType, GlobalSearchResult } from "../../api";
import { AdminPageHeader } from "../../components/admin";
import { Button, EmptyState, Icon, SearchInput, StatusBadge } from "../../components/ui";
import { useI18n } from "../../i18n";
import { cx } from "../../lib/classNames";

const typeOptions: Array<{ value: "all" | GlobalSearchEntityType; label: string }> = [
  { value: "all", label: "All" },
  { value: "document", label: "Documents" },
  { value: "user", label: "Users" },
  { value: "position", label: "Positions" },
  { value: "unit", label: "Units" },
  { value: "organization", label: "Organizations" },
  { value: "assignment", label: "Assignments" },
  { value: "document_type", label: "Document Types" },
  { value: "admin_page", label: "Pages" }
];

function iconFor(result: GlobalSearchResult) {
  switch (result.entityType) {
    case "document":
    case "document_type":
      return "document";
    case "user":
      return "users";
    case "position":
      return "briefcase";
    case "unit":
    case "organization":
      return "building";
    case "assignment":
      return "userCheck";
    default:
      return "search";
  }
}

function hrefFor(result: GlobalSearchResult, query: string) {
  if (result.entityType === "document") {
    return `/admin/search?q=${encodeURIComponent(query.trim())}&type=document&id=${encodeURIComponent(result.entityId)}`;
  }

  return result.routePath;
}

export function AdminSearchPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const urlQuery = params.get("q") || "";
  const urlType = (params.get("type") || "all") as "all" | GlobalSearchEntityType;
  const selectedId = params.get("id");
  const [query, setQuery] = useState(urlQuery);
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedResult = useMemo(
    () => selectedId ? results.find((result) => result.entityId === selectedId && result.entityType === urlType) || null : null,
    [results, selectedId, urlType]
  );

  useEffect(() => {
    setQuery(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    const trimmed = urlQuery.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    globalSearchApi.search({
      limit: 50,
      q: trimmed,
      types: urlType === "all" ? undefined : [urlType]
    }, controller.signal)
      .then(setResults)
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

    return () => controller.abort();
  }, [t, urlQuery, urlType]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = new URLSearchParams();
    if (query.trim()) {
      next.set("q", query.trim());
    }
    if (urlType !== "all") {
      next.set("type", urlType);
    }
    setParams(next);
  }

  function setType(type: "all" | GlobalSearchEntityType) {
    const next = new URLSearchParams(params);
    if (type === "all") {
      next.delete("type");
    } else {
      next.set("type", type);
    }
    next.delete("id");
    setParams(next);
  }

  return (
    <div className="min-w-0 space-y-4">
      <AdminPageHeader
        description={t("admin.search.description")}
        title={t("admin.search.title")}
      />

      <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        <div className="border-b border-slate-200 p-4">
          <form className="flex min-w-0 flex-col gap-2 md:flex-row" onSubmit={submit}>
            <SearchInput
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("admin.topbar.searchPlaceholder")}
              value={query}
              wrapperClassName="min-w-0 flex-1"
            />
            <Button icon="search" type="submit" variant="primary">{t("admin.search.submit")}</Button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            {typeOptions.map((option) => (
              <button
                className={cx(
                  "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                  urlType === option.value ? "border-[#061d49] bg-[#061d49] text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                )}
                key={option.value}
                onClick={() => setType(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid min-w-0 gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,.45fr)]">
          <div className="min-w-0">
            {loading ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">{t("admin.search.loading")}</div>
            ) : error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-8 text-center text-sm text-red-700">{error}</div>
            ) : urlQuery.trim().length < 2 ? (
              <EmptyState label={t("admin.search.shortQuery")} />
            ) : results.length ? (
              <div className="space-y-2">
                {results.map((result) => (
                  <Link
                    className={cx(
                      "flex min-w-0 items-start gap-3 rounded-lg border p-3 transition hover:border-blue-200 hover:bg-blue-50/40",
                      selectedResult?.id === result.id ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"
                    )}
                    key={`${result.entityType}-${result.entityId}-${result.id}`}
                    to={hrefFor(result, urlQuery)}
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#061d49]">
                      <Icon className="h-5 w-5" name={iconFor(result)} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-bold text-slate-950">{result.title}</span>
                        {result.status ? <StatusBadge>{result.status}</StatusBadge> : null}
                      </span>
                      <span className="mt-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">{result.entityType.replaceAll("_", " ")}</span>
                      {result.subtitle ? <span className="mt-1 block truncate text-sm text-slate-600">{result.subtitle}</span> : null}
                      {result.snippet ? <span className="mt-1 line-clamp-2 block text-sm leading-6 text-slate-600">{result.snippet}</span> : null}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState label={t("admin.search.empty")} />
            )}
          </div>

          <aside className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
            <h2 className="text-sm font-bold text-slate-950">{t("admin.search.contextTitle")}</h2>
            {selectedResult ? (
              <div className="mt-3 space-y-2 text-sm text-slate-600">
                <p className="font-bold text-[#061d49]">{selectedResult.title}</p>
                {selectedResult.subtitle ? <p>{selectedResult.subtitle}</p> : null}
                {selectedResult.snippet ? <p className="leading-6">{selectedResult.snippet}</p> : null}
                <Button className="mt-2 w-full" icon="view" onClick={() => navigate(hrefFor(selectedResult, urlQuery))} variant="primary">
                  {t("admin.search.openResult")}
                </Button>
              </div>
            ) : (
              <p className="mt-2 text-sm leading-6 text-slate-600">{t("admin.search.contextEmpty")}</p>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}
