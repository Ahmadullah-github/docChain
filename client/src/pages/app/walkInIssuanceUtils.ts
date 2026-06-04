import type {
  CreateWalkInRequestInput,
  EntityId,
  UpdateWalkInPersonsInput,
  WalkInExternalPerson,
  WalkInExternalPersonInput,
  WalkInRequestDetail
} from "../../api";

export type WalkInPersonForm = WalkInExternalPersonInput;

export type WalkInStudentForm = {
  academic_year: string;
  department_id: string;
  faculty_id: string;
  is_student: boolean;
  semester: string;
  student_notes: string;
  student_registration_number: string;
  student_status: string;
};

export type WalkInIntakeForm = {
  destination_organization: string;
  document_type_id: string;
  person: WalkInPersonForm;
  purpose: string;
  relationship_to_subject: string;
  requester: WalkInPersonForm;
  separatePeople: boolean;
  student: WalkInStudentForm;
  subject: WalkInPersonForm;
  taker: WalkInPersonForm;
};

export type WalkInActionState = {
  canArchive: boolean;
  canCancel: boolean;
  canCreateDocument: boolean;
  canFinalize: boolean;
  canHandover: boolean;
  canPrint: boolean;
  canRenderPdf: boolean;
  reasons: {
    archive?: string;
    cancel?: string;
    createDocument?: string;
    finalize?: string;
    handover?: string;
    print?: string;
    renderPdf?: string;
  };
};

const requiredPersonFields: Array<keyof WalkInExternalPersonInput> = [
  "first_name",
  "last_name",
  "father_name",
  "phone_number",
  "tazkira_number"
];

export function blankWalkInPerson(): WalkInPersonForm {
  return {
    address: "",
    father_name: "",
    first_name: "",
    last_name: "",
    notes: "",
    phone_number: "",
    tazkira_number: ""
  };
}

export function blankWalkInStudent(): WalkInStudentForm {
  return {
    academic_year: "",
    department_id: "",
    faculty_id: "",
    is_student: false,
    semester: "",
    student_notes: "",
    student_registration_number: "",
    student_status: ""
  };
}

export function blankWalkInIntakeForm(): WalkInIntakeForm {
  return {
    destination_organization: "",
    document_type_id: "",
    person: blankWalkInPerson(),
    purpose: "",
    relationship_to_subject: "self",
    requester: blankWalkInPerson(),
    separatePeople: false,
    student: blankWalkInStudent(),
    subject: blankWalkInPerson(),
    taker: blankWalkInPerson()
  };
}

function trim(value: unknown) {
  return String(value ?? "").trim();
}

function nullableText(value: string) {
  const next = trim(value);
  return next ? next : null;
}

function numberId(value: string): EntityId | undefined {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next as EntityId : undefined;
}

export function normalizeWalkInPerson(person: WalkInExternalPersonInput): WalkInExternalPersonInput {
  return {
    address: nullableText(person.address || ""),
    father_name: trim(person.father_name),
    first_name: trim(person.first_name),
    last_name: trim(person.last_name),
    notes: nullableText(person.notes || ""),
    phone_number: trim(person.phone_number),
    relationship_to_subject: person.relationship_to_subject ? trim(person.relationship_to_subject) : undefined,
    tazkira_number: trim(person.tazkira_number)
  };
}

export function personName(person?: Pick<WalkInExternalPersonInput, "father_name" | "first_name" | "last_name"> | null) {
  const first = trim(person?.first_name);
  const last = trim(person?.last_name);
  const father = trim(person?.father_name);
  return [first, last, father ? `child of ${father}` : ""].filter(Boolean).join(" ");
}

export function personShortName(person?: Pick<WalkInExternalPersonInput, "first_name" | "last_name"> | null) {
  const name = [trim(person?.first_name), trim(person?.last_name)].filter(Boolean).join(" ");
  return name || "Unnamed person";
}

export function personFormFromRecord(person?: WalkInExternalPerson | null): WalkInPersonForm {
  return {
    address: trim(person?.address),
    father_name: trim(person?.father_name),
    first_name: trim(person?.first_name),
    last_name: trim(person?.last_name),
    notes: trim(person?.notes),
    phone_number: trim(person?.phone_number),
    tazkira_number: trim(person?.tazkira_number)
  };
}

