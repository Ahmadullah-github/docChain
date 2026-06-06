-- 010_workflow_reliability down

alter table `notifications`
  drop index `notifications_document_task_created_idx`;

alter table `notifications`
  drop foreign key `notifications_document_task_id_foreign`;

alter table `notifications`
  drop column `document_task_id`;

alter table `document_tasks`
  drop index `doc_tasks_doc_status_outcome_idx`;

alter table `document_tasks`
  drop column `response_outcome`;
