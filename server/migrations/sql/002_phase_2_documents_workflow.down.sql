-- 002_phase_2_documents_workflow.cjs down
-- SQL migration for MySQL.

drop table if exists `document_tasks`;
drop table if exists `document_workflow_events`;
drop table if exists `workflow_rule_conditions`;
drop table if exists `routing_rules`;
drop table if exists `document_attachments`;
drop table if exists `document_relations`;
drop table if exists `document_versions`;
drop table if exists `documents`;
drop table if exists `file_assets`;
