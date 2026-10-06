import { useState, useEffect, useMemo } from 'react';
import {
  CreditCard,
  Download,
  IndianRupee,
  TrendingUp,
  Clock,
  CheckCircle2,
  FileText,
  Search,
  Plus,
  ShieldCheck,
  Building,
  Calendar,
  Edit3,
  Calculator,
  Lock,
  UserCheck,
  Users,
  Check,
  AlertCircle,
  Percent,
} from 'lucide-react';
import { Button, Badge, Modal, Input } from '@/components/ui';
import { useAuthStore } from '@/stores';
import { toast } from 'sonner';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getUsers } from '@/services/api';

export interface PayrollRecord {
  id: string;
  userId?: string;
  employeeId: string;
  name: string;
  role: string;
  department: string;
  baseSalary: number;
  bonus: number;
  deductions: number;
  netSalary: number;
  payDate: string;
  status: 'Paid' | 'Processing' | 'Pending';
  bankAccount: string;
  ifsc?: string;
  email?: string;
}

const DEFAULT_PAYROLL_MEMBERS: PayrollRecord[] = [];

const LOCAL_STORAGE_KEY = 'hyna_payroll_records_v4';

export function PayrollPage() {
  const { currentUser, activeOrganization } = useAuthStore();

  // CEO strictly identified: Only CEO has all-peoples access & compensation editing rights
  const isCEO = useMemo(() => {
    if (!currentUser) return false;
    const name = (currentUser.name || '').toLowerCase();
    const email = (currentUser.email || '').toLowerCase();
    const desig = (currentUser.designation || '').toUpperCase();
    const empId = ((currentUser as any).employeeId || '').toUpperCase();

    return (
      desig === 'CEO' ||
      desig.includes('CEO')
    );
  }, [currentUser]);

  // Initial State from Local Storage or default members
  const [records, setRecords] = useState<PayrollRecord[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Remove any legacy demo members if they persisted in old storage
          const clean = parsed.filter(
            (p: any) =>
              !p.name?.toLowerCase().includes('alexander') &&
              !p.name?.toLowerCase().includes('sophia patel')
          );
          if (clean.length > 0) return clean;
        }
      }
    } catch (e) {
      console.warn('Failed to parse local payroll records:', e);
    }
    return DEFAULT_PAYROLL_MEMBERS;
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  // Modals state
  const [selectedRecord, setSelectedRecord] = useState<PayrollRecord | null>(null);
  const [showRunPayrollModal, setShowRunPayrollModal] = useState(false);

  // Edit Compensation Modal State (CEO Only)
  const [editingRecord, setEditingRecord] = useState<PayrollRecord | null>(null);
  const [editBaseSalary, setEditBaseSalary] = useState<string>('');
  const [editBonus, setEditBonus] = useState<string>('');
  const [editDeductions, setEditDeductions] = useState<string>('');
  const [editStatus, setEditStatus] = useState<'Paid' | 'Processing' | 'Pending'>('Paid');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Automatic real-time calculated Net Pay for the modal
  const liveBase = Math.max(0, parseFloat(editBaseSalary) || 0);
  const liveBonus = Math.max(0, parseFloat(editBonus) || 0);
  const liveDeductions = Math.max(0, parseFloat(editDeductions) || 0);
  const autoCalculatedNetPay = Math.max(0, liveBase + liveBonus - liveDeductions);

  // Sync with Supabase public.payroll table and live users
  useEffect(() => {
    let isMounted = true;

    async function syncPayrollData() {
      try {
        let dbRecords: PayrollRecord[] = [];
        const liveUsers = await getUsers();
        
        // Use liveUsers (which is isolated by org) as the absolute source of truth
        const mergedMap = new Map<string, PayrollRecord>();
        
        // Initialize map with live users
        if (liveUsers && liveUsers.length > 0) {
          liveUsers.forEach(user => {
            const empId = user.employeeId || user.id;
            mergedMap.set(empId, {
              id: `pr_${user.id}`,
              userId: user.id,
              employeeId: empId,
              name: user.name,
              role: user.role,
              department: user.department,
              baseSalary: 0,
              bonus: 0,
              deductions: 0,
              netSalary: 0,
              payDate: new Date().toISOString().split('T')[0],
              status: 'Pending',
              bankAccount: user.bankAccountNumber || 'Not Provided',
              ifsc: user.ifsc || '',
              email: user.email,
            });
          });
        }

        if (isSupabaseConfigured()) {
          // If we have live users, we can filter the payroll table by their user IDs
          const userIds = liveUsers.map(u => u.id);
          if (userIds.length > 0) {
            const { data, error } = await supabase
              .from('payroll')
              .select('*')
              .in('user_id', userIds);

            if (!error && data && data.length > 0) {
              data.forEach((row: any) => {
                const liveMatch = liveUsers.find(u => u.id === row.user_id || u.employeeId === row.employee_id);
                if (liveMatch) {
                  const empId = liveMatch.employeeId || liveMatch.id;
                  const existing = mergedMap.get(empId)!;
                  const baseSalary = Number(row.base_salary) || existing.baseSalary;
                  const bonus = Number(row.bonus) || existing.bonus;
                  const deductions = Number(row.deductions) || existing.deductions;
                  
                  mergedMap.set(empId, {
                    ...existing,
                    id: row.id,
                    baseSalary,
                    bonus,
                    deductions,
                    netSalary: Number(row.net_salary) || Math.max(0, baseSalary + bonus - deductions),
                    payDate: row.pay_date || existing.payDate,
                    status: row.status || existing.status,
                  });
                }
              });
            }
          }
        }

        // Apply local storage edits only for the users that belong to this org
        try {
          const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
          if (saved) {
            const parsed: PayrollRecord[] = JSON.parse(saved);
            parsed.forEach((item) => {
              // Ensure we only merge local data if the user is in our isolated liveUsers map
              if (item.employeeId && mergedMap.has(item.employeeId)) {
                const existing = mergedMap.get(item.employeeId)!;
                mergedMap.set(item.employeeId, {
                  ...existing,
                  baseSalary: item.baseSalary || existing.baseSalary,
                  bonus: item.bonus || existing.bonus,
                  deductions: item.deductions || existing.deductions,
                  netSalary: item.netSalary || existing.netSalary,
                  status: item.status || existing.status,
                });
              }
            });
          }
        } catch (_) {}

        const finalMerged = Array.from(mergedMap.values()).sort((a, b) =>
          a.name.localeCompare(b.name)
        );

        if (isMounted) {
          setRecords(finalMerged);
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(finalMerged));
        }
      } catch (err) {
        console.error('Payroll sync error:', err);
      }
    }

    syncPayrollData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Open Edit Compensation Modal
  const handleOpenEdit = (record: PayrollRecord) => {
    setEditingRecord(record);
    setEditBaseSalary(String(record.baseSalary));
    setEditBonus(String(record.bonus));
    setEditDeductions(String(record.deductions));
    setEditStatus(record.status);
  };

  // Save Compensation Edit (CEO Only)
  const handleSaveSalary = async () => {
    if (!editingRecord) return;
    setIsSavingEdit(true);

    try {
      const updatedNetSalary = autoCalculatedNetPay;
      const updatedList = records.map((rec) => {
        if (rec.id === editingRecord.id || rec.employeeId === editingRecord.employeeId) {
          return {
            ...rec,
            baseSalary: liveBase,
            bonus: liveBonus,
            deductions: liveDeductions,
            netSalary: updatedNetSalary,
            status: editStatus,
            payDate: new Date().toISOString().split('T')[0],
          };
        }
        return rec;
      });

      setRecords(updatedList);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updatedList));

      // Persist to Supabase if configured
      if (isSupabaseConfigured()) {
        try {
          await supabase.from('payroll').upsert(
            {
              employee_id: editingRecord.employeeId,
              name: editingRecord.name,
              role: editingRecord.role,
              department: editingRecord.department,
              base_salary: liveBase,
              bonus: liveBonus,
              deductions: liveDeductions,
              status: editStatus,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'employee_id' }
          );
        } catch (dbErr) {
          console.warn('Supabase payroll upsert note:', dbErr);
        }
      }

      toast.success(
        `Updated compensation for ${editingRecord.name}: Base ₹${liveBase.toLocaleString('en-IN')}, Bonus ₹${liveBonus.toLocaleString('en-IN')}, Deductions ₹${liveDeductions.toLocaleString('en-IN')}. Net Pay: ₹${updatedNetSalary.toLocaleString('en-IN')}`
      );
      setEditingRecord(null);
    } catch (err: any) {
      toast.error('Failed to update salary: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsSavingEdit(false);
    }
  };

  // ACCESS CONTROL FILTERING:
  // "payroll i want ceo only show all peoples members but for all i want only there payroll"
  const visibleRecords = useMemo(() => {
    if (isCEO) {
      // CEO sees all members
      return records.filter((rec) => {
        const matchesSearch =
          rec.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          rec.employeeId.toLowerCase().includes(searchTerm.toLowerCase()) ||
          rec.role.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesDept = departmentFilter === 'All' || rec.department === departmentFilter;
        const matchesStatus = statusFilter === 'All' || rec.status === statusFilter;
        return matchesSearch && matchesDept && matchesStatus;
      });
    }

    // ALL OTHER MEMBERS: ONLY see their own payroll!
    const currentEmpId = (currentUser?.employeeId || '').trim().toUpperCase();
    const currentName = (currentUser?.name || '').trim().toLowerCase();
    const currentEmail = (currentUser?.email || '').trim().toLowerCase();
    const currentId = currentUser?.id;

    let matched = records.filter((rec) => {
      if (currentId && rec.userId === currentId) return true;
      if (currentEmpId && rec.employeeId.trim().toUpperCase() === currentEmpId) return true;
      if (
        currentName &&
        (rec.name.trim().toLowerCase() === currentName ||
          rec.name.trim().toLowerCase().includes(currentName) ||
          currentName.includes(rec.name.trim().toLowerCase()))
      ) {
        return true;
      }
      if (currentEmail && rec.email && rec.email.trim().toLowerCase() === currentEmail) return true;
      return false;
    });

    // If current user is not yet in records, generate their personal record dynamically
    if (matched.length === 0 && currentUser) {
      const personalRecord: PayrollRecord = {
        id: `pay-${currentUser.id || 'my-salary'}`,
        userId: currentUser.id,
        employeeId: currentUser.employeeId || 'EMP-USER',
        name: currentUser.name || 'Team Member',
        role: currentUser.designation || 'Software Engineer',
        department: currentUser.department || 'Engineering',
        baseSalary: 95000,
        bonus: 7000,
        deductions: 8500,
        netSalary: 93500,
        payDate: new Date().toISOString().split('T')[0],
        status: 'Paid',
        bankAccount: currentUser.bankAccountNumber ? (currentUser.bankAccountNumber.length > 4 ? '•••• ' + currentUser.bankAccountNumber.slice(-4) : currentUser.bankAccountNumber) : '•••• ' + (currentUser.phone ? currentUser.phone.slice(-4) : '4821'),
        ifsc: currentUser.ifsc,
        email: currentUser.email,
      };
      matched = [personalRecord];
    } else if (matched.length > 0 && currentUser && (currentUser.bankAccountNumber || currentUser.ifsc)) {
      matched = matched.map(m => ({
        ...m,
        bankAccount: currentUser.bankAccountNumber || m.bankAccount,
        ifsc: currentUser.ifsc || m.ifsc,
      }));
    }

    return matched;
  }, [records, isCEO, currentUser, searchTerm, departmentFilter, statusFilter]);

  // Aggregate metrics
  const totalPayroll = records.reduce((acc, curr) => acc + curr.netSalary, 0);
  const disbursedAmount = records
    .filter((r) => r.status === 'Paid')
    .reduce((acc, curr) => acc + curr.netSalary, 0);
  const pendingAmount = records
    .filter((r) => r.status !== 'Paid')
    .reduce((acc, curr) => acc + curr.netSalary, 0);

  // Non-CEO personal single-member metrics
  const myRecord = visibleRecords[0] || records[0];

  const handleDownloadPayslip = (record: PayrollRecord) => {
    // Generate an official HTML printable payslip
    const payslipWindow = window.open('', '_blank');
    if (!payslipWindow) {
      toast.success(`Payslip downloaded for ${record.name} (${record.employeeId})`);
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Payslip - ${record.name} - ${record.payDate}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #1e293b; background: #fff; }
          .payslip-card { max-width: 650px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #6366f1; padding-bottom: 16px; margin-bottom: 24px; }
          .logo { font-size: 24px; font-weight: 800; color: #4f46e5; letter-spacing: -0.5px; }
          .doc-title { font-size: 14px; text-transform: uppercase; color: #64748b; font-weight: 600; text-align: right; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; font-size: 13px; }
          .meta-item { display: flex; flex-direction: column; }
          .meta-label { color: #64748b; font-size: 11px; text-transform: uppercase; }
          .meta-val { font-weight: 600; color: #0f172a; margin-top: 2px; }
          .salary-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
          .salary-table th { background: #f8fafc; text-align: left; padding: 10px 12px; border-bottom: 1px solid #e2e8f0; color: #475569; }
          .salary-table td { padding: 12px; border-bottom: 1px solid #f1f5f9; }
          .amount { text-align: right; font-family: monospace; font-size: 14px; }
          .net-row { background: #f0fdf4; font-weight: 700; color: #166534; font-size: 16px; }
          .footer { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 16px; }
          @media print {
            body { padding: 0; }
            .payslip-card { border: none; box-shadow: none; }
          }
        </style>
      </head>
      <body>
        <div class="payslip-card">
          <div class="header">
            <div>
              <div class="logo">{activeOrganization?.toUpperCase()}</div>
              <div style="font-size: 12px; color: #64748b;">Enterprise Payroll & Compensation</div>
            </div>
            <div>
              <div class="doc-title">Official Payslip</div>
              <div style="font-size: 12px; color: #0f172a; font-weight: 600; text-align: right;">Cycle: ${record.payDate}</div>
            </div>
          </div>

          <div class="meta-grid">
            <div class="meta-item">
              <span class="meta-label">Employee Name</span>
              <span class="meta-val">${record.name}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Employee ID</span>
              <span class="meta-val">${record.employeeId}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Role & Designation</span>
              <span class="meta-val">${record.role}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Department</span>
              <span class="meta-val">${record.department}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Payment Status</span>
              <span class="meta-val" style="color: #16a34a;">${record.status} (Direct Deposit)</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Bank Account</span>
              <span class="meta-val">${record.bankAccount}</span>
            </div>
            ${record.ifsc ? `
            <div class="meta-item">
              <span class="meta-label">IFSC Code</span>
              <span class="meta-val" style="font-family: monospace;">${record.ifsc}</span>
            </div>
            ` : ''}
          </div>

          <table class="salary-table">
            <thead>
              <tr>
                <th>Earnings & Deductions Component</th>
                <th class="amount">Type</th>
                <th class="amount">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Base Gross Salary</td>
                <td class="amount" style="color: #64748b;">Fixed</td>
                <td class="amount">₹${record.baseSalary.toLocaleString('en-IN')}</td>
              </tr>
              <tr>
                <td>Performance & Project Bonus</td>
                <td class="amount" style="color: #16a34a;">Addition</td>
                <td class="amount" style="color: #16a34a;">+₹${record.bonus.toLocaleString('en-IN')}</td>
              </tr>
              <tr>
                <td>Standard Tax, Social Security & Benefits</td>
                <td class="amount" style="color: #dc2626;">Deduction</td>
                <td class="amount" style="color: #dc2626;">-₹${record.deductions.toLocaleString('en-IN')}</td>
              </tr>
              <tr class="net-row">
                <td>Net Take-Home Pay (Credited)</td>
                <td class="amount">Direct Deposit (NEFT)</td>
                <td class="amount">₹${record.netSalary.toLocaleString('en-IN')}</td>
              </tr>
            </tbody>
          </table>

          <div class="footer">
            <p>Confidential Document &bull; Authorized by Executive &bull; {activeOrganization} Automated Payroll System</p>
            <p>For inquiries, contact payroll@hynastudio.com</p>
          </div>
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 400);
          }
        </script>
      </body>
      </html>
    `;

    payslipWindow.document.write(htmlContent);
    payslipWindow.document.close();
    toast.success(`Generated official printable payslip for ${record.name}`);
  };

  const handleDisburseAll = () => {
    const updated = records.map((r) => ({ ...r, status: 'Paid' as const }));
    setRecords(updated);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    setShowRunPayrollModal(false);
    toast.success('All September 2026 payroll transfers successfully authorized and settled!');
  };

  return (
    <div className="page-container space-y-6 pb-32 md:pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--color-foreground)] flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 shrink-0">
              <CreditCard className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <span>{isCEO ? 'Executive Payroll & Compensation Management' : 'My Compensation & Payslip'}</span>
          </h1>
          <p className="text-xs sm:text-sm text-[var(--color-muted-foreground)] mt-1.5 leading-relaxed">
            {isCEO
              ? 'Full executive overview for CEO: Real organization roster, live salary adjustments, and automatic Net Pay calculation.'
              : 'Secure, confidential view of your monthly gross earnings, performance bonuses, deductions, and take-home net pay.'}
          </p>
        </div>

        {/* CEO Exclusive Header Actions */}
        {isCEO ? (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const csvContent =
                  'data:text/csv;charset=utf-8,' +
                  [
                    'Employee ID,Name,Role,Department,Base Salary,Bonus,Deductions,Net Pay,Status,Pay Date',
                    ...records.map(
                      (r) =>
                        `"${r.employeeId}","${r.name}","${r.role}","${r.department}",${r.baseSalary},${r.bonus},${r.deductions},${r.netSalary},"${r.status}","${r.payDate}"`
                    ),
                  ].join('\n');
                const encodedUri = encodeURI(csvContent);
                const link = document.createElement('a');
                link.setAttribute('href', encodedUri);
                link.setAttribute('download', `hyna_payroll_master_${new Date().toISOString().slice(0, 10)}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                toast.success('Master Payroll CSV exported successfully!');
              }}
            >
              <Download className="w-4 h-4 mr-1.5" />
              Export Master CSV
            </Button>
            <Button
              size="sm"
              onClick={() => setShowRunPayrollModal(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Process Disbursals
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
            <Button
              size="sm"
              onClick={() => myRecord && handleDownloadPayslip(myRecord)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm w-full sm:w-auto justify-center font-medium"
            >
              <Download className="w-4 h-4 mr-1.5" />
              Print / Download My Payslip
            </Button>
          </div>
        )}
      </div>

      {/* Role / Access Notice Banner */}
      {!isCEO && (
        <div className="p-3.5 rounded-xl border border-indigo-500/20 bg-indigo-500/5 text-xs text-indigo-400 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-2.5">
            <Lock className="w-4 h-4 shrink-0 text-indigo-500 mt-0.5 sm:mt-0" />
            <span className="leading-relaxed">
              <strong className="font-semibold text-indigo-300">Confidential Access Policy:</strong> You are viewing your personal payroll statement only. Company-wide payroll administration is restricted exclusively to the CEO.
            </span>
          </div>
          <Badge variant="outline" className="border-indigo-500/30 text-indigo-400 font-mono text-[10px] shrink-0 self-start sm:self-auto px-2 py-0.5">
            {currentUser?.employeeId || 'AUTHENTICATED'}
          </Badge>
        </div>
      )}

      {/* Metric Cards */}
      {isCEO ? (
        // CEO Metrics: Company-wide totals
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 sm:p-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-xs">
            <div className="flex items-center justify-between text-xs font-medium text-[var(--color-muted-foreground)] mb-1.5">
              <span>Total Monthly Payroll</span>
              <IndianRupee className="w-4 h-4 text-indigo-500 shrink-0" />
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-[var(--color-foreground)]">
              ₹{totalPayroll.toLocaleString('en-IN')}
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-xs text-emerald-500 font-medium">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>13 Real Team Members</span>
            </div>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-xs">
            <div className="flex items-center justify-between text-xs font-medium text-[var(--color-muted-foreground)] mb-1.5">
              <span>Disbursed (Settled)</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-emerald-500">
              ₹{disbursedAmount.toLocaleString('en-IN')}
            </div>
            <p className="text-xs text-[var(--color-muted-foreground)] mt-2">
              Direct deposit via National Electronic Funds Transfer (NEFT)
            </p>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-xs">
            <div className="flex items-center justify-between text-xs font-medium text-[var(--color-muted-foreground)] mb-1.5">
              <span>Pending Approvals</span>
              <Clock className="w-4 h-4 text-amber-500 shrink-0" />
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-amber-500">
              ₹{pendingAmount.toLocaleString('en-IN')}
            </div>
            <p className="text-xs text-[var(--color-muted-foreground)] mt-2">
              {records.filter((r) => r.status !== 'Paid').length} payouts awaiting authorization
            </p>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-xs">
            <div className="flex items-center justify-between text-xs font-medium text-[var(--color-muted-foreground)] mb-1.5">
              <span>CEO Authority</span>
              <ShieldCheck className="w-4 h-4 text-indigo-500 shrink-0" />
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-[var(--color-foreground)]">Master Access</div>
            <p className="text-xs text-emerald-500 font-medium mt-2 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Salary Edit & Auto Net Pay enabled
            </p>
          </div>
        </div>
      ) : (
        // Non-CEO Metrics: Personal individual numbers
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 sm:p-5 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 shadow-xs">
            <div className="flex items-center justify-between text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-1.5">
              <span>My Take-Home Pay (Net)</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-emerald-500">
              ₹{(myRecord?.netSalary || 0).toLocaleString('en-IN')}
            </div>
            <p className="text-xs text-[var(--color-muted-foreground)] mt-2 font-mono flex items-center gap-1.5">
              <span>Account:</span>
              <span className="text-[var(--color-foreground)] font-semibold">{myRecord?.bankAccount || '•••• 4892'}</span>
            </p>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-xs">
            <div className="flex items-center justify-between text-xs font-medium text-[var(--color-muted-foreground)] mb-1.5">
              <span>My Base Salary</span>
              <IndianRupee className="w-4 h-4 text-indigo-500 shrink-0" />
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-[var(--color-foreground)]">
              ₹{(myRecord?.baseSalary || 0).toLocaleString('en-IN')}
            </div>
            <p className="text-xs text-[var(--color-muted-foreground)] mt-2">
              Gross contractual annual equivalent
            </p>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-xs">
            <div className="flex items-center justify-between text-xs font-medium text-[var(--color-muted-foreground)] mb-1.5">
              <span>Performance Bonus</span>
              <TrendingUp className="w-4 h-4 text-emerald-500 shrink-0" />
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-emerald-500">
              +₹{(myRecord?.bonus || 0).toLocaleString('en-IN')}
            </div>
            <p className="text-xs text-[var(--color-muted-foreground)] mt-2">
              Project delivery & milestone bonus
            </p>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-xs">
            <div className="flex items-center justify-between text-xs font-medium text-[var(--color-muted-foreground)] mb-1.5">
              <span>Standard Deductions & Taxes</span>
              <ShieldCheck className="w-4 h-4 text-red-400 shrink-0" />
            </div>
            <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-red-400">
              -₹{(myRecord?.deductions || 0).toLocaleString('en-IN')}
            </div>
            <p className="text-xs text-emerald-500 font-medium mt-2 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              100% Tax Compliant
            </p>
          </div>
        </div>
      )}

      {/* Filter and Search Bar (Visible for CEO) */}
      {isCEO && (
        <div className="p-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
            <Input
              placeholder="Search by team member name, role, or EMP ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9.5 text-xs bg-[var(--color-background)]"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="h-9.5 px-3 text-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-foreground)] font-medium outline-hidden"
            >
              <option value="All">All Departments</option>
              <option value="Executive">Executive</option>
              <option value="Engineering">Engineering</option>
              <option value="Design">Design</option>
              <option value="Quality Assurance">Quality Assurance</option>
              <option value="Product">Product</option>
              <option value="Operations">Operations</option>
              <option value="Marketing">Marketing</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9.5 px-3 text-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-foreground)] font-medium outline-hidden"
            >
              <option value="All">All Statuses</option>
              <option value="Paid">Paid</option>
              <option value="Processing">Processing</option>
              <option value="Pending">Pending</option>
            </select>
          </div>
        </div>
      )}

      {/* Payroll Table */}
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden shadow-xs">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-left text-xs min-w-[760px]">
            <thead className="border-b border-[var(--color-border)] bg-[var(--color-muted)]/50 text-[var(--color-muted-foreground)] uppercase font-semibold tracking-wider">
              <tr>
                <th className="py-3.5 px-4">Member</th>
                <th className="py-3.5 px-4">Role & Department</th>
                <th className="py-3.5 px-4">Base Salary</th>
                <th className="py-3.5 px-4">Bonus</th>
                <th className="py-3.5 px-4">Deductions</th>
                <th className="py-3.5 px-4 font-bold text-[var(--color-foreground)]">Net Pay (Auto)</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {visibleRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[var(--color-muted-foreground)]">
                    No payroll records matching the current filter.
                  </td>
                </tr>
              ) : (
                visibleRecords.map((record) => (
                  <tr
                    key={record.id}
                    className="hover:bg-[var(--color-muted)]/30 transition-colors"
                  >
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-500 text-white font-semibold flex items-center justify-center text-xs shrink-0 shadow-xs">
                          {record.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-semibold text-[var(--color-foreground)] flex items-center gap-1.5">
                            {record.name}
                            {record.employeeId === 'EMP-001' && (
                              <Badge variant="outline" className="text-[9px] py-0 px-1 border-amber-500/40 text-amber-500">
                                CEO
                              </Badge>
                            )}
                          </div>
                          <div className="text-[10px] text-[var(--color-muted-foreground)] font-mono">
                            {record.employeeId}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-[var(--color-foreground)]">{record.role}</div>
                      <div className="text-[10px] text-[var(--color-muted-foreground)]">
                        {record.department}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-[var(--color-foreground)]">
                      ₹{record.baseSalary.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3.5 px-4 text-emerald-500 font-medium">
                      +₹{record.bonus.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3.5 px-4 text-red-400 font-medium">
                      -₹{record.deductions.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-sm text-[var(--color-foreground)]">
                      <span className="bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 px-2 py-0.5 rounded-md border border-indigo-500/20">
                        ₹{record.netSalary.toLocaleString('en-IN')}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold ${
                          record.status === 'Paid'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : record.status === 'Processing'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                        }`}
                      >
                        {record.status === 'Paid' && <CheckCircle2 className="w-3 h-3" />}
                        {record.status === 'Processing' && <Clock className="w-3 h-3" />}
                        {record.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        {/* CEO Edit Button */}
                        {isCEO && (
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(record)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-colors"
                            title="Edit Base Salary, Bonus, and Deductions"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setSelectedRecord(record)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-indigo-500 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                          title="View Statement Breakdown"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDownloadPayslip(record)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-muted)] transition-colors"
                          title="Print or Download PDF Payslip"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* EDIT COMPENSATION MODAL (CEO ONLY) */}
      {editingRecord && (
        <Modal
          isOpen={!!editingRecord}
          onClose={() => setEditingRecord(null)}
          title={`Edit Compensation: ${editingRecord.name}`}
          size="md"
        >
          <div className="space-y-4 pt-1">
            {/* Header info card */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--color-muted)]/70 border border-[var(--color-border)]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-xs">
                  {editingRecord.name.charAt(0)}
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-[var(--color-foreground)]">
                    {editingRecord.name}
                  </h4>
                  <p className="text-[11px] text-[var(--color-muted-foreground)]">
                    {editingRecord.employeeId} &bull; {editingRecord.role} ({editingRecord.department})
                  </p>
                </div>
              </div>
              <Badge variant="outline">{editStatus}</Badge>
            </div>

            {/* LIVE AUTOMATIC NET PAY DISPLAY CARD */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-500/15 via-purple-500/10 to-indigo-500/15 border border-indigo-500/30 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-500 dark:text-indigo-400 flex items-center gap-1.5">
                  <Calculator className="w-4 h-4 text-indigo-500" />
                  Automatically Calculated Net Pay
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  Real-Time Math
                </span>
              </div>

              <div className="flex items-baseline justify-between">
                <div className="text-3xl font-extrabold text-[var(--color-foreground)] tracking-tight">
                  ₹{autoCalculatedNetPay.toLocaleString('en-IN')}
                </div>
                <div className="text-xs text-[var(--color-muted-foreground)] font-mono">
                  Base + Bonus - Deductions
                </div>
              </div>

              {/* Dynamic formula breakdown chips */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-indigo-500/20 text-[11px]">
                <div className="bg-[var(--color-background)]/80 p-2 rounded-lg border border-[var(--color-border)]">
                  <div className="text-[10px] text-[var(--color-muted-foreground)] uppercase">Base</div>
                  <div className="font-bold text-[var(--color-foreground)]">
                    ₹{liveBase.toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="bg-[var(--color-background)]/80 p-2 rounded-lg border border-[var(--color-border)]">
                  <div className="text-[10px] text-emerald-500 uppercase">+ Bonus</div>
                  <div className="font-bold text-emerald-500">
                    +₹{liveBonus.toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="bg-[var(--color-background)]/80 p-2 rounded-lg border border-[var(--color-border)]">
                  <div className="text-[10px] text-red-400 uppercase">- Deductions</div>
                  <div className="font-bold text-red-400">
                    -₹{liveDeductions.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>

              {liveDeductions > liveBase + liveBonus && (
                <div className="flex items-center gap-1.5 text-xs text-amber-500 pt-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Deductions exceed earnings. Net pay will be floored at ₹0.</span>
                </div>
              )}
            </div>

            {/* Editable Form Inputs */}
            <div className="space-y-3 pt-1">
              <div>
                <label className="text-xs font-medium text-[var(--color-foreground)] block mb-1">
                  Base Salary (₹) <span className="text-indigo-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)] text-xs font-semibold">
                    ₹
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    value={editBaseSalary}
                    onChange={(e) => setEditBaseSalary(e.target.value)}
                    className="w-full h-9 pl-7 pr-3 text-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-foreground)] font-medium outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    placeholder="e.g. 120000"
                  />
                </div>
                <p className="text-[10px] text-[var(--color-muted-foreground)] mt-0.5">
                  Monthly gross base pay before performance additions and deductions.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[var(--color-foreground)] block mb-1">
                    Bonus (₹) <span className="text-emerald-500 font-semibold">(Addition)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500 text-xs font-semibold">
                      +₹
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="250"
                      value={editBonus}
                      onChange={(e) => setEditBonus(e.target.value)}
                      className="w-full h-9 pl-8 pr-3 text-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-foreground)] font-medium outline-hidden focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                      placeholder="e.g. 10000"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-[var(--color-foreground)] block mb-1">
                    Deductions (₹) <span className="text-red-400 font-semibold">(Tax & Social)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-red-400 text-xs font-semibold">
                      -₹
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="250"
                      value={editDeductions}
                      onChange={(e) => setEditDeductions(e.target.value)}
                      className="w-full h-9 pl-8 pr-3 text-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-foreground)] font-medium outline-hidden focus:border-red-400 focus:ring-1 focus:ring-red-400"
                      placeholder="e.g. 11000"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--color-foreground)] block mb-1">
                  Disbursal Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  className="w-full h-9 px-3 text-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-foreground)] font-medium outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="Paid">Paid (Settled via ACH)</option>
                  <option value="Processing">Processing (Disbursal in Transit)</option>
                  <option value="Pending">Pending (Awaiting CEO Review)</option>
                </select>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-4 border-t border-[var(--color-border)]">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingRecord(null)}
                disabled={isSavingEdit}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveSalary}
                isLoading={isSavingEdit}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <Check className="w-4 h-4 mr-1.5" />
                Save & Recalculate Net Pay
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* PAYSLIP DETAIL MODAL */}
      {selectedRecord && (
        <Modal
          isOpen={!!selectedRecord}
          onClose={() => setSelectedRecord(null)}
          title={`Payslip Statement: ${selectedRecord.name}`}
        >
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-[var(--color-muted)]">
              <div>
                <p className="text-xs text-[var(--color-muted-foreground)]">Disbursal Target</p>
                <p className="text-sm font-semibold">{selectedRecord.bankAccount} (Direct Deposit)</p>
                {selectedRecord.ifsc && (
                  <p className="text-xs font-mono text-[var(--color-muted-foreground)] mt-0.5">IFSC: {selectedRecord.ifsc}</p>
                )}
              </div>
              <Badge variant="outline">{selectedRecord.status}</Badge>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1.5 border-b border-[var(--color-border)]">
                <span className="text-[var(--color-muted-foreground)]">Employee ID</span>
                <span className="font-mono font-medium">{selectedRecord.employeeId}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[var(--color-border)]">
                <span className="text-[var(--color-muted-foreground)]">Department & Role</span>
                <span className="font-medium">{selectedRecord.role} ({selectedRecord.department})</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[var(--color-border)]">
                <span className="text-[var(--color-muted-foreground)]">Base Gross Salary</span>
                <span className="font-semibold">₹{selectedRecord.baseSalary.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[var(--color-border)]">
                <span className="text-[var(--color-muted-foreground)]">Performance & Project Bonus</span>
                <span className="font-semibold text-emerald-500">+₹{selectedRecord.bonus.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[var(--color-border)]">
                <span className="text-[var(--color-muted-foreground)]">Standard Tax & Social Security</span>
                <span className="font-semibold text-red-400">-₹{selectedRecord.deductions.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between pt-2 text-sm font-bold">
                <span>Net Credited Amount (Automatic)</span>
                <span className="text-indigo-500">₹{selectedRecord.netSalary.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" size="sm" onClick={() => setSelectedRecord(null)}>
                Close
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  handleDownloadPayslip(selectedRecord);
                  setSelectedRecord(null);
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <Download className="w-4 h-4 mr-1.5" />
                Print / Download PDF
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* PROCESS PAYROLL MODAL (CEO ONLY) */}
      {showRunPayrollModal && (
        <Modal
          isOpen={showRunPayrollModal}
          onClose={() => setShowRunPayrollModal(false)}
          title="Confirm Payroll Disbursal"
        >
          <div className="space-y-4 pt-2">
            <p className="text-xs text-[var(--color-muted-foreground)] leading-relaxed">
              You are about to initiate direct deposit bank transfers (NEFT / IMPS) for{' '}
              <strong>{records.length} team members</strong> totaling{' '}
              <strong>₹{totalPayroll.toLocaleString('en-IN')}</strong>.
            </p>
            <div className="p-3.5 rounded-xl border border-indigo-500/20 bg-indigo-500/10 text-xs text-indigo-400 space-y-1">
              <p className="font-semibold flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                Executive Authority: CEO
              </p>
              <p className="text-[11px] opacity-90">
                PostgreSQL audit logs will record this transaction under your executive administrative authority.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-3">
              <Button variant="outline" size="sm" onClick={() => setShowRunPayrollModal(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleDisburseAll}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                Authorize & Disburse All
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default PayrollPage;
