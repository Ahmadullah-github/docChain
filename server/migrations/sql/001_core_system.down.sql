-- 001_core_system down

drop table if exists `admin_override_logs`;
drop table if exists `access_logs`;
drop table if exists `audit_logs`;
drop table if exists `priority_levels`;
drop table if exists `confidentiality_levels`;
drop table if exists `document_types`;
drop table if exists `assignment_status_history`;
drop table if exists `assignments`;
drop table if exists `positions`;
drop table if exists `units`;
drop table if exists `unit_types`;
drop table if exists `organizations`;
drop table if exists `user_roles`;
drop table if exists `roles`;
drop table if exists `sessions`;
drop table if exists `password_reset_tokens`;
drop table if exists `user_activation_tokens`;
drop table if exists `users`;
drop table if exists `persons`;
