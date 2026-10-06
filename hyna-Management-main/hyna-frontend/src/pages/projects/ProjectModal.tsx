import React, { useState, useEffect } from 'react';
import { Modal, Input, Textarea, Select, Button, Avatar } from '@/components/ui';
import { cn } from '@/lib/utils';
import { createProject, updateProject, getUsers, createNotification } from '@/services/api';
import { useAuthStore } from '@/stores';
import { toast } from 'sonner';
import type { Project, ProjectStatus, User } from '@/types';

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (project: Project, isEdit: boolean) => void;
  editProject?: Project;
}

export function ProjectModal({ isOpen, onClose, onSuccess, editProject }: ProjectModalProps) {
  const { currentUser } = useAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    startDate: new Date().toISOString().split('T')[0],
    deadline: '',
    status: 'planning' as ProjectStatus,
    leadId: '',
    memberIds: [] as string[],
  });

  useEffect(() => {
    let isMounted = true;
    getUsers().then(usrs => {
      if (isMounted) setUsers(usrs);
    }).catch(err => console.error(err));
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    if (isOpen) {
      if (editProject) {
        setFormData({
          name: editProject.name,
          description: editProject.description,
          startDate: editProject.startDate,
          deadline: editProject.deadline,
          status: editProject.status,
          leadId: editProject.leadId || '',
          memberIds: editProject.memberIds,
        });
      } else {
        setFormData({
          name: '',
          description: '',
          startDate: new Date().toISOString().split('T')[0],
          deadline: '',
          status: 'planning',
          leadId: '',
          memberIds: [currentUser?.id || ''],
        });
      }
    }
  }, [isOpen, editProject, currentUser]);

  const toggleMember = (id: string) => {
    setFormData(prev => ({
      ...prev,
      memberIds: prev.memberIds.includes(id)
        ? prev.memberIds.filter(mId => mId !== id)
        : [...prev.memberIds, id]
    }));
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error('Please enter a project name');
      return;
    }

    setIsSubmitting(true);
    try {
      let savedProject: Project;
      const isEdit = !!editProject;
      
      if (isEdit) {
        savedProject = await updateProject(editProject.id, {
          name: formData.name,
          description: formData.description,
          startDate: formData.startDate,
          deadline: formData.deadline,
          status: formData.status,
          leadId: formData.leadId || undefined,
          memberIds: formData.memberIds,
        });
        toast.success('Project updated successfully!');
      } else {
        savedProject = await createProject({
          name: formData.name,
          description: formData.description,
          startDate: formData.startDate,
          deadline: formData.deadline,
          status: formData.status,
          managerId: currentUser?.id || 'u1',
          leadId: formData.leadId || undefined,
          memberIds: formData.memberIds,
        });
        toast.success('Project created successfully!');
      }

      // Identify newly assigned members for notifications
      const prevMemberIds = editProject?.memberIds || [];
      const newMembers = formData.memberIds.filter(id => !prevMemberIds.includes(id) && id !== currentUser?.id);
      
      for (const memberId of newMembers) {
        await createNotification({
          userId: memberId,
          title: 'New Project Assignment',
          message: `You have been added to ${savedProject.name}`,
          actionUrl: `/member/projects/${savedProject.id}`,
          type: 'general'
        });
      }

      if (formData.leadId && formData.leadId !== currentUser?.id && formData.leadId !== editProject?.leadId) {
        await createNotification({
          userId: formData.leadId,
          title: 'New Project Lead Assignment',
          message: `You have been assigned as the Lead for project: ${savedProject.name}`,
          actionUrl: `/member/projects/${savedProject.id}`,
          type: 'general'
        });
      }

      onSuccess(savedProject, isEdit);
      onClose();
    } catch (err) {
      toast.error(`Failed to ${editProject ? 'update' : 'create'} project`);
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editProject ? "Edit Project" : "Create New Project"}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : editProject ? 'Save Changes' : 'Create Project'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Project Name"
          placeholder="Enter project name"
          value={formData.name}
          onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
        />
        <Textarea
          label="Description"
          placeholder="Project description..."
          rows={3}
          value={formData.description}
          onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Start Date"
            type="date"
            value={formData.startDate}
            onChange={(e) => setFormData(p => ({ ...p, startDate: e.target.value }))}
          />
          <Input
            label="Deadline"
            type="date"
            value={formData.deadline}
            onChange={(e) => setFormData(p => ({ ...p, deadline: e.target.value }))}
          />
        </div>
        <Select
          label="Status"
          value={formData.status}
          onChange={(val) => setFormData(p => ({ ...p, status: val as ProjectStatus }))}
          options={[
            { value: 'planning', label: 'Planning' },
            { value: 'active', label: 'Active' },
            { value: 'on-hold', label: 'On Hold' },
            { value: 'completed', label: 'Completed' },
          ]}
        />
        
        <Select
          label="Project Lead"
          value={formData.leadId}
          onChange={(val) => setFormData(p => ({ ...p, leadId: val }))}
          options={[
            { value: '', label: 'Unassigned' },
            ...users.map(u => ({ value: u.id, label: u.name }))
          ]}
        />
        
        <div>
          <label className="text-sm font-medium block mb-2">Team Members</label>
          <div className="border border-[var(--color-input)] rounded-lg p-2 max-h-40 overflow-y-auto space-y-1 bg-[var(--color-background)]">
            {users.map(user => (
              <div 
                key={user.id} 
                onClick={() => toggleMember(user.id)}
                className="flex items-center gap-2 p-2 rounded-md hover:bg-[var(--color-muted)] cursor-pointer transition-colors"
              >
                <input 
                  type="checkbox" 
                  checked={formData.memberIds.includes(user.id)}
                  onChange={() => {}} // handled by parent div click
                  className="rounded border-[var(--color-input)]"
                />
                <Avatar name={user.name} src={user.avatar} size="xs" />
                <span className="text-sm flex-1">{user.name}</span>
                <span className="text-xs text-[var(--color-muted-foreground)] capitalize">{user.role}</span>
              </div>
            ))}
            {users.length === 0 && (
              <div className="text-center text-sm text-[var(--color-muted-foreground)] py-4">
                Loading members...
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
