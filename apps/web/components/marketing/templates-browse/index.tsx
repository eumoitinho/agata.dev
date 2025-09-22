/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * index.tsx
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

'use client'

import { useState } from 'react'
import { motion } from 'motion/react'
import Image from 'next/image'
import { Section } from '@libra/ui/components/section'
import { Avatar, AvatarFallback, AvatarImage } from '@libra/ui/components/avatar'
import { Badge } from '@libra/ui/components/badge'
import { Button } from '@libra/ui/components/button'
import { Input } from '@libra/ui/components/input'
import { Skeleton } from '@libra/ui/components/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@libra/ui/components/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@libra/ui/components/select'
import { cn } from '@libra/ui/lib/utils'
import { useTRPC } from '@/trpc/client'
import { useQuery } from '@tanstack/react-query'
import { Eye, Heart, Copy, Crown, Search, Filter } from 'lucide-react'
import { RemakeTemplateDialog } from '@/components/common/template-sharing'
import * as m from '@/paraglide/messages'

interface TemplateCardProps {
  template: {
    id: string
    title: string
    description: string | null
    thumbnailUrl: string | null
    previewUrl: string | null
    category: string
    creatorPlanAtShare: 'free' | 'ultra' | 'business'
    statsViews: number
    statsRemakes: number
    statsLikes: number
    isFeatured: boolean
    createdAt: string
    creatorUserId: string
    creatorOrganizationId: string
  }
}

function TemplateCard({ template }: TemplateCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  
  // For now, we'll use placeholder creator info until we have user data
  const creatorName = `User ${template.creatorUserId.slice(0, 8)}`
  const creatorInitials = creatorName.split(' ').map(n => n[0]).join('')
  
  const isPlanRestricted = template.creatorPlanAtShare !== 'free'
  
  return (
    <motion.div
      className={cn(
        'group relative overflow-hidden rounded-xl border bg-card transition-all duration-300',
        'hover:border-primary/50 hover:shadow-lg hover:scale-[1.02]'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      {/* Template Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-muted/20 to-muted/40">
        {template.thumbnailUrl ? (
          <Image
            src={template.thumbnailUrl}
            alt={`${template.title} preview`}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-muted-foreground">
              <div className="mx-auto mb-2 h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Copy className="h-6 w-6 text-primary/60" />
              </div>
              <p className="text-sm">No preview</p>
            </div>
          </div>
        )}
        
        {/* Hover overlay */}
        {isHovered && (
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          />
        )}
        
        {/* Plan restriction badge */}
        {isPlanRestricted && (
          <div className="absolute top-3 right-3">
            <Badge variant="secondary" className="bg-gradient-to-r from-orange-500 to-amber-500 text-white border-0 shadow-md">
              <Crown className="mr-1 h-3 w-3" />
              {m.templatesharing_templatecard_badges_proonly3()}
            </Badge>
          </div>
        )}
        
        {/* Featured badge */}
        {template.isFeatured && (
          <div className="absolute top-3 left-3">
            <Badge variant="secondary" className="bg-gradient-to-r from-blue-500 to-purple-500 text-white border-0 shadow-md">
              <Crown className="mr-1 h-3 w-3" />
              {m.templatesharing_templatecard_badges_featured2()}
            </Badge>
          </div>
        )}
        
        {/* Action button on hover */}
        {isHovered && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, delay: 0.1 }}
          >
            <RemakeTemplateDialog
              templateId={template.id}
              trigger={
                <Button size="lg" className="shadow-xl">
                  {m.templatesharing_templatecard_actions_usetemplate3()}
                </Button>
              }
            />
          </motion.div>
        )}
      </div>
      
      {/* Content */}
      <div className="p-4">
        {/* Template title and description */}
        <div className="mb-3">
          <h3 className="font-semibold text-foreground line-clamp-1 mb-1">
            {template.title}
          </h3>
          <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
            {template.description || 'No description available'}
          </p>
        </div>
        
        {/* Creator info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarImage src="" alt={creatorName} />
              <AvatarFallback className="text-xs bg-primary/10">
                {creatorInitials}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm text-muted-foreground truncate">
              {creatorName}
            </span>
          </div>
          
          {/* Plan badge */}
          <div className="flex items-center gap-1">
            {isPlanRestricted ? (
              <Badge variant="outline" className="text-xs border-orange-200 text-orange-700 bg-orange-50">
                Pro
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs border-green-200 text-green-700 bg-green-50">
                {m.templatesharing_templatecard_badges_free2()}
              </Badge>
            )}
          </div>
        </div>
        
        {/* Stats */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/50">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Eye className="h-3 w-3" />
            <span>{template.statsViews}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Copy className="h-3 w-3" />
            <span>{template.statsRemakes}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Heart className="h-3 w-3" />
            <span>{template.statsLikes}</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function TemplateCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <Skeleton className="aspect-video w-full" />
      <div className="p-4">
        <div className="mb-3">
          <Skeleton className="h-5 w-3/4 mb-2" />
          <Skeleton className="h-4 w-full mb-1" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-6 rounded-full" />
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="h-5 w-12" />
        </div>
        <div className="flex items-center gap-4 mt-3 pt-3">
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-3 w-8" />
        </div>
      </div>
    </div>
  )
}

