import { useEffect, useMemo, useReducer, useState } from "react";
import type { ReactNode } from "react";
import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import Placeholder from "@tiptap/extension-placeholder";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Columns3,
  Italic,
  List,
  ListOrdered,
  Minus,
  Redo2,
  Rows3,
  Table as TableIcon,
  Trash2,
  Type,
  Underline as UnderlineIcon,
  Undo2
} from "lucide-react";
import type { DocumentContent, DocumentFreeBlock, JsonRecord, TipTapNode } from "../../api";
import { cx } from "../../lib/classNames";
import { Button } from "../ui";

type StructuredDocumentEditorProps = {
  allowFreeBlocks?: boolean;
  allowTables?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  onChange?: (content: DocumentContent) => void;
  placeholder?: string;
  toolbarMode?: "full" | "minimal" | "none";
  value: DocumentContent;
};

const emptyBody: TipTapNode = { type: "doc", content: [{ type: "paragraph" }] };

function recordValue(value: unknown): JsonRecord {
  if (!value) {
    return {};
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as JsonRecord : {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function nodeFromPlainText(value: string): TipTapNode {
  const text = value.replace(/\r\n?/g, "\n");
  if (!text.trim()) {
    return emptyBody;
  }
  return {
    type: "doc",
    content: text.split(/\n{2,}/).map((paragraph) => ({
      type: "paragraph",
      content: paragraph.split("\n").flatMap((line, index) => {
        const nodes: TipTapNode[] = [];
        if (index) {
          nodes.push({ type: "hardBreak" });
        }
        if (line) {
          nodes.push({ type: "text", text: line });
        }
        return nodes;
      })
    }))
  };
}

export function emptyDocumentContent(metadata: DocumentContent["metadata"] = {}): DocumentContent {
  return {
    version: 1,
    body: emptyBody,
    templateFields: {},
    freeBlocks: [],
    pagination: { mode: "auto", manualBreaks: true },
    metadata: {
      pageNumberMode: "system",
      pageNumberStart: 1,
      ...metadata
    }
  };
}

export function documentContentFromBody(body = "", metadata: DocumentContent["metadata"] = {}, templateFields: Record<string, string> = {}): DocumentContent {
  return {
    ...emptyDocumentContent(metadata),
    body: nodeFromPlainText(body),
    templateFields
  };
}

export function safeDocumentContent(value: unknown, fallbackBody = "", metadata: DocumentContent["metadata"] = {}, templateFields: Record<string, string> = {}): DocumentContent {
  const source = recordValue(value);
  const body = recordValue(source.body);
  return {
    version: 1,
    body: typeof body.type === "string" ? body as TipTapNode : nodeFromPlainText(fallbackBody),
    templateFields: {
      ...templateFields,
      ...(Object.fromEntries(Object.entries(recordValue(source.templateFields)).filter(([, item]) => typeof item === "string")) as Record<string, string>)
    },
    freeBlocks: Array.isArray(source.freeBlocks) ? source.freeBlocks.filter((item) => typeof item === "object" && item).slice(0, 40) as DocumentFreeBlock[] : [],
    pagination: { mode: "auto", manualBreaks: true },
    metadata: {
      pageNumberMode: "system",
      pageNumberStart: 1,
      ...metadata,
      ...recordValue(source.metadata)
    }
  };
}

function plainTextForNode(node: TipTapNode): string {
  if (node.type === "text") {
    return node.text || "";
  }
  if (node.type === "hardBreak") {
    return "\n";
  }
  if (node.type === "horizontalRule") {
    return "\n\n";
  }
  const children = (node.content || []).map((child) => plainTextForNode(child)).join("");
  if (["paragraph", "heading", "blockquote", "listItem"].includes(node.type)) {
    return `${children}\n`;
  }
  if (node.type === "tableCell" || node.type === "tableHeader") {
    return `${children.trim()} | `;
  }
  if (node.type === "tableRow") {
    return `${children.replace(/\s+\|\s*$/, "")}\n`;
  }
  if (node.type === "table") {
    return `${children}\n`;
  }
  return children;
}

export function documentContentToPlainText(content: DocumentContent) {
  return plainTextForNode(content.body)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function freeBlockText(block: DocumentFreeBlock) {
  return plainTextForNode(block.content).trim();
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function newBlockId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `free-${Date.now()}`;
}

function ToolbarGroup({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div aria-label={label} className="flex min-w-0 items-center gap-1 border-r border-slate-200 pr-2 last:border-r-0 last:pr-0" role="group">
      {children}
    </div>
  );
}

function ToolbarButton({ active, children, disabled, icon, label, onClick }: {
  active?: boolean;
  children?: ReactNode;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={typeof active === "boolean" ? active : undefined}
      className={`inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md border px-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#061d49]/10 disabled:cursor-not-allowed disabled:opacity-45 ${active ? "border-[#061d49] bg-[#061d49] text-white shadow-sm shadow-slate-900/10" : "border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900 disabled:hover:border-transparent disabled:hover:bg-transparent disabled:hover:text-slate-600"}`}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      title={label}
      type="button"
    >
      {icon}
      {children}
    </button>
  );
}

function ToolbarSelect({ children, disabled, icon, label, onChange, value }: {
  children: ReactNode;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="relative inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white pl-2 pr-7 text-xs font-bold text-slate-700 shadow-sm shadow-slate-900/[0.03] transition focus-within:border-[#061d49] focus-within:ring-4 focus-within:ring-[#061d49]/10">
      {icon}
      <span className="sr-only">{label}</span>
      <select
        className="max-w-32 appearance-none bg-transparent py-1 outline-none disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        title={label}
        value={value}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-slate-500" />
    </label>
  );
}

export function StructuredDocumentEditor({
  allowFreeBlocks = false,
  allowTables = true,
  disabled = false,
  invalid = false,
  onChange,
  placeholder = "Write the document body...",
  toolbarMode = "full",
  value
}: StructuredDocumentEditorProps) {
  const [lastExternalValue, setLastExternalValue] = useState(() => JSON.stringify(value.body));
  const [, refreshToolbar] = useReducer((version: number) => version + 1, 0);
  const showToolbar = !disabled && toolbarMode !== "none";
  const showFullToolbar = toolbarMode === "full";
  const extensions = useMemo(() => [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] }
    }),
    Underline,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    Placeholder.configure({ placeholder })
  ], [placeholder]);

  const editor = useEditor({
    content: value.body as JSONContent,
    editable: !disabled,
    editorProps: {
      attributes: {
        class: "min-h-80 w-full px-4 py-4 text-sm leading-7 text-slate-900 outline-none"
      }
    },
    extensions,
    immediatelyRender: false,
    onUpdate: ({ editor: updatedEditor }) => {
      const nextBody = updatedEditor.getJSON() as TipTapNode;
      setLastExternalValue(JSON.stringify(nextBody));
      onChange?.({ ...value, body: nextBody });
    }
  });

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.on("selectionUpdate", refreshToolbar);
    editor.on("transaction", refreshToolbar);
    editor.on("focus", refreshToolbar);
    editor.on("blur", refreshToolbar);

    return () => {
      editor.off("selectionUpdate", refreshToolbar);
      editor.off("transaction", refreshToolbar);
      editor.off("focus", refreshToolbar);
      editor.off("blur", refreshToolbar);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }
    const nextExternalValue = JSON.stringify(value.body);
    if (nextExternalValue !== lastExternalValue) {
      editor.commands.setContent(value.body as JSONContent);
      setLastExternalValue(nextExternalValue);
    }
  }, [editor, lastExternalValue, value.body]);

  function updateFreeBlocks(freeBlocks: DocumentFreeBlock[]) {
    onChange?.({ ...value, freeBlocks });
  }

  function addFreeBlock() {
    updateFreeBlocks([
      ...value.freeBlocks,
      {
        id: newBlockId(),
        page: 1,
        x: 24,
        y: 84,
        width: 80,
        height: 24,
        content: nodeFromPlainText("")
      }
    ]);
  }

  function updateFreeBlock(blockId: string, patch: Partial<DocumentFreeBlock>) {
    updateFreeBlocks(value.freeBlocks.map((block) => block.id === blockId ? { ...block, ...patch } : block));
  }

  function textStyleValue() {
    if (editor?.isActive("heading", { level: 1 })) {
      return "h1";
    }
    if (editor?.isActive("heading", { level: 2 })) {
      return "h2";
    }
    if (editor?.isActive("heading", { level: 3 })) {
      return "h3";
    }
    return "paragraph";
  }

  function applyTextStyle(style: string) {
    if (!editor) {
      return;
    }
    if (style === "h1") {
      editor.chain().focus().setHeading({ level: 1 }).run();
      return;
    }
    if (style === "h2") {
      editor.chain().focus().setHeading({ level: 2 }).run();
      return;
    }
    if (style === "h3") {
      editor.chain().focus().setHeading({ level: 3 }).run();
      return;
    }
    editor.chain().focus().setParagraph().run();
  }

  const canUndo = Boolean(editor?.can().undo());
  const canRedo = Boolean(editor?.can().redo());

  return (
    <div
      aria-invalid={invalid || undefined}
      className={cx(
        "overflow-hidden rounded-lg border bg-white shadow-sm shadow-slate-900/[0.02] transition focus-within:ring-4",
        invalid
          ? "border-red-300 focus-within:border-red-400 focus-within:ring-red-500/10"
          : "border-slate-200 focus-within:border-[#061d49] focus-within:ring-[#061d49]/10"
      )}
    >
      {showToolbar ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/80 px-2 py-2">
          <ToolbarGroup label="History">
            <ToolbarButton disabled={!editor || !canUndo} icon={<Undo2 className="h-4 w-4" />} label="Undo" onClick={() => editor?.chain().focus().undo().run()} />
            <ToolbarButton disabled={!editor || !canRedo} icon={<Redo2 className="h-4 w-4" />} label="Redo" onClick={() => editor?.chain().focus().redo().run()} />
          </ToolbarGroup>

          <ToolbarGroup label="Text">
            <ToolbarSelect disabled={!editor} icon={<Type className="h-4 w-4" />} label="Text style" onChange={applyTextStyle} value={textStyleValue()}>
              <option value="paragraph">Normal</option>
              <option value="h1">Heading 1</option>
              <option value="h2">Heading 2</option>
              <option value="h3">Heading 3</option>
            </ToolbarSelect>
            <ToolbarButton active={editor?.isActive("bold")} disabled={!editor} icon={<Bold className="h-4 w-4" />} label="Bold" onClick={() => editor?.chain().focus().toggleBold().run()} />
            <ToolbarButton active={editor?.isActive("italic")} disabled={!editor} icon={<Italic className="h-4 w-4" />} label="Italic" onClick={() => editor?.chain().focus().toggleItalic().run()} />
            <ToolbarButton active={editor?.isActive("underline")} disabled={!editor} icon={<UnderlineIcon className="h-4 w-4" />} label="Underline" onClick={() => editor?.chain().focus().toggleUnderline().run()} />
          </ToolbarGroup>

          <ToolbarGroup label="Paragraph">
            <ToolbarButton active={editor?.isActive({ textAlign: "left" })} disabled={!editor} icon={<AlignLeft className="h-4 w-4" />} label="Align left" onClick={() => editor?.chain().focus().setTextAlign("left").run()} />
            <ToolbarButton active={editor?.isActive({ textAlign: "center" })} disabled={!editor} icon={<AlignCenter className="h-4 w-4" />} label="Align center" onClick={() => editor?.chain().focus().setTextAlign("center").run()} />
            <ToolbarButton active={editor?.isActive({ textAlign: "right" })} disabled={!editor} icon={<AlignRight className="h-4 w-4" />} label="Align right" onClick={() => editor?.chain().focus().setTextAlign("right").run()} />
            <ToolbarButton active={editor?.isActive("bulletList")} disabled={!editor} icon={<List className="h-4 w-4" />} label="Bullet list" onClick={() => editor?.chain().focus().toggleBulletList().run()} />
            <ToolbarButton active={editor?.isActive("orderedList")} disabled={!editor} icon={<ListOrdered className="h-4 w-4" />} label="Numbered list" onClick={() => editor?.chain().focus().toggleOrderedList().run()} />
          </ToolbarGroup>

          {showFullToolbar && allowTables ? (
            <ToolbarGroup label="Table">
              <ToolbarButton disabled={!editor} icon={<TableIcon className="h-4 w-4" />} label="Insert table" onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
              <ToolbarButton disabled={!editor || !editor.can().addRowAfter()} icon={<Rows3 className="h-4 w-4" />} label="Add row" onClick={() => editor?.chain().focus().addRowAfter().run()}>Row</ToolbarButton>
              <ToolbarButton disabled={!editor || !editor.can().addColumnAfter()} icon={<Columns3 className="h-4 w-4" />} label="Add column" onClick={() => editor?.chain().focus().addColumnAfter().run()}>Col</ToolbarButton>
              <ToolbarButton disabled={!editor || !editor.can().deleteRow()} icon={<Trash2 className="h-4 w-4" />} label="Delete row" onClick={() => editor?.chain().focus().deleteRow().run()}>Row</ToolbarButton>
              <ToolbarButton disabled={!editor || !editor.can().deleteColumn()} icon={<Trash2 className="h-4 w-4" />} label="Delete column" onClick={() => editor?.chain().focus().deleteColumn().run()}>Col</ToolbarButton>
            </ToolbarGroup>
          ) : null}

          <ToolbarGroup label="Document">
            <ToolbarButton disabled={!editor} icon={<Minus className="h-4 w-4" />} label="Insert page break" onClick={() => editor?.chain().focus().setHorizontalRule().run()}>Page break</ToolbarButton>
          </ToolbarGroup>
        </div>
      ) : null}

      <div className="structured-document-editor" dir="auto">
        <EditorContent editor={editor} />
      </div>

      {allowFreeBlocks ? (
        <div className="space-y-3 border-t border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-slate-900">Free text blocks</p>
              <p className="text-xs text-slate-500">Use editable zones first; add bounded free blocks only when the document needs extra placed text.</p>
            </div>
            {!disabled ? <Button onClick={addFreeBlock} variant="secondary">Add block</Button> : null}
          </div>
          {value.freeBlocks.length ? value.freeBlocks.map((block) => (
            <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3" key={block.id}>
              <textarea
                className="min-h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-sm leading-6 outline-none focus:border-[#061d49] focus:ring-4 focus:ring-[#061d49]/10"
                disabled={disabled}
                dir="auto"
                onChange={(event) => updateFreeBlock(block.id, { content: nodeFromPlainText(event.target.value) })}
                value={freeBlockText(block)}
              />
              <div className="grid gap-2 sm:grid-cols-5">
                {([
                  ["page", 1, 100],
                  ["x", 0, 210],
                  ["y", 0, 297],
                  ["width", 8, 210],
                  ["height", 4, 297]
                ] as const).map(([field, min, max]) => (
                  <label className="text-xs font-bold text-slate-600" key={field}>
                    {field}
                    <input
                      className="mt-1 min-h-9 w-full rounded-md border border-slate-200 px-2 text-sm"
                      disabled={disabled}
                      max={max}
                      min={min}
                      onChange={(event) => updateFreeBlock(block.id, { [field]: clampNumber(Number(event.target.value), min, max) } as Partial<DocumentFreeBlock>)}
                      type="number"
                      value={block[field]}
                    />
                  </label>
                ))}
              </div>
              {!disabled ? (
                <button className="text-xs font-bold text-red-600 hover:text-red-700" onClick={() => updateFreeBlocks(value.freeBlocks.filter((item) => item.id !== block.id))} type="button">
                  Remove block
                </button>
              ) : null}
            </div>
          )) : <p className="text-sm text-slate-500">No free text blocks.</p>}
        </div>
      ) : null}
    </div>
  );
}
