import { apiBlobRequest } from "../lib/api";
import { deleteJson, getJson, patchJson, postForm, postJson } from "./http";
import type { QueryValue } from "./http";
import type {
  AdminAssignment,
  AuditLog,
  ConfidentialityLevel,
  DocumentWriteMode,
  DocumentWriteRule,
  DocumentType,
  EntityId,
  JsonRecord,
  Organization,
  Person,
  Position,
  PriorityLevel,
  Role,
  StructureImportPreview,
  Unit,
  UnitType,
  UserListItem
} from "./types";

type StatusPatch = {
  status?: string;
};

type PersonInput = Partial<Person> & {
  first_name?: string;
};

type UserInput = {
  person_id: EntityId;
  email: string;
  username: string;
  password: string;
  status?: string;
  must_change_password?: boolean;
  role_names?: string[];
};

type UserUpdateInput = Partial<Omit<UserInput, "person_id">>;

type ResetPasswordInput = {
  password: string;
};

type OrganizationInput = Partial<Organization> & {
  code?: string;
  name?: string;
};

type UnitTypeInput = Partial<UnitType> & {
  code?: string;
  name?: string;
};

type UnitInput = Partial<Unit> & {
  organization_id?: EntityId;
  unit_type_id?: EntityId;
  code?: string;
  name?: string;
};

type PositionInput = Partial<Position> & {
  code?: string;
  title?: string;
};

type AssignmentInput = Partial<AdminAssignment> & {
  person_id?: EntityId;
  position_id?: EntityId;
  reason?: string | null;
};

type DocumentTypeInput = Partial<DocumentType> & {
  code?: string;
  name?: string;
};

type DocumentWriteRuleInput = {
  document_type_id?: EntityId;
  unit_type_id?: EntityId | null;
  position_id?: EntityId | null;
  role_id?: EntityId | null;
  mode?: DocumentWriteMode;
  status?: string;
  notes?: string | null;
};

type ConfidentialityLevelInput = Partial<ConfidentialityLevel> & {
  code?: string;
  name?: string;
};

type PriorityLevelInput = Partial<PriorityLevel> & {
  code?: string;
  name?: string;
};

type RetentionPolicyInput = JsonRecord & {
  code?: string;
  name?: string;
};

type ConfidentialityAccessRuleInput = JsonRecord & {
  confidentiality_level_id?: EntityId;
  subject_type?: string;
};

type ExternalOrganizationInput = JsonRecord & {
  code?: string;
  name?: string;
};

type ExternalRecipientInput = JsonRecord & {
  external_organization_id?: EntityId;
  full_name?: string;
};

type DelegationInput = JsonRecord & {
  delegator_assignment_id?: EntityId;
  delegate_assignment_id?: EntityId;
  starts_at?: string | Date;
  ends_at?: string | Date;
};

type ApiClientInput = {
  name: string;
  scopes?: string[];
};

type AuditLogQuery = {
  action?: QueryValue;
  actor_user_id?: QueryValue;
  date_from?: QueryValue;
  date_to?: QueryValue;
  entity_type?: QueryValue;
  limit?: QueryValue;
  q?: QueryValue;
};

function resourceApi<TRecord, TCreate extends object, TUpdate extends object = Partial<TCreate> & StatusPatch>(path: string) {
  return {
    list() {
      return getJson<TRecord[]>(path);
    },

    create(input: TCreate) {
      return postJson<TRecord>(path, input);
    },

    update(id: EntityId, input: TUpdate) {
      return patchJson<TRecord>(`${path}/${id}`, input);
    }
  };
}

function createOnlyResourceApi<TRecord, TCreate extends object>(path: string) {
  return {
    list() {
      return getJson<TRecord[]>(path);
    },

    create(input: TCreate) {
      return postJson<TRecord>(path, input);
    }
  };
}

