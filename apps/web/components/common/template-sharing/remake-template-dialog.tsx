/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * remake-template-dialog.tsx
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
import { useTRPC } from '@/trpc/client'
import { toast } from 'sonner'
import { Loader2, Lock, Crown } from 'lucide-react'
import * as m from '@/paraglide/messages'
import { useUserPlan } from '@/hooks/use-user-plan'
import { canAccessTemplate } from '@/lib/template-utils'
import { useRouter } from 'next/navigation'

const remakeTemplateSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters').max(100, 'Name must be less than 100 characters'),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
})

type RemakeTemplateForm = z.infer<typeof remakeTemplateSchema>

interface RemakeTemplateDialogProps {
  templateId: string
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function RemakeTemplateDialog({
  templateId,
  trigger,
  open,
  onOpenChange,
}: RemakeTemplateDialogProps) {
  const trpc = useTRPC()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const { templatePlan: userPlan } = useUserPlan()
  
  // Get template details to check access (guard against undefined hook during build or partial injection)
  const templateGet: any = (trpc as any).template?.get
  const templateQuery = templateGet?.useQuery
    ? templateGet.useQuery({ id: templateId, trackView: false })
    : { data: undefined, isLoading: false }
  const { data: template, isLoading: isLoadingTemplate } = templateQuery as { data: any; isLoading: boolean }
  
  const form = useForm<RemakeTemplateForm>({
    resolver: zodResolver(remakeTemplateSchema),
    defaultValues: {
      name: template ? `${template.title} (Copy)` : '',
      description: '',
    },
  })
  
  const remakeTemplateMutation = (trpc.project as any)?.specialOperations?.createFromTemplate?.useMutation
    ? (trpc.project as any).specialOperations.createFromTemplate.useMutation({
    onSuccess: (data: any) => {
      toast.success('Project created successfully!', {
        description: 'Your new project is ready to use.',
      })
      form.reset()
      setIsOpen(false)
      if (onOpenChange) onOpenChange(false)
      
      // Navigate to the new project
      router.push(`/project/${data.id}`)
    },
    onError: (error: any) => {
      toast.error('Failed to create project', {
        description: error.message || 'Please try again later.',
      })
    },
    })
    : { mutate: undefined, isPending: false }
  
  const handleSubmit = (data: RemakeTemplateForm) => {
    if (!remakeTemplateMutation?.mutate) {
      toast.error('Template system not available')
      return
    }
    
    remakeTemplateMutation.mutate({
      templateId,
      name: data.name,
      description: data.description,
    })
  }
  
  // Check if user can access this template
  const canAccess = template ? canAccessTemplate(template.creatorPlanAtShare, userPlan) : true
  
  const dialogContent = (
    <DialogContent className="sm:max-w-[500px]">
      <DialogHeader>
        <DialogTitle>
          {m['templateSharing.remakeDialog.title']?.()}
        </DialogTitle>
        <DialogDescription>
          {m['templateSharing.remakeDialog.description']?.()}
        </DialogDescription>
      </DialogHeader>
      
      {isLoadingTemplate ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : !canAccess ? (
        <div className="space-y-6">
          <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg border-2 border-dashed border-orange-200">
            <Crown className="h-8 w-8 text-orange-500" />
            <div>
              <h3 className="font-semibold text-orange-900">
                {m['templateSharing.remakeDialog.restrictions.upgradeRequired']?.()}
              </h3>
              <p className="text-sm text-orange-700">
                {m['templateSharing.remakeDialog.restrictions.upgradeDescription']?.()}
              </p>
            </div>
          </div>
          
          <div className="flex items-center justify-between pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsOpen(false)
                if (onOpenChange) onOpenChange(false)
              }}
            >
              {m['templateSharing.remakeDialog.actions.cancel']?.()}
            </Button>
            <Button>
              {m['templateSharing.remakeDialog.restrictions.upgradeButton']?.()}
            </Button>
          </div>
        </div>
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            {/* Project Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{m['templateSharing.remakeDialog.form.name']?.()}</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder={m['templateSharing.remakeDialog.form.namePlaceholder']?.()} 
                      {...field} 
                    />
                  </FormControl>
                  <FormDescription>
                    Choose a name for your new project based on this template.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* Project Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{m['templateSharing.remakeDialog.form.description']?.()}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={m['templateSharing.remakeDialog.form.descriptionPlaceholder']?.()}
                      className="min-h-[80px]"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Describe what you plan to build with this template.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* Actions */}
            <div className="flex items-center justify-between pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsOpen(false)
                  if (onOpenChange) onOpenChange(false)
                }}
                disabled={remakeTemplateMutation.isPending}
              >
                {m['templateSharing.remakeDialog.actions.cancel']?.()}
              </Button>
              <Button
                type="submit"
                disabled={remakeTemplateMutation.isPending}
              >
                {remakeTemplateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {m['templateSharing.remakeDialog.actions.creating']?.()}
                  </>
                ) : (
                  m['templateSharing.remakeDialog.actions.create']?.()
                )}
              </Button>
            </div>
          </form>
        </Form>
      )}
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