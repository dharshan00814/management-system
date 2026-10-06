import { useState, useEffect } from 'react';
import { Avatar, Badge, Button, Textarea, Input, EmptyState, LoadingState } from '@/components/ui';
import { cn, formatDate } from '@/lib/utils';
import { useAuthStore } from '@/stores';
import { getDailyReports, submitDailyReport, getUsers, getUserById } from '@/services/api';
import { toast } from 'sonner';
import type { DailyReport } from '@/types';

export function ReportsPage() {
  const { currentRole, currentUser } = useAuthStore();
  const isAdmin = currentRole !== 'member';
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [content, setContent] = useState('');
  const [achievements, setAchievements] = useState('');
  const [challenges, setChallenges] = useState('');
  const [tomorrowPlan, setTomorrowPlan] = useState('');
  const [hours, setHours] = useState('');

  const loadData = async () => {
    try {
      await getUsers();
      const reps = await getDailyReports();
      setReports(reps);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmit = async () => {
    if (!content.trim()) {
      toast.error('Please describe your work.');
      return;
    }
    try {
      const created = await submitDailyReport({
        userId: currentUser?.id || 'u2',
        content,
        achievements,
        challenges,
        tomorrowPlan,
        hoursWorked: Number(hours) || 8,
      });
      setReports(prev => [created, ...prev]);
      toast.success('Report submitted successfully!');
      setShowForm(false);
      setContent('');
      setAchievements('');
      setChallenges('');
      setTomorrowPlan('');
      setHours('');
    } catch (err) {
      toast.error('Failed to submit report');
    }
  };

  const userReports = isAdmin ? reports : reports.filter(r => r.userId === currentUser?.id);

  if (isLoading) return <LoadingState />;

  return (
    <div className="page-container">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="page-title">{isAdmin ? 'Daily Reports' : 'My Reports'}</h1>
          <p className="page-description">{userReports.length} reports</p>
        </div>
        {!isAdmin && <Button onClick={() => setShowForm(!showForm)}>Write Report</Button>}
      </div>

      {showForm && (
        <div className="card p-6 mb-6 animate-slide-up">
          <h2 className="text-base font-semibold mb-4">Daily Work Report</h2>
          <div className="space-y-4">
            <Textarea label="What did you work on today?" value={content} onChange={(e) => setContent(e.target.value)} placeholder="Describe your work..." rows={3} />
            <Textarea label="Achievements" value={achievements} onChange={(e) => setAchievements(e.target.value)} placeholder="Key accomplishments..." rows={2} />
            <Textarea label="Challenges" value={challenges} onChange={(e) => setChallenges(e.target.value)} placeholder="Any blockers or challenges..." rows={2} />
            <Textarea label="Tomorrow's Plan" value={tomorrowPlan} onChange={(e) => setTomorrowPlan(e.target.value)} placeholder="What you plan to do tomorrow..." rows={2} />
            <Input label="Hours Worked" type="number" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="e.g., 7.5" />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={handleSubmit}>Submit Report</Button>
            </div>
          </div>
        </div>
      )}

      {userReports.length === 0 ? (
        <EmptyState title="No reports yet" description={isAdmin ? 'Team reports will appear here.' : 'Submit your first daily report.'} />
      ) : (
        <div className="space-y-4">
          {userReports.map((report, idx) => {
            const user = getUserById(report.userId);
            return (
              <div key={report.id} className={cn('card p-5 animate-slide-up', `stagger-${Math.min(idx + 1, 5)}`)}>
                <div className="flex items-start gap-4">
                  <Avatar name={user?.name || ''} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{user?.name || 'Member'}</p>
                        <span className="text-xs text-[var(--color-muted-foreground)]">{formatDate(report.date)}</span>
                      </div>
                      <Badge className="bg-[var(--color-muted)] text-[var(--color-foreground)]">{report.hoursWorked}h</Badge>
                    </div>
                    <p className="text-sm text-[var(--color-muted-foreground)] mb-2">{report.content}</p>
                    {report.achievements && (
                      <div className="text-xs mb-1"><span className="font-medium text-emerald-600 dark:text-emerald-400">Achievements: </span><span className="text-[var(--color-muted-foreground)]">{report.achievements}</span></div>
                    )}
                    {report.challenges && (
                      <div className="text-xs"><span className="font-medium text-amber-600 dark:text-amber-400">Challenges: </span><span className="text-[var(--color-muted-foreground)]">{report.challenges}</span></div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