export function intakeFormFromDetail(detail: WalkInRequestDetail): WalkInIntakeForm {
  const requester = personFormFromRecord(detail.requester);
  const subject = personFormFromRecord(detail.subject);
  const taker = personFormFromRecord(detail.taker);
  const relationship = trim(detail.request.taker_relationship_to_subject) || "self";
  const samePerson = JSON.stringify(requester) === JSON.stringify(subject) && JSON.stringify(subject) === JSON.stringify(taker);
  return {
    destination_organization: trim(detail.request.destination_organization),
    document_type_id: String(detail.request.document_type_id || ""),
    person: samePerson ? taker : blankWalkInPerson(),
    purpose: trim(detail.request.purpose),
    relationship_to_subject: relationship,
    requester,
    separatePeople: !samePerson,
    student: {
      academic_year: trim(detail.studentProfile?.academic_year),
      department_id: detail.studentProfile?.department_id ? String(detail.studentProfile.department_id) : "",
      faculty_id: detail.studentProfile?.faculty_id ? String(detail.studentProfile.faculty_id) : "",
      is_student: booleanValue(detail.request.is_student),
      semester: trim(detail.studentProfile?.semester),
      student_notes: trim(detail.studentProfile?.notes),
      student_registration_number: trim(detail.studentProfile?.student_registration_number),
      student_status: trim(detail.studentProfile?.student_status)
    },
    subject,
    taker
  };
}

function validatePerson(person: WalkInExternalPersonInput, label: string) {
  return requiredPersonFields
    .filter((field) => !trim(person[field]))
    .map((field) => `${label}: ${field.replaceAll("_", " ")} is required.`);
}

export function validateWalkInIntake(form: WalkInIntakeForm) {
  const errors: string[] = [];
  if (!numberId(form.document_type_id)) {
    errors.push("Select a document type.");
  }

  if (form.separatePeople) {
    errors.push(...validatePerson(form.requester, "Requester"));
    errors.push(...validatePerson(form.subject, "Document subject"));
    errors.push(...validatePerson(form.taker, "Physical receiver"));
    if (!trim(form.relationship_to_subject)) {
      errors.push("Relationship to the document subject is required.");
    }
  } else {
    errors.push(...validatePerson(form.person, "Person"));
  }

  if (form.student.is_student) {
    if (!numberId(form.student.faculty_id)) {
      errors.push("Select the student's faculty.");
    }
    if (!numberId(form.student.department_id)) {
      errors.push("Select the student's department.");
    }
    if (!trim(form.student.semester)) {
      errors.push("Enter the student's semester.");
    }
  }

  return errors;
}

export function buildWalkInPeoplePayload(form: WalkInIntakeForm) {
  if (!form.separatePeople) {
    return {
      person: {
        ...normalizeWalkInPerson(form.person),
        relationship_to_subject: "self"
      },
      relationship_to_subject: "self"
    };
  }

  const relationship = trim(form.relationship_to_subject);
  return {
    relationship_to_subject: relationship,
    requester: normalizeWalkInPerson(form.requester),
    subject: normalizeWalkInPerson(form.subject),
    taker: {
      ...normalizeWalkInPerson(form.taker),
      relationship_to_subject: relationship
    }
  };
}

export function buildWalkInStudentPayload(student: WalkInStudentForm) {
  if (!student.is_student) {
    return { is_student: false };
  }

  return {
    academic_year: nullableText(student.academic_year),
    department_id: numberId(student.department_id),
    faculty_id: numberId(student.faculty_id),
    is_student: true,
    semester: trim(student.semester),
    student_notes: nullableText(student.student_notes),
    student_registration_number: nullableText(student.student_registration_number),
    student_status: nullableText(student.student_status)
  };
}

export function buildCreateWalkInRequestPayload(form: WalkInIntakeForm): CreateWalkInRequestInput {
  return {
    ...buildWalkInPeoplePayload(form),
    ...buildWalkInStudentPayload(form.student),
    destination_organization: nullableText(form.destination_organization),
    document_type_id: numberId(form.document_type_id) as EntityId,
    purpose: nullableText(form.purpose)
  };
}

export function buildUpdateWalkInPersonsPayload(form: WalkInIntakeForm): UpdateWalkInPersonsInput {
  return {
    ...buildWalkInPeoplePayload(form),
    ...buildWalkInStudentPayload(form.student)
  };
}

