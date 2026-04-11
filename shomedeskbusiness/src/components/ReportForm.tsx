import React, { useState, useEffect } from 'react';
import { db, auth } from '@/src/lib/firebase';
import { collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp, where, onSnapshot, doc, updateDoc, increment } from 'firebase/firestore';
import { DailyReport, Transaction } from '@/src/types';
import { useBusiness } from '@/src/contexts/BusinessContext';
import { handleFirestoreError, OperationType } from '@/src/lib/firestore-utils';
import { toast } from 'sonner';
import { Save, Calculator, FileText, Wallet, Landmark, ArrowRightLeft, History, Calendar, Banknote } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

export default function ReportForm() {
  const { selectedBusiness, selectedBranch, selectedService, branches, services, bankAccounts } = useBusiness();
  const [formData, setFormData] = useState({
    openingCash: 0,
    openingBank: 0,
    cashSale: 0,
    bankSale: 0,
    cashExpense: 0,
    bankExpense: 0,
    bankToCash: 0,
    cashToBank: 0,
    note: '',
  });
  const [selectedBankId, setSelectedBankId] = useState('');
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [loading, setLoading] = useState(false);

  const branchBankAccounts = bankAccounts.filter(ba => 
    ba.businessId === selectedBusiness?.id && 
    (selectedBranch ? ba.branchId === selectedBranch.id : (selectedService ? ba.serviceId === selectedService.id : true))
  );

  useEffect(() => {
    if (branchBankAccounts.length > 0 && !selectedBankId) {
      setSelectedBankId(branchBankAccounts[0].id);
    }
  }, [branchBankAccounts]);

  useEffect(() => {
    if (!selectedBusiness) return;

    const q = query(
      collection(db, 'dailyReports'), 
      where('businessId', '==', selectedBusiness.id),
      ...(selectedBranch ? [where('branchId', '==', selectedBranch.id)] : []),
      ...(selectedService ? [where('serviceId', '==', selectedService.id)] : []),
      orderBy('date', 'desc'), 
      limit(10)
    );
    
    const unsub = onSnapshot(q, async (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as DailyReport));
      setReports(list);
      
      if (selectedBranch && list.length > 0) {
        const lastReport = list[0];
        setFormData(prev => ({
          ...prev,
          openingCash: lastReport.closingCash,
          openingBank: lastReport.closingBank,
        }));
      } else if (selectedService && list.length > 0) {
        const lastReport = list[0];
        setFormData(prev => ({
          ...prev,
          openingCash: lastReport.closingCash,
          openingBank: lastReport.closingBank,
        }));
      } else if (selectedBranch || selectedService) {
        // No previous reports, fetch current balances from Finance
        try {
          // Get current bank balance for this branch
          const currentBankBalance = branchBankAccounts.reduce((acc, ba) => acc + ba.balance, 0);
          
          // Get current cash balance for this branch/service
          const cashQuery = query(
            collection(db, 'transactions'),
            where('businessId', '==', selectedBusiness.id),
            ...(selectedBranch ? [where('branchId', '==', selectedBranch.id)] : []),
            ...(selectedService ? [where('serviceId', '==', selectedService.id)] : []),
            where('ownerId', '==', auth.currentUser?.uid)
          );
          const cashSnap = await getDocs(cashQuery);
          const currentCashBalance = cashSnap.docs.reduce((acc, d) => {
            const t = d.data() as Transaction;
            if (t.toAccount === 'cash') return acc + t.amount;
            if (t.fromAccount === 'cash') return acc - t.amount;
            return acc;
          }, 0);

          setFormData(prev => ({
            ...prev,
            openingCash: currentCashBalance,
            openingBank: currentBankBalance,
          }));
        } catch (err) {
          console.error('Failed to fetch initial balances:', err);
        }
      } else {
        setFormData(prev => ({
          ...prev,
          openingCash: 0,
          openingBank: 0,
        }));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'dailyReports');
    });

    return () => unsub();
  }, [selectedBusiness, selectedBranch]);

  const closingCash = formData.openingCash + formData.cashSale + formData.bankToCash - formData.cashExpense - formData.cashToBank;
  const closingBank = formData.openingBank + formData.bankSale + formData.cashToBank - formData.bankExpense - formData.bankToCash;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !selectedBusiness || (!selectedBranch && !selectedService)) return;

    setLoading(true);
    try {
      const report: DailyReport = {
        businessId: selectedBusiness.id,
        ownerId: selectedBusiness.ownerId,
        branchId: selectedBranch?.id || 'global',
        serviceId: selectedService?.id || 'global',
        managerId: auth.currentUser.uid,
        date: new Date().toISOString(),
        ...formData,
        closingCash,
        closingBank,
        createdAt: serverTimestamp(),
      };

      // 1. Save the report
      await addDoc(collection(db, 'dailyReports'), report);

      // 2. Create Transactions to update Finance Manager balances
      const common = {
        businessId: selectedBusiness.id,
        ownerId: selectedBusiness.ownerId,
        branchId: selectedBranch?.id || 'global',
        serviceId: selectedService?.id || 'global',
        userId: auth.currentUser.uid,
        date: new Date().toISOString(),
        createdAt: serverTimestamp(),
        isFromReport: true, // Tag to identify report-generated transactions
      };

      const transactions: Partial<Transaction>[] = [];

      if (formData.cashSale > 0) {
        transactions.push({ ...common, type: 'income', amount: formData.cashSale, toAccount: 'cash', category: 'Daily Cash Sale', description: `Report: ${format(new Date(), 'MMM dd')}` });
      }
      if (formData.bankSale > 0) {
        transactions.push({ ...common, type: 'income', amount: formData.bankSale, toAccount: 'bank', toBankId: selectedBankId, category: 'Daily Bank Sale', description: `Report: ${format(new Date(), 'MMM dd')}` });
      }
      if (formData.cashExpense > 0) {
        transactions.push({ ...common, type: 'expense', amount: formData.cashExpense, fromAccount: 'cash', category: 'Daily Cash Expense', description: `Report: ${format(new Date(), 'MMM dd')}` });
      }
      if (formData.bankExpense > 0) {
        transactions.push({ ...common, type: 'expense', amount: formData.bankExpense, fromAccount: 'bank', fromBankId: selectedBankId, category: 'Daily Bank Expense', description: `Report: ${format(new Date(), 'MMM dd')}` });
      }
      if (formData.bankToCash > 0) {
        transactions.push({ ...common, type: 'transfer', amount: formData.bankToCash, fromAccount: 'bank', toAccount: 'cash', fromBankId: selectedBankId, category: 'Bank to Cash', description: `Report Transfer` });
      }
      if (formData.cashToBank > 0) {
        transactions.push({ ...common, type: 'transfer', amount: formData.cashToBank, fromAccount: 'cash', toAccount: 'bank', toBankId: selectedBankId, category: 'Cash to Bank', description: `Report Transfer` });
      }

      // Save all transactions
      await Promise.all(transactions.map(t => addDoc(collection(db, 'transactions'), t)));

      // 3. Update Bank Balance if applicable
      if (selectedBankId) {
        const bankNetChange = formData.bankSale + formData.cashToBank - formData.bankExpense - formData.bankToCash;
        if (bankNetChange !== 0) {
          await updateDoc(doc(db, 'bankAccounts', selectedBankId), {
            balance: increment(bankNetChange)
          });
        }
      }

      toast.success('Report submitted and balances updated');
      setFormData({
        openingCash: closingCash,
        openingBank: closingBank,
        cashSale: 0,
        bankSale: 0,
        cashExpense: 0,
        bankExpense: 0,
        bankToCash: 0,
        cashToBank: 0,
        note: '',
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'dailyReports');
      toast.error('Failed to submit report');
    } finally {
      setLoading(false);
    }
  };

  const currency = selectedBusiness?.currency || '$';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="space-y-6">
        {!selectedBranch && !selectedService ? (
          <div className="bg-[#1E293B] p-12 rounded-3xl border border-slate-800 shadow-xl text-center space-y-4">
            <div className="bg-slate-900 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-blue-500">
              <FileText size={32} />
            </div>
            <div className="space-y-1">
              <p className="text-slate-200 font-black text-lg uppercase tracking-widest">Select a Branch or Service</p>
              <p className="text-slate-500 text-sm font-bold">Please select a specific branch or digital service from the top menu to submit daily reports.</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-[#1E293B] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-6">
              <div className="flex items-center gap-3 text-blue-500 mb-2">
                <FileText size={24} />
                <h2 className="text-lg font-black uppercase tracking-widest">Daily Report</h2>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <InputGroup label="Opening Cash" value={formData.openingCash} readOnly icon={<Wallet size={16} />} />
                <InputGroup label="Opening Bank" value={formData.openingBank} readOnly icon={<Landmark size={16} />} />
              </div>

              {branchBankAccounts.length > 0 && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Select Branch Bank Account</label>
                  <select
                    value={selectedBankId}
                    onChange={(e) => setSelectedBankId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm font-bold outline-none focus:border-blue-500"
                  >
                    {branchBankAccounts.map(bank => (
                      <option key={bank.id} value={bank.id}>{bank.bankName} - {bank.accountName}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <InputGroup
                  label="Cash Sale (+)"
                  value={formData.cashSale}
                  onChange={(v) => setFormData({ ...formData, cashSale: v })}
                  icon={<Calculator size={16} />}
                />
                <InputGroup
                  label="Bank Sale (+)"
                  value={formData.bankSale}
                  onChange={(v) => setFormData({ ...formData, bankSale: v })}
                  icon={<Calculator size={16} />}
                />
                <InputGroup
                  label="Cash Exp (-)"
                  value={formData.cashExpense}
                  onChange={(v) => setFormData({ ...formData, cashExpense: v })}
                  icon={<Calculator size={16} />}
                />
                <InputGroup
                  label="Bank Exp (-)"
                  value={formData.bankExpense}
                  onChange={(v) => setFormData({ ...formData, bankExpense: v })}
                  icon={<Calculator size={16} />}
                />
                <InputGroup
                  label="Bank to Cash"
                  value={formData.bankToCash}
                  onChange={(v) => setFormData({ ...formData, bankToCash: v })}
                  icon={<ArrowRightLeft size={16} />}
                />
                <InputGroup
                  label="Cash to Bank"
                  value={formData.cashToBank}
                  onChange={(v) => setFormData({ ...formData, cashToBank: v })}
                  icon={<ArrowRightLeft size={16} />}
                />
              </div>

              <div className="bg-slate-900/50 p-5 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Closing Cash</span>
                    <Link to="/cash-count" className="text-[10px] font-black text-blue-500 hover:text-blue-400 flex items-center gap-1 mt-1">
                      <Banknote size={12} /> Count Cash
                    </Link>
                  </div>
                  <span className="text-lg font-black text-emerald-400">{currency}{closingCash.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Closing Bank</span>
                  <span className="text-lg font-black text-blue-400">{currency}{closingBank.toLocaleString()}</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Manager Note</label>
                <textarea
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  maxLength={1000}
                  className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm focus:border-blue-500 outline-none transition-all h-24 resize-none"
                  placeholder="Any special notes for today?"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg shadow-blue-900/20"
              >
                {loading ? <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div> : <Save size={20} />}
                Submit Daily Report
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="space-y-6">
        <div className="bg-[#1E293B] p-6 rounded-3xl border border-slate-800 shadow-xl">
          <div className="flex items-center gap-3 text-slate-400 mb-6">
            <History size={20} />
            <h3 className="text-xs font-black uppercase tracking-[0.2em]">Report History {!selectedBranch && !selectedService && '(All Entities)'}</h3>
          </div>
          <div className="space-y-3">
            {reports.map(report => (
              <div key={report.id} className="p-4 bg-slate-900/50 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    <Calendar size={12} />
                    {format(new Date(report.date), 'MMM dd, yyyy')}
                  </div>
                  <span className="text-[10px] font-black bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-md uppercase">
                    {report.branchId !== 'global' 
                      ? (branches.find(b => b.id === report.branchId)?.name || 'Branch')
                      : (services.find(s => s.id === report.serviceId)?.name || 'Service')
                    }
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Closing Cash</p>
                    <p className="text-sm font-black text-emerald-400">{currency}{report.closingCash.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Closing Bank</p>
                    <p className="text-sm font-black text-blue-400">{currency}{report.closingBank.toLocaleString()}</p>
                  </div>
                </div>
                {report.note && (
                  <p className="text-[10px] text-slate-400 italic border-t border-slate-800 pt-2">"{report.note}"</p>
                )}
              </div>
            ))}
            {reports.length === 0 && (
              <div className="p-12 text-center text-slate-500 font-bold uppercase tracking-widest text-[10px]">
                No reports found
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InputGroup({ label, value, onChange, readOnly, icon }: { label: string; value: number; onChange?: (v: number) => void; readOnly?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 flex items-center gap-1.5">
        {icon}
        {label}
      </label>
      <input
        type="number"
        value={value || ''}
        onChange={(e) => onChange?.(parseFloat(e.target.value) || 0)}
        readOnly={readOnly}
        min="0"
        max="1000000000"
        className={cn(
          "w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm focus:border-blue-500 outline-none transition-all",
          readOnly && "opacity-60 cursor-not-allowed"
        )}
      />
    </div>
  );
}
