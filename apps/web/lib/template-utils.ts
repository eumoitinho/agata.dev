/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * template-utils.ts
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

/**
 * Template-specific plan types (used in template sharing system)
 */
export type TemplatePlan = 'free' | 'ultra' | 'business'

/**
 * System plan types (from subscription system)
 */
export type SystemPlan = 'libra free' | 'libra pro' | 'libra max' | 'FREE' | 'PRO' | 'MAX'

/**
 * Maps system plan names to template plan categories
 */
export function mapSystemPlanToTemplatePlan(systemPlan: string): TemplatePlan {
  const planLower = systemPlan.toLowerCase()
  
  // Handle various plan name formats
  if (planLower.includes('free') || planLower === 'free') {
    return 'free'
  }
  
  if (planLower.includes('pro') || planLower === 'pro') {
    return 'ultra'
  }
  
  if (planLower.includes('max') || planLower === 'max') {
    return 'business'
  }
  
  // Default to free for unknown plans
  return 'free'
}

/**
 * Determines if a user can access a template based on plan restrictions
 */
export function canAccessTemplate(
  templatePlan: TemplatePlan,
  userPlan: TemplatePlan
): boolean {
  // Free templates are accessible to everyone
  if (templatePlan === 'free') {
    return true
  }
  
  // Premium templates (ultra/business) require non-free plans
  return userPlan !== 'free'
}

/**
 * Gets the template plan that would be assigned to a template created by a user with the given plan
 */
export function getTemplatePlanForUser(userPlan: TemplatePlan): TemplatePlan {
  return userPlan
}

/**
 * Checks if a plan is considered premium (not free)
 */
export function isPremiumPlan(plan: TemplatePlan): boolean {
  return plan !== 'free'
}

/**
 * Gets display name for a template plan
 */
export function getTemplatePlanDisplayName(plan: TemplatePlan): string {
  switch (plan) {
    case 'free':
      return 'Free'
    case 'ultra':
      return 'Pro'
    case 'business':
      return 'Business'
    default:
      return 'Free'
  }
}