export function booleanValue(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

export function walkInDocumentId(detail: WalkInRequestDetail | null) {
  return Number(detail?.document?.id || detail?.request.document_id || 0);
}

export function walkInOfficialSerial(detail: WalkInRequestDetail | null) {
  return trim(detail?.document?.official_serial) || trim(detail?.request.officialSerial);
}

export function walkInDocumentStatus(detail: WalkInRequestDetail | null) {
  return trim(detail?.document?.status) || trim(detail?.request.documentStatus) || "";
}

export function walkInActionState(detail: WalkInRequestDetail | null): WalkInActionState {
  const requestStatus = trim(detail?.request.status);
  const documentStatus = walkInDocumentStatus(detail);
  const documentId = walkInDocumentId(detail);
  const officialSerial = walkInOfficialSerial(detail);
  const hasPrint = Boolean(detail?.printEvents.length);
  const hasHandover = Boolean(detail?.handoverRecords.length);
  const canceled = requestStatus === "canceled";
  const documentClosed = ["archived", "closed"].includes(documentStatus);
  const finalizedDocument = Boolean(officialSerial && documentStatus === "finalized");

  const state: WalkInActionState = {
    canArchive: false,
    canCancel: false,
    canCreateDocument: false,
    canFinalize: false,
    canHandover: false,
    canPrint: false,
    canRenderPdf: false,
    reasons: {}
  };

  state.canCreateDocument = Boolean(detail && !canceled && !documentId && requestStatus === "intake");
  state.reasons.createDocument = !detail
    ? "Create the intake request first."
    : canceled
      ? "Canceled requests cannot create documents."
      : documentId
        ? "The linked document already exists."
        : requestStatus !== "intake"
          ? "Documents can only be created from intake."
          : undefined;

  state.canFinalize = Boolean(detail && documentId && !officialSerial && !["finalized", "archived", "closed"].includes(documentStatus) && !canceled);
  state.reasons.finalize = !documentId
    ? "Create the linked document first."
    : canceled
      ? "Canceled requests cannot be finalized."
      : officialSerial
        ? "The document already has an official serial."
        : ["finalized", "archived", "closed"].includes(documentStatus)
          ? "This document is no longer draft-finalizable."
          : undefined;

  state.canRenderPdf = Boolean(detail && documentId && officialSerial);
  state.reasons.renderPdf = !documentId
    ? "Create the linked document first."
    : !officialSerial
      ? "Finalize the document to assign an official serial first."
      : undefined;

  state.canPrint = Boolean(detail && documentId && officialSerial && ["finalized", "archived"].includes(documentStatus) && !canceled);
  state.reasons.print = !documentId
    ? "Create the linked document first."
    : !officialSerial
      ? "Finalize the document to assign an official serial first."
      : !["finalized", "archived"].includes(documentStatus)
        ? "Print can only be recorded after finalization."
        : canceled
          ? "Canceled requests cannot be printed."
          : undefined;

  state.canHandover = Boolean(detail && finalizedDocument && hasPrint && !hasHandover && !canceled);
  state.reasons.handover = !documentId
    ? "Create the linked document first."
    : !finalizedDocument
      ? "Handover requires a finalized document with an official serial."
      : !hasPrint
        ? "Record at least one print event first."
        : hasHandover
          ? "This request already has a handover record."
          : canceled
            ? "Canceled requests cannot be handed over."
            : undefined;

  state.canArchive = Boolean(detail && documentId && hasHandover && !documentClosed && !canceled);
  state.reasons.archive = !documentId
    ? "Create the linked document first."
    : !hasHandover
      ? "Record physical handover before archive."
      : documentClosed
        ? "This document is already archived or closed."
        : canceled
          ? "Canceled requests cannot be archived."
          : undefined;

  state.canCancel = Boolean(detail && !["finalized", "printed", "handed_over", "archived", "canceled"].includes(requestStatus) && !officialSerial && !["finalized", "archived", "closed"].includes(documentStatus));
  state.reasons.cancel = !detail
    ? "Create an intake before canceling."
    : ["finalized", "printed", "handed_over", "archived", "canceled"].includes(requestStatus) || officialSerial || ["finalized", "archived", "closed"].includes(documentStatus)
      ? "Cancel is only available before finalization."
      : undefined;

  return state;
}
