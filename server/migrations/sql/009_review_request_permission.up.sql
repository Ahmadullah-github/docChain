-- 009_review_request_permission up
-- Review is a first-class request permission, separate from the primary action label.

alter table `document_tasks`
  add column `can_review` boolean not null default '0' after `requires_comment`;

alter table `document_tasks`
  add index `doc_tasks_can_review_status_idx`(`document_id`, `can_review`, `status`);
