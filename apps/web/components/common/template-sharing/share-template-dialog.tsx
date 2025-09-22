/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * share-template-dialog.tsx
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
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import * as z from 'zod'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@libra/ui/components/dialog'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@libra/ui/components/form'
import { Button } from '@libra/ui/components/button'
import { Input } from '@libra/ui/components/input'
import { Textarea } from '@libra/ui/components/textarea'
import { Badge } from '@libra/ui/components/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@libra/ui/components/select'
import { useTRPC } from '@/trpc/client'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Share2, Crown, Globe, Lock } from 'lucide-react'
import * as m from '@/paraglide/messages'
import { useUserPlan } from '@/hooks/use-user-plan'
import { getTemplatePlanDisplayName, isPremiumPlan } from '@/lib/template-utils'

const shareTemplateSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(100, 'Title must be less than 100 characters'),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
  category: z.string().min(1, 'Please select a category'),
  tags: z.array(z.string()).max(10, 'Maximum 10 tags allowed').default([]),
  isPublic: z.boolean().default(true),
})

type ShareTemplateForm = z.infer<typeof shareTemplateSchema>

interface ShareTemplateDialogProps {
  projectId: string
  projectName?: string
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function ShareTemplateDialog({
  projectId,
  projectName = '',
  trigger,
  open,
  onOpenChange,
}: ShareTemplateDialogProps) {
  const trpc = useTRPC()
  const [isOpen, setIsOpen] = useState(false)
  const [currentTag, setCurrentTag] = useState('')
  const { templatePlan } = useUserPlan()
  
  const form = useForm<ShareTemplateForm>({
    resolver: zodResolver(shareTemplateSchema),
    defaultValues: {
      title: projectName,
      description: '',
      category: 'web',
      tags: [],
      isPublic: true,
    },
  })
  
  const shareTemplateMutation = useMutation({
    ...trpc.template.share.useMutation(),
    onSuccess: () => {
      toast.success('Template shared successfully!', {
        description: 'Your template is now available for the community to use.',
      })
      form.reset()
      setIsOpen(false)
      if (onOpenChange) onOpenChange(false)
    },
    onError: (error) => {
      toast.error('Failed to share template', {
        description: error.message || 'Please try again later.',
      })
    },
  })
  
  const handleSubmit = (data: ShareTemplateForm) => {
    shareTemplateMutation.mutate({
      projectId,
      ...data,
    })
  }
  
  const addTag = () => {
    if (currentTag.trim() && !form.getValues('tags').includes(currentTag.trim())) {
      const currentTags = form.getValues('tags')
      if (currentTags.length < 10) {
        form.setValue('tags', [...currentTags, currentTag.trim()])
        setCurrentTag('')
      }
    }
  }
  
  const removeTag = (tagToRemove: string) => {
    const currentTags = form.getValues('tags')
    form.setValue('tags', currentTags.filter(tag => tag !== tagToRemove))
  }
  
  const categories = [
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
  
  const isUserPremium = isPremiumPlan(templatePlan)
  
  const dialogContent = (
    <DialogContent className="sm:max-w-[600px]">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Share2 className="h-5 w-5" />
          {m.templatesharing_sharedialog_title2()}
        </DialogTitle>
        <DialogDescription>
          {m.templatesharing_sharedialog_description2()}
        </DialogDescription>
      </DialogHeader>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          {/* Template Title */}
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{m.templatesharing_sharedialog_form_title2()}</FormLabel>
                <FormControl>
                  <Input 
                    placeholder={m.templatesharing_sharedialog_form_titleplaceholder3()} 
                    {...field} 
                  />
                </FormControl>
                <FormDescription>
                  Give your template a clear, descriptive name.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          
          {/* Description */}
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{m.templatesharing_sharedialog_form_description2()}</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder={m.templatesharing_sharedialog_form_descriptionplaceholder3()}
                    className="min-h-[100px]"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Explain what your template does and what technologies it uses.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          
          {/* Category */}
          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{m.templatesharing_sharedialog_form_category2()}</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={m.templatesharing_sharedialog_form_categoryplaceholder3()} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.value} value={category.value}>
                        {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Choose the category that best describes your template.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          
          {/* Tags */}
          <FormField
            control={form.control}
            name="tags"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{m.templatesharing_sharedialog_form_tags2()}</FormLabel>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      placeholder={m.templatesharing_sharedialog_form_tagsplaceholder3()}
                      value={currentTag}
                      onChange={(e) => setCurrentTag(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addTag()
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addTag}
                      disabled={!currentTag.trim() || field.value.length >= 10}
                    >
                      {m.templatesharing_sharedialog_form_addtag3()}
                    </Button>
                  </div>
                  
                  {field.value.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {field.value.map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                          onClick={() => removeTag(tag)}
                        >
                          {tag} ×
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <FormDescription>
                  Add relevant tags to help users find your template (max 10).
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          
          {/* Template Plan Info */}
          <div className="p-4 bg-muted/50 rounded-lg border-2 border-dashed">
            <div className="flex items-center gap-3">
              {isUserPremium ? (
                <>
                  <Crown className="h-6 w-6 text-orange-500" />
                  <div>
                    <h3 className="font-semibold text-orange-900">
                      {m.templatesharing_sharedialog_planinfo_protemplate4()}
                    </h3>
                    <p className="text-sm text-orange-700">
                      {m.templatesharing_sharedialog_planinfo_prodescription4()}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <Globe className="h-6 w-6 text-green-500" />
                  <div>
                    <h3 className="font-semibold text-green-900">
                      {m.templatesharing_sharedialog_planinfo_freetemplate4()}
                    </h3>
                    <p className="text-sm text-green-700">
                      {m.templatesharing_sharedialog_planinfo_freedescription4()}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex items-center justify-between pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsOpen(false)
                if (onOpenChange) onOpenChange(false)
              }}
              disabled={shareTemplateMutation.isPending}
            >
              {m.templatesharing_sharedialog_actions_cancel2()}
            </Button>
            <Button
              type="submit"
              disabled={shareTemplateMutation.isPending}
            >
              {shareTemplateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {m.templatesharing_sharedialog_actions_sharing2()}
                </>
              ) : (
                <>
                  <Share2 className="mr-2 h-4 w-4" />
                  {m.templatesharing_sharedialog_actions_share2()}
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </DialogContent>
  )
  
  if (trigger) {
    return (
      <Dialog open={open ?? isOpen} onOpenChange={onOpenChange ?? setIsOpen}>
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
        {dialogContent}
      </Dialog>
    )
  }
  
  return (
    <Dialog open={open ?? isOpen} onOpenChange={onOpenChange ?? setIsOpen}>
      {dialogContent}
    </Dialog>
  )
}