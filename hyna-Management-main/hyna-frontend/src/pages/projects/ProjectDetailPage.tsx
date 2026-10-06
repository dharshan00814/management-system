import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Users, User as UserIcon, CheckSquare, Plus,
  Layers, Check, Trash2, Edit2, ShieldCheck, Calendar,
  Crown, ArrowDown, X, AlertTriangle
} from 'lucide-react';
import {
  Button, Badge, ProgressBar, Avatar, AvatarGroup, Tabs,
  EmptyState, Modal, Input, Textarea, Select, LoadingState
} from '@/components/ui';
import { cn, getStatusColor, getPriorityColor, formatDate } from '@/lib/utils';
import { useAuthStore } from '@/stores';
import {
  getProject, getModules, getProjectTasks, createModule, updateModule, deleteModule,
  createTask, updateProject, deleteProject, getUsers, getUserById
} from '@/services/api';
import { toast } from 'sonner';
import type { Project, Module, Task, User, TaskPriority, TaskStatus } from '@/types';

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentRole, currentUser, effectiveRole } = useAuthStore();
  const prefix = effectiveRole === 'member' ? '/member' : effectiveRole === 'manager' ? '/manager' : '/admin';
  const isAdminOrManager = effectiveRole === 'admin' || effectiveRole === 'manager';

  const [activeTab, setActiveTab] = useState('overview');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // CEO Authority Check
  const isCEO = Boolean(
    currentUser?.designation?.toUpperCase().includes('CEO') ||
    (effectiveRole === 'admin' && currentUser?.designation?.toUpperCase().includes('CEO'))
  );

  const [project, setProject] = useState<Project | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);

  // Create Module Modal State
  const [showCreateModule, setShowCreateModule] = useState(false);
  const [newModuleName, setNewModuleName] = useState('');
  const [newModuleDescription, setNewModuleDescription] = useState('');
  const [newModuleAssigneeId, setNewModuleAssigneeId] = useState('');
  const [isSubmittingModule, setIsSubmittingModule] = useState(false);

  // Quick Task Creation Modal State (Allocating task inside project & module)
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    priority: 'medium' as TaskPriority,
    status: 'todo' as TaskStatus,
    deadline: '',
    moduleId: '',
    assigneeId: '',
  });
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);

  // Manage Team Modal State (Team vs Solo & Member allocation)
  const [showManageTeam, setShowManageTeam] = useState(false);
  const [editMode, setEditMode] = useState<'team' | 'solo'>('team');
  const [editManagerId, setEditManagerId] = useState('');
  const [editMemberIds, setEditMemberIds] = useState<string[]>([]);
  const [isUpdatingTeam, setIsUpdatingTeam] = useState(false);

  const handleDeleteProject = async () => {
    if (!id || !project) return;
    setIsDeleting(true);
    try {
      await deleteProject(id);
      toast.success(`Project "${project.name}" was permanently deleted.`);
      navigate(`${prefix}/projects`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete project');
      setIsDeleting(false);
    }
  };

  const loadData = async () => {
    if (!id) return;
    try {
      const [usersList, p, mods, ts] = await Promise.all([
        getUsers(),
        getProject(id),
        getModules(id),
        getProjectTasks(id),
      ]);
      setAllUsers(usersList);
      if (p) {
        setProject(p);
        setEditMode(p.projectType || (p.memberIds.length <= 1 ? 'solo' : 'team'));
        setEditManagerId(p.managerId);
        setEditMemberIds(p.memberIds);
      }
      setModules(mods);
      setTasks(ts);
    } catch (err) {
      console.error('Error loading project details:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  // Handle Create Module with direct member assignment
  const handleCreateModule = async () => {
    if (!id || !newModuleName.trim()) {
      toast.error('Please enter a module name');
      return;
    }
    try {
      setIsSubmittingModule(true);
      const created = await createModule({
        projectId: id,
        name: newModuleName.trim(),
        description: newModuleDescription.trim(),
        assigneeIds: newModuleAssigneeId ? [newModuleAssigneeId] : [],
      });
      setModules(prev => [...prev, created]);
      setShowCreateModule(false);
      setNewModuleName('');
      setNewModuleDescription('');
      setNewModuleAssigneeId('');
      toast.success('Module created and assigned to team member!');
    } catch (err) {
      toast.error('Failed to create module');
    } finally {
      setIsSubmittingModule(false);
    }
  };

  // Reassign an existing module's owner
  const handleReassignModule = async (moduleId: string, newAssigneeId: string) => {
    try {
      const updated = await updateModule(moduleId, {
        assigneeIds: newAssigneeId ? [newAssigneeId] : [],
      });
      setModules(prev => prev.map(m => m.id === moduleId ? updated : m));
      const targetUser = allUsers.find(u => u.id === newAssigneeId);
      toast.success(targetUser ? `Module reassigned to ${targetUser.name}` : 'Module assignment cleared');
    } catch (err) {
      toast.error('Failed to reassign module');
    }
  };

  // Open task creation modal for a specific module
  const handleOpenTaskForModule = (mod: Module) => {
    const defaultAssignee = mod.assigneeIds && mod.assigneeIds.length > 0 ? mod.assigneeIds[0] : (project?.memberIds[0] || '');
    setTaskForm({
      title: '',
      description: '',
      priority: 'medium',
      status: 'todo',
      deadline: '',
      moduleId: mod.id,
      assigneeId: defaultAssignee,
    });
    setShowCreateTask(true);
  };

  // Create & allocate task to member and module
  const handleCreateTask = async () => {
    if (!taskForm.title.trim()) {
      toast.error('Please enter a task title');
      return;
    }
    if (!id) return;

    try {
      setIsSubmittingTask(true);
      const created = await createTask({
        title: taskForm.title.trim(),
        description: taskForm.description.trim(),
        priority: taskForm.priority,
        status: taskForm.status,
        deadline: taskForm.deadline || undefined,
        projectId: id,
        moduleId: taskForm.moduleId || undefined,
        assigneeId: taskForm.assigneeId || undefined,
      });

      setTasks(prev => [created, ...prev]);

      // If module assigned, update module total tasks count
      if (taskForm.moduleId) {
        const targetMod = modules.find(m => m.id === taskForm.moduleId);
        if (targetMod) {
          const updatedMod = await updateModule(targetMod.id, {
            totalTasks: (targetMod.totalTasks || 0) + 1,
          });
          setModules(prev => prev.map(m => m.id === targetMod.id ? updatedMod : m));
        }
      }

      setShowCreateTask(false);
      setTaskForm({
        title: '',
        description: '',
        priority: 'medium',
        status: 'todo',
        deadline: '',
        moduleId: '',
        assigneeId: '',
      });
      toast.success('Task created and assigned to team member!');
    } catch (err) {
      toast.error('Failed to create task');
    } finally {
      setIsSubmittingTask(false);
    }
  };

  // Save team/solo & member updates
  const handleSaveTeam = async () => {
    if (!id || !project) return;
    try {
      setIsUpdatingTeam(true);
      const finalMembers = editMode === 'solo'
        ? (editManagerId ? [editManagerId] : project.memberIds.slice(0, 1))
        : (editMemberIds.length > 0 ? editMemberIds : project.memberIds);

      const updated = await updateProject(id, {
        projectType: editMode,
        managerId: editManagerId || project.managerId,
        memberIds: finalMembers,
      });

      setProject(updated);
      setShowManageTeam(false);
      toast.success(editMode === 'solo' ? 'Updated to Solo Project!' : 'Team membership updated successfully!');
    } catch (err) {
      toast.error('Failed to update team settings');
    } finally {
      setIsUpdatingTeam(false);
    }
  };

  if (isLoading) return <LoadingState />;

  if (!project) {
    return (
      <div className="page-container">
        <EmptyState
          title="Project not found"
          description="The project you are looking for does not exist."
          action={<Button onClick={() => navigate(`${prefix}/projects`)}>Go to Projects</Button>}
        />
      </div>
    );
  }

  const isSolo = project.projectType === 'solo' || project.memberIds.length <= 1;
  const manager = getUserById(project.managerId);
  const soloMember = isSolo ? getUserById(project.memberIds[0] || project.managerId) : null;

  // Project team members
  const projectMembers = allUsers.filter(u => project.memberIds.includes(u.id));

  const tabs = [
    { value: 'overview', label: 'Overview' },
    { value: 'modules', label: 'Modules', count: modules.length },
    { value: 'tasks', label: 'Tasks', count: tasks.length },
    { value: 'members', label: isSolo ? 'Solo Contributor' : 'Team Members', count: project.memberIds.length },
    { value: 'activity', label: 'Activity' },
  ];

  return (
    <div className="page-container">
      {/* Top Navigation & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate(`${prefix}/projects`)}
            className="p-2 rounded-lg hover:bg-[var(--color-muted)] transition-colors cursor-pointer"
            title="Back to Projects"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: project.color }} />
              <h1 className="page-title truncate text-xl sm:text-2xl">{project.name}</h1>
              <Badge className={getStatusColor(project.status)}>{project.status}</Badge>

              {/* Team vs Solo Badge */}
              {isSolo ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <UserIcon className="w-3.5 h-3.5" /> Solo Project
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  <Users className="w-3.5 h-3.5" /> Team ({project.memberIds.length} members)
                </span>
              )}
            </div>
            <p className="page-description mt-0.5 truncate">{project.description || 'No description provided.'}</p>
          </div>
        </div>
        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {isAdminOrManager && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditMode(isSolo ? 'solo' : 'team');
                  setEditManagerId(project.managerId);
                  setEditMemberIds(project.memberIds);
                  setShowManageTeam(true);
                }}
              >
                <Users className="w-3.5 h-3.5 mr-1.5" />
                <span>{isSolo ? 'Change Assignee' : 'Manage Team'}</span>
              </Button>

              <Button size="sm" onClick={() => setShowCreateModule(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> New Module
              </Button>

              <Button size="sm" onClick={() => {
                setTaskForm({
                  title: '',
                  description: '',
                  priority: 'medium',
                  status: 'todo',
                  deadline: '',
                  moduleId: modules[0]?.id || '',
                  assigneeId: project.memberIds[0] || '',
                });
                setShowCreateTask(true);
              }}>
                <CheckSquare className="w-3.5 h-3.5 mr-1" /> Allocate Task
              </Button>
            </>
          )}

          {isCEO && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteModal(true)}
              className="text-red-500 hover:text-red-600 hover:bg-red-500/10 border-red-500/30 shrink-0"
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Delete Project
            </Button>
          )}
        </div>
      </div>

      <Tabs tabs={tabs} value={activeTab} onChange={setActiveTab} className="mb-6 w-fit" />

      {/* ======================================================== */}
      {/* 1. OVERVIEW TAB                                          */}
      {/* ======================================================== */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
          <div className="lg:col-span-2 space-y-6">
            {/* Progress Card */}
            {(() => {
              const completedTasksCount = tasks.filter(t => t.status === 'completed').length;
              const inReviewTasksCount = tasks.filter(t => t.status === 'in-review').length;
              const inProgressTasksCount = tasks.filter(t => t.status === 'in-progress').length;
              const computedOverallProgress = tasks.length > 0
                ? Math.round((completedTasksCount / tasks.length) * 100)
                : project.progress;
              const completedModulesCount = modules.filter(m => {
                const mTasks = tasks.filter(t => t.moduleId === m.id);
                return mTasks.length > 0 && mTasks.every(t => t.status === 'completed');
              }).length;

              return (
                <div className="card p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-base font-bold">Overall Project Velocity & Completion</h2>
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        Real-time tracking computed from approved tasks and module sign-offs.
                      </p>
                    </div>
                    <span className="text-base font-bold text-indigo-600 dark:text-indigo-400">
                      {computedOverallProgress}% completed
                    </span>
                  </div>
                  <ProgressBar value={computedOverallProgress} showLabel size="lg" className="mb-4" />
                  <div className="grid grid-cols-4 gap-2 pt-4 border-t border-[var(--color-border)] text-center">
                    <div>
                      <p className="text-xl sm:text-2xl font-bold">{modules.length}</p>
                      <p className="text-[11px] text-[var(--color-muted-foreground)]">Modules ({completedModulesCount} Done)</p>
                    </div>
                    <div>
                      <p className="text-xl sm:text-2xl font-bold">{tasks.length}</p>
                      <p className="text-[11px] text-[var(--color-muted-foreground)]">Total Tasks</p>
                    </div>
                    <div>
                      <p className="text-xl sm:text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                        {inProgressTasksCount + inReviewTasksCount}
                      </p>
                      <p className="text-[11px] text-[var(--color-muted-foreground)]">In Progress / Review</p>
                    </div>
                    <div>
                      <p className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                        {completedTasksCount}
                      </p>
                      <p className="text-[11px] text-[var(--color-muted-foreground)]">Completed</p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Modules Overview with Member Owners */}
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold">Project Modules & Team Allocation</h2>
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    Each module represents an independent deliverable assigned to team members.
                  </p>
                </div>
                {isAdminOrManager && (
                  <Button size="sm" variant="outline" onClick={() => setShowCreateModule(true)}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Module
                  </Button>
                )}
              </div>

              {modules.length === 0 ? (
                <div className="py-8 text-center border border-dashed border-[var(--color-border)] rounded-2xl">
                  <Layers className="w-8 h-8 text-[var(--color-muted-foreground)] mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-semibold">No modules created yet</p>
                  <p className="text-xs text-[var(--color-muted-foreground)] mb-3">Break this project into modules and allocate them to members.</p>
                  {isAdminOrManager && (
                    <Button size="sm" onClick={() => setShowCreateModule(true)}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> Create First Module
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {modules.map(mod => {
                    const ownerId = mod.assigneeIds && mod.assigneeIds.length > 0 ? mod.assigneeIds[0] : null;
                    const owner = ownerId ? getUserById(ownerId) : null;
                    const modTasks = tasks.filter(t => t.moduleId === mod.id);
                    const completedCount = modTasks.filter(t => t.status === 'completed').length;
                    const inReviewCount = modTasks.filter(t => t.status === 'in-review').length;
                    const inProgressCount = modTasks.filter(t => t.status === 'in-progress').length;
                    const computedProgress = modTasks.length > 0 ? Math.round((completedCount / modTasks.length) * 100) : mod.progress;
                    const isModuleCompleted = modTasks.length > 0 && completedCount === modTasks.length;

                    return (
                      <div
                        key={mod.id}
                        className={cn(
                          'p-4 rounded-2xl border transition-all',
                          isModuleCompleted
                            ? 'border-emerald-500/40 bg-emerald-500/5'
                            : 'border-[var(--color-border)] bg-[var(--color-card)] hover:border-black/20 dark:hover:border-white/20'
                        )}
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-bold text-[var(--color-foreground)]">{mod.name}</h3>
                              {isModuleCompleted ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                  ✅ Completed
                                </span>
                              ) : inReviewCount > 0 ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                                  🔍 {inReviewCount} In Review
                                </span>
                              ) : null}
                            </div>
                            <p className="text-xs text-[var(--color-muted-foreground)] line-clamp-1 mt-0.5">
                              {mod.description || 'Module deliverable and tasks.'}
                            </p>
                          </div>
                          <span className="text-xs font-bold shrink-0">{computedProgress}%</span>
                        </div>

                        <ProgressBar value={computedProgress} size="sm" className="mb-3" />

                        <div className="flex items-center justify-between text-xs pt-2 border-t border-[var(--color-border)]/50">
                          {/* Module Owner Chip */}
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-[var(--color-muted-foreground)]">Assigned Owner:</span>
                            {owner ? (
                              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-[var(--color-muted)] text-[var(--color-foreground)] text-xs font-semibold">
                                <Avatar name={owner.name} size="xs" />
                                <span>{owner.name}</span>
                                <span className="text-[10px] text-[var(--color-muted-foreground)]">({owner.designation})</span>
                              </div>
                            ) : (
                              <span className="text-xs text-amber-500 font-medium">Unassigned</span>
                            )}
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="text-[11px] text-[var(--color-muted-foreground)]">
                              {completedCount}/{modTasks.length} tasks done
                            </span>
                            {/* Quick Add Task Button */}
                            {isAdminOrManager && (
                              <button
                                onClick={() => handleOpenTaskForModule(mod)}
                                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Allocate Task</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="space-y-6">
            {/* Team or Solo Details Card */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold">
                  {isSolo ? 'Solo Contributor' : 'Team Command'}
                </h3>
                {isAdminOrManager && (
                  <button
                    onClick={() => {
                      setEditMode(isSolo ? 'solo' : 'team');
                      setEditManagerId(project.managerId);
                      setEditMemberIds(project.memberIds);
                      setShowManageTeam(true);
                    }}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Edit2 className="w-3 h-3" /> Edit
                  </button>
                )}
              </div>

              {isSolo ? (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-2">
                  <div className="flex items-center gap-3">
                    <Avatar name={soloMember?.name || 'Solo'} size="md" />
                    <div>
                      <p className="text-sm font-bold text-[var(--color-foreground)]">{soloMember?.name || 'Solo Contributor'}</p>
                      <p className="text-xs text-[var(--color-muted-foreground)]">{soloMember?.designation || 'Software Engineer'}</p>
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">{soloMember?.department}</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-[var(--color-muted-foreground)] pt-2 border-t border-emerald-500/20">
                    Sole contributor responsible for delivering all project modules.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1">
                        <Crown className="w-3 h-3 text-amber-500" />
                        Team Lead / Manager
                      </span>
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-800 dark:text-amber-200 font-bold">
                        Lead
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Avatar name={manager?.name || 'Lead'} size="xs" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold truncate leading-tight">{manager?.name || 'Unassigned'}</p>
                        <p className="text-[10px] text-[var(--color-muted-foreground)] truncate">{manager?.designation} • {manager?.department || 'Eng'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Down Arrow Connector */}
                  <div className="flex items-center justify-center -my-1 text-[var(--color-muted-foreground)]">
                    <div className="flex items-center gap-1 text-[9px] font-bold text-indigo-500 uppercase tracking-wider">
                      <ArrowDown className="w-2.5 h-2.5" />
                      <span>Chosen Members Reporting Below</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-[var(--color-foreground)]">
                        Chosen Team Members ({project.memberIds.filter(id => id !== project.managerId).length})
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {project.memberIds.filter(id => id !== project.managerId).map(mid => {
                        const m = getUserById(mid);
                        if (!m) return null;
                        const memberModules = modules.filter(mod => mod.assigneeIds?.includes(mid));
                        return (
                          <div key={mid} className="flex items-center justify-between p-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <Avatar name={m.name} size="xs" />
                              <div className="min-w-0">
                                <p className="font-semibold text-xs truncate leading-tight">{m.name}</p>
                                <p className="text-[10px] text-[var(--color-muted-foreground)] truncate">{m.designation}</p>
                              </div>
                            </div>
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-[var(--color-muted)] text-[var(--color-muted-foreground)] shrink-0 font-medium">
                              {memberModules.length} module{memberModules.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Timeline & Metadata */}
            <div className="card p-5 space-y-3 text-xs">
              <h3 className="text-sm font-bold text-[var(--color-foreground)]">Project Timeline</h3>
              <div>
                <span className="text-[var(--color-muted-foreground)]">Start Date:</span>
                <p className="font-semibold text-sm mt-0.5">{formatDate(project.startDate)}</p>
              </div>
              <div>
                <span className="text-[var(--color-muted-foreground)]">Target Deadline:</span>
                <p className="font-semibold text-sm mt-0.5 text-indigo-600 dark:text-indigo-400">
                  {formatDate(project.deadline)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. MODULES TAB                                           */}
      {/* ======================================================== */}
      {activeTab === 'modules' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Project Modules</h2>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Assign and distribute independent technical modules to each member of the team.
              </p>
            </div>
            {isAdminOrManager && (
              <Button onClick={() => setShowCreateModule(true)}>
                <Plus className="w-4 h-4 mr-1.5" /> New Module
              </Button>
            )}
          </div>

          {modules.length === 0 ? (
            <EmptyState
              title="No modules yet"
              description="Break down this project into technical deliverables and assign each to a team member."
              action={isAdminOrManager ? <Button onClick={() => setShowCreateModule(true)}>Create Module</Button> : undefined}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {modules.map(mod => {
                const ownerId = mod.assigneeIds && mod.assigneeIds.length > 0 ? mod.assigneeIds[0] : '';
                const owner = ownerId ? getUserById(ownerId) : null;
                const modTasks = tasks.filter(t => t.moduleId === mod.id);
                const completedCount = modTasks.filter(t => t.status === 'completed').length;
                const inReviewCount = modTasks.filter(t => t.status === 'in-review').length;
                const inProgressCount = modTasks.filter(t => t.status === 'in-progress').length;
                const overdueCount = modTasks.filter(t => t.status !== 'completed' && t.deadline && new Date(t.deadline) < new Date()).length;
                const computedProgress = modTasks.length > 0 ? Math.round((completedCount / modTasks.length) * 100) : mod.progress;
                const isModuleCompleted = modTasks.length > 0 && completedCount === modTasks.length;

                return (
                  <div
                    key={mod.id}
                    className={cn(
                      'card p-5 card-hover flex flex-col justify-between transition-all',
                      isModuleCompleted ? 'border-emerald-500/40 bg-emerald-500/5' : ''
                    )}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-bold text-[var(--color-foreground)]">{mod.name}</h3>
                            {isModuleCompleted ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                ✅ Completed
                              </span>
                            ) : inReviewCount > 0 ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                                🔍 {inReviewCount} In Review
                              </span>
                            ) : overdueCount > 0 ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30">
                                ⚠️ {overdueCount} Overdue
                              </span>
                            ) : null}
                          </div>
                          <p className="text-xs text-[var(--color-muted-foreground)] mt-1 line-clamp-2">
                            {mod.description || 'Module deliverables and tasks.'}
                          </p>
                        </div>
                        <Badge
                          variant={isModuleCompleted ? 'default' : 'outline'}
                          className={cn('font-bold shrink-0', isModuleCompleted ? 'bg-emerald-600 text-white' : '')}
                        >
                          {computedProgress}%
                        </Badge>
                      </div>

                      <ProgressBar value={computedProgress} size="md" className="mb-3" />

                      {/* Live Task Distribution Chips */}
                      <div className="flex items-center gap-1.5 flex-wrap mb-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          {completedCount} Done
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                          {inProgressCount} Active
                        </span>
                        {inReviewCount > 0 && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                            {inReviewCount} In Review
                          </span>
                        )}
                        {overdueCount > 0 && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                            {overdueCount} Overdue
                          </span>
                        )}
                      </div>

                      {/* Module Owner Assignment & Reassignment */}
                      <div className="p-3 rounded-xl bg-[var(--color-muted)]/40 border border-[var(--color-border)] mb-4">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                            Assigned Module Owner
                          </span>
                          {isAdminOrManager && (
                            <span className="text-[10px] text-indigo-500 font-semibold">Change Owner</span>
                          )}
                        </div>

                        {isAdminOrManager ? (
                          <select
                            value={ownerId}
                            onChange={(e) => handleReassignModule(mod.id, e.target.value)}
                            className="w-full h-8 px-2 rounded-lg border border-[var(--color-input)] bg-[var(--color-card)] text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                          >
                            <option value="">Unassigned</option>
                            {(projectMembers.length > 0 ? projectMembers : allUsers).map(u => (
                              <option key={u.id} value={u.id}>
                                {u.name} ({u.designation} — {u.department})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="flex items-center gap-2">
                            {owner && <Avatar name={owner.name} size="xs" />}
                            <span className="text-xs font-semibold">{owner?.name || 'Unassigned'}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-[var(--color-border)] text-xs text-[var(--color-muted-foreground)]">
                      <span>{completedCount} of {modTasks.length} tasks completed</span>
                      {isAdminOrManager && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenTaskForModule(mod)}
                          className="h-8 text-xs cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" /> Add Task
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. TASKS TAB                                             */}
      {/* ======================================================== */}
      {activeTab === 'tasks' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Project Tasks & Assignments</h2>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Tasks allocated to specific modules and team members.
              </p>
            </div>
            {isAdminOrManager && (
              <Button onClick={() => {
                setTaskForm({
                  title: '',
                  description: '',
                  priority: 'medium',
                  status: 'todo',
                  deadline: '',
                  moduleId: modules[0]?.id || '',
                  assigneeId: project.memberIds[0] || '',
                });
                setShowCreateTask(true);
              }}>
                <Plus className="w-4 h-4 mr-1.5" /> Allocate New Task
              </Button>
            )}
          </div>

          {tasks.length === 0 ? (
            <EmptyState
              title="No tasks in this project"
              description="Start assigning tasks to modules and team members."
              action={isAdminOrManager ? <Button onClick={() => setShowCreateTask(true)}>Create Task</Button> : undefined}
            />
          ) : (
            <div className="space-y-2.5">
              {tasks.map(task => {
                const assignee = getUserById(task.assigneeId);
                const taskModule = modules.find(m => m.id === task.moduleId);

                return (
                  <div key={task.id} className="card p-4 card-hover flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="text-sm font-bold text-[var(--color-foreground)]">{task.title}</p>
                        <Badge className={getStatusColor(task.status)}>{task.status.replace(/-/g, ' ')}</Badge>
                        <Badge className={getPriorityColor(task.priority)}>{task.priority}</Badge>
                        {taskModule && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                            <Layers className="w-3 h-3" /> {taskModule.name}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--color-muted-foreground)] line-clamp-1">{task.description}</p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {assignee && (
                        <div className="flex items-center gap-1.5 text-xs font-medium">
                          <Avatar name={assignee.name} size="xs" />
                          <span>{assignee.name}</span>
                        </div>
                      )}
                      <span className="text-[11px] text-[var(--color-muted-foreground)]">
                        {formatDate(task.deadline)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. MEMBERS TAB                                           */}
      {/* ======================================================== */}
      {activeTab === 'members' && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">
                {isSolo ? 'Solo Contributor' : 'Project Leadership & Team Members'}
              </h2>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {isSolo
                  ? 'Dedicated individual contributor assigned to deliver this project.'
                  : 'Team Lead and chosen members reporting directly to project leadership.'}
              </p>
            </div>
            {isAdminOrManager && (
              <Button
                variant="outline"
                onClick={() => {
                  setEditMode(isSolo ? 'solo' : 'team');
                  setEditManagerId(project.managerId);
                  setEditMemberIds(project.memberIds);
                  setShowManageTeam(true);
                }}
              >
                <Users className="w-4 h-4 mr-1.5" />
                <span>{isSolo ? 'Change Solo Contributor' : 'Manage Team & Lead'}</span>
              </Button>
            )}
          </div>

          {isSolo ? (
            /* Solo Member View */
            <div className="max-w-md">
              {(() => {
                const soloM = soloMember || (project.memberIds[0] ? getUserById(project.memberIds[0]) : null);
                if (!soloM) return <EmptyState title="No member assigned" />;
                const memberTasks = tasks.filter(t => t.assigneeId === soloM.id);
                return (
                  <div className="card p-6 border-emerald-500/30 bg-emerald-500/5">
                    <div className="flex items-center gap-4 mb-4">
                      <Avatar name={soloM.name} size="lg" />
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-[var(--color-foreground)]">{soloM.name}</h3>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            Solo Owner
                          </span>
                        </div>
                        <p className="text-xs text-[var(--color-muted-foreground)]">{soloM.designation}</p>
                        <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{soloM.department}</p>
                      </div>
                    </div>
                    <div className="pt-3 border-t border-[var(--color-border)] flex items-center justify-between text-xs text-[var(--color-muted-foreground)]">
                      <span>{memberTasks.length} tasks allocated</span>
                      <span>{modules.length} project modules</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            /* Team Project: Team Lead card at top, then Chosen Members down below */
            <div className="space-y-6">
              {/* 1. Team Lead Card */}
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-muted-foreground)] flex items-center gap-1.5">
                  <Crown className="w-4 h-4 text-amber-500" />
                  <span>Project Leadership / Team Lead</span>
                </span>

                {(() => {
                  const leadUser = manager || (project.managerId ? getUserById(project.managerId) : null);
                  if (!leadUser) {
                    return (
                      <div className="p-4 rounded-2xl border border-dashed border-[var(--color-border)] text-center text-xs text-[var(--color-muted-foreground)]">
                        No Team Lead assigned yet. Click "Manage Team & Lead" to assign one.
                      </div>
                    );
                  }
                  const leadTasks = tasks.filter(t => t.assigneeId === leadUser.id);
                  const leadModules = modules.filter(mod => mod.assigneeIds?.includes(leadUser.id));

                  return (
                    <div className="p-5 rounded-2xl border-2 border-amber-500/30 bg-gradient-to-r from-amber-500/5 to-indigo-500/5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="relative">
                          <Avatar name={leadUser.name} size="lg" />
                          <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-amber-500 text-white shadow-xs">
                            <Crown className="w-3 h-3" />
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base font-bold text-[var(--color-foreground)]">{leadUser.name}</h3>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                              👑 Team Lead / Manager
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-[var(--color-muted)] text-[var(--color-muted-foreground)] font-mono">
                              {leadUser.employeeId || 'LEAD'}
                            </span>
                          </div>
                          <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">
                            {leadUser.designation} • {leadUser.department || 'Engineering'}
                          </p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-[var(--color-muted-foreground)]">
                            <span>{leadModules.length} module{leadModules.length !== 1 ? 's' : ''} owned</span>
                            <span>•</span>
                            <span>{leadTasks.length} tasks allocated</span>
                          </div>
                        </div>
                      </div>

                      {isAdminOrManager && (
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setTaskForm(prev => ({
                                ...prev,
                                assigneeId: leadUser.id,
                              }));
                              setShowCreateTask(true);
                            }}
                          >
                            <Plus className="w-3.5 h-3.5 mr-1" /> Allocate Task
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Hierarchy Tree Visual Connector */}
              <div className="flex items-center justify-center my-2 text-[var(--color-muted-foreground)]">
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--color-muted)] text-xs font-bold text-indigo-600 dark:text-indigo-400">
                  <ArrowDown className="w-3.5 h-3.5" />
                  <span>Chosen Team Members (Under Team Lead)</span>
                  <ArrowDown className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* 2. Chosen Team Members Down Below */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-[var(--color-foreground)] flex items-center gap-2">
                      <Users className="w-4 h-4 text-indigo-500" />
                      <span>Chosen Team Members ({project.memberIds.filter(id => id !== project.managerId).length})</span>
                    </h3>
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      Members actively contributing to project deliverables under the Team Lead.
                    </p>
                  </div>
                  {isAdminOrManager && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditMode('team');
                        setEditManagerId(project.managerId);
                        setEditMemberIds(project.memberIds);
                        setShowManageTeam(true);
                      }}
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" /> Add / Remove Members
                    </Button>
                  )}
                </div>

                {project.memberIds.filter(id => id !== project.managerId).length === 0 ? (
                  <div className="p-8 text-center border border-dashed border-[var(--color-border)] rounded-2xl bg-[var(--color-muted)]/20">
                    <Users className="w-8 h-8 text-[var(--color-muted-foreground)] mx-auto mb-2 opacity-50" />
                    <p className="text-sm font-semibold">No additional members chosen yet</p>
                    <p className="text-xs text-[var(--color-muted-foreground)] mb-3">
                      Add engineers and contributors to work under this Team Lead.
                    </p>
                    {isAdminOrManager && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setEditMode('team');
                          setEditManagerId(project.managerId);
                          setEditMemberIds(project.memberIds);
                          setShowManageTeam(true);
                        }}
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" /> Choose Team Members
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {project.memberIds
                      .filter(id => id !== project.managerId)
                      .map(memberId => {
                        const member = getUserById(memberId);
                        if (!member) return null;
                        const memberTasks = tasks.filter(t => t.assigneeId === memberId);
                        const assignedModules = modules.filter(mod => mod.assigneeIds?.includes(memberId));

                        return (
                          <div key={memberId} className="card p-5 card-hover flex flex-col justify-between border-[var(--color-border)] hover:border-indigo-500/40 transition-all">
                            <div>
                              <div className="flex items-center gap-3 mb-3">
                                <Avatar name={member.name} size="md" />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <p className="text-sm font-bold text-[var(--color-foreground)] truncate">{member.name}</p>
                                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                                      Chosen Member
                                    </span>
                                  </div>
                                  <p className="text-xs text-[var(--color-muted-foreground)] truncate">{member.designation}</p>
                                  <p className="text-[11px] font-semibold text-indigo-500">{member.department || 'Engineering'}</p>
                                </div>
                              </div>

                              {/* Modules assigned to this member */}
                              <div className="mb-3 pt-3 border-t border-[var(--color-border)]">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted-foreground)] block mb-1">
                                  Assigned Modules ({assignedModules.length})
                                </span>
                                {assignedModules.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {assignedModules.map(mod => (
                                      <span
                                        key={mod.id}
                                        className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20"
                                      >
                                        {mod.name}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-[11px] text-[var(--color-muted-foreground)] italic">
                                    No module assigned yet.
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="pt-2 border-t border-[var(--color-border)] space-y-2">
                              <div className="flex items-center justify-between text-xs text-[var(--color-muted-foreground)]">
                                <span>{memberTasks.length} tasks allocated</span>
                                <span>{memberTasks.filter(t => t.status === 'completed').length} completed</span>
                              </div>
                              {isAdminOrManager && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTaskForm(prev => ({
                                      ...prev,
                                      assigneeId: member.id,
                                    }));
                                    setShowCreateTask(true);
                                  }}
                                  className="w-full py-1 rounded-md text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 transition-colors flex items-center justify-center gap-1 cursor-pointer"
                                >
                                  <Plus className="w-3 h-3" /> Allocate Task to {member.name.split(' ')[0]}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. ACTIVITY TAB                                          */}
      {/* ======================================================== */}
      {activeTab === 'activity' && (
        <div className="card p-6 animate-fade-in">
          <EmptyState
            title="Live Team Activity"
            description="Live git commits, module progress updates, and task deliverable reviews appear here."
          />
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: CREATE MODULE                                     */}
      {/* ======================================================== */}
      <Modal
        isOpen={showCreateModule}
        onClose={() => setShowCreateModule(false)}
        title="Create & Assign Module"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowCreateModule(false)}>Cancel</Button>
            <Button onClick={handleCreateModule} isLoading={isSubmittingModule}>Create & Assign Module</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Module Name"
            placeholder="e.g., Frontend UI & Bento Cards, Backend API & Auth"
            value={newModuleName}
            onChange={(e) => setNewModuleName(e.target.value)}
          />

          <Textarea
            label="Description & Key Deliverables"
            placeholder="Describe the module's scope and expected deliverables..."
            rows={3}
            value={newModuleDescription}
            onChange={(e) => setNewModuleDescription(e.target.value)}
          />

          {/* Direct Member Assignment in Module */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--color-foreground)]">
              Assign Module in Team to Member
            </label>
            <select
              value={newModuleAssigneeId}
              onChange={(e) => setNewModuleAssigneeId(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-[var(--color-input)] bg-[var(--color-card)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            >
              <option value="">Select Team Member to Own This Module</option>
              {(projectMembers.length > 0 ? projectMembers : allUsers).map(u => (
                <option key={u.id} value={u.id}>
                  {u.name} — {u.designation} ({u.department})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-[var(--color-muted-foreground)]">
              This member will be responsible for leading and completing all tasks under this module.
            </p>
          </div>
        </div>
      </Modal>

      {/* ======================================================== */}
      {/* MODAL: CREATE TASK ALLOCATED TO MODULE & MEMBER           */}
      {/* ======================================================== */}
      <Modal
        isOpen={showCreateTask}
        onClose={() => setShowCreateTask(false)}
        title="Allocate Task to Module & Member"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowCreateTask(false)}>Cancel</Button>
            <Button onClick={handleCreateTask} isLoading={isSubmittingTask}>Allocate Task</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Task Title"
            placeholder="e.g. Build dark mode toggle, write REST endpoint"
            value={taskForm.title}
            onChange={(e) => setTaskForm(p => ({ ...p, title: e.target.value }))}
          />

          <Textarea
            label="Description & Requirements"
            placeholder="Provide task instructions, deliverable requirements..."
            rows={2}
            value={taskForm.description}
            onChange={(e) => setTaskForm(p => ({ ...p, description: e.target.value }))}
          />

          {/* Module Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--color-foreground)]">Belongs to Module</label>
            <select
              value={taskForm.moduleId}
              onChange={(e) => {
                const targetModId = e.target.value;
                const foundMod = modules.find(m => m.id === targetModId);
                const suggestedAssignee = foundMod?.assigneeIds?.[0] || taskForm.assigneeId;
                setTaskForm(p => ({
                  ...p,
                  moduleId: targetModId,
                  assigneeId: suggestedAssignee,
                }));
              }}
              className="w-full h-10 px-3 rounded-lg border border-[var(--color-input)] bg-[var(--color-card)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            >
              <option value="">General Project Task (No Module)</option>
              {modules.map(mod => {
                const modOwner = mod.assigneeIds?.[0] ? getUserById(mod.assigneeIds[0]) : null;
                return (
                  <option key={mod.id} value={mod.id}>
                    {mod.name} {modOwner ? `(Owned by ${modOwner.name})` : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Assignee Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[var(--color-foreground)]">Assign to Team Member</label>
            <select
              value={taskForm.assigneeId}
              onChange={(e) => setTaskForm(p => ({ ...p, assigneeId: e.target.value }))}
              className="w-full h-10 px-3 rounded-lg border border-[var(--color-input)] bg-[var(--color-card)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            >
              <option value="">Select Team Member</option>
              {(projectMembers.length > 0 ? projectMembers : allUsers).map(u => (
                <option key={u.id} value={u.id}>
                  {u.name} — {u.designation}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Priority"
              value={taskForm.priority}
              onChange={(val) => setTaskForm(p => ({ ...p, priority: val as TaskPriority }))}
              options={[
                { value: 'urgent', label: 'Urgent' },
                { value: 'high', label: 'High' },
                { value: 'medium', label: 'Medium' },
                { value: 'low', label: 'Low' },
              ]}
            />

            <Input
              label="Due Date"
              type="date"
              value={taskForm.deadline}
              onChange={(e) => setTaskForm(p => ({ ...p, deadline: e.target.value }))}
            />
          </div>
        </div>
      </Modal>

      {/* ======================================================== */}
      {/* MODAL: MANAGE TEAM (TEAM VS SOLO & MEMBER ALLOCATION)    */}
      {/* ======================================================== */}
      <Modal
        isOpen={showManageTeam}
        onClose={() => setShowManageTeam(false)}
        title="Manage Team & Project Mode"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowManageTeam(false)}>Cancel</Button>
            <Button onClick={handleSaveTeam} isLoading={isUpdatingTeam}>Save Changes</Button>
          </>
        }
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Mode Switcher */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setEditMode('team')}
              className={cn(
                'p-3 rounded-xl border text-left transition-all flex items-center gap-3 cursor-pointer',
                editMode === 'team'
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-foreground)]'
                  : 'border-[var(--color-border)] hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)]'
              )}
            >
              <Users className="w-4 h-4 text-indigo-500" />
              <div>
                <p className="text-xs font-bold">Team Project</p>
                <p className="text-[11px] opacity-75">Multi-member team</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setEditMode('solo')}
              className={cn(
                'p-3 rounded-xl border text-left transition-all flex items-center gap-3 cursor-pointer',
                editMode === 'solo'
                  ? 'border-emerald-500 bg-emerald-500/10 text-[var(--color-foreground)]'
                  : 'border-[var(--color-border)] hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)]'
              )}
            >
              <UserIcon className="w-4 h-4 text-emerald-500" />
              <div>
                <p className="text-xs font-bold">Solo Project</p>
                <p className="text-[11px] opacity-75">1 dedicated member</p>
              </div>
            </button>
          </div>

          {editMode === 'solo' ? (
            <div className="space-y-2 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
              <label className="text-xs font-bold text-[var(--color-foreground)]">Select Solo Contributor</label>
              <select
                value={editManagerId}
                onChange={(e) => {
                  setEditManagerId(e.target.value);
                  setEditMemberIds([e.target.value]);
                }}
                className="w-full h-10 px-3 rounded-lg border border-[var(--color-input)] bg-[var(--color-card)] text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {allUsers.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.designation} — {user.department})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-3.5 p-3.5 rounded-2xl border border-indigo-200/60 dark:border-indigo-900/40 bg-indigo-50/20 dark:bg-indigo-950/10">
              {/* Step 1: Team Lead / Manager */}
              <div className="p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xs">
                <label className="text-[11px] font-bold text-[var(--color-foreground)] uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                  <Crown className="w-3.5 h-3.5 text-amber-500" />
                  <span>1. Team Lead / Project Manager *</span>
                </label>
                <select
                  value={editManagerId}
                  onChange={(e) => {
                    const newMgrId = e.target.value;
                    setEditManagerId(newMgrId);
                    if (newMgrId && !editMemberIds.includes(newMgrId)) {
                      setEditMemberIds(prev => [newMgrId, ...prev.filter(id => id !== newMgrId)]);
                    }
                  }}
                  className="w-full h-9 px-3 rounded-lg border border-[var(--color-input)] bg-[var(--color-background)] text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Choose Team Lead / Manager...</option>
                  {allUsers.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.role.toUpperCase()} — {user.designation})
                    </option>
                  ))}
                </select>

                {editManagerId && (() => {
                  const leadUser = allUsers.find(u => u.id === editManagerId);
                  if (!leadUser) return null;
                  return (
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--color-border)]/60 text-xs">
                      <div className="flex items-center gap-2">
                        <Avatar name={leadUser.name} size="xs" />
                        <div>
                          <p className="font-bold text-xs leading-tight">{leadUser.name}</p>
                          <p className="text-[10px] text-[var(--color-muted-foreground)]">{leadUser.designation} • {leadUser.department || 'Engineering'}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                        Team Lead
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Hierarchy indicator down to chosen members */}
              <div className="flex items-center justify-center -my-1 text-[var(--color-muted-foreground)]">
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[var(--color-muted)] text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                  <ArrowDown className="w-3 h-3" />
                  <span>Chosen Members Down Below</span>
                  <ArrowDown className="w-3 h-3" />
                </div>
              </div>

              {/* Step 2: Chosen Team Members Under Lead */}
              <div className="p-3.5 rounded-xl border border-indigo-200/60 dark:border-indigo-800/40 bg-[var(--color-card)] space-y-3 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-[11px] font-bold text-[var(--color-foreground)] uppercase tracking-wider block">
                      2. Chosen Team Members ({editMemberIds.filter(id => id !== editManagerId).length})
                    </label>
                    <p className="text-[10px] text-[var(--color-muted-foreground)]">
                      Members assigned to work under this Team Lead
                    </p>
                  </div>
                </div>

                {/* Dropdown to Choose and Add a Member */}
                <div>
                  <select
                    className="w-full h-9 px-3 rounded-lg border border-[var(--color-input)] bg-[var(--color-background)] text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    defaultValue=""
                    onChange={(e) => {
                      const newId = e.target.value;
                      if (newId && !editMemberIds.includes(newId)) {
                        setEditMemberIds(prev => [...prev, newId]);
                      }
                      e.target.value = '';
                    }}
                  >
                    <option value="" disabled>+ Choose member to add under Team Lead...</option>
                    {allUsers
                      .filter(u => !editMemberIds.includes(u.id))
                      .map(user => (
                        <option key={user.id} value={user.id}>
                          + Add {user.name} — {user.designation} ({user.department || 'Engineering'})
                        </option>
                      ))}
                  </select>
                </div>

                {/* List of Chosen Members */}
                {editMemberIds.length === 0 ? (
                  <p className="text-xs text-[var(--color-muted-foreground)] text-center py-2 italic">
                    No members chosen yet. Pick a member from the dropdown or click from the quick pool below.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                    {editMemberIds.map(mid => {
                      const member = allUsers.find(u => u.id === mid);
                      if (!member) return null;
                      const isLead = mid === editManagerId;

                      return (
                        <div
                          key={mid}
                          className={cn(
                            'flex items-center justify-between p-2 rounded-lg border text-xs transition-all',
                            isLead
                              ? 'border-amber-500/30 bg-amber-500/5'
                              : 'border-[var(--color-border)] bg-[var(--color-muted)]/40 hover:bg-[var(--color-muted)]/70'
                          )}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Avatar name={member.name} size="xs" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="font-bold truncate leading-tight text-xs">{member.name}</p>
                                {isLead ? (
                                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300">
                                    Lead
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-medium px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                                    Chosen Member
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-[var(--color-muted-foreground)] truncate">
                                {member.designation} • {member.department || 'Engineering'}
                              </p>
                            </div>
                          </div>

                          {!isLead && (
                            <button
                              type="button"
                              onClick={() => setEditMemberIds(prev => prev.filter(id => id !== mid))}
                              className="p-1 rounded-md text-[var(--color-muted-foreground)] hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                              title="Remove chosen member"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Quick Toggle Members Pool */}
                <div className="pt-2 border-t border-[var(--color-border)]/60">
                  <span className="text-[10px] font-semibold text-[var(--color-muted-foreground)] block mb-1.5">
                    Click to quick choose / remove members:
                  </span>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {allUsers.map(user => {
                      const isChosen = editMemberIds.includes(user.id);
                      const isLead = user.id === editManagerId;
                      return (
                        <button
                          type="button"
                          key={user.id}
                          onClick={() => {
                            if (isChosen) {
                              if (!isLead) {
                                setEditMemberIds(prev => prev.filter(id => id !== user.id));
                              }
                            } else {
                              setEditMemberIds(prev => [...prev, user.id]);
                            }
                          }}
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer border',
                            isChosen
                              ? isLead
                                ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                                : 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                              : 'bg-[var(--color-muted)] hover:bg-[var(--color-muted)]/80 text-[var(--color-foreground)] border-transparent'
                          )}
                        >
                          <Avatar name={user.name} size="xs" className="w-4 h-4 text-[9px]" />
                          <span>{user.name}</span>
                          {isLead ? (
                            <Crown className="w-3 h-3 text-amber-500 ml-0.5" />
                          ) : isChosen ? (
                            <Check className="w-3 h-3 text-white ml-0.5" />
                          ) : (
                            <Plus className="w-3 h-3 text-[var(--color-muted-foreground)] ml-0.5" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* CEO Project Delete Confirmation Modal */}
      {showDeleteModal && (
        <Modal
          isOpen={showDeleteModal}
          onClose={() => !isDeleting && setShowDeleteModal(false)}
          title="Delete Project (CEO Authorization)"
          footer={
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                disabled={isDeleting}
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                isLoading={isDeleting}
                onClick={handleDeleteProject}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Permanently Delete Project
              </Button>
            </div>
          }
        >
          <div className="space-y-3 pt-2">
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-semibold text-red-500">Irreversible Executive Action</p>
                <p className="text-[var(--color-muted-foreground)] leading-relaxed">
                  Are you sure you want to permanently delete <strong>{project.name}</strong>? All associated modules, sprint tasks, and member allocations will be permanently removed from the database.
                </p>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-[var(--color-muted)] text-[11px] text-[var(--color-muted-foreground)] flex items-center justify-between">
              <span>Authority Verification:</span>
              <span className="font-semibold text-amber-500 flex items-center gap-1">
                <Crown className="w-3.5 h-3.5" /> CEO Clearance Required
              </span>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
