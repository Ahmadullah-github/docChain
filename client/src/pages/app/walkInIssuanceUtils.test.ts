import { describe, expect, it } from "vitest";
import type { WalkInRequestDetail } from "../../api";
import {
  blankWalkInIntakeForm,
  buildCreateWalkInRequestPayload,
  buildUpdateWalkInPersonsPayload,
  validateWalkInIntake,
  walkInActionState
} from "./walkInIssuanceUtils";

function detail(overrides: Partial<WalkInRequestDetail> = {}): WalkInRequestDetail {
  return {
    document: null,
    handoverRecords: [],
    printEvents: [],
    request: {
      document_type_id: 12,
      handled_by_assignment_id: 1,
      id: 50,
      is_student: false,
      requester_person_id: 1,
      status: "intake",
      subject_person_id: 1,
      taker_person_id: 1,
      taker_relationship_to_subject: "self",
      uuid: "request-uuid"
    },
    requester: null,
    studentProfile: null,
    subject: null,
    taker: null,
    ...overrides
  };
}

describe("walk-in issuance utilities", () => {
  it("builds the default single-person request payload", () => {
    const form = blankWalkInIntakeForm();
    form.document_type_id = "7";
    form.person = {
      address: "Kabul",
      father_name: "Wali",
      first_name: "Ahmad",
      last_name: "Karimi",
      notes: "",
      phone_number: "0700000000",
      tazkira_number: "12345"
    };
    form.purpose = "Transcript pickup";

    expect(buildCreateWalkInRequestPayload(form)).toMatchObject({
      document_type_id: 7,
      is_student: false,
      person: {
        address: "Kabul",
        father_name: "Wali",
        first_name: "Ahmad",
        last_name: "Karimi",
        phone_number: "0700000000",
        relationship_to_subject: "self",
        tazkira_number: "12345"
      },
      purpose: "Transcript pickup",
      relationship_to_subject: "self"
    });
  });

  it("builds separated requester, subject, and receiver payloads", () => {
    const form = blankWalkInIntakeForm();
    form.document_type_id = "9";
    form.separatePeople = true;
    form.relationship_to_subject = "brother";
    form.requester = { address: "", father_name: "A", first_name: "Req", last_name: "One", notes: "", phone_number: "1", tazkira_number: "11" };
    form.subject = { address: "", father_name: "B", first_name: "Sub", last_name: "Two", notes: "", phone_number: "2", tazkira_number: "22" };
    form.taker = { address: "", father_name: "C", first_name: "Tak", last_name: "Three", notes: "", phone_number: "3", tazkira_number: "33" };

    expect(buildUpdateWalkInPersonsPayload(form)).toMatchObject({
      relationship_to_subject: "brother",
      requester: { first_name: "Req" },
      subject: { first_name: "Sub" },
      taker: { first_name: "Tak", relationship_to_subject: "brother" }
    });
  });

  it("validates required student fields", () => {
    const form = blankWalkInIntakeForm();
    form.document_type_id = "4";
    form.person = { address: "", father_name: "F", first_name: "A", last_name: "B", notes: "", phone_number: "1", tazkira_number: "2" };
    form.student.is_student = true;

    expect(validateWalkInIntake(form)).toEqual([
      "Select the student's faculty.",
      "Select the student's department.",
      "Enter the student's semester."
    ]);
  });

  it("gates print, handover, archive, and cancel actions by lifecycle state", () => {
    const draft = detail({
      document: { document_type_id: 12, id: 90, status: "draft", subject: "Draft" },
      request: { ...detail().request, document_id: 90, status: "draft_created" }
    });
    expect(walkInActionState(draft)).toMatchObject({
      canCancel: true,
      canFinalize: true,
      canPrint: false
    });

    const finalized = detail({
      document: { document_type_id: 12, id: 90, official_serial: "A-1", status: "finalized", subject: "Final" },
      request: { ...detail().request, document_id: 90, status: "finalized" }
    });
    expect(walkInActionState(finalized)).toMatchObject({
      canCancel: false,
      canHandover: false,
      canPrint: true,
      canRenderPdf: true
    });

    const printed = detail({
      document: { document_type_id: 12, id: 90, official_serial: "A-1", status: "finalized", subject: "Final" },
      printEvents: [{ copy_number: 1, document_id: 90, id: 1, issuance_request_id: 50, print_type: "original", printed_by_assignment_id: 1 }],
      request: { ...detail().request, document_id: 90, status: "printed" }
    });
    expect(walkInActionState(printed)).toMatchObject({
      canArchive: false,
      canHandover: true
    });

    const handedOver = detail({
      document: { document_type_id: 12, id: 90, official_serial: "A-1", status: "finalized", subject: "Final" },
      handoverRecords: [{ copy_count: 1, document_id: 90, handed_by_assignment_id: 1, handover_method: "physical_original", id: 2, issuance_request_id: 50, official_serial_number: "A-1", taker_person_id: 1 }],
      printEvents: [{ copy_number: 1, document_id: 90, id: 1, issuance_request_id: 50, print_type: "original", printed_by_assignment_id: 1 }],
      request: { ...detail().request, document_id: 90, status: "handed_over" }
    });
    expect(walkInActionState(handedOver)).toMatchObject({
      canArchive: true,
      canHandover: false
    });
  });
});
