-- 005_simple_document_requests down

alter table `signature_events`
  drop foreign key `signature_events_document_task_id_foreign`;

alter table `signature_events`
  drop index `signature_events_document_task_id_index`;

alter table `signature_events`
  drop column `document_task_id`;

alter table `document_workflow_events`
  drop foreign key `document_workflow_events_to_position_id_foreign`;

alter table `document_workflow_events`
  drop index `doc_workflow_doc_req_action_idx`,
  drop index `document_workflow_events_to_position_id_index`;

alter table `document_workflow_events`
  drop column `permissions`,
  drop column `required_action`,
  drop column `to_position_id`;

alter table `document_tasks`
  drop foreign key `document_tasks_responded_by_assignment_id_foreign`;

alter table `document_tasks`
  drop index `document_tasks_responded_by_assignment_id_index`,
  drop index `doc_tasks_assignee_req_status_idx`,
  drop index `doc_tasks_doc_req_status_idx`;

alter table `document_tasks`
  drop column `payload`,
  drop column `response_note`,
  drop column `responded_by_assignment_id`,
  drop column `can_archive`,
  drop column `can_finalize`,
  drop column `can_forward`,
  drop column `can_sign`,
  drop column `can_edit`,
  drop column `required_action`;
