-- 005_master_data_configuration_status.cjs down
-- SQL migration for MySQL.

alter table `unit_types` drop index `unit_types_status_idx`;
alter table `unit_types` drop `status`;
