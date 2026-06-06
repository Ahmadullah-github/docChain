-- 009_review_request_permission down

alter table `document_tasks`
  drop index `doc_tasks_can_review_status_idx`;

alter table `document_tasks`
  drop column `can_review`;
