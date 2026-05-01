-- 006_document_templates down

drop table if exists `document_layout_drafts`;
drop table if exists `document_template_bindings`;
alter table `document_templates` drop foreign key `document_templates_current_version_id_foreign`;
drop table if exists `document_template_versions`;
drop table if exists `document_templates`;
