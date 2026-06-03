-- 004_priority_level_defaults up

SET @priority_default_column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'priority_levels'
    AND COLUMN_NAME = 'is_default'
);

SET @priority_default_column_sql := IF(
  @priority_default_column_exists = 0,
  'ALTER TABLE `priority_levels` ADD COLUMN `is_default` boolean NOT NULL DEFAULT ''0'' AFTER `rank`',
  'SELECT 1'
);

PREPARE priority_default_column_stmt FROM @priority_default_column_sql;
EXECUTE priority_default_column_stmt;
DEALLOCATE PREPARE priority_default_column_stmt;

SET @priority_default_index_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'priority_levels'
    AND INDEX_NAME = 'priority_levels_status_default_index'
);

SET @priority_default_index_sql := IF(
  @priority_default_index_exists = 0,
  'ALTER TABLE `priority_levels` ADD INDEX `priority_levels_status_default_index`(`status`, `is_default`)',
  'SELECT 1'
);

PREPARE priority_default_index_stmt FROM @priority_default_index_sql;
EXECUTE priority_default_index_stmt;
DEALLOCATE PREPARE priority_default_index_stmt;
