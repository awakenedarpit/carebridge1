ALTER TABLE `hospitals`
  ADD COLUMN `city` varchar(120) NULL AFTER `address`,
  ADD COLUMN `state` varchar(120) NULL AFTER `city`,
  ADD COLUMN `postal_code` varchar(24) NULL AFTER `state`,
  MODIFY COLUMN `phone` varchar(64) NULL,
  ADD COLUMN `website` text NULL AFTER `phone`,
  ADD COLUMN `data_source` enum('official','openstreetmap') NOT NULL DEFAULT 'official' AFTER `sourceLabel`,
  ADD COLUMN `osm_type` varchar(16) NULL AFTER `data_source`,
  ADD COLUMN `osm_id` varchar(32) NULL AFTER `osm_type`,
  ADD UNIQUE KEY `hospitals_osm_source` (`osm_type`, `osm_id`);
