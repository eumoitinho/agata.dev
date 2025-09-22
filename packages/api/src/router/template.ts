/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * template.ts
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

import { getDbAsync, sharedTemplate, templateRemake, templateLike, templateView, project } from '@libra/db'
import { TRPCError } from '@trpc/server'
import { eq, desc, asc, and, sql, count, like, or } from 'drizzle-orm'
import { z } from 'zod/v4'
import { createTRPCRouter, publicProcedure, protectedProcedure, organizationProcedure } from '../trpc'

/**
 * Template router - handles shared template operations
 */
export const templateRouter = createTRPCRouter({
  /**
   * List templates with filtering and pagination
   * Public endpoint - no authentication required for browsing
   */
  list: publicProcedure
    .input(z.object({
      // Filtering options
      category: z.string().optional(),
      search: z.string().optional(),
      planFilter: z.enum(['all', 'free', 'pro']).default('all'),
      creatorUserId: z.string().optional(), // Filter by specific creator
      
      // Sorting options
      sortBy: z.enum(['popular', 'recent', 'most_remakes', 'most_views', 'most_likes']).default('popular'),
      
      // Pagination
      limit: z.number().min(1).max(50).default(12),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDbAsync()
      
      // Build WHERE conditions
      const conditions = []
      
      // Only show public templates
      conditions.push(eq(sharedTemplate.isPublic, true))
      
      // Category filter
      if (input.category) {
        conditions.push(eq(sharedTemplate.category, input.category))
      }
      
      // Search filter (title and description)
      if (input.search) {
        const searchTerm = `%${input.search}%`
        conditions.push(
          or(
            like(sharedTemplate.title, searchTerm),
            like(sharedTemplate.description, searchTerm)
          )
        )
      }
      
      // Plan filter
      if (input.planFilter === 'free') {
        conditions.push(eq(sharedTemplate.creatorPlanAtShare, 'free'))
      } else if (input.planFilter === 'pro') {
        conditions.push(
          or(
            eq(sharedTemplate.creatorPlanAtShare, 'ultra'),
            eq(sharedTemplate.creatorPlanAtShare, 'business')
          )
        )
      }
      
      // Creator filter
      if (input.creatorUserId) {
        conditions.push(eq(sharedTemplate.creatorUserId, input.creatorUserId))
      }
      
      // Build ORDER BY clause
      let orderBy
      switch (input.sortBy) {
        case 'recent':
          orderBy = [desc(sharedTemplate.createdAt)]
          break
        case 'most_remakes':
          orderBy = [desc(sharedTemplate.statsRemakes), desc(sharedTemplate.createdAt)]
          break
        case 'most_views':
          orderBy = [desc(sharedTemplate.statsViews), desc(sharedTemplate.createdAt)]
          break
        case 'most_likes':
          orderBy = [desc(sharedTemplate.statsLikes), desc(sharedTemplate.createdAt)]
          break
        case 'popular':
        default:
          // Popularity algorithm: weighted combination of remakes, views, and likes
          orderBy = [
            desc(sql`(${sharedTemplate.statsRemakes} * 3 + ${sharedTemplate.statsViews} * 1 + ${sharedTemplate.statsLikes} * 2)`),
            desc(sharedTemplate.createdAt)
          ]
          break
      }
      
      // Execute query with JOIN to get creator info
      const templates = await db
        .select({
          id: sharedTemplate.id,
          title: sharedTemplate.title,
          description: sharedTemplate.description,
          thumbnailUrl: sharedTemplate.thumbnailUrl,
          previewUrl: sharedTemplate.previewUrl,
          category: sharedTemplate.category,
          tags: sharedTemplate.tags,
          creatorPlanAtShare: sharedTemplate.creatorPlanAtShare,
          statsViews: sharedTemplate.statsViews,
          statsRemakes: sharedTemplate.statsRemakes,
          statsLikes: sharedTemplate.statsLikes,
          isFeatured: sharedTemplate.isFeatured,
          createdAt: sharedTemplate.createdAt,
          // Template metadata
          templateType: sharedTemplate.templateType,
          // Creator info (would need to JOIN with user table when available)
          creatorUserId: sharedTemplate.creatorUserId,
          creatorOrganizationId: sharedTemplate.creatorOrganizationId,
        })
        .from(sharedTemplate)
        .where(and(...conditions))
        .orderBy(...orderBy)
        .limit(input.limit)
        .offset(input.offset)
      
      // Get total count for pagination
      const countResult = await db
        .select({ totalCount: count() })
        .from(sharedTemplate)
        .where(and(...conditions))
      
      const totalCount = countResult[0]?.totalCount ?? 0
      
      return {
        templates,
        pagination: {
          total: totalCount,
          limit: input.limit,
          offset: input.offset,
          hasMore: input.offset + input.limit < totalCount,
        }
      }
    }),

  /**
   * Get single template details
   * Public endpoint - tracks views for analytics
   */
  get: publicProcedure
    .input(z.object({
      id: z.string(),
      // Optional user context for analytics
      trackView: z.boolean().default(true),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDbAsync()
      
      // Get template details
      const template = await db
        .select({
          id: sharedTemplate.id,
          title: sharedTemplate.title,
          description: sharedTemplate.description,
          thumbnailUrl: sharedTemplate.thumbnailUrl,
          previewUrl: sharedTemplate.previewUrl,
          category: sharedTemplate.category,
          tags: sharedTemplate.tags,
          creatorPlanAtShare: sharedTemplate.creatorPlanAtShare,
          statsViews: sharedTemplate.statsViews,
          statsRemakes: sharedTemplate.statsRemakes,
          statsLikes: sharedTemplate.statsLikes,
          isFeatured: sharedTemplate.isFeatured,
          templateType: sharedTemplate.templateType,
          sourceCode: sharedTemplate.sourceCode,
          createdAt: sharedTemplate.createdAt,
          updatedAt: sharedTemplate.updatedAt,
          // Creator info
          creatorUserId: sharedTemplate.creatorUserId,
          creatorOrganizationId: sharedTemplate.creatorOrganizationId,
          // Source project info
          sourceProjectId: sharedTemplate.sourceProjectId,
        })
        .from(sharedTemplate)
        .where(and(
          eq(sharedTemplate.id, input.id),
          eq(sharedTemplate.isPublic, true)
        ))
        .limit(1)
      
      if (!template.length) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Template not found or not public',
        })
      }
      
      const templateData = template[0]
      
      // Track view if requested
      if (input.trackView) {
        try {
          // Insert view record
          await db.insert(templateView).values({
            templateId: templateData.id,
            viewerUserId: ctx.session?.user?.id || null,
            viewerOrganizationId: null, // Would need proper org context
            // Note: viewerPlan would need to be fetched from user subscription
            ipAddress: null, // Would need to get from request headers
            userAgent: null, // Would need to get from request headers
            referrer: null,  // Would need to get from request headers
          })
          
          // Increment view count
          await db
            .update(sharedTemplate)
            .set({
              statsViews: sql`${sharedTemplate.statsViews} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(sharedTemplate.id, templateData.id))
        } catch (error) {
          // Non-critical error - continue even if view tracking fails
          console.warn('Failed to track template view:', error)
        }
      }
      
      return templateData
    }),

  /**
   * Share a project as template
   * Organization endpoint - requires authentication with org context
   */
  share: organizationProcedure
    .input(z.object({
      projectId: z.string(),
      title: z.string().min(3).max(100),
      description: z.string().max(500).optional(),
      category: z.string().default('web'),
      tags: z.array(z.string()).max(10).default([]),
      isPublic: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDbAsync()
      const userId = ctx.session?.user?.id
      const orgId = ctx.orgId
      
      if (!userId) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'User not authenticated',
        })
      }
      
      // Verify user owns the project
      const sourceProject = await db
        .select({
          id: project.id,
          name: project.name,
          templateType: project.templateType,
          userId: project.userId,
          organizationId: project.organizationId,
          previewImageUrl: project.previewImageUrl,
          productionDeployUrl: project.productionDeployUrl,
          messageHistory: project.messageHistory,
        })
        .from(project)
        .where(and(
          eq(project.id, input.projectId),
          eq(project.userId, userId),
          eq(project.organizationId, orgId)
        ))
        .limit(1)
      
      if (!sourceProject.length) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Project not found or access denied',
        })
      }
      
      const projectData = sourceProject[0]
      
      // Get user's current plan (would need to implement plan detection)
      // For now, defaulting to 'free' - this should be fetched from subscription
      const userPlan = 'free' // TODO: Implement actual plan detection
      
      // Create shared template
      const [template] = await db
        .insert(sharedTemplate)
        .values({
          title: input.title,
          description: input.description,
          category: input.category,
          tags: input.tags,
          sourceProjectId: input.projectId,
          creatorUserId: userId,
          creatorOrganizationId: orgId,
          creatorPlanAtShare: userPlan,
          isPublic: input.isPublic,
          templateType: projectData.templateType,
          thumbnailUrl: projectData.previewImageUrl,
          previewUrl: projectData.productionDeployUrl,
          sourceCode: projectData.messageHistory, // Store project configuration
        })
        .returning({ id: sharedTemplate.id })
      
      return {
        templateId: template.id,
        message: 'Template shared successfully',
      }
    }),

  /**
   * Get user's shared templates
   * Organization endpoint
   */
  myTemplates: organizationProcedure
    .query(async ({ ctx }) => {
      const db = await getDbAsync()
      const userId = ctx.session?.user?.id
      
      if (!userId) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'User not authenticated',
        })
      }
      
      const templates = await db
        .select({
          id: sharedTemplate.id,
          title: sharedTemplate.title,
          description: sharedTemplate.description,
          category: sharedTemplate.category,
          isPublic: sharedTemplate.isPublic,
          isFeatured: sharedTemplate.isFeatured,
          statsViews: sharedTemplate.statsViews,
          statsRemakes: sharedTemplate.statsRemakes,
          statsLikes: sharedTemplate.statsLikes,
          createdAt: sharedTemplate.createdAt,
          updatedAt: sharedTemplate.updatedAt,
        })
        .from(sharedTemplate)
        .where(eq(sharedTemplate.creatorUserId, userId))
        .orderBy(desc(sharedTemplate.createdAt))
      
      return templates
    }),

  /**
   * Get popular/featured templates for homepage
   * Public endpoint
   */
  featured: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(20).default(6),
    }))
    .query(async ({ input }) => {
      const db = await getDbAsync()
      
      // Get featured templates first, then popular ones
      const templates = await db
        .select({
          id: sharedTemplate.id,
          title: sharedTemplate.title,
          description: sharedTemplate.description,
          thumbnailUrl: sharedTemplate.thumbnailUrl,
          category: sharedTemplate.category,
          creatorPlanAtShare: sharedTemplate.creatorPlanAtShare,
          statsViews: sharedTemplate.statsViews,
          statsRemakes: sharedTemplate.statsRemakes,
          statsLikes: sharedTemplate.statsLikes,
          isFeatured: sharedTemplate.isFeatured,
          createdAt: sharedTemplate.createdAt,
          creatorUserId: sharedTemplate.creatorUserId,
          creatorOrganizationId: sharedTemplate.creatorOrganizationId,
        })
        .from(sharedTemplate)
        .where(eq(sharedTemplate.isPublic, true))
        .orderBy(
          desc(sharedTemplate.isFeatured),
          desc(sql`(${sharedTemplate.statsRemakes} * 3 + ${sharedTemplate.statsViews} * 1 + ${sharedTemplate.statsLikes} * 2)`),
          desc(sharedTemplate.createdAt)
        )
        .limit(input.limit)
      
      return templates
    }),
})