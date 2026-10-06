import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, Calendar, Edit3, Trash2, AlertTriangle, UserCheck, Landmark, Copy, Check, Key } from 'lucide-react';
import { Button, Avatar, Badge, Tabs, ProgressBar, EmptyState, LoadingState, Modal, Input, Select } from '@/components/ui';
import { cn, getStatusColor, getPriorityColor, formatDate } from '@/lib/utils';
import { useAuthStore, isCeoOrCto } from '@/stores';
import { getUser, getUserTasks, getProjects, updateMember, deleteMember, sendPasswordResetEmail } from '@/services/api';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import type { User, Task, Project, UserRole } from '@/types';

export function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentRole, effectiveRole, currentUser } = useAuthStore();
  const prefix = effectiveRole === 'member' ? '/member' : effectiveRole === 'manager' ? '/manager' : '/admin';
  const canManageMembers = effectiveRole === 'admin' || effectiveRole === 'manager' || currentRole !== 'member';
  const canEditMembers = isCeoOrCto(currentUser);

  const [activeTab, setActiveTab] = useState('profile');
  const [member, setMember] = useState<User | null>(null);
  const [memberTasks, setMemberTasks] = useState<Task[]>([]);
  const [memberProjects, setMemberProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Edit Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: '',
    role: 'member' as UserRole,
    department: 'Engineering',
    designation: 'Software Engineer',
    employeeId: '',
    phone: '',
    status: 'active' as 'active' | 'inactive',
    bankAccountNumber: '',
    ifsc: '',
  });

  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Delete Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Password Reset State
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  const handleResetPassword = async () => {
    if (!member?.email) return;
    setIsResettingPassword(true);
    try {
      await sendPasswordResetEmail(member.email);
      toast.success(`Password reset email sent to ${member.email}`);
    } catch (err: any) {
      console.error('Failed to send password reset email:', err);
      toast.error(err.message || 'Failed to send password reset email');
    } finally {
      setIsResettingPassword(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function load() {
      if (!id) return;
      try {
        const [u, ts, ps] = await Promise.all([
          getUser(id),
          getUserTasks(id),
          getProjects(),
        ]);
        if (isMounted) {
          if (u) setMember(u);
          setMemberTasks(ts);
          setMemberProjects(ps.filter(p => p.memberIds.includes(id)));
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    load();
    return () => { isMounted = false; };
  }, [id]);

  const handleOpenEditModal = () => {
    if (!canEditMembers) {
      toast.error('Unauthorized: Only CEO and CTO are permitted to edit member details.');
      return;
    }
    if (!member) return;
    setEditFormData({
      name: member.name || '',
      role: member.role || 'member',
      department: member.department || 'Engineering',
      designation: member.designation || 'Software Engineer',
      employeeId: member.employeeId || '',
      phone: member.phone || '',
      status: member.status || 'active',
      bankAccountNumber: member.bankAccountNumber || '',
      ifsc: member.ifsc || '',
    });
    setShowEditModal(true);
  };

  const handleUpdateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditMembers) {
      toast.error('Unauthorized: Only CEO and CTO are permitted to edit member details.');
      return;
    }
    if (!member) return;
    if (!editFormData.name.trim()) {
      toast.error('Please enter the member\'s full name');
      return;
    }

    setIsEditing(true);
    try {
      const updated = await updateMember(member.id, {
        name: editFormData.name.trim(),
        role: editFormData.role,
        department: editFormData.department.trim(),
        designation: editFormData.designation.trim(),
        employeeId: editFormData.employeeId.trim(),
        phone: editFormData.phone.trim(),
        status: editFormData.status,
        bankAccountNumber: editFormData.bankAccountNumber.trim(),
        ifsc: editFormData.ifsc.trim().toUpperCase(),
      });

      setMember(updated);
      toast.success(`Member "${updated.name}" updated successfully!`);
      setShowEditModal(false);
    } catch (err: any) {
      console.error('Failed to update member:', err);
      toast.error(err.message || 'Failed to update member');
    } finally {
      setIsEditing(false);
    }
  };

  const handleDeleteMember = async () => {
    if (!canEditMembers) {
      toast.error('Unauthorized: Only CEO and CTO are permitted to remove members.');
      return;
    }
    if (!member) return;
    setIsDeleting(true);
    try {
      await deleteMember(member.id);
      toast.success(`Member "${member.name}" removed successfully.`);
      setShowDeleteModal(false);
      navigate(`${prefix}/members`);
    } catch (err: any) {
      console.error('Failed to remove member:', err);
      toast.error(err.message || 'Failed to remove member');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) return <LoadingState />;

  if (!member) {
    return (
      <div className="page-container">
        <EmptyState title="Member not found" action={<Button onClick={() => navigate(`${prefix}/members`)}>Go Back</Button>} />
      </div>
    );
  }

  const tabs = [
    { value: 'profile', label: 'Profile' },
    { value: 'tasks', label: 'Tasks', count: memberTasks.length },
    { value: 'projects', label: 'Projects', count: memberProjects.length },
  ];

  return (
    <div className="page-container">
      <button onClick={() => navigate(`${prefix}/members`)} className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Members
      </button>

      <div className="card p-6 mb-6 animate-slide-up">
        <div className="flex flex-col sm:flex-row items-start justify-between gap-5">
          <div className="flex flex-col sm:flex-row items-start gap-5 flex-1">
            <Avatar name={member.name} src={member.avatar} size="xl" />
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-xl font-semibold">{member.name}</h1>
                <div className={cn('w-2.5 h-2.5 rounded-full', member.status === 'active' ? 'bg-emerald-500' : 'bg-zinc-300')} />
                <span className={cn(
                  'text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded-full border',
                  member.role === 'admin' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' :
                  member.role === 'manager' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' :
                  'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20'
                )}>
                  {member.role === 'admin' ? 'Executive Admin' : member.role === 'manager' ? 'Manager' : 'Member'}
                </span>
                {member.employeeId && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[var(--color-muted)] text-[var(--color-muted-foreground)] font-medium">
                    {member.employeeId}
                  </span>
                )}
              </div>
              <p className="text-sm text-[var(--color-muted-foreground)]">{member.designation} • {member.department}</p>
              {member.bio && <p className="text-sm text-[var(--color-muted-foreground)] mt-2">{member.bio}</p>}
              <div className="flex flex-wrap gap-3 mt-3 text-xs text-[var(--color-muted-foreground)]">
                <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{member.email}</span>
                <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{member.phone || 'No phone'}</span>
                <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />Joined {formatDate(member.joinDate)}</span>
                <span className="flex items-center gap-1 font-mono">
                  <Landmark className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                  {member.bankAccountNumber ? `A/C •••• ${member.bankAccountNumber.slice(-4)}` : 'Bank: Not Set'}
                </span>
              </div>
              {member.skills && member.skills.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {member.skills.map(skill => <Badge key={skill} className="bg-[var(--color-muted)] text-[var(--color-foreground)]">{skill}</Badge>)}
                </div>
              )}
            </div>
          </div>

          {canEditMembers && (
            <div className="flex items-center gap-2 self-start shrink-0">
              <Button variant="outline" size="sm" onClick={handleOpenEditModal} className="gap-1.5 text-xs">
                <Edit3 className="w-3.5 h-3.5 text-[var(--color-primary)]" />
                Edit Member & Role
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetPassword}
                isLoading={isResettingPassword}
                className="gap-1.5 text-xs text-amber-500 hover:text-amber-600 hover:bg-amber-500/10 border-amber-500/20"
                title="Send a password recovery email to this user"
              >
                {!isResettingPassword && <Key className="w-3.5 h-3.5" />}
                Reset Password
              </Button>
              {member.id !== currentUser?.id && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteModal(true)}
                  className="gap-1.5 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10 border-red-500/20"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <Tabs tabs={tabs} value={activeTab} onChange={setActiveTab} className="mb-6 w-fit" />

      {activeTab === 'profile' && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="card p-4 text-center"><p className="text-2xl font-semibold">{memberProjects.length}</p><p className="text-xs text-[var(--color-muted-foreground)]">Projects</p></div>
            <div className="card p-4 text-center"><p className="text-2xl font-semibold">{memberTasks.length}</p><p className="text-xs text-[var(--color-muted-foreground)]">Total Tasks</p></div>
            <div className="card p-4 text-center"><p className="text-2xl font-semibold text-emerald-500">{memberTasks.filter(t => t.status === 'completed').length}</p><p className="text-xs text-[var(--color-muted-foreground)]">Completed</p></div>
            <div className="card p-4 text-center"><p className="text-2xl font-semibold text-blue-500">{memberTasks.filter(t => t.status === 'in-progress').length}</p><p className="text-xs text-[var(--color-muted-foreground)]">In Progress</p></div>
          </div>

          {/* Banking & Direct Settlement Card */}
          <div className="card p-6 border border-[var(--color-border)] bg-[var(--color-card)] rounded-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--color-primary)]/10 text-[var(--color-primary)] flex items-center justify-center shrink-0">
                  <Landmark className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--color-foreground)]">
                    Banking & Direct Payout Details
                  </h3>
                  <p className="text-xs text-[var(--color-muted-foreground)]">
                    Official account details registered for salary disbursement and expense reimbursements.
                  </p>
                </div>
              </div>
              {canEditMembers && (
                <Button variant="outline" size="sm" onClick={handleOpenEditModal} className="text-xs gap-1.5 self-start sm:self-auto cursor-pointer">
                  <Edit3 className="w-3.5 h-3.5" /> Edit Bank Details
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/30 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider block mb-1">
                    Bank Account Number
                  </span>
                  <span className="text-base font-mono font-semibold tracking-wide text-[var(--color-foreground)]">
                    {member.bankAccountNumber || 'Not provided yet'}
                  </span>
                </div>
                {member.bankAccountNumber && (
                  <button
                    type="button"
                    onClick={() => handleCopy(member.bankAccountNumber!, 'account')}
                    className="p-2 rounded-lg hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors cursor-pointer"
                    title="Copy Account Number"
                  >
                    {copiedField === 'account' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                )}
              </div>

              <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/30 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wider block mb-1">
                    IFSC Code
                  </span>
                  <span className="text-base font-mono font-semibold tracking-wide uppercase text-[var(--color-foreground)]">
                    {member.ifsc || 'Not provided yet'}
                  </span>
                </div>
                {member.ifsc && (
                  <button
                    type="button"
                    onClick={() => handleCopy(member.ifsc!, 'ifsc')}
                    className="p-2 rounded-lg hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors cursor-pointer"
                    title="Copy IFSC Code"
                  >
                    {copiedField === 'ifsc' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'tasks' && (
        <div className="space-y-2 animate-fade-in">
          {memberTasks.map(task => (
            <div key={task.id} className="card p-4 card-hover flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{task.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className={getStatusColor(task.status)}>{task.status.replace(/-/g, ' ')}</Badge>
                  <Badge className={getPriorityColor(task.priority)}>{task.priority}</Badge>
                </div>
              </div>
              <span className="text-xs text-[var(--color-muted-foreground)] shrink-0">{formatDate(task.deadline)}</span>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'projects' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
          {memberProjects.map((project, idx) => (
            <div key={`${project.id}-${idx}`} className="card p-5 card-hover cursor-pointer" onClick={() => navigate(`${prefix}/projects/${project.id}`)}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: project.color }} />
                <h3 className="text-sm font-semibold">{project.name}</h3>
                <Badge className={getStatusColor(project.status)}>{project.status}</Badge>
              </div>
              <ProgressBar value={project.progress} showLabel className="mt-3" />
            </div>
          ))}
        </div>
      )}

      {/* Edit Member Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => !isEditing && setShowEditModal(false)}
        title="Edit Member & Role"
        size="md"
        footer={
          <>
            <Button
              variant="outline"
              type="button"
              disabled={isEditing}
              onClick={() => setShowEditModal(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              isLoading={isEditing}
              onClick={handleUpdateMember}
            >
              <UserCheck className="w-4 h-4 mr-1.5" />
              Save Changes
            </Button>
          </>
        }
      >
        <form onSubmit={handleUpdateMember} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Full Name *"
              placeholder="e.g. Priya Sharma"
              value={editFormData.name}
              onChange={(e) => setEditFormData(f => ({ ...f, name: e.target.value }))}
              required
            />
            <Input
              label="Employee ID"
              placeholder="e.g. EMP-014"
              value={editFormData.employeeId}
              onChange={(e) => setEditFormData(f => ({ ...f, employeeId: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-sm font-medium block mb-1">Email Address</label>
            <div className="w-full h-9 px-3 rounded-lg border border-[var(--color-input)] bg-[var(--color-muted)] text-[var(--color-muted-foreground)] text-sm flex items-center cursor-not-allowed">
              {member?.email}
            </div>
            <p className="text-[11px] text-[var(--color-muted-foreground)] mt-1">
              Email is managed via authentication credentials.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Role *"
              value={editFormData.role}
              onChange={(val) => setEditFormData(f => ({ ...f, role: val as UserRole }))}
              options={[
                { value: 'member', label: 'Member' },
                { value: 'manager', label: 'Manager' },
                { value: 'admin', label: 'Executive Admin' },
              ]}
            />
            <Select
              label="Department"
              value={editFormData.department}
              onChange={(val) => setEditFormData(f => ({ ...f, department: val }))}
              options={[
                { value: 'Engineering', label: 'Engineering' },
                { value: 'Design', label: 'Design' },
                { value: 'Quality Assurance', label: 'Quality Assurance' },
                { value: 'Product', label: 'Product' },
                { value: 'Operations', label: 'Operations' },
                { value: 'Marketing', label: 'Marketing' },
                { value: 'Executive', label: 'Executive' },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Designation"
              placeholder="e.g. Software Engineer"
              value={editFormData.designation}
              onChange={(e) => setEditFormData(f => ({ ...f, designation: e.target.value }))}
            />
            <Input
              label="Phone Number"
              placeholder="e.g. +91 98765 43210"
              value={editFormData.phone}
              onChange={(e) => setEditFormData(f => ({ ...f, phone: e.target.value }))}
            />
          </div>

          <Select
            label="Account Status"
            value={editFormData.status}
            onChange={(val) => setEditFormData(f => ({ ...f, status: val as 'active' | 'inactive' }))}
            options={[
              { value: 'active', label: 'Active Member' },
              { value: 'inactive', label: 'Inactive / Suspended' },
            ]}
          />

          <div className="pt-2 border-t border-[var(--color-border)]">
            <div className="flex items-center gap-1.5 mb-3">
              <Landmark className="w-4 h-4 text-[var(--color-primary)]" />
              <span className="text-xs font-semibold text-[var(--color-foreground)] uppercase tracking-wider">
                Banking & Payout Details
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Bank Account Number"
                placeholder="e.g. 123456789012"
                value={editFormData.bankAccountNumber}
                onChange={(e) => setEditFormData(f => ({ ...f, bankAccountNumber: e.target.value }))}
              />
              <Input
                label="IFSC Code"
                placeholder="e.g. HDFC0001234"
                value={editFormData.ifsc}
                onChange={(e) => setEditFormData(f => ({ ...f, ifsc: e.target.value.toUpperCase() }))}
                maxLength={11}
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* Delete Member Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => !isDeleting && setShowDeleteModal(false)}
        title="Remove Team Member"
        size="sm"
        footer={
          <>
            <Button
              variant="outline"
              type="button"
              disabled={isDeleting}
              onClick={() => setShowDeleteModal(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              type="button"
              isLoading={isDeleting}
              onClick={handleDeleteMember}
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Remove Member
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-3 py-2">
          <div className="w-10 h-10 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-[var(--color-foreground)]">
              Remove {member?.name}?
            </h4>
            <p className="text-xs text-[var(--color-muted-foreground)] mt-1">
              Are you sure you want to remove <span className="font-semibold text-[var(--color-foreground)]">{member?.name}</span> ({member?.email}) from the team? This will revoke their access to the organization and remove their assignments.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
