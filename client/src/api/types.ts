export type EntityId = number;
export type JsonRecord = Record<string, unknown>;
export type Status = string;

export type AuthUser = {
  id: EntityId;
  uuid: string;
  personId: EntityId;
  email: string;
  username: string;
  status: Status;
  mustChangePassword: boolean;
  displayName: string;
};

export type AuthRole = {
  name: string;
  displayName: string;
};

export type AuthAssignment = {
  id: EntityId;
  uuid: string;
  status: Status;
  isPrimary: boolean;
  unitId: EntityId;
  unitName: string;
  unitCode: string;
  positionId: EntityId;
  positionTitle: string;
  positionCode: string;
};

export type AuthSession = {
  user: AuthUser;
  roles: AuthRole[];
  assignments: AuthAssignment[];
  activeAssignmentId: EntityId | null;
  csrfToken: string;
};

export type LoginInput = {
  identifier: string;
  password: string;
};

export type Assignment = AuthAssignment & {
  startsAt?: string | null;
  endsAt?: string | null;
  unitType?: string;
  isSigningAuthority?: boolean;
};

export type SelectActiveAssignmentResponse = {
  activeAssignmentId: EntityId;
};

export type Person = {
  id: EntityId;
  uuid: string;
  employee_code?: string | null;
  first_name: string;
  last_name?: string | null;
  display_name: string;
  father_name?: string | null;
  email?: string | null;
  phone?: string | null;
  status: Status;
};

export type UserListItem = {
  id: EntityId;
  uuid: string;
  personId: EntityId;
  personDisplayName: string;
  email: string;
  username: string;
  status: Status;
  mustChangePassword: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  roleDisplayNames?: string[];
  roleNames?: string[];
};

export type Role = {
  id: EntityId;
  uuid: string;
  name: string;
  display_name?: string;
  displayName?: string;
  description?: string | null;
  is_system?: boolean;
};

export type Organization = {
  id: EntityId;
  uuid: string;
  code: string;
  name: string;
  name_local?: string | null;
  description?: string | null;
  status: Status;
  created_at?: string | null;
  updated_at?: string | null;
};

