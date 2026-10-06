import { useState, useEffect } from 'react';
import { Plus, Search, List, LayoutGrid, Paperclip, MessageSquare, ExternalLink, Layers, Users, User as UserIcon, Trash2, AlertTriangle } from 'lucide-react';
import { Button, Badge, Avatar, Modal, Input, Textarea, Select, EmptyState, LoadingState } from '@/components/ui';
import { cn, getStatusColor, getPriorityColor, getPriorityDot, formatDate } from '@/lib/utils';
import { useAuthStore } from '@/stores';
import {
  getTasks, createTask, updateTask, submitTask, reviewTask, deleteTask,
  getProjects, getModules, getUsers, getUserById, createNotification
} from '@/services/api';
import {
  notifyTaskAssigned,
  notifyTaskSubmitted,
  notifyTaskReviewed,
} from '@/services/notificationWorkflow';
import { toast } from 'sonner';
import type { Task, TaskStatus, TaskPriority, Project, Module, User } from '@/types';

const statusColumns: { status: TaskStatus; label: string; color: string }[] = [
  { status: 'backlog', label: 'Backlog', color: 'bg-zinc-400' },
  { status: 'todo', label: 'To Do', color: 'bg-blue-500' },
  { status: 'in-progress', label: 'In Progress', color: 'bg-indigo-500' },
  { status: 'in-review', label: 'In Review', color: 'bg-purple-500' },
  { status: 'completed', label: 'Completed', color: 'bg-emerald-500' },
  { status: 'blocked', label: 'Blocked', color: 'bg-red-500' },
];