export default function TemplatesBrowse() {
  const trpc = useTRPC()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [planFilter, setPlanFilter] = useState<'all' | 'free' | 'pro'>('all')
  const [sortBy, setSortBy] = useState<'popular' | 'recent' | 'most_remakes' | 'most_views' | 'most_likes'>('popular')
  const [browseType, setBrowseType] = useState<'templates' | 'components'>('templates')
  
  const {
    data: templatesData,
    isLoading,
    error
  } = useQuery({
    ...trpc.template.list.queryOptions({
      search: search || undefined,
      category: category === 'all' ? undefined : category,
      planFilter,
      sortBy,
      limit: 24,
      offset: 0,
    }),
    retry: 2,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
  
  const templates = templatesData?.templates || []
  
  const categories = [
    { value: 'all', label: m.templatesharing_browse_categories_all1() },
    { value: 'web', label: m.templatesharing_browse_categories_web1() },
    { value: 'mobile', label: m.templatesharing_browse_categories_mobile1() },
    { value: 'desktop', label: m.templatesharing_browse_categories_desktop1() },
    { value: 'api', label: m.templatesharing_browse_categories_api1() },
    { value: 'landing', label: m.templatesharing_browse_categories_landing1() },
    { value: 'portfolio', label: m.templatesharing_browse_categories_portfolio1() },
    { value: 'ecommerce', label: m.templatesharing_browse_categories_ecommerce1() },
    { value: 'blog', label: m.templatesharing_browse_categories_blog1() },
    { value: 'dashboard', label: m.templatesharing_browse_categories_dashboard1() },
  ]

  return (
    <Section className="pt-24">
      <div className="max-w-container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold tracking-tight text-foreground mb-4">
            {m.templatesharing_browse_title1()}
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {m.templatesharing_browse_description1()}
          </p>
        </div>

        {/* Top Navigation Bar */}
        <div className="flex flex-col lg:flex-row gap-6 mb-8">
          {/* Browse Type Tabs */}
          <Tabs value={browseType} onValueChange={(value) => setBrowseType(value as any)}>
            <TabsList className="grid w-fit grid-cols-2">
              <TabsTrigger value="templates">{m.templatesharing_browse_tabs_templates1()}</TabsTrigger>
              <TabsTrigger value="components">{m.templatesharing_browse_tabs_components1()}</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Search */}
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={m.templatesharing_browse_searchplaceholder2()}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-6">
              {/* Categories */}
              <div>
                <h3 className="font-semibold text-sm text-foreground mb-3 flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  Categories
                </h3>
                <div className="space-y-2">
                  {categories.map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => setCategory(cat.value)}
                      className={cn(
                        'w-full text-left px-3 py-2 text-sm rounded-md transition-colors',
                        category === cat.value
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      )}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Plan Filter */}
              <div>
                <h3 className="font-semibold text-sm text-foreground mb-3">
                  Plan Type
                </h3>
                <Select value={planFilter} onValueChange={(value: any) => setPlanFilter(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{m.templatesharing_browse_planfilters_all1()}</SelectItem>
                    <SelectItem value="free">{m.templatesharing_browse_planfilters_free1()}</SelectItem>
                    <SelectItem value="pro">{m.templatesharing_browse_planfilters_pro1()}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Sort By */}
              <div>
                <h3 className="font-semibold text-sm text-foreground mb-3">
                  Sort By
                </h3>
                <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="popular">{m.templatesharing_browse_sortby_popular1()}</SelectItem>
                    <SelectItem value="recent">{m.templatesharing_browse_sortby_recent1()}</SelectItem>
                    <SelectItem value="most_remakes">{m.templatesharing_browse_sortby_mostremakes1()}</SelectItem>
                    <SelectItem value="most_views">{m.templatesharing_browse_sortby_mostviews1()}</SelectItem>
                    <SelectItem value="most_likes">{m.templatesharing_browse_sortby_mostlikes1()}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="lg:col-span-3">
            {error ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  Unable to load templates. Please try again later.
                </p>
              </div>
            ) : (
              <>
                {/* Templates grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {isLoading
                    ? Array.from({ length: 9 }).map((_, i) => (
                        <TemplateCardSkeleton key={i} />
                      ))
                    : templates.map((template) => (
                        <TemplateCard key={template.id} template={template} />
                      ))
                  }
                </div>

                {/* Empty state */}
                {!isLoading && templates.length === 0 && (
                  <div className="text-center py-12">
                    <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                      <Copy className="h-8 w-8 text-primary/60" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                      {m.templatesharing_browse_noresults1()}
                    </h3>
                    <p className="text-muted-foreground">
                      {m.templatesharing_browse_noresultsdescription1()}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </Section>
  )
}