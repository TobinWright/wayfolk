-- Wayfolk: every table, empty. Load it into a new database, then seed.sql.
-- Made by server/tools/dump-schema.js (npm run schema) from MySQL 9.3.0. Don't edit by hand.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `admin_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `at` datetime NOT NULL,
  `staff_id` int NOT NULL,
  `player_id` int NOT NULL,
  `what` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `player_id` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `adventurer` (
  `id` int NOT NULL AUTO_INCREMENT,
  `player_id` int NOT NULL,
  `active_until` datetime NOT NULL,
  `race` int NOT NULL,
  `sex` int NOT NULL,
  `name` text NOT NULL,
  `talents` text NOT NULL,
  `skills` text NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `chat_report` (
  `id` int NOT NULL AUTO_INCREMENT,
  `at` datetime NOT NULL,
  `reporter_id` int NOT NULL,
  `reported_id` int NOT NULL,
  `channel` tinyint NOT NULL,
  `reason` tinyint NOT NULL,
  `line` varchar(255) NOT NULL,
  `context` text NOT NULL,
  `done` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `done` (`done`),
  KEY `reported_id` (`reported_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `cosmetic_pack` (
  `id` int NOT NULL,
  `name` varchar(32) NOT NULL,
  `sort` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `cosmetic_tier` (
  `look` tinyint NOT NULL,
  `value` int NOT NULL,
  `tier` int NOT NULL,
  PRIMARY KEY (`look`,`value`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `email_confirm` (
  `token_hash` char(64) NOT NULL,
  `player_id` int NOT NULL,
  `email` varchar(254) NOT NULL,
  `created_at` datetime NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  PRIMARY KEY (`token_hash`),
  KEY `player_id` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `event_share` (
  `event_id` int NOT NULL,
  `player_id` int NOT NULL,
  `points` double NOT NULL,
  `gold` int NOT NULL DEFAULT '0',
  `item` int NOT NULL DEFAULT '0',
  `paid` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`event_id`,`player_id`),
  KEY `player_id` (`player_id`,`paid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `feature_use` (
  `day` date NOT NULL,
  `feature` varchar(40) NOT NULL,
  `player_id` int NOT NULL,
  `uses` int NOT NULL,
  PRIMARY KEY (`day`,`feature`,`player_id`),
  KEY `player_id` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `feedback` (
  `id` int NOT NULL AUTO_INCREMENT,
  `player_id` int NOT NULL,
  `at` datetime NOT NULL,
  `kind` tinyint NOT NULL,
  `text` text NOT NULL,
  `version` varchar(40) NOT NULL DEFAULT '',
  `device` varchar(8) NOT NULL DEFAULT '',
  `done` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `done` (`done`,`id`),
  KEY `player_id` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `friend` (
  `a_id` int NOT NULL,
  `b_id` int NOT NULL,
  `since` datetime NOT NULL,
  `a_fav` tinyint NOT NULL DEFAULT '0',
  `b_fav` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`a_id`,`b_id`),
  KEY `b_id` (`b_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `friend_ask` (
  `from_id` int NOT NULL,
  `to_id` int NOT NULL,
  `at` datetime NOT NULL,
  PRIMARY KEY (`from_id`,`to_id`),
  KEY `to_id` (`to_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `game_ante` (
  `player_id` int NOT NULL,
  `gold` int NOT NULL,
  PRIMARY KEY (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `game_bet` (
  `player_id` int NOT NULL,
  `room_id` int NOT NULL,
  `gold` int NOT NULL,
  PRIMARY KEY (`player_id`,`room_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `game_stat` (
  `player_id` int NOT NULL,
  `hands` int NOT NULL DEFAULT '0',
  `best` int NOT NULL DEFAULT '0',
  `net` bigint NOT NULL DEFAULT '0',
  PRIMARY KEY (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `guild` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(32) NOT NULL,
  `tag` varchar(8) NOT NULL,
  `notice` varchar(255) NOT NULL DEFAULT '',
  `is_open` tinyint NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL,
  `xp` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  UNIQUE KEY `tag` (`tag`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `guild_hall` (
  `guild_id` int NOT NULL,
  `items` mediumtext NOT NULL,
  `log` mediumtext NOT NULL,
  `takes` text NOT NULL,
  PRIMARY KEY (`guild_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `guild_invite` (
  `guild_id` int NOT NULL,
  `player_id` int NOT NULL,
  `by_id` int NOT NULL,
  `at` datetime NOT NULL,
  PRIMARY KEY (`guild_id`,`player_id`),
  KEY `player_id` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `guild_member` (
  `player_id` int NOT NULL,
  `guild_id` int NOT NULL,
  `grade` tinyint NOT NULL,
  `joined_at` datetime NOT NULL,
  PRIMARY KEY (`player_id`),
  KEY `guild_id` (`guild_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `guild_pay` (
  `id` int NOT NULL AUTO_INCREMENT,
  `player_id` int NOT NULL,
  `gold` int NOT NULL,
  `why` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `player_id` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `guild_week` (
  `guild_id` int NOT NULL,
  `week` int NOT NULL,
  `size` int NOT NULL,
  `prog` varchar(255) NOT NULL,
  `done` tinyint NOT NULL DEFAULT '0',
  `shares` mediumtext NOT NULL,
  PRIMARY KEY (`guild_id`,`week`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `hero` (
  `id` int NOT NULL AUTO_INCREMENT,
  `player_id` int NOT NULL,
  `created_at` datetime NOT NULL,
  `data` text NOT NULL,
  `state` text,
  `journal` mediumtext,
  `benched` tinyint NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `player_id` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `hero_board` (
  `player_id` int NOT NULL,
  `board` varchar(32) NOT NULL,
  `period` int NOT NULL,
  `offers` text NOT NULL,
  `rerolls` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`player_id`,`board`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `hero_party` (
  `id` int NOT NULL AUTO_INCREMENT,
  `player_id` int NOT NULL,
  `name` varchar(64) NOT NULL,
  `members` text NOT NULL,
  `state` text NOT NULL,
  `asks` text NOT NULL,
  `open_spots` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `player_id` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `inventory` (
  `id` int NOT NULL AUTO_INCREMENT,
  `player_id` int NOT NULL,
  `gold` int NOT NULL,
  `items` text NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `inventory_player` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `mail` (
  `id` int NOT NULL AUTO_INCREMENT,
  `from_id` int NOT NULL,
  `to_id` int NOT NULL,
  `note` varchar(255) NOT NULL DEFAULT '',
  `gold` bigint NOT NULL DEFAULT '0',
  `items` text NOT NULL,
  `sent` bigint NOT NULL,
  `ends` bigint NOT NULL,
  `unread` tinyint NOT NULL DEFAULT '1',
  `taken` tinyint NOT NULL DEFAULT '0',
  `returned` tinyint NOT NULL DEFAULT '0',
  `hidden` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `to_id` (`to_id`,`hidden`),
  KEY `from_id` (`from_id`),
  KEY `ends` (`ends`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `market_listing` (
  `id` int NOT NULL AUTO_INCREMENT,
  `seller_id` int NOT NULL,
  `item` int NOT NULL,
  `amount` int NOT NULL,
  `price` int NOT NULL,
  `listed` bigint NOT NULL,
  `ends` bigint NOT NULL,
  `state` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `state` (`state`),
  KEY `seller_id` (`seller_id`,`state`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `market_order` (
  `id` int NOT NULL AUTO_INCREMENT,
  `buyer_id` int NOT NULL,
  `item` int NOT NULL,
  `amount` int NOT NULL,
  `price` int NOT NULL,
  `placed` bigint NOT NULL,
  `ends` bigint NOT NULL,
  `state` tinyint NOT NULL DEFAULT '0',
  `owed` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `state` (`state`),
  KEY `buyer_id` (`buyer_id`,`state`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `market_sale` (
  `id` int NOT NULL AUTO_INCREMENT,
  `listing_id` int NOT NULL,
  `order_id` int NOT NULL DEFAULT '0',
  `seller_id` int NOT NULL,
  `buyer_id` int NOT NULL,
  `item` int NOT NULL,
  `amount` int NOT NULL,
  `gold` bigint NOT NULL,
  `at` bigint NOT NULL,
  `paid` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `seller_id` (`seller_id`,`paid`),
  KEY `seller_id_2` (`seller_id`,`at`),
  KEY `item_at` (`item`,`at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `node` (
  `id` int NOT NULL AUTO_INCREMENT,
  `data` text NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `party_invites` (
  `player_id` int NOT NULL,
  `invites` tinyint NOT NULL,
  PRIMARY KEY (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `password_reset` (
  `token_hash` char(64) NOT NULL,
  `player_id` int NOT NULL,
  `email` varchar(254) NOT NULL,
  `created_at` datetime NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  PRIMARY KEY (`token_hash`),
  KEY `player_id` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `play_session` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `player_id` int NOT NULL,
  `started_at` datetime NOT NULL,
  `ended_at` datetime NOT NULL,
  `busy_s` int NOT NULL DEFAULT '0',
  `idle_s` int NOT NULL DEFAULT '0',
  `away_s` int DEFAULT NULL,
  `stalled_s` int NOT NULL DEFAULT '0',
  `first` tinyint NOT NULL DEFAULT '0',
  `device` varchar(8) NOT NULL DEFAULT '',
  `source` varchar(32) NOT NULL DEFAULT '',
  `open` tinyint NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `player_id` (`player_id`,`id`),
  KEY `started_at` (`started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `player` (
  `id` int NOT NULL AUTO_INCREMENT,
  `created_at` datetime NOT NULL,
  `active_at` datetime NOT NULL,
  `premium_until` datetime NOT NULL,
  `account_type` text NOT NULL,
  `role` int NOT NULL,
  `login` varchar(255) NOT NULL,
  `password` text NOT NULL,
  `display_name` text NOT NULL,
  `name_color` tinyint NOT NULL DEFAULT '0',
  `chat_muted_until` bigint NOT NULL DEFAULT '0',
  `guide` int DEFAULT NULL,
  `banned_until` bigint NOT NULL DEFAULT '0',
  `ban_reason` varchar(255) NOT NULL DEFAULT '',
  `title` varchar(64) DEFAULT NULL,
  `guide_at` json DEFAULT NULL,
  `daily_day` int DEFAULT NULL,
  `daily_streak` int DEFAULT NULL,
  `achievements` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `player_login` (`login`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `player_away` (
  `player_id` int NOT NULL,
  `snap` mediumtext NOT NULL,
  PRIMARY KEY (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `player_block` (
  `player_id` int NOT NULL,
  `blocked_id` int NOT NULL,
  `at` datetime NOT NULL,
  PRIMARY KEY (`player_id`,`blocked_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `player_cosmetic_pack` (
  `player_id` int NOT NULL,
  `pack_id` int NOT NULL,
  `got_at` datetime NOT NULL,
  PRIMARY KEY (`player_id`,`pack_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `player_email_verified` (
  `player_id` int NOT NULL,
  `email` varchar(254) NOT NULL,
  `verified_at` datetime NOT NULL,
  PRIMARY KEY (`player_id`,`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `player_google` (
  `sub` varchar(255) NOT NULL,
  `player_id` int NOT NULL,
  `email` varchar(254) DEFAULT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`sub`),
  KEY `player_id` (`player_id`),
  KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `player_profile` (
  `player_id` int NOT NULL,
  `about` varchar(200) NOT NULL DEFAULT '',
  `private` tinyint NOT NULL DEFAULT '0',
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `player_remember` (
  `token_hash` char(64) NOT NULL,
  `player_id` int NOT NULL,
  `created_at` datetime NOT NULL,
  `expires_at` datetime NOT NULL,
  PRIMARY KEY (`token_hash`),
  KEY `player_id` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `player_session` (
  `token_hash` char(64) NOT NULL,
  `player_id` int NOT NULL,
  `created_at` datetime NOT NULL,
  `expires_at` datetime NOT NULL,
  PRIMARY KEY (`token_hash`),
  KEY `player_id` (`player_id`),
  KEY `expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `player_stripe_customer` (
  `player_id` int NOT NULL,
  `stripe_customer_id` varchar(64) NOT NULL,
  PRIMARY KEY (`player_id`),
  UNIQUE KEY `stripe_customer_id` (`stripe_customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `player_subscription` (
  `player_id` int NOT NULL,
  `subscription_id` varchar(64) NOT NULL,
  `status` varchar(24) NOT NULL,
  `renews` tinyint NOT NULL,
  `until` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  PRIMARY KEY (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `race_stat` (
  `player_id` int NOT NULL,
  `races` int NOT NULL DEFAULT '0',
  `best` int NOT NULL DEFAULT '0',
  `net` bigint NOT NULL DEFAULT '0',
  PRIMARY KEY (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `season_done` (
  `season` int NOT NULL,
  `at` datetime NOT NULL,
  PRIMARY KEY (`season`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `season_reward` (
  `player_id` int NOT NULL,
  `kind` tinyint NOT NULL,
  `season` int NOT NULL,
  `value` varchar(64) NOT NULL,
  PRIMARY KEY (`player_id`,`kind`,`season`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `season_score` (
  `season` int NOT NULL,
  `player_id` int NOT NULL,
  `points` double NOT NULL DEFAULT '0',
  PRIMARY KEY (`season`,`player_id`),
  KEY `player_id` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `stripe_event` (
  `event_id` varchar(64) NOT NULL,
  `type` varchar(64) NOT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`event_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `town_growth` (
  `place` int NOT NULL,
  `points` int NOT NULL,
  `built` text NOT NULL,
  PRIMARY KEY (`place`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `trade` (
  `id` int NOT NULL AUTO_INCREMENT,
  `a_id` int NOT NULL,
  `b_id` int NOT NULL,
  `a_gold` bigint NOT NULL,
  `a_items` text NOT NULL,
  `b_gold` bigint NOT NULL,
  `b_items` text NOT NULL,
  `at` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `a_id` (`a_id`),
  KEY `b_id` (`b_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `whisper` (
  `id` int NOT NULL AUTO_INCREMENT,
  `from_id` int NOT NULL,
  `to_id` int NOT NULL,
  `at` datetime NOT NULL,
  `text` varchar(255) NOT NULL,
  `seen` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `from_id` (`from_id`,`to_id`),
  KEY `to_id` (`to_id`,`seen`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `world_event` (
  `id` int NOT NULL AUTO_INCREMENT,
  `kind` int NOT NULL,
  `place` int NOT NULL,
  `name` varchar(120) NOT NULL,
  `boss` int DEFAULT NULL,
  `started` bigint NOT NULL,
  `ends` bigint NOT NULL,
  `goal` double NOT NULL,
  `done` double NOT NULL,
  `state` tinyint NOT NULL,
  `boon_until` bigint DEFAULT NULL,
  `route` text,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `world_sight` (
  `id` int NOT NULL AUTO_INCREMENT,
  `data` mediumtext NOT NULL,
  `ends` bigint NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ends` (`ends`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

