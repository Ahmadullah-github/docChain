-- 005_simple_document_requests up
-- Schema foundation for sender-driven document action requests.

alter table `document_tasks`
  add column `required_action` varchar(80) null after `task_type`,
  add column `can_edit` boolean not null default '0' after `required_action`,
  add column `can_sign` boolean not null default '0' after `can_edit`,
  add column `can_forward` boolean not null default '0' after `can_sign`,
  add column `can_finalize` boolean not null default '0' after `can_forward`,
  add column `can_archive` boolean not null default '0' after `can_finalize`,
  add column `responded_by_assignment_id` bigint unsigned null after `completed_by_assignment_id`,
  add column `response_note` text null after `completion_note`,
  add column `payload` json null after `response_note`;

alter table `document_tasks`
  add index `doc_tasks_doc_req_status_idx`(`document_id`, `required_action`, `status`),
  add index `doc_tasks_assignee_req_status_idx`(`assigned_unit_id`, `assigned_position_id`, `required_action`, `status`),
  add index `document_tasks_responded_by_assignment_id_index`(`responded_by_assignment_id`);

alter table `document_tasks`
  add constraint `document_tasks_responded_by_assignment_id_foreign`
  foreign key (`responded_by_assignment_id`) references `assignments` (`id`) on delete SET NULL;

alter table `document_workflow_events`
  add column `to_position_id` bigint unsigned null after `to_unit_id`,
  add column `required_action` varchar(80) null after `action`,
  add column `permissions` json null after `payload`;

alter table `document_workflow_events`
  add index `document_workflow_events_to_position_id_index`(`to_position_id`),
  add index `doc_workflow_doc_req_action_idx`(`document_id`, `required_action`, `created_at`);

alter table `document_workflow_events`
  add constraint `document_workflow_events_to_position_id_foreign`
  foreign key (`to_position_id`) references `positions` (`id`) on delete SET NULL;

alter table `signature_events`
  add column `document_task_id` bigint unsigned null after `document_id`;

alter table `signature_events`
  add index `signature_events_document_task_id_index`(`document_task_id`);

alter table `signature_events`
  add constraint `signature_events_document_task_id_foreign`
  foreign key (`document_task_id`) references `document_tasks` (`id`) on delete SET NULL;
