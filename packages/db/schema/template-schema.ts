/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * template-schema.ts
 * Copyright (C) 2025 Nextify Limited
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 */

import { pgTable, text, timestamp, boolean, integer, varchar, index } from 'drizzle-orm/pg-core'
import { createId } from '@paralleldrive/cuid2'

export const sharedTemplate = pgTable('shared_template', {
  id: text('id').$defaultFn(() => createId()).primaryKey().unique(),
  
  // Template metadata
  title: text('title').notNull(),
  description: text('description'),
  category: varchar('category', { length: 50 }).notNull().default('web'),
  tags: text('tags').array().notNull().default([]),
  
  // Source information
  sourceProjectId: text('source_project_id').notNull(),
  sourceCode: text('source_code'), // JSON string of project configuration
  templateType: varchar('template_type', { length: 10 }).notNull().default('0'),
  
  // Creator information
  creatorUserId: text('creator_user_id').notNull(),
  creatorOrganizationId: text('creator_organization_id').notNull(),
  creatorPlanAtShare: varchar('creator_plan_at_share', { 
    enum: ['free', 'ultra', 'business'] 
  }).notNull(),
  
  // Visibility and moderation
  isPublic: boolean('is_public').notNull().default(true),
  isFeatured: boolean('is_featured').notNull().default(false),
  isApproved: boolean('is_approved').notNull().default(true),
  
  // Media assets
  thumbnailUrl: text('thumbnail_url'),
  previewUrl: text('preview_url'),
  
  // Analytics
  statsViews: integer('stats_views').notNull().default(0),
  statsRemakes: integer('stats_remakes').notNull().default(0),
  statsLikes: integer('stats_likes').notNull().default(0),
  
  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  creatorIdx: index('shared_template_creator_idx').on(table.creatorUserId),
  categoryIdx: index('shared_template_category_idx').on(table.category),
  publicIdx: index('shared_template_public_idx').on(table.isPublic),
  featuredIdx: index('shared_template_featured_idx').on(table.isFeatured),
  createdAtIdx: index('shared_template_created_at_idx').on(table.createdAt),
  popularityIdx: index('shared_template_popularity_idx').on(table.statsRemakes, table.statsViews, table.statsLikes),
}))

export const templateRemake = pgTable('template_remake', {
  id: text('id').$defaultFn(() => createId()).primaryKey().unique(),
  
  // Template and user information
  templateId: text('template_id').notNull().references(() => sharedTemplate.id, { onDelete: 'cascade' }),
  userUserId: text('user_user_id').notNull(),
  userOrganizationId: text('user_organization_id').notNull(),
  userPlan: varchar('user_plan', { enum: ['free', 'ultra', 'business'] }),
  
  // Result information
  projectId: text('project_id'), // The new project created from the template
  success: boolean('success').notNull().default(true),
  errorMessage: text('error_message'),
  
  // Analytics
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  referrer: text('referrer'),
  
  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  templateIdx: index('template_remake_template_idx').on(table.templateId),
  userIdx: index('template_remake_user_idx').on(table.userUserId),
  createdAtIdx: index('template_remake_created_at_idx').on(table.createdAt),
}))

export const templateLike = pgTable('template_like', {
  id: text('id').$defaultFn(() => createId()).primaryKey().unique(),
  
  // Template and user information
  templateId: text('template_id').notNull().references(() => sharedTemplate.id, { onDelete: 'cascade' }),
  userUserId: text('user_user_id').notNull(),
  userOrganizationId: text('user_organization_id').notNull(),
  userPlan: varchar('user_plan', { enum: ['free', 'ultra', 'business'] }),
  
  // Analytics
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  
  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  templateIdx: index('template_like_template_idx').on(table.templateId),
  userIdx: index('template_like_user_idx').on(table.userUserId),
  uniqueLikeIdx: index('template_like_unique_idx').on(table.templateId, table.userUserId),
}))

export const templateView = pgTable('template_view', {
  id: text('id').$defaultFn(() => createId()).primaryKey().unique(),
  
  // Template and viewer information
  templateId: text('template_id').notNull().references(() => sharedTemplate.id, { onDelete: 'cascade' }),
  viewerUserId: text('viewer_user_id'), // Nullable for anonymous views
  viewerOrganizationId: text('viewer_organization_id'),
  viewerPlan: varchar('viewer_plan', { enum: ['free', 'ultra', 'business'] }),
  
  // Analytics
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  referrer: text('referrer'),
  
  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  templateIdx: index('template_view_template_idx').on(table.templateId),
  viewerIdx: index('template_view_viewer_idx').on(table.viewerUserId),
  createdAtIdx: index('template_view_created_at_idx').on(table.createdAt),
}))

export type SharedTemplate = typeof sharedTemplate.$inferSelect
export type NewSharedTemplate = typeof sharedTemplate.$inferInsert
export type TemplateRemake = typeof templateRemake.$inferSelect
export type NewTemplateRemake = typeof templateRemake.$inferInsert
export type TemplateLike = typeof templateLike.$inferSelect
export type NewTemplateLike = typeof templateLike.$inferInsert
export type TemplateView = typeof templateView.$inferSelect
export type NewTemplateView = typeof templateView.$inferInsert