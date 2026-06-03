import { Button, Icon, IconButton } from "../../../ui";
import type { EntityId } from "../../../../api";
import type { TemplateLogoAsset } from "../../../../api/templates";
import { cx } from "../../../../lib/classNames";

type LogoAssetPickerModalProps = {
  allowedMimeTypes: string[];
  assets: TemplateLogoAsset[];
  busy: boolean;
  error: string | null;
  formatBytes: (value: number) => string;
  isOpen: boolean;
  logoLimit: number;
  maxLogoBytes: number;
  onArchive: (assetId: EntityId) => void;
  onClose: () => void;
  onRefresh: () => void;
  onSelectAsset: (assetId: EntityId) => void;
  onUpload: (file: File | null | undefined) => void;
  onUseAsset: (asset: TemplateLogoAsset) => void;
  selectedAssetId: EntityId | null;
};

export function LogoAssetPickerModal({
  allowedMimeTypes,
  assets,
  busy,
  error,
  formatBytes,
  isOpen,
  logoLimit,
  maxLogoBytes,
  onArchive,
  onClose,
  onRefresh,
  onSelectAsset,
  onUpload,
  onUseAsset,
  selectedAssetId
}: LogoAssetPickerModalProps) {
  if (!isOpen) {
    return null;
  }

  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) || null;
  const remainingSlots = Math.max(0, logoLimit - assets.length);

  return (
    <div className="fixed inset-0 z-50">
      <button aria-label="Close logo picker" className="absolute inset-0 cursor-default bg-slate-950/35" onClick={onClose} type="button" />
      <section className="absolute left-1/2 top-1/2 flex max-h-[88vh] w-[min(56rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-black text-slate-950">Official Logo Library</h2>
            <p className="mt-1 text-sm text-slate-500">{assets.length}/{logoLimit} active logos - {remainingSlots} upload slots remaining</p>
          </div>
          <div className="flex items-center gap-2">
            <Button className="min-h-9 px-3 py-1.5 text-xs" disabled={busy} icon="reset" onClick={onRefresh}>Refresh</Button>
            <IconButton className="h-9 w-9 rounded-md" icon="x" label="Close logo picker" onClick={onClose} />
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}

          <div className="mb-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-bold text-slate-950">Upload logo</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">PNG, JPG, WEBP, or SVG. Maximum {formatBytes(maxLogoBytes)}.</p>
              </div>
              <label className={cx(
                "inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition",
                busy || remainingSlots <= 0 ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400" : "border-[#061d49] bg-[#061d49] text-white shadow-sm hover:bg-[#082861]"
              )}>
                <Icon className="h-4 w-4" name="upload" />
                Upload and insert
                <input
                  accept={allowedMimeTypes.join(",")}
                  className="hidden"
                  disabled={busy || remainingSlots <= 0}
                  onChange={(event) => {
                    onUpload(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                  type="file"
                />
              </label>
            </div>
          </div>

          {assets.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {assets.map((asset) => (
                <div
                  className={cx(
                    "group min-w-0 rounded-lg border p-3 text-start transition",
                    selectedAssetId === asset.id ? "border-[#061d49] bg-blue-50 ring-2 ring-[#061d49]/10" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  )}
                  key={asset.id}
                  onDoubleClick={() => onUseAsset(asset)}
                >
                  <button className="block w-full text-start" onClick={() => onSelectAsset(asset.id)} type="button">
                    <span className="flex aspect-[4/3] items-center justify-center rounded-md border border-slate-200 bg-white p-3">
                      <img alt="" className="max-h-full max-w-full object-contain" src={asset.preview_url} />
                    </span>
                  </button>
                  <div className="mt-3 flex min-w-0 items-start justify-between gap-2">
                    <button className="min-w-0 flex-1 text-start" onClick={() => onSelectAsset(asset.id)} type="button">
                      <p className="truncate text-sm font-bold text-slate-950">{asset.original_filename}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{asset.mime_type} - {formatBytes(asset.byte_size)}</p>
                    </button>
                    <IconButton
                      className="h-8 w-8 rounded-md opacity-80 hover:opacity-100"
                      disabled={busy}
                      icon="x"
                      label="Archive logo"
                      onClick={(event) => {
                        event.stopPropagation();
                        onArchive(asset.id);
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
              <Icon className="mx-auto h-8 w-8 text-slate-400" name="image" />
              <p className="mt-3 text-sm font-bold text-slate-700">No official logos uploaded yet.</p>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4">
          <p className="text-xs font-semibold text-slate-500">Double-click a logo to insert it quickly.</p>
          <div className="flex flex-wrap gap-2">
            <Button icon="x" onClick={onClose}>Cancel</Button>
            <Button disabled={busy || !selectedAsset} icon="image" onClick={() => selectedAsset ? onUseAsset(selectedAsset) : undefined} variant="primary">
              Insert selected
            </Button>
          </div>
        </footer>
      </section>
    </div>
  );
}
