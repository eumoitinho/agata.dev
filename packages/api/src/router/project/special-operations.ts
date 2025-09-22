/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * special-operations.ts
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

import { checkAndUpdateProjectUsage } from '@libra/auth/utils/subscription-limits'
import { log } from '@libra/common'
import { project } from '@libra/db/schema/project-schema'
import { sharedTemplate, templateRemake } from '@libra/db/schema/template-schema'
import { TRPCError } from '@trpc/server'
import { eq, and, sql } from 'drizzle-orm'
import { z } from 'zod/v4'
import { projectSchema } from '../../schemas/project-schema'
import { organizationProcedure, protectedProcedure } from '../../trpc'
import {
  ensureOrgAccess,
  fetchProject,
  requireOrgAndUser,
  withDbCleanup,
} from '../../utils/project'
import {
  buildForkHistory,
  createProjectWithHistory,
  generateRandomProjectName,
} from '../../utils/project-operations'

/**
 * Special operations router
 */
export const specialOperations = {
  heroProjectCreate: organizationProcedure.input(projectSchema).mutation(async ({ ctx, input }) => {
    const { orgId, userId } = await requireOrgAndUser(ctx)
    const { initialMessage, attachment, planId } = input

    // Check and deduct project quota
    const quotaDeducted = await checkAndUpdateProjectUsage(orgId)
    if (!quotaDeducted) {
      log.project('warn', 'Hero project creation failed - quota exceeded', {
        orgId,
        userId,
        operation: 'hero-create',
      })
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Project quota exceeded' })
    }

    // Note: AI message deduction now occurs when sending the actual AI request
    // No longer deducting in advance here to avoid incorrect charges when creating projects

    return await withDbCleanup(async (db) => {
      return await createProjectWithHistory(db, {
        orgId,
        userId,
        operation: 'hero-create',
      }, {
        // name: undefined - let createProjectWithHistory generate a random name
        templateType: '0',
        visibility: 'public',
        initialMessage,
        attachment,
        planId,
      })
    })
  }),

  fork: organizationProcedure
    .input(
      z.object({
        projectId: z.string(),
        planId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { orgId, userId } = await requireOrgAndUser(ctx)
      const { projectId, planId } = input

      log.project('info', 'Project fork started', {
        orgId,
        userId,
        sourceProjectId: projectId,
        forkPlanId: planId,
        operation: 'fork',
      })

      // Check and deduct project quota
      const quotaDeducted = await checkAndUpdateProjectUsage(orgId)
      if (!quotaDeducted) {
        log.project('warn', 'Project fork failed - quota exceeded', {
          orgId,
          userId,
          sourceProjectId: projectId,
          operation: 'fork',
        })
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Project quota exceeded' })
      }

      return await withDbCleanup(async (db) => {
        // Fetch the source project
        const sourceProject = await fetchProject(db, projectId)
        ensureOrgAccess(sourceProject, orgId, 'view')

        // Build fork history up to the target planId
        const { forkHistory, initialMessage } = buildForkHistory(sourceProject, planId, {
          orgId,
          projectId,
          operation: 'fork',
        })

        // Generate a smart fork name that follows the same naming pattern as createProjectWithHistory
        // If the source project name is too long, use a random name instead of appending "(Fork)"
        const maxForkNameLength = 30
        const forkSuffix = ' (Fork)'
        let forkName: string

        if (sourceProject.name.length + forkSuffix.length <= maxForkNameLength) {
          forkName = `${sourceProject.name}${forkSuffix}`
        } else {
          // Use the same random naming pattern as createProjectWithHistory for consistency
          forkName = generateRandomProjectName(maxForkNameLength)
        }

        // Create the new forked project using the generic creation function
        const newProject = await createProjectWithHistory(db, {
          orgId,
          userId,
          operation: 'fork',
        }, {
          name: forkName,
          templateType: sourceProject.templateType,
          visibility: sourceProject.visibility,
          initialMessage,
        })

        // Override the message history with the fork history
        const [updatedProject] = await db
          .update(project)
          .set({ messageHistory: JSON.stringify(forkHistory) })
          .where(eq(project.id, newProject.id))
          .returning()

        if (!updatedProject) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to update forked project history',
          })
        }

        log.project('info', 'Project forked successfully', {
          orgId,
          userId,
          sourceProjectId: projectId,
          forkedProjectId: newProject.id,
          forkPlanId: planId,
          operation: 'fork',
          messageCount: forkHistory.length,
        })

        return updatedProject
      })
    }),

  createFromTemplate: organizationProcedure
    .input(
      z.object({
        templateId: z.string(),
        name: z.string().min(3).max(100),
        description: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { templateId, name, description } = input
      const { orgId, userId } = await requireOrgAndUser(ctx)
      
      log.project('info', 'Template remake started', {
        orgId,
        userId,
        templateId,
        operation: 'createFromTemplate',
      })

      // Check and deduct project quota
      const quotaDeducted = await checkAndUpdateProjectUsage(orgId)
      if (!quotaDeducted) {
        log.project('warn', 'Template remake failed - quota exceeded', {
          orgId,
          userId,
          templateId,
          operation: 'createFromTemplate',
        })
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Project quota exceeded' })
      }

      return await withDbCleanup(async (db) => {
        // Fetch template details
        const template = await db
          .select()
          .from(sharedTemplate)
          .where(and(
            eq(sharedTemplate.id, templateId),
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

        // TODO: Check if user has access to premium templates
        // For now, we'll allow access to all templates
        const isPremiumTemplate = templateData.creatorPlanAtShare !== 'free'
        // const userPlan = getUserPlan(userId) // This would need to be implemented
        // if (isPremiumTemplate && userPlan === 'free') {
        //   throw new TRPCError({
        //     code: 'FORBIDDEN',
        //     message: 'Premium subscription required to use this template',
        //   })
        // }

        // Create project from template
        const newProject = await createProjectWithHistory(db, {
          orgId,
          userId,
          operation: 'createFromTemplate',
        }, {
          name,
          templateType: templateData.templateType,
          visibility: 'private', // Default to private for template remakes
          initialMessage: description || `Project created from template: ${templateData.title}`,
        })

        // Override with template source code if available
        if (templateData.sourceCode) {
          try {
            const templateMessageHistory = JSON.parse(templateData.sourceCode)
            if (Array.isArray(templateMessageHistory)) {
              await db
                .update(project)
                .set({ messageHistory: templateData.sourceCode })
                .where(eq(project.id, newProject.id))
            }
          } catch (error) {
            log.project('warn', 'Failed to parse template source code', {
              templateId,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        }

        // Record the template remake
        try {
          await db.insert(templateRemake).values({
            templateId,
            userUserId: userId,
            userOrganizationId: orgId,
            // userPlan would need to be fetched from subscription
            // userPlan: userPlan,
            projectId: newProject.id,
          })

          // Increment template remake count
          await db
            .update(sharedTemplate)
            .set({
              statsRemakes: sql`${sharedTemplate.statsRemakes} + 1`,
              updatedAt: new Date(),
            })
            .where(eq(sharedTemplate.id, templateId))
        } catch (error) {
          // Non-critical error - continue even if remake tracking fails
          log.project('warn', 'Failed to track template remake', {
            templateId,
            projectId: newProject.id,
            error: error instanceof Error ? error.message : String(error),
          })
        }

        log.project('info', 'Template remake completed successfully', {
          orgId,
          userId,
          templateId,
          projectId: newProject.id,
          operation: 'createFromTemplate',
        })

        return newProject
      })
    }),
}