export const adminApi = {
  auditLogs: {
    list(query?: AuditLogQuery) {
      return getJson<AuditLog[]>("/api/admin/audit-logs", query);
    }
  },
  persons: resourceApi<Person, PersonInput>("/api/admin/persons"),
  users: {
    list() {
      return getJson<UserListItem[]>("/api/admin/users");
    },

    create(input: UserInput) {
      return postJson<UserListItem>("/api/admin/users", input);
    },

    update(id: EntityId, input: UserUpdateInput) {
      return patchJson<UserListItem>(`/api/admin/users/${id}`, input);
    },

    resetPassword(id: EntityId, input: ResetPasswordInput) {
      return postJson<UserListItem>(`/api/admin/users/${id}/reset-password`, input);
    },

    remove(id: EntityId) {
      return deleteJson<{ id: EntityId; deleted: boolean }>(`/api/admin/users/${id}`);
    }
  },
  roles: {
    list() {
      return getJson<Role[]>("/api/admin/roles");
    }
  },
  organizations: resourceApi<Organization, OrganizationInput>("/api/admin/organizations"),
  unitTypes: resourceApi<UnitType, UnitTypeInput>("/api/admin/unit-types"),
  units: {
    ...resourceApi<Unit, UnitInput>("/api/admin/units"),

    remove(id: EntityId) {
      return deleteJson<{ id: EntityId; deleted: boolean }>(`/api/admin/units/${id}`);
    }
  },
  structure: {
    export() {
      return apiBlobRequest("/api/admin/structure/export");
    },

    template() {
      return apiBlobRequest("/api/admin/structure/template");
    },

    previewImport(file: File) {
      const formData = new FormData();
      formData.append("file", file);
      return postForm<StructureImportPreview>("/api/admin/structure/imports/preview", formData);
    },

    applyImport(file: File) {
      const formData = new FormData();
      formData.append("file", file);
      return postForm<StructureImportPreview>("/api/admin/structure/imports/apply", formData);
    }
  },
  positions: {
    list() {
      return getJson<Position[]>("/api/admin/positions");
    },

    create(input: PositionInput) {
      return postJson<Position>("/api/admin/positions", input);
    },

    update(id: EntityId, input: Partial<PositionInput>) {
      return patchJson<Position>(`/api/admin/positions/${id}`, input);
    },

    remove(id: EntityId) {
      return deleteJson<{ id: EntityId; deleted: boolean }>(`/api/admin/positions/${id}`);
    }
  },
  assignments: {
    list() {
      return getJson<AdminAssignment[]>("/api/admin/assignments");
    },

    create(input: AssignmentInput) {
      return postJson<AdminAssignment>("/api/admin/assignments", input);
    },

    update(id: EntityId, input: Partial<AssignmentInput>) {
      return patchJson<AdminAssignment>(`/api/admin/assignments/${id}`, input);
    },

    remove(id: EntityId) {
      return deleteJson<{ id: EntityId; deleted: boolean }>(`/api/admin/assignments/${id}`);
    }
  },
  documentTypes: {
    list() {
      return getJson<DocumentType[]>("/api/admin/document-types");
    },

    create(input: DocumentTypeInput) {
      return postJson<DocumentType>("/api/admin/document-types", input);
    },

    update(id: EntityId, input: Partial<DocumentTypeInput>) {
      return patchJson<DocumentType>(`/api/admin/document-types/${id}`, input);
    },

    remove(id: EntityId) {
      return deleteJson<{ id: EntityId; deleted: boolean; status: string }>(`/api/admin/document-types/${id}`);
    }
  },
  documentWriteRules: resourceApi<DocumentWriteRule, DocumentWriteRuleInput>("/api/admin/document-write-rules"),
  confidentialityLevels: resourceApi<ConfidentialityLevel, ConfidentialityLevelInput>("/api/admin/confidentiality-levels"),
  priorityLevels: resourceApi<PriorityLevel, PriorityLevelInput>("/api/admin/priority-levels"),
  retentionPolicies: createOnlyResourceApi<JsonRecord, RetentionPolicyInput>("/api/admin/retention-policies"),
  confidentialityAccessRules: createOnlyResourceApi<JsonRecord, ConfidentialityAccessRuleInput>("/api/admin/confidentiality-access-rules"),
  externalOrganizations: createOnlyResourceApi<JsonRecord, ExternalOrganizationInput>("/api/admin/external-organizations"),
  externalRecipients: createOnlyResourceApi<JsonRecord, ExternalRecipientInput>("/api/admin/external-recipients"),
  delegations: createOnlyResourceApi<JsonRecord, DelegationInput>("/api/admin/delegations"),
  apiClients: {
    list() {
      return getJson<JsonRecord[]>("/api/admin/api-clients");
    },

    create(input: ApiClientInput) {
      return postJson<JsonRecord & { clientId: string; clientSecret: string }>("/api/admin/api-clients", input);
    }
  }
};
