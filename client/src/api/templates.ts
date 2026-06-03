import { getJson, patchJson, postJson } from "./http";
import { apiRequest } from "../lib/api";
import type {
  ActiveDocumentTemplate,
  DocumentContent,
  DocumentLayoutDraft,
  DocumentTemplate,
  DocumentTemplateBinding,
  DocumentTemplateDetail,
  DocumentTemplateVersion,
  EntityId,
  TemplateLayout,
  TemplateLocale,
  TemplateVariant
} from "./types";

export type TemplateListScope = "visible" | "mine" | "published" | "submitted";

export type TemplateLogoAsset = {
  id: EntityId;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  created_at?: string;
  preview_url: string;
};

export type CreateTemplateInput = {
  name: string;
  description?: string | null;
  layout_definition?: TemplateLayout;
};

export type UpdateTemplateInput = Partial<CreateTemplateInput>;

export type TemplateBindingInput = {
  document_type_id?: EntityId | null;
  locale: TemplateLocale;
  variant: TemplateVariant;
  template_id: EntityId;
  template_version_id?: EntityId;
};

export type RenderTemplateInput = {
  template_id?: EntityId | null;
  template_version_id?: EntityId | null;
  layout_draft_id?: EntityId | null;
  layout_definition?: TemplateLayout;
  locale: TemplateLocale;
  variant: TemplateVariant;
  output?: "html" | "pdf";
  signature_visibility?: Array<{
    signature_event_id?: EntityId | null;
    is_visible: boolean;
    visibility_reason?: string | null;
  }>;
};

export type PreviewTemplateInput = {
  template_id?: EntityId | null;
  template_version_id?: EntityId | null;
  layout_definition?: TemplateLayout;
  document_type_id?: EntityId | null;
  confidentiality_level_id?: EntityId | null;
  priority_level_id?: EntityId | null;
  document_date?: string | null;
  subject?: string;
  summary?: string | null;
  body?: string;
  document_content?: DocumentContent;
  template_fields?: Record<string, string>;
  locale: TemplateLocale;
  variant: TemplateVariant;
};

export const templateApi = {
  list(scope: TemplateListScope = "visible") {
    return getJson<DocumentTemplate[]>("/api/templates", { scope });
  },

  get(templateId: EntityId) {
    return getJson<DocumentTemplateDetail>(`/api/templates/${templateId}`);
  },

  create(input: CreateTemplateInput) {
    return postJson<DocumentTemplateDetail>("/api/templates", input);
  },

  update(templateId: EntityId, input: UpdateTemplateInput) {
    return patchJson<DocumentTemplateDetail>(`/api/templates/${templateId}`, input);
  },

  remove(templateId: EntityId) {
    return apiRequest<{ deleted: boolean }>(`/api/templates/${templateId}`, { method: "DELETE" });
  },

  submit(templateId: EntityId) {
    return postJson<DocumentTemplateDetail>(`/api/templates/${templateId}/submit`);
  },

  clone(templateId: EntityId) {
    return postJson<DocumentTemplateDetail>(`/api/templates/${templateId}/clone`);
  },

  defaultFor(query: { document_type_id?: EntityId | null; locale: TemplateLocale; variant: TemplateVariant }) {
    return getJson<DocumentTemplateBinding | null>("/api/templates/default", query);
  },

  activeFor(query: { document_type_id?: EntityId | null; locale: TemplateLocale; variant: TemplateVariant }) {
    return getJson<ActiveDocumentTemplate[]>("/api/templates/active", query);
  },

  uploadAsset(input: { original_filename: string; mime_type: string; data_base64: string }) {
    return postJson<{ id: EntityId; storage_path: string; data_url: string }>("/api/templates/assets", input);
  },

  getLayoutDraft(documentId: EntityId) {
    return getJson<DocumentLayoutDraft | null>(`/api/templates/documents/${documentId}/layout-draft`);
  },

  saveLayoutDraft(documentId: EntityId, input: { base_template_version_id?: EntityId | null; layout_definition: TemplateLayout }) {
    return apiRequest<DocumentLayoutDraft>(`/api/templates/documents/${documentId}/layout-draft`, {
      method: "PUT",
      body: JSON.stringify(input)
    });
  },

  render(documentId: EntityId, input: RenderTemplateInput) {
    return postJson<{ renderId?: EntityId; fileAssetId?: EntityId; storagePath?: string; byteSize?: number; html?: string; reused?: boolean; metadata?: Record<string, unknown> }>(
      `/api/templates/documents/${documentId}/render`,
      input
    );
  },

  preview(input: PreviewTemplateInput) {
    return postJson<{ html?: string; layout_definition?: TemplateLayout }>("/api/templates/preview", input);
  },

  admin: {
    listAll() {
      return getJson<DocumentTemplate[]>("/api/admin/templates");
    },

    reviewQueue() {
      return getJson<DocumentTemplateVersion[]>("/api/admin/templates/review-queue");
    },

    approve(templateId: EntityId, versionId: EntityId) {
      return postJson<DocumentTemplateDetail>(`/api/admin/templates/${templateId}/versions/${versionId}/approve`);
    },

    reject(templateId: EntityId, versionId: EntityId, review_note: string) {
      return postJson<DocumentTemplateDetail>(`/api/admin/templates/${templateId}/versions/${versionId}/reject`, { review_note });
    },

    archive(templateId: EntityId) {
      return postJson<DocumentTemplateDetail>(`/api/admin/templates/${templateId}/archive`);
    },

    listBindings() {
      return getJson<DocumentTemplateBinding[]>("/api/admin/templates/bindings");
    },

    createBinding(input: TemplateBindingInput) {
      return postJson<{ id: EntityId }>("/api/admin/templates/bindings", input);
    },

    updateBindingStatus(bindingId: EntityId, status: "active" | "inactive") {
      return patchJson<{ id: EntityId; status: string }>(`/api/admin/templates/bindings/${bindingId}`, { status });
    },

    removeBinding(bindingId: EntityId) {
      return apiRequest<{ id: EntityId; status: string }>(`/api/admin/templates/bindings/${bindingId}`, { method: "DELETE" });
    },

    listLogoAssets() {
      return getJson<TemplateLogoAsset[]>("/api/admin/templates/logo-assets");
    },

    uploadLogoAsset(input: { original_filename: string; mime_type: string; data_base64: string }) {
      return postJson<TemplateLogoAsset>("/api/admin/templates/logo-assets", input);
    },

    archiveLogoAsset(assetId: EntityId) {
      return apiRequest<{ id: EntityId; status: string }>(`/api/admin/templates/logo-assets/${assetId}`, { method: "DELETE" });
    },

    logoAssetContentUrl(assetId: EntityId) {
      return `/api/admin/templates/logo-assets/${assetId}/content`;
    }
  }
};