export function TasksPage() {
  const { currentRole, currentUser, effectiveRole } = useAuthStore();
  const isAdminOrManager = effectiveRole === 'admin' || effectiveRole === 'manager';
  const prefix = effectiveRole === 'member' ? '/member' : effectiveRole === 'manager' ? '/manager' : '/admin';

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [view, setView] = useState<'list' | 'board'>('list');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<string | null>(null);
  const [showSubmit, setShowSubmit] = useState<string | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form states
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'medium' as TaskPriority,
    status: 'todo' as TaskStatus,
    deadline: '',
    projectId: '',
    moduleId: '',
    assigneeId: '',
  });

  const [submitForm, setSubmitForm] = useState({
    description: '',
    githubUrl: '',
    deploymentUrl: '',
    notes: '',
  });

  const loadData = async () => {
    try {
      const [fetchedTasks, fetchedProjects, fetchedUsers, fetchedModules] = await Promise.all([
        isAdminOrManager ? getTasks() : getTasks({ assigneeId: currentUser?.id }),
        getProjects(),
        getUsers(),
        getModules(),
      ]);
      setTasks(fetchedTasks);
      setProjects(fetchedProjects);
      setUsers(fetchedUsers);
      setModules(fetchedModules);

      if (fetchedProjects.length > 0) {
        const firstProj = fetchedProjects[0];
        const firstProjMods = fetchedModules.filter(m => m.projectId === firstProj.id);
        const soloMemberId = firstProj.projectType === 'solo' ? (firstProj.managerId || firstProj.memberIds?.[0]) : '';
        const firstModAssignee = firstProjMods[0]?.assigneeIds?.[0];

        setNewTask(prev => ({
          ...prev,
          projectId: firstProj.id,
          moduleId: firstProjMods[0]?.id || '',
          assigneeId: firstModAssignee || soloMemberId || (fetchedUsers.length > 0 ? fetchedUsers[0].id : ''),
        }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    
    const handleRealtimeTask = () => {
      loadData();
    };
    window.addEventListener('realtime-task', handleRealtimeTask);
    return () => window.removeEventListener('realtime-task', handleRealtimeTask);
  }, [isAdminOrManager, currentUser?.id]);

  const handleCreateTask = async () => {
    if (!newTask.title.trim() || !newTask.projectId || !newTask.assigneeId) {
      toast.error('Please enter task title, select a project, and allocate a team member');
      return;
    }
    try {
      const created = await createTask({
        title: newTask.title,
        description: newTask.description,
        priority: newTask.priority,
        status: newTask.status,
        deadline: newTask.deadline,
        projectId: newTask.projectId,
        moduleId: newTask.moduleId || undefined,
        assigneeId: newTask.assigneeId,
      });

      // Notify the assigned member with native push
      if (newTask.assigneeId && newTask.assigneeId !== currentUser?.id) {
        notifyTaskAssigned({
          id: created.id,
          title: newTask.title,
          assigneeId: newTask.assigneeId,
          assignerName: currentUser?.name,
        }).catch(console.error);
      }

      setTasks(prev => [created, ...prev]);
      setShowCreate(false);
      const defaultProj = projects[0];
      const defaultMods = defaultProj ? modules.filter(m => m.projectId === defaultProj.id) : [];
      setNewTask({
        title: '',
        description: '',
        priority: 'medium',
        status: 'todo',
        deadline: '',
        projectId: projects[0]?.id || '',
        moduleId: defaultMods[0]?.id || '',
        assigneeId: '',
      });
      const allocatedMember = users.find(u => u.id === newTask.assigneeId);
      const targetModule = modules.find(m => m.id === newTask.moduleId);
      toast.success(
        targetModule
          ? `Task created in module "${targetModule.name}" and allocated to ${allocatedMember?.name || 'Member'}!`
          : `Task created and allocated to ${allocatedMember?.name || 'Member'}!`
      );
    } catch (err) {
      toast.error('Failed to create task');
    }
  };

  const handleSubmitTask = async () => {
    if (!showSubmit || !submitForm.description.trim()) {
      toast.error('Please enter a description for your submission');
      return;
    }
    try {
      const updated = await submitTask(showSubmit, {
        description: submitForm.description,
        githubUrl: submitForm.githubUrl,
        deploymentUrl: submitForm.deploymentUrl,
        notes: submitForm.notes,
        submittedBy: currentUser?.id,
      });
      setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
      setShowSubmit(null);
      setSubmitForm({ description: '', githubUrl: '', deploymentUrl: '', notes: '' });
      toast.success('Task submitted for review!');

      // Notify managers via Web Push
      notifyTaskSubmitted({
        id: updated.id,
        title: updated.title,
        submitterName: currentUser?.name || 'Member',
      }).catch(console.error);
    } catch (err) {
      toast.error('Failed to submit task');
    }
  };

  const handleReview = async (taskId: string, action: 'approve' | 'request-changes') => {
    try {
      const updated = await reviewTask(taskId, action, currentUser?.id || '');
      setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
      setShowDetail(null);
      toast.success(action === 'approve' ? 'Task approved!' : 'Changes requested');

      // Notify the task assignee
      if (updated.assigneeId) {
        notifyTaskReviewed({
          id: updated.id,
          title: updated.title,
          approved: action === 'approve',
          reviewerName: currentUser?.name || 'Reviewer',
          assigneeId: updated.assigneeId,
        }).catch(console.error);
      }
    } catch (err) {
      toast.error('Failed to process review');
    }
  };

  const handleDeleteTask = async () => {
    if (!taskToDelete) return;
    setIsDeleting(true);
    try {
      await deleteTask(taskToDelete.id);
      setTasks(prev => prev.filter(t => t.id !== taskToDelete.id));
      toast.success(`Task "${taskToDelete.title}" deleted successfully.`);
      setTaskToDelete(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete task');
    } finally {
      setIsDeleting(false);
    }
  };

  // Rule: Members only view tasks assigned to them; Admin/Managers view all tasks
  const allTasks = isAdminOrManager
    ? tasks
    : tasks.filter(t => t.assigneeId === currentUser?.id);

  const filtered = allTasks.filter(t => {
    const matchesSearch = t.title.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || t.priority === priorityFilter;
    const matchesProject = projectFilter === 'all' || t.projectId === projectFilter;
    return matchesSearch && matchesStatus && matchesPriority && matchesProject;
  });

  const detailTask = showDetail ? tasks.find(t => t.id === showDetail) : null;

  if (isLoading) return <LoadingState />;

  return (
    <div className="page-container">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="page-title">{isAdminOrManager ? 'Tasks & Team Allocation' : 'My Assigned Tasks'}</h1>
          <p className="page-description">
            {isAdminOrManager
              ? `${filtered.length} total tasks across team`
              : `${filtered.length} deliverables assigned to you`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 p-1 rounded-lg bg-[var(--color-muted)]">
            <button onClick={() => setView('list')} className={cn('p-1.5 rounded-md transition-colors', view === 'list' ? 'bg-[var(--color-card)] shadow-sm' : '')}>
              <List className="w-4 h-4" />
            </button>
            <button onClick={() => setView('board')} className={cn('p-1.5 rounded-md transition-colors', view === 'board' ? 'bg-[var(--color-card)] shadow-sm' : '')}>
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
          {/* Admin and Managers allocate tasks; regular members only view and work on assigned tasks */}
          {isAdminOrManager && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-1" /> Allocate Task
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-muted-foreground)]" />
          <input
            type="text"
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-[var(--color-input)] bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
          />
        </div>
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="h-9 px-3 rounded-lg border border-[var(--color-input)] bg-[var(--color-background)] text-sm"
        >
          <option value="all">All Projects</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.projectType === 'solo' ? '👤 Solo' : `👥 Team`})
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 px-3 rounded-lg border border-[var(--color-input)] bg-[var(--color-background)] text-sm"
        >
          <option value="all">All Status</option>
          {statusColumns.map(s => <option key={s.status} value={s.status}>{s.label}</option>)}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="h-9 px-3 rounded-lg border border-[var(--color-input)] bg-[var(--color-background)] text-sm"
        >
          <option value="all">All Priority</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* List view */}
      {view === 'list' && (
        <div className="space-y-1.5 animate-fade-in">
          {filtered.length === 0 ? (
            <EmptyState title="No tasks found" description="Try adjusting your filters or allocate a new task." />
          ) : (
            filtered.map(task => {
              const assignee = getUserById(task.assigneeId);
              const project = projects.find(p => p.id === task.projectId);
              const taskModule = modules.find(m => m.id === task.moduleId);
              return (
                <div
                  key={task.id}
                  className="card p-3 sm:p-4 card-hover flex items-center gap-3 sm:gap-4 cursor-pointer"
                  onClick={() => setShowDetail(task.id)}
                >
                  <div className={cn('w-2 h-2 rounded-full shrink-0', getPriorityDot(task.priority))} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{task.title}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge className={getStatusColor(task.status)}>{task.status.replace(/-/g, ' ')}</Badge>
                      {project && (
                        <span className="inline-flex items-center gap-1 text-xs text-[var(--color-muted-foreground)]">
                          {project.projectType === 'solo' ? (
                            <UserIcon className="w-3 h-3 text-amber-500" />
                          ) : (
                            <Users className="w-3 h-3 text-blue-500" />
                          )}
                          {project.name}
                        </span>
                      )}
                      {taskModule && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/40">
                          <Layers className="w-3 h-3" />
                          {taskModule.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                    {task.attachments > 0 && <span className="hidden sm:flex items-center gap-1 text-xs text-[var(--color-muted-foreground)]"><Paperclip className="w-3 h-3" />{task.attachments}</span>}
                    {task.comments > 0 && <span className="hidden sm:flex items-center gap-1 text-xs text-[var(--color-muted-foreground)]"><MessageSquare className="w-3 h-3" />{task.comments}</span>}
                    <span className="text-xs text-[var(--color-muted-foreground)] hidden md:inline">{formatDate(task.deadline)}</span>
                    {assignee && (
                      <div className="flex items-center gap-1.5" title={`Assigned to ${assignee.name}`}>
                        <Avatar name={assignee.name} size="xs" />
                        <span className="text-xs text-[var(--color-muted-foreground)] hidden lg:inline max-w-[100px] truncate">{assignee.name}</span>
                      </div>
                    )}
                    {isAdminOrManager && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setTaskToDelete(task); }}
                        className="p-1 rounded-md text-[var(--color-muted-foreground)] hover:text-red-500 hover:bg-red-500/10 transition-colors ml-1"
                        title="Delete Task"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Board view */}
      {view === 'board' && (
        <div className="flex gap-4 overflow-x-auto pb-4 animate-fade-in">
          {statusColumns.map(col => {
            const colTasks = filtered.filter(t => t.status === col.status);
            return (
              <div key={col.status} className="flex-shrink-0 w-72">
                <div className="flex items-center gap-2 mb-3 px-1">
                  <div className={cn('w-2 h-2 rounded-full', col.color)} />
                  <span className="text-sm font-medium">{col.label}</span>
                  <span className="text-xs text-[var(--color-muted-foreground)] ml-auto">{colTasks.length}</span>
                </div>
                <div className="space-y-2">
                  {colTasks.map(task => {
                    const assignee = getUserById(task.assigneeId);
                    const project = projects.find(p => p.id === task.projectId);
                    const taskModule = modules.find(m => m.id === task.moduleId);
                    return (
                      <div key={task.id} className="card p-3 card-hover cursor-pointer" onClick={() => setShowDetail(task.id)}>
                        <p className="text-sm font-medium mb-1.5">{task.title}</p>
                        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                          <Badge className={getPriorityColor(task.priority)}>{task.priority}</Badge>
                          {taskModule && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/40">
                              <Layers className="w-2.5 h-2.5" />
                              <span className="truncate max-w-[110px]">{taskModule.name}</span>
                            </span>
                          )}
                        </div>
                        {project && (
                          <div className="flex items-center gap-1 text-[11px] text-[var(--color-muted-foreground)] mb-2 truncate">
                            {project.projectType === 'solo' ? (
                              <UserIcon className="w-3 h-3 text-amber-500 shrink-0" />
                            ) : (
                              <Users className="w-3 h-3 text-blue-500 shrink-0" />
                            )}
                            <span className="truncate">{project.name}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between pt-1 border-t border-[var(--color-border)]/50">
                          {assignee ? (
                            <div className="flex items-center gap-1">
                              <Avatar name={assignee.name} size="xs" />
                              <span className="text-[11px] text-[var(--color-muted-foreground)] max-w-[80px] truncate">{assignee.name}</span>
                            </div>
                          ) : <span className="text-[11px] text-[var(--color-muted-foreground)]">Unassigned</span>}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-[var(--color-muted-foreground)]">{formatDate(task.deadline)}</span>
                            {isAdminOrManager && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setTaskToDelete(task); }}
                                className="p-0.5 rounded text-[var(--color-muted-foreground)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                                title="Delete Task"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Task detail modal */}
      <Modal
        isOpen={!!showDetail}
        onClose={() => setShowDetail(null)}
        title={detailTask?.title || 'Task'}
        size="lg"
        footer={
          effectiveRole === 'member' && detailTask?.assigneeId === currentUser?.id ? (
            detailTask.status === 'todo' ? (
              <Button onClick={async () => {
                const updated = await updateTask(detailTask.id, { status: 'in-progress' });
                setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
                setShowDetail(null);
                toast.success('Task started! Status moved to In Progress.');
              }}>
                Start Task
              </Button>
            ) : detailTask.status === 'in-progress' ? (
              <Button onClick={() => { setShowDetail(null); setShowSubmit(detailTask?.id || null); }}>
                Submit for Review
              </Button>
            ) : undefined
          ) : isAdminOrManager && detailTask?.submission?.reviewStatus === 'pending' ? (
            <>
              <Button variant="outline" onClick={() => handleReview(detailTask.id, 'request-changes')}>Request Changes</Button>
              <Button onClick={() => handleReview(detailTask.id, 'approve')}>Approve Deliverable</Button>
              <Button
                variant="destructive"
                onClick={() => {
                  const target = detailTask;
                  setShowDetail(null);
                  setTaskToDelete(target);
                }}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
              </Button>
            </>
          ) : isAdminOrManager ? (
            <Button
              variant="destructive"
              onClick={() => {
                const target = detailTask;
                setShowDetail(null);
                setTaskToDelete(target);
              }}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete Task
            </Button>
          ) : undefined
        }
      >
        {detailTask && (() => {
          const detailProject = projects.find(p => p.id === detailTask.projectId);
          const detailModule = modules.find(m => m.id === detailTask.moduleId);
          const moduleOwner = detailModule?.assigneeIds?.[0] ? users.find(u => u.id === detailModule.assigneeIds[0]) : null;

          return (
            <div className="space-y-4">
              <p className="text-sm text-[var(--color-muted-foreground)]">{detailTask.description}</p>

              {/* Module Banner if task belongs to a module */}
              {detailModule && (
                <div className="p-3 rounded-xl border border-indigo-200/60 dark:border-indigo-800/40 bg-indigo-50/50 dark:bg-indigo-950/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <span className="text-xs font-semibold text-indigo-900 dark:text-indigo-200">
                        Module: {detailModule.name}
                      </span>
                    </div>
                    {moduleOwner && (
                      <span className="text-[11px] text-indigo-600 dark:text-indigo-400">
                        Module Lead: <strong>{moduleOwner.name}</strong>
                      </span>
                    )}
                  </div>
                  {detailModule.description && (
                    <p className="text-xs text-[var(--color-muted-foreground)] mt-1">{detailModule.description}</p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div><span className="text-[var(--color-muted-foreground)]">Status</span><br /><Badge className={getStatusColor(detailTask.status)}>{detailTask.status.replace(/-/g, ' ')}</Badge></div>
                <div><span className="text-[var(--color-muted-foreground)]">Priority</span><br /><Badge className={getPriorityColor(detailTask.priority)}>{detailTask.priority}</Badge></div>
                <div className="sm:col-span-2">
                  <span className="text-[var(--color-muted-foreground)] font-medium">Allocated Member</span>
                  {isAdminOrManager ? (
                    <div className="mt-1">
                      <select
                        value={detailTask.assigneeId || ''}
                        onChange={async (e) => {
                          const newAssigneeId = e.target.value;
                          try {
                            const updated = await updateTask(detailTask.id, { assigneeId: newAssigneeId });
                            setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
                            const allocatedUser = users.find(u => u.id === newAssigneeId);
                            toast.success(`Task re-allocated to ${allocatedUser?.name || 'Member'}`);
                          } catch {
                            toast.error('Failed to re-allocate task');
                          }
                        }}
                        className="w-full h-10 px-3 rounded-lg border border-[var(--color-input)] bg-[var(--color-card)] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                      >
                        <option value="">Unassigned</option>
                        {users.map(u => (
                          <option key={u.id} value={u.id}>
                            {u.name} — {u.designation} ({u.department || 'Engineering'}) [{u.employeeId || 'EMP'}]
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-[var(--color-muted-foreground)] mt-1">Admin can re-allocate this task to any team member.</p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-1">
                      <Avatar name={getUserById(detailTask.assigneeId)?.name || currentUser?.name || ''} size="xs" />
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {getUserById(detailTask.assigneeId)?.name || 'Assigned to you'}
                      </span>
                    </div>
                  )}
                </div>
                <div><span className="text-[var(--color-muted-foreground)]">Deadline</span><br /><span className="font-medium">{formatDate(detailTask.deadline)}</span></div>
                <div>
                  <span className="text-[var(--color-muted-foreground)]">Project</span><br />
                  <span className="font-medium inline-flex items-center gap-1.5">
                    {detailProject?.projectType === 'solo' ? (
                      <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold">
                        👤 Solo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold">
                        👥 Team
                      </span>
                    )}
                    {detailProject?.name || 'Project'}
                  </span>
                </div>
              </div>
              {detailTask.checklist && detailTask.checklist.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Checklist</p>
                  <div className="space-y-1.5">
                    {detailTask.checklist.map(item => (
                      <label key={item.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={item.completed} readOnly className="rounded" />
                        <span className={item.completed ? 'line-through text-[var(--color-muted-foreground)]' : ''}>{item.text}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {detailTask.submission && (
                <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/50">
                  <p className="text-sm font-semibold mb-2">Submission Deliverable</p>
                  <p className="text-sm text-[var(--color-muted-foreground)] mb-2">{detailTask.submission.description}</p>
                  <div className="flex flex-wrap gap-2">
                    {detailTask.submission.githubUrl && (
                      <a href={detailTask.submission.githubUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline">
                        <ExternalLink className="w-3 h-3" /> GitHub
                      </a>
                    )}
                    {detailTask.submission.deploymentUrl && (
                      <a href={detailTask.submission.deploymentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline">
                        <ExternalLink className="w-3 h-3" /> Deployment
                      </a>
                    )}
                  </div>
                  <Badge className={cn('mt-2', getStatusColor(detailTask.submission.reviewStatus === 'approved' ? 'completed' : detailTask.submission.reviewStatus === 'changes-requested' ? 'blocked' : 'in-review'))}>
                    {detailTask.submission.reviewStatus.replace(/-/g, ' ')}
                  </Badge>
                </div>
              )}
            </div>
          );
        })()}
      </Modal>

      {/* Submit task modal */}
      <Modal
        isOpen={!!showSubmit}
        onClose={() => setShowSubmit(null)}
        title="Submit Task for Review"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowSubmit(null)}>Cancel</Button>
            <Button onClick={handleSubmitTask}>Submit for Review</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Textarea
            label="Description"
            placeholder="Describe what you've completed..."
            rows={3}
            value={submitForm.description}
            onChange={(e) => setSubmitForm(f => ({ ...f, description: e.target.value }))}
          />
          <Input
            label="GitHub URL"
            placeholder="https://github.com/..."
            value={submitForm.githubUrl}
            onChange={(e) => setSubmitForm(f => ({ ...f, githubUrl: e.target.value }))}
          />
          <Input
            label="Deployment URL"
            placeholder="https://staging..."
            value={submitForm.deploymentUrl}
            onChange={(e) => setSubmitForm(f => ({ ...f, deploymentUrl: e.target.value }))}
          />
          <Textarea
            label="Notes"
            placeholder="Any additional notes..."
            rows={2}
            value={submitForm.notes}
            onChange={(e) => setSubmitForm(f => ({ ...f, notes: e.target.value }))}
          />
        </div>
      </Modal>

      {/* Create task modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="Allocate New Task to Team"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreateTask}>Allocate Task</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Task Title *"
            placeholder="Enter task title"
            value={newTask.title}
            onChange={(e) => setNewTask(t => ({ ...t, title: e.target.value }))}
          />
          <Textarea
            label="Description"
            placeholder="Task description and requirements..."
            rows={3}
            value={newTask.description}
            onChange={(e) => setNewTask(t => ({ ...t, description: e.target.value }))}
          />

          <Select
            label="Project *"
            value={newTask.projectId}
            onChange={(val) => setNewTask(t => ({ ...t, projectId: val, assigneeId: '' }))}
            options={projects.map(p => ({ value: p.id, label: p.name }))}
          />

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Allocate Team Member *</label>
            <div className="flex flex-wrap gap-2 p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-background)] max-h-40 overflow-y-auto">
              {(() => {
                if (!newTask.projectId) {
                  return <p className="text-sm text-[var(--color-muted-foreground)] p-2">Select a project first to see available members.</p>;
                }
                const selectedProject = projects.find(p => p.id === newTask.projectId);
                if (!selectedProject) return null;
                // Get all users associated with the project
                const projectMembers = users.filter(u => 
                  selectedProject.memberIds.includes(u.id) || 
                  selectedProject.managerId === u.id || 
                  selectedProject.leadId === u.id
                );
                
                if (projectMembers.length === 0) {
                  return <p className="text-sm text-[var(--color-muted-foreground)] p-2">No members allocated to this project.</p>;
                }
                
                return projectMembers.map((user) => {
                  const isSelected = newTask.assigneeId === user.id;
                  return (
                    <label key={user.id} className={cn(
                      "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs cursor-pointer border transition-colors",
                      isSelected ? "bg-[var(--color-primary)]/10 border-[var(--color-primary)] text-[var(--color-primary)]" : "border-[var(--color-border)] hover:bg-[var(--color-muted)] text-[var(--color-foreground)]"
                    )}>
                      <input
                        type="radio"
                        name="task-assignee"
                        className="hidden"
                        checked={isSelected}
                        onChange={() => setNewTask(t => ({ ...t, assigneeId: user.id }))}
                      />
                      <Avatar name={user.name} src={user.avatar} size="xs" />
                      <span>{user.name}</span>
                    </label>
                  );
                });
              })()}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Priority"
              value={newTask.priority}
              onChange={(val) => setNewTask(t => ({ ...t, priority: val as TaskPriority }))}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
                { value: 'urgent', label: 'Urgent' },
              ]}
            />
            <Select
              label="Status"
              value={newTask.status}
              onChange={(val) => setNewTask(t => ({ ...t, status: val as TaskStatus }))}
              options={[
                { value: 'backlog', label: 'Backlog' },
                { value: 'todo', label: 'To Do' },
                { value: 'in-progress', label: 'In Progress' },
              ]}
            />
          </div>
          <Input
            label="Deadline"
            type="date"
            value={newTask.deadline}
            className="dark:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:dark:invert"
            onChange={(e) => setNewTask(t => ({ ...t, deadline: e.target.value }))}
          />
        </div>
      </Modal>

      {/* Delete Task Confirmation Modal */}
      {taskToDelete && (
        <Modal
          isOpen={!!taskToDelete}
          onClose={() => setTaskToDelete(null)}
          title="Delete Task"
          size="sm"
          footer={
            <>
              <Button variant="outline" onClick={() => setTaskToDelete(null)} disabled={isDeleting}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeleteTask} disabled={isDeleting}>
                {isDeleting ? 'Deleting...' : 'Delete Task'}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-400">
                This action <strong>cannot be undone</strong>.
              </p>
            </div>
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Are you sure you want to permanently delete <strong className="text-[var(--color-foreground)]">{taskToDelete.title}</strong>?
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
