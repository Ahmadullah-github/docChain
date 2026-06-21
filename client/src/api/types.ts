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
  isSigningAuthority?: boolean | number;
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

export type ForgotPasswordInput = {
  identifier: string;
};

export type ForgotPasswordResponse = {
  requested: boolean;
  resetUrl?: string | null;
  expiresInMinutes: number;
};

export type ResetPasswordInput = {
  token: string;
  new_password: string;
};

export type ResetPasswordResponse = {
  reset: boolean;
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
  unit_id: EntityId;
  organization_id?: EntityId | null;
  code: string;
  title: string;
  title_local?: string | null;
  authority_level: number;
  is_signing_authority: boolean;
  allows_multiple_active_assignments?: boolean;
  description?: string | null;
  status: Status;
  unitCode?: string;
  unitName?: string;
  organizationId?: EntityId;
  organizationName?: string;
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

export type DocumentWriteMode = "locked" | "free";

export type DocumentWriteRule = {
  id: EntityId;
  uuid: string;
  document_type_id: EntityId;
  documentTypeCode?: string | null;
  documentTypeName?: string | null;
  unit_type_id?: EntityId | null;
  unitTypeCode?: string | null;
  unitTypeName?: string | null;
  position_id?: EntityId | null;
  positionCode?: string | null;
  positionTitle?: string | null;
  role_id?: EntityId | null;
  roleName?: string | null;
  roleDisplayName?: string | null;
  mode: DocumentWriteMode;
  status: Status;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type DocumentWritePermission = {
  documentTypeId: EntityId;
  documentTypeCode: string;
  documentTypeName: string;
  mode: DocumentWriteMode;
  ruleId: EntityId;
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
  is_default: boolean;
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

export type WorkspaceSummary = {
  myTasks: number;
  unitQueue: number;
  signatureQueue: number;
  unreadNotifications: number;
  drafts: number;
};

export type WorkspaceWorkItemType =
  | "activity"
  | "notification"
  | "signature"
  | "task"
  | "unit_document";

export type WorkspaceWorkItem = {
  itemType: WorkspaceWorkItemType;
  id: EntityId;
  title: string;
  subtitle?: string | null;
  status?: string | null;
  requiredAction?: DocumentRequestAction | null;
  canReview?: boolean | number;
  canEdit?: boolean | number;
  canSign?: boolean | number;
  canForward?: boolean | number;
  canFinalize?: boolean | number;
  canArchive?: boolean | number;
  dueAt?: string | null;
  createdAt: string;
  documentId?: EntityId | null;
  documentSubject?: string | null;
  internalReference?: string | null;
  officialSerial?: string | null;
  documentTypeName?: string | null;
  priorityName?: string | null;
  holderUnitName?: string | null;
  assignedPositionTitle?: string | null;
  workflowSummary?: DocumentWorkflowSummary | null;
};

export type WorkspaceReference = {
  documentTypes: DocumentType[];
  confidentialityLevels: ConfidentialityLevel[];
  documentWritePermissions: DocumentWritePermission[];
  priorityLevels: PriorityLevel[];
  templateFieldDefaults?: Record<string, string>;
  units?: WorkspaceTargetUnit[];
};

export type WorkspaceTargetUnit = {
  id: EntityId;
  uuid: string;
  code: string;
  name: string;
  unitTypeCode: string;
  unitTypeName: string;
};

export type WorkspaceTargetAssignment = {
  id: EntityId;
  uuid: string;
  personDisplayName: string;
  unitId: EntityId;
  unitName: string;
  positionId: EntityId;
  positionTitle: string;
};

export type WorkspaceTargets = {
  action: string | null;
  units: WorkspaceTargetUnit[];
  assignments: WorkspaceTargetAssignment[];
};

export type WorkspaceTransmissionTargets = {
  units: WorkspaceTargetUnit[];
  assignments: WorkspaceTargetAssignment[];
};

export type DocumentScope = "accessible" | "created_by_me" | "current_holder" | "origin_unit" | "owner_unit" | "my_tasks" | "signature_queue";
export type DocumentRegistrySort = "updated_desc" | "updated_asc" | "document_date_desc" | "priority_desc";

export type DocumentWorkflowStepStatus = "blocked" | "completed" | "current" | "pending";

export type DocumentWorkflowRouteStep = {
  action?: string | null;
  documentTaskId?: EntityId | null;
  label: string;
  positionId?: EntityId | null;
  status: DocumentWorkflowStepStatus;
  sublabel?: string | null;
  unitId?: EntityId | null;
  workflowEventId?: EntityId | null;
};

export type DocumentWorkflowSummary = {
  activeAction?: string | null;
  completedTaskCount: number;
  openTaskCount: number;
  routeSteps: DocumentWorkflowRouteStep[];
  thumbnailStatus: "available" | "missing" | "pending";
  thumbnailUrl: string;
};

export type DocumentRegistryStats = {
  total: number;
  scopeCounts: Record<string, number>;
  statusCounts: Array<{ status: string; count: number }>;
  typeCounts: Array<{ id: EntityId; code: string; name: string; count: number }>;
  priorityCounts: Array<{ id: EntityId; code: string; name: string; color?: string | null; count: number }>;
  updatedAt: string;
};

export type DocumentListItem = {
  id: EntityId;
  uuid: string;
  documentTypeId?: EntityId;
  priorityLevelId?: EntityId;
  internalReference: string;
  documentDate?: string | null;
  document_date?: string | null;
  subject: string;
  status: Status;
  officialSerial?: string | null;
  creatorAssignmentId?: EntityId;
  createdAt: string;
  updatedAt: string;
  documentTypeCode: string;
  documentTypeName: string;
  priorityCode?: string | null;
  priorityName?: string | null;
  priorityColor?: string | null;
  currentHolderUnitId?: EntityId;
  currentHolderUnitName: string;
  canDelete?: boolean | number;
  canDownloadPdf?: boolean | number;
  canEdit?: boolean | number;
  canOpenPdf?: boolean | number;
  workflowSummary?: DocumentWorkflowSummary | null;
};

export type TipTapMark = {
  type: string;
  attrs?: JsonRecord | null;
};

export type TipTapNode = {
  type: string;
  attrs?: JsonRecord | null;
  content?: TipTapNode[];
  marks?: TipTapMark[];
  text?: string;
};

export type DocumentFreeBlock = {
  id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  content: TipTapNode;
  locked?: boolean;
};

export type DocumentContentMetadata = {
  subject?: string;
  topic?: string;
  subTopic?: string;
  summary?: string;
  date?: string | null;
  pageNumberMode?: "system" | "manual";
  pageNumberStart?: number;
  signatureVisibility?: Record<string, boolean>;
};

export type DocumentContentPagination = {
  mode: "auto";
  manualBreaks: true;
};

export type DocumentContent = {
  version: 1;
  body: TipTapNode;
  templateFields: Record<string, string>;
  freeBlocks: DocumentFreeBlock[];
  pagination: DocumentContentPagination;
  metadata: DocumentContentMetadata;
};

export type CreateDocumentInput = {
  document_type_id: EntityId;
  subject: string;
  document_date?: string | null;
  summary?: string | null;
  body?: string;
  document_content?: DocumentContent;
  template_fields?: Record<string, string>;
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
  action: string;
  required_action?: DocumentRequestAction | "multiple" | null;
  from_status?: string | null;
  to_status?: string | null;
  from_unit_id?: EntityId | null;
  to_unit_id?: EntityId | null;
  to_position_id?: EntityId | null;
  note?: string | null;
  return_reason?: string | null;
  permissions?: JsonRecord | string | null;
  payload?: JsonRecord | string | null;
  created_at: string;
};

export type DocumentRequestAction = "review" | "edit" | "sign" | "forward" | "information";

export type DocumentRequestPermissions = {
  can_review: boolean;
  can_edit: boolean;
  can_sign: boolean;
  can_forward: boolean;
  can_finalize: boolean;
  can_archive: boolean;
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
  required_action?: DocumentRequestAction | null;
  requires_comment?: boolean | number;
  can_review?: boolean | number;
  can_edit?: boolean | number;
  can_sign?: boolean | number;
  can_forward?: boolean | number;
  can_finalize?: boolean | number;
  can_archive?: boolean | number;
  responded_by_assignment_id?: EntityId | null;
  response_outcome?: "approved" | "completed" | "changes_requested" | string | null;
  response_note?: string | null;
  payload?: JsonRecord | string | null;
  status: Status;
  title: string;
  description?: string | null;
  due_at?: string | null;
  completed_at?: string | null;
  completed_by_assignment_id?: EntityId | null;
  completion_note?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  assignedUnitName?: string | null;
  assignedPositionTitle?: string | null;
  assignedAssignmentName?: string | null;
  creatorName?: string | null;
};

export type DocumentAttachmentAccess = {
  downloadedAt?: string | null;
  latestAt?: string | null;
  viewedAt?: string | null;
};

export type DocumentAttachmentReceipt = {
  action: "download" | "view" | string;
  actorName?: string | null;
  actorPositionTitle?: string | null;
  actorUnitName?: string | null;
  assignmentId?: EntityId | null;
  createdAt: string;
  id: EntityId;
  userId?: EntityId | null;
};

export type DocumentAttachmentReceiptSummary = {
  downloadCount: number;
  latestAccessedAt?: string | null;
  latestAction?: string | null;
  latestActorName?: string | null;
  recent: DocumentAttachmentReceipt[];
  viewCount: number;
};

export type DocumentAttachment = JsonRecord & {
  id: EntityId;
  uuid: string;
  document_id: EntityId;
  file_asset_id: EntityId;
  fileAssetId?: EntityId;
  uploaded_by_assignment_id?: EntityId | null;
  attachment_type: string;
  title?: string | null;
  description?: string | null;
  status: Status;
  created_at?: string | null;
  updated_at?: string | null;
  originalFilename?: string | null;
  mimeType?: string | null;
  byteSize?: number | null;
  isPreviewable?: boolean;
  myAccess?: DocumentAttachmentAccess;
  receiptSummary?: DocumentAttachmentReceiptSummary | null;
};

export type DocumentDetail = {
  canUploadAttachments?: boolean;
  document: JsonRecord & {
    current_content_hash?: string | null;
    document_content?: DocumentContent | string | null;
    document_date?: string | null;
    id: EntityId;
    subject: string;
    status: Status;
  };
  versions: JsonRecord[];
  attachments: DocumentAttachment[];
  relations: JsonRecord[];
  workflowEvents: DocumentWorkflowEvent[];
  tasks: DocumentTask[];
  signatureEvents: JsonRecord[];
  renders: DocumentRender[];
  workflowSummary?: DocumentWorkflowSummary | null;
  serialAssignment: JsonRecord | null;
};

export type DocumentRender = JsonRecord & {
  id: EntityId;
  document_id: EntityId;
  file_asset_id?: EntityId | null;
  render_type: string;
  status: string;
  created_at?: string;
  originalFilename?: string | null;
  mimeType?: string | null;
  byteSize?: number | null;
};

export type DocumentSendAction = {
  action: DocumentRequestAction;
  label: string;
  defaultPermissions: DocumentRequestPermissions;
  disabledReason?: string | null;
};

export type DocumentSendPurpose = {
  action: DocumentRequestAction | string;
  label: string;
  category: "correction" | "dispatch" | "edit" | "forward" | "information" | "review" | "signature" | string;
  disabledReason?: string | null;
};

export type DocumentSendTarget = {
  id: string;
  type: "unit" | "unit_position";
  unitId: EntityId;
  unitName: string;
  unitTypeId?: EntityId;
  unitTypeName: string;
  positionId?: EntityId;
  positionTitle?: string;
  hasActiveHolder: boolean;
  holderSummary?: string | null;
  allowedActions: string[];
};

export type DocumentSendOptions = {
  documentState: {
    status: string;
    officialSerial?: string | null;
    canArchive?: boolean;
    canDispatch?: boolean;
    canFinalize?: boolean;
  };
  actions?: DocumentSendAction[];
  purposes: DocumentSendPurpose[];
  targets: DocumentSendTarget[];
};

export type SendDocumentRecipientInput = {
  to_unit_id: EntityId;
  to_position_id?: EntityId | null;
  required_action: DocumentRequestAction;
  requires_comment?: boolean;
  can_review?: boolean;
  can_edit?: boolean;
  can_sign?: boolean;
  can_forward?: boolean;
  can_finalize?: boolean;
  can_archive?: boolean;
  note?: string | null;
  due_at?: string | Date | null;
};

export type SendDocumentInput = {
  recipients?: SendDocumentRecipientInput[];
  note?: string | null;
  action?: string;
  to_unit_id?: EntityId;
  to_position_id?: EntityId | null;
  return_reason?: string | null;
  due_at?: string | Date | null;
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

export type SignTaskInput = {
  pin?: string;
  placement_token?: string;
  expected_document_hash?: string;
  expected_document_version_number?: number;
  print_options?: SignaturePrintOptions;
  response_note?: string | null;
  render_page: number;
  render_x: number;
  render_y: number;
  render_width: number;
  render_height: number;
};

export type SignaturePrintOptions = {
  show_name_position: boolean;
  show_date: boolean;
  show_comment: boolean;
};

export type SignaturePlacement = {
  render_page: number;
  render_x: number;
  render_y: number;
  render_width: number;
  render_height: number;
};

export type SigningSessionInput = {
  pin: string;
  expected_document_hash?: string;
  expected_document_version_number?: number;
  response_note?: string | null;
};

export type SigningSession = {
  expires_at: string;
  placement: SignaturePlacement;
  placement_token: string;
  print_options: SignaturePrintOptions;
  signature_image: SignatureAssetPreview;
  signer?: {
    name?: string | null;
    position?: string | null;
    unit?: string | null;
  } | null;
};

export type SignDocumentInput = SignaturePlacement & {
  placement_token: string;
  print_options?: SignaturePrintOptions;
  response_note?: string | null;
};

export type SignatureUploadSession = {
  id: EntityId;
  token?: string;
  upload_url?: string;
  status: string;
  expires_at?: string;
  expired?: boolean;
  preview_url?: string | null;
  uploadedFileAssetId?: EntityId | null;
};

export type SignatureAssetPreview = {
  data_url: string;
  mime_type: string;
};

export type VerificationResult = {
  status: "valid" | "mismatched" | "invalid" | "expired" | "revoked";
  reason?: string;
  documentSerial?: string | null;
  subject?: string;
  issuer?: {
    position?: string | null;
    unit?: string | null;
  } | null;
  finalizedAt?: string | null;
  finalizedAtShamsi?: string | null;
  signedBy?: Array<{
    name?: string | null;
    position?: string | null;
    signedAt?: string | null;
    unit?: string | null;
  }>;
  documentHash?: {
    matched: boolean;
    value?: string | null;
  };
};

export type TemplateVariant = "official" | "internal" | "archive" | "routing_sheet";
export type TemplateLocale = "all" | "en" | "fa-AF" | "ps-AF";

export type TemplateBlockStyle = {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline";
  textAlign?: "start" | "center" | "end" | "left" | "right";
  letterSpacing?: number;
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: string;
  cellPaddingMm?: number;
  headerBackgroundColor?: string;
  lineHeight?: number;
};

export type TemplateTableCell = string | {
  colSpan?: number;
  content?: string;
  hidden?: boolean;
  richContent?: TipTapNode;
  rowSpan?: number;
  style?: TemplateBlockStyle;
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
  headerRow?: boolean;
  columnWidths?: number[];
  rowHeights?: number[];
  src?: string;
  assetId?: EntityId;
  assetName?: string;
  rows?: TemplateTableCell[][];
  mode?: string;
  limit?: number;
  maxLines?: number;
  minFontSize?: number;
  placeholder?: string;
  pageScope?: "first" | "all" | "except_first" | "last";
  reflowBelow?: boolean;
  hidden?: boolean;
  locked?: boolean;
  style?: TemplateBlockStyle;
};

export type WordTemplateZoneKind =
  | "subject"
  | "body"
  | "recipient"
  | "header_unit"
  | "custom"
  | "system_field"
  | "signature"
  | "date"
  | "serial";

export type WordTemplateZone = {
  id: string;
  key: string;
  label: string;
  kind: WordTemplateZoneKind;
  required?: boolean;
  maxLength?: number;
  maxLines?: number;
  multiline?: boolean;
  richText?: boolean;
  placeholder?: string;
};

export type TemplateLayout = {
  mode?: "legacy" | "word_template";
  schemaVersion?: number;
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
  document?: TipTapNode;
  zones?: WordTemplateZone[];
  meta?: JsonRecord;
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
  templateDescription?: string | null;
  layout_definition?: TemplateLayout;
  layoutDefinition?: TemplateLayout | string | null;
  created_at?: string;
  updated_at?: string;
};

export type ActiveDocumentTemplate = DocumentTemplateBinding & {
  layout_definition: TemplateLayout;
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

export type WalkInPrintType = "original" | "copy" | "reprint";
export type WalkInHandoverMethod = "physical_original" | "physical_copy" | "reprint";

export type WalkInExternalPersonInput = {
  first_name: string;
  last_name: string;
  father_name: string;
  phone_number: string;
  tazkira_number: string;
  relationship_to_subject?: string;
  address?: string | null;
  notes?: string | null;
};

export type WalkInExternalPerson = JsonRecord & WalkInExternalPersonInput & {
  id: EntityId;
  uuid: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type WalkInStudentProfile = JsonRecord & {
  id: EntityId;
  uuid: string;
  external_person_id: EntityId;
  faculty_id: EntityId;
  department_id: EntityId;
  semester: string;
  academic_year?: string | null;
  student_registration_number?: string | null;
  student_status?: string | null;
  notes?: string | null;
  facultyName?: string | null;
  departmentName?: string | null;
};

export type WalkInIssuanceRequest = JsonRecord & {
  id: EntityId;
  uuid: string;
  document_type_id: EntityId;
  requester_person_id: EntityId;
  subject_person_id: EntityId;
  taker_person_id: EntityId;
  taker_relationship_to_subject: string;
  handled_by_assignment_id: EntityId;
  handled_by_unit_id?: EntityId | null;
  document_id?: EntityId | null;
  purpose?: string | null;
  destination_organization?: string | null;
  is_student: boolean | number | string;
  status: Status;
  documentTypeCode?: string | null;
  documentTypeName?: string | null;
  documentStatus?: string | null;
  officialSerial?: string | null;
  finalized_at?: string | null;
  handed_over_at?: string | null;
  archived_at?: string | null;
  canceled_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type WalkInDocumentRecord = JsonRecord & {
  id: EntityId;
  document_type_id: EntityId;
  subject: string;
  status: Status;
  official_serial?: string | null;
  document_date?: string | null;
  summary?: string | null;
  body?: string | null;
  template_fields?: Record<string, string> | string | null;
  document_content?: DocumentContent | string | null;
};

export type WalkInPrintEvent = JsonRecord & {
  id: EntityId;
  document_id: EntityId;
  issuance_request_id: EntityId;
  printed_by_assignment_id: EntityId;
  print_type: WalkInPrintType;
  print_reason?: string | null;
  copy_number: number;
  printed_at?: string | null;
};

export type WalkInHandoverRecord = JsonRecord & {
  id: EntityId;
  document_id: EntityId;
  issuance_request_id: EntityId;
  official_serial_number: string;
  taker_person_id: EntityId;
  handed_by_assignment_id: EntityId;
  handover_method: WalkInHandoverMethod;
  copy_count: number;
  handover_note?: string | null;
  handed_over_at?: string | null;
};

export type WalkInRequestDetail = {
  request: WalkInIssuanceRequest;
  requester: WalkInExternalPerson | null;
  subject: WalkInExternalPerson | null;
  taker: WalkInExternalPerson | null;
  studentProfile: WalkInStudentProfile | null;
  document: WalkInDocumentRecord | null;
  printEvents: WalkInPrintEvent[];
  handoverRecords: WalkInHandoverRecord[];
};

export type WalkInReference = {
  confidentialityLevels: ConfidentialityLevel[];
  departments: Unit[];
  documentTypes: DocumentType[];
  faculties: Unit[];
  priorityLevels: PriorityLevel[];
};

export type CreateWalkInRequestInput = {
  document_type_id: EntityId;
  person?: WalkInExternalPersonInput;
  requester?: WalkInExternalPersonInput;
  subject?: WalkInExternalPersonInput;
  taker?: WalkInExternalPersonInput;
  relationship_to_subject?: string;
  purpose?: string | null;
  destination_organization?: string | null;
  is_student?: boolean;
  faculty_id?: EntityId;
  department_id?: EntityId;
  semester?: string;
  academic_year?: string | null;
  student_registration_number?: string | null;
  student_status?: string | null;
  student_notes?: string | null;
};

export type UpdateWalkInPersonsInput = Omit<CreateWalkInRequestInput, "document_type_id" | "purpose" | "destination_organization">;

export type CreateWalkInDocumentInput = {
  subject?: string;
  document_date?: string | null;
  summary?: string | null;
  body?: string;
  document_content?: DocumentContent;
  template_fields?: Record<string, string>;
  confidentiality_level_id?: EntityId;
  priority_level_id?: EntityId;
  change_reason?: string | null;
};
