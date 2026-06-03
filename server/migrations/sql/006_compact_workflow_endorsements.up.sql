-- 006_compact_workflow_endorsements up
-- Sender-controlled comment requirement for printable workflow endorsements.

alter table `document_tasks`
  add column `requires_comment` boolean not null default '0' after `required_action`;

alter table `document_tasks`
  add index `doc_tasks_requires_comment_idx`(`document_id`, `requires_comment`, `status`);
