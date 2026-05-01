-- 005_master_data_configuration_status.cjs up
-- SQL migration for MySQL.

alter table `unit_types` add `status` varchar(40) not null default 'active' after `allows_children`;
alter table `unit_types` add index `unit_types_status_idx`(`status`);
