import { useState, useEffect } from 'react';
import { Plus, Check, X } from 'lucide-react';
import { Button, Avatar, Badge, Modal, Input, Textarea, Select, EmptyState, LoadingState } from '@/components/ui';
import { cn, getStatusColor, formatDate } from '@/lib/utils';
import { useAuthStore } from '@/stores';
import {
  getLeaveRequests, createLeaveRequest, reviewLeaveRequest,
  getUsers, getUserById,
} from '@/services/api';
import { toast } from 'sonner';
import type { LeaveRequest, LeaveType } from '@/types';

export function LeavePage() {
  const { currentRole, currentUser } = useAuthStore();
  const isAdmin = currentRole !== 'member';
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<string>('all');

  const [newLeave, setNewLeave] = useState({
    type: 'casual' as LeaveType,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    reason: '',
  });

  const loadData = async () => {
    try {
      await getUsers();
      const reqs = await getLeaveRequests();
      setRequests(reqs);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleReview = async (id: string, action: 'approve' | 'reject') => {
    try {
      const updated = await reviewLeaveRequest(id, action, currentUser?.id || 'u1');
      setRequests(prev => prev.map(r => r.id === updated.id ? updated : r));
      toast.success(`Leave request ${action === 'approve' ? 'approved' : 'rejected'}`);
    } catch (err) {
      toast.error('Failed to update leave request');
    }
  };

  const handleCreateLeave = async () => {
    if (!newLeave.reason.trim()) {
      toast.error('Please enter a reason for your leave');
      return;
    }
    try {
      const created = await createLeaveRequest({
        userId: currentUser?.id || 'u2',
        type: newLeave.type,
        startDate: newLeave.startDate,
        endDate: newLeave.endDate,
        reason: newLeave.reason,
      });
      setRequests(prev => [created, ...prev]);
      setShowCreate(false);
      setNewLeave({
        type: 'casual',
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        reason: '',
      });
      toast.success('Leave request submitted!');
    } catch (err) {
      toast.error('Failed to submit leave request');
    }
  };

  const userRequests = isAdmin ? requests : requests.filter(r => r.userId === currentUser?.id);
  const filtered = userRequests.filter(r => filter === 'all' || r.status === filter);

  if (isLoading) return <LoadingState />;

  return (
    <div className="page-container">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="page-title">Leave {isAdmin ? 'Management' : 'Requests'}</h1>
          <p className="page-description">{filtered.length} requests</p>
        </div>
        <div className="flex gap-2">
          {['all', 'pending', 'approved', 'rejected'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors', filter === f ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]')}
            >
              {f}
            </button>
          ))}
          {!isAdmin && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-1" /> Request Leave
            </Button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No leave requests" description={isAdmin ? 'No leave requests to review.' : 'You haven\'t requested any leave.'} />
      ) : (
        <div className="space-y-3">
          {filtered.map((req, idx) => {
            const user = getUserById(req.userId);
            return (
              <div key={req.id} className={cn('card p-5 animate-slide-up', `stagger-${Math.min(idx + 1, 5)}`)}>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Avatar name={user?.name || ''} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{user?.name || 'Team Member'}</p>
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        {formatDate(req.startDate)} - {formatDate(req.endDate)} • <span className="capitalize">{req.type} Leave</span>
                      </p>
                      <p className="text-xs text-[var(--color-muted-foreground)] mt-0.5">{req.reason}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className={getStatusColor(req.status)}>{req.status}</Badge>
                    {isAdmin && req.status === 'pending' && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => handleReview(req.id, 'reject')}><X className="w-3.5 h-3.5" /></Button>
                        <Button size="sm" onClick={() => handleReview(req.id, 'approve')}><Check className="w-3.5 h-3.5" /></Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="Request Leave"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreateLeave}>Submit Request</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Leave Type"
            value={newLeave.type}
            onChange={(val) => setNewLeave(l => ({ ...l, type: val as LeaveType }))}
            options={[
              { value: 'casual', label: 'Casual Leave' },
              { value: 'sick', label: 'Sick Leave' },
              { value: 'earned', label: 'Earned Leave' },
              { value: 'unpaid', label: 'Unpaid Leave' },
            ]}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Start Date"
              type="date"
              value={newLeave.startDate}
              onChange={(e) => setNewLeave(l => ({ ...l, startDate: e.target.value }))}
            />
            <Input
              label="End Date"
              type="date"
              value={newLeave.endDate}
              onChange={(e) => setNewLeave(l => ({ ...l, endDate: e.target.value }))}
            />
          </div>
          <Textarea
            label="Reason"
            placeholder="Reason for leave..."
            rows={3}
            value={newLeave.reason}
            onChange={(e) => setNewLeave(l => ({ ...l, reason: e.target.value }))}
          />
        </div>
      </Modal>
    </div>
  );
}
