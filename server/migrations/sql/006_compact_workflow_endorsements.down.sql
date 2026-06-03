-- 006_compact_workflow_endorsements down

alter table `document_tasks`
  drop index `doc_tasks_requires_comment_idx`;

alter table `document_tasks`
  drop column `requires_comment`;