export type UnitType = {
  id: EntityId;
  uuid: string;
  code: string;
  name: string;
  hierarchy_level: number;
  allows_children: boolean;
  status: Status;
  description?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type Unit = {
  id: EntityId;
  uuid: string;
  organization_id: EntityId;
  unit_type_id: EntityId;
  parent_unit_id?: EntityId | null;
  code: string;
  name: string;
  name_local?: string | null;
  description?: string | null;
  status: Status;
  organizationName?: string;
  unitTypeCode?: string;
  unitTypeName?: string;
  parentUnitName?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type StructureImportSheet = "organizations" | "unit_types" | "units";

export type StructureImportOperationType = "create" | "update" | "unchanged";

export type StructureImportError = {
  code: string;
  column?: string;
  message: string;
  row: number;
  sheet: StructureImportSheet;
};

export type StructureImportOperation = {
  code: string;
  label: string;
  operation: StructureImportOperationType;
  row: number;
  sheet: StructureImportSheet;
};

export type StructureImportSummarySection = {
  create: number;
  unchanged: number;
  update: number;
};

export type StructureImportPreview = {
  canApply: boolean;
  errors: StructureImportError[];
  operations: StructureImportOperation[];
  summary: {
    errors: number;
    organizations: StructureImportSummarySection;
    unitTypes: StructureImportSummarySection;
    units: StructureImportSummarySection;
  };
};

export type Position = {
  id: EntityId;
  uuid: string;
  organization_id?: EntityId | null;
  code: string;
  title: string;
  title_local?: string | null;
  authority_level: number;
  is_signing_authority: boolean;
  description?: string | null;
  status: Status;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AdminAssignment = {
  id: EntityId;
  uuid: string;
  person_id: EntityId;
  unit_id: EntityId;
  position_id: EntityId;
  status: Status;
  is_primary: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  personDisplayName?: string;
  unitName?: string;
  positionTitle?: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type DocumentType = {
  id: EntityId;
  uuid: string;
  code: string;
  name: string;
  description?: string | null;
  requires_serial: boolean;
  status: Status;
};

export type ConfidentialityLevel = {
  id: EntityId;
  uuid: string;
  code: string;
  name: string;
  rank: number;
  is_default: boolean;
  requires_access_log: boolean;
  description?: string | null;
  status: Status;
};

export type PriorityLevel = {
  id: EntityId;
  uuid: string;
  code: string;
  name: string;
  rank: number;
  default_due_days?: number | null;
  color?: string | null;
  description?: string | null;
  status: Status;
};

export type AuditLog = {
  id: EntityId;
  actorUserId?: EntityId | null;
  actorAssignmentId?: EntityId | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: JsonRecord | string | null;
  createdAt: string;
  actorUsername?: string | null;
  actorDisplayName?: string | null;
  actorPositionTitle?: string | null;
  actorUnitName?: string | null;
};

export type GlobalSearchEntityType =
  | "admin_page"
  | "assignment"
  | "document"
  | "document_type"
  | "organization"
  | "position"
  | "unit"
  | "user";

export type GlobalSearchResult = {
  id: EntityId;
  entityType: GlobalSearchEntityType;
  entityId: string;
  title: string;
  subtitle?: string | null;
  snippet?: string | null;
  status?: string | null;
  routePath: string;
  score: number;
  metadata: JsonRecord;
};

export type NotificationItem = {
  id: EntityId;
  uuid: string;
  recipient_user_id: EntityId;
  recipient_assignment_id?: EntityId | null;
  document_id?: EntityId | null;
  transmission_id?: EntityId | null;
  notification_type: string;
  channel: string;
  title: string;
  body?: string | null;
  status: string;
  read_at?: string | null;
  sent_at?: string | null;
  failed_at?: string | null;
  failure_reason?: string | null;
  payload?: JsonRecord | string | null;
  created_at: string;
  updated_at?: string | null;
};

export type DocumentListItem = {
  id: EntityId;
  uuid: string;
  internalReference: string;
  subject: string;
  status: Status;
  officialSerial?: string | null;
  createdAt: string;
  updatedAt: string;
  documentTypeCode: string;
  documentTypeName: string;
  currentHolderUnitName: string;
};

export type CreateDocumentInput = {
  document_type_id: EntityId;
  subject: string;
  summary?: string | null;
  body?: string;
  confidentiality_level_id: EntityId;
  priority_level_id: EntityId;
  origin_unit_id?: EntityId;
  owner_unit_id?: EntityId;
  current_holder_unit_id?: EntityId;
  change_reason?: string | null;
};

export type UpdateDocumentInput = Partial<CreateDocumentInput> & {
  material_change?: boolean;
};

export type DocumentWorkflowEvent = {
  id: EntityId;
  uuid: string;
  document_id: EntityId;
  actor_assignment_id: EntityId;
  routing_rule_id?: EntityId | null;
  action: string;
  from_status?: string | null;
  to_status?: string | null;
  from_unit_id?: EntityId | null;
  to_unit_id?: EntityId | null;
  note?: string | null;
  return_reason?: string | null;
  payload?: JsonRecord | string | null;
  created_at: string;
};

export type DocumentTask = {
  id: EntityId;
  uuid: string;
  document_id: EntityId;
  workflow_event_id?: EntityId | null;
  created_by_assignment_id: EntityId;
  assigned_unit_id?: EntityId | null;
  assigned_position_id?: EntityId | null;
  assigned_assignment_id?: EntityId | null;
  task_type: string;
  status: Status;
  title: string;
  description?: string | null;
  due_at?: string | null;
};

export type DocumentDetail = {
  document: JsonRecord & { id: EntityId; subject: string; status: Status };
  versions: JsonRecord[];
  attachments: JsonRecord[];
  relations: JsonRecord[];
  workflowEvents: DocumentWorkflowEvent[];
  tasks: DocumentTask[];
  signatureSlots: SignatureSlot[];
  signatureEvents: JsonRecord[];
  serialAssignment: JsonRecord | null;
};

export type WorkflowAction = {
  id: EntityId;
  action: string;
  allowed: string;
  priority: number;
  requiresTargetUnitTypeId: EntityId | null;
  requiresTargetUnitTypeCode: string | null;
  requiresTargetPositionId: EntityId | null;
  requiresTargetPositionCode: string | null;
  priorReviewRequired: boolean;
  priorSignatureRequired: boolean;
  isExternalTarget: boolean;
  isMultiRecipient: boolean;
  notes?: string | null;
};

export type ExecuteWorkflowActionInput = {
  action: string;
  to_unit_id?: EntityId | null;
  to_assignment_id?: EntityId | null;
  to_position_id?: EntityId | null;
  routing_rule_id?: EntityId | null;
  to_status?: string | null;
  note?: string | null;
  return_reason?: string | null;
  create_task?: boolean;
  task_title?: string | null;
  due_at?: string | Date | null;
  payload?: JsonRecord;
};

export type SignatureProfile = {
  id: EntityId;
  uuid: string;
  status: Status;
  activeAssetUuid?: string | null;
  activeOriginalFilename?: string | null;
  failedPinAttempts?: number;
  lockedUntil?: string | null;
};

export type EnrollSignatureProfileInput = {
  pin: string;
  signature_image_base64: string;
  original_filename?: string;
  mime_type?: string;
};

export type SignatureSlot = {
  id: EntityId;
  uuid: string;
  document_id: EntityId;
  signature_rule_id?: EntityId | null;
  step_number: number;
  required_position_id: EntityId;
  target_unit_id?: EntityId | null;
  required_unit_scope: string;
  signature_mode: string;
  is_required: boolean;
  is_parallel: boolean;
  can_finalize_document: boolean;
  can_be_hidden_later: boolean;
  status: Status;
  requiredPositionTitle?: string;
  requiredPositionCode?: string;
  targetUnitName?: string | null;
};

export type SignSlotInput = {
  pin: string;
  render_page?: number | null;
  render_x?: number | null;
  render_y?: number | null;
  render_width?: number | null;
  render_height?: number | null;
};

export type RoutingRule = JsonRecord & {
  id: EntityId;
  uuid: string;
  action: string;
  allowed: string;
  priority: number;
  status: Status;
};

export type RoutingRuleDetail = {
  rule: RoutingRule;
  conditions: JsonRecord[];
};

export type TemplateVariant = "official" | "internal" | "archive" | "routing_sheet";
export type TemplateLocale = "all" | "en" | "fa-AF" | "ps-AF";

export type TemplateBlockStyle = {
  fontSize?: number;
  fontWeight?: string;
  textAlign?: "start" | "center" | "end" | "left" | "right";
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: string;
};

export type TemplateBlock = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  content?: string;
  field?: string;
  src?: string;
  rows?: string[][];
  mode?: string;
  limit?: number;
  style?: TemplateBlockStyle;
};

export type TemplateLayout = {
  page: {
    widthMm: 210;
    heightMm: 297;
    direction: "ltr" | "rtl";
    backgroundColor?: string;
    marginTopMm?: number;
    marginRightMm?: number;
    marginBottomMm?: number;
    marginLeftMm?: number;
  };
  blocks: TemplateBlock[];
};

export type DocumentTemplate = {
  id: EntityId;
  uuid: string;
  owner_user_id: EntityId;
  owner_assignment_id?: EntityId | null;
  name: string;
  description?: string | null;
  status: string;
  visibility: string;
  current_version_id?: EntityId | null;
  ownerDisplayName?: string | null;
  currentVersionNumber?: number | null;
  currentVersionStatus?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type DocumentTemplateVersion = {
  id: EntityId;
  uuid: string;
  template_id: EntityId;
  version_number: number;
  status: string;
  layout_definition: TemplateLayout;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
  templateName?: string | null;
  ownerDisplayName?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type DocumentTemplateDetail = {
  template: DocumentTemplate;
  versions: DocumentTemplateVersion[];
};

export type DocumentTemplateBinding = {
  id: EntityId;
  uuid: string;
  document_type_id?: EntityId | null;
  locale: TemplateLocale;
  variant: TemplateVariant;
  template_id: EntityId;
  template_version_id: EntityId;
  status: string;
  documentTypeName?: string | null;
  templateName?: string | null;
  templateVersionNumber?: number | null;
};

export type DocumentLayoutDraft = {
  id: EntityId;
  uuid: string;
  document_id: EntityId;
  owner_user_id: EntityId;
  base_template_version_id?: EntityId | null;
  status: string;
  layout_definition: TemplateLayout;
};
