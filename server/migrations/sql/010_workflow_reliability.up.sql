-- 010_workflow_reliability up
-- Track task response outcomes and link in-app notifications to document tasks.

alter table `document_tasks`
  add column `response_outcome` varchar(60) null after `response_note`;

alter table `document_tasks`
  add index `doc_tasks_doc_status_outcome_idx`(`document_id`, `status`, `response_outcome`);

alter table `notifications`
  add column `document_task_id` bigint unsigned null after `transmission_id`;

alter table `notifications`
  add constraint `notifications_document_task_id_foreign`
  foreign key (`document_task_id`) references `document_tasks` (`id`) on delete SET NULL;

alter table `notifications`
  add index `notifications_document_task_created_idx`(`document_task_id`, `created_at`);
