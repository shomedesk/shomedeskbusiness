import React, { useState, useEffect } from 'react';
import { db, auth } from '@/src/lib/firebase';
import { collection, addDoc, query, orderBy, limit, getDocs, serverTimestamp, where, onSnapshot, doc, updateDoc, deleteDoc, increment } from 'firebase/firestore';
import { DailyReport, Transaction } from '@/src/types';
import { useBusiness } from '@/src/contexts/BusinessContext';
import { handleFirestoreError, OperationType } from '@/src/lib/firestore-utils';
import { toast } from 'sonner';
import { Save, Calculator, FileText, Wallet, Landmark, ArrowRightLeft, History, Calendar, Banknote, Plus, Eye, Edit2, Trash2, Printer, Download, ChevronLeft, ChevronRight, X, ShieldAlert, FileSpreadsheet } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { format, parseISO } from 'date-fns';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { MonthlyStatementModal } from './MonthlyStatementModal';

export default function ReportForm() {
  const { selectedBusiness, selectedBranch, selectedService, branches, services, bankAccounts, userProfile } = useBusiness();
  const isAdmin = userProfile?.role === 'admin' || auth.currentUser?.email === 'shomedesk@gmail.com';

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
  const [selectedReport, setSelectedReport] = useState<DailyReport | null>(null);
  const [isStatementOpen, setIsStatementOpen] = useState(false);

  // Edit State for Admin
  const [editingReport, setEditingReport] = useState<DailyReport | null>(null);
  const [editFormData, setEditFormData] = useState({
    date: '',
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
  const [editSaving, setEditSaving] = useState(false);

  // Filter & Pagination State
  const [dateFilter, setDateFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

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
      limit(200)
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
  }, [selectedBusiness, selectedBranch, selectedService]);

  // Reset page when filter or branch changes
  useEffect(() => {
    setCurrentPage(1);
  }, [dateFilter, selectedBranch, selectedService, selectedBusiness]);

  // Prevent background scrolling when Statement or View Report modal is open
  useEffect(() => {
    if (isStatementOpen || selectedReport) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [isStatementOpen, selectedReport]);

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
        openingCash: Number(formData.openingCash) || 0,
        openingBank: Number(formData.openingBank) || 0,
        cashSale: Number(formData.cashSale) || 0,
        bankSale: Number(formData.bankSale) || 0,
        cashExpense: Number(formData.cashExpense) || 0,
        bankExpense: Number(formData.bankExpense) || 0,
        bankToCash: Number(formData.bankToCash) || 0,
        cashToBank: Number(formData.cashToBank) || 0,
        closingCash,
        closingBank,
        note: formData.note || '',
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

  // Admin Delete Daily Report
  const handleDeleteReport = async (report: DailyReport) => {
    if (!isAdmin) {
      toast.error('Only administrators can delete daily reports');
      return;
    }

    const reportDateStr = report.date ? format(new Date(report.date), 'MMM dd, yyyy') : 'this report';
    const confirmed = window.confirm(`Are you sure you want to delete the daily report for ${reportDateStr}? This cannot be undone.`);
    if (!confirmed) return;

    try {
      if (!report.id) return;
      await deleteDoc(doc(db, 'dailyReports', report.id));
      toast.success(`Daily report for ${reportDateStr} deleted`);
      if (selectedReport?.id === report.id) {
        setSelectedReport(null);
      }
      if (editingReport?.id === report.id) {
        setEditingReport(null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'dailyReports');
      toast.error('Failed to delete report');
    }
  };

  // Admin Start Editing Daily Report
  const handleStartEdit = (report: DailyReport) => {
    if (!isAdmin) {
      toast.error('Only administrators can edit daily reports');
      return;
    }

    setEditingReport(report);
    let dateStr = '';
    try {
      dateStr = report.date ? format(new Date(report.date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
    } catch {
      dateStr = format(new Date(), 'yyyy-MM-dd');
    }

    setEditFormData({
      date: dateStr,
      openingCash: report.openingCash || 0,
      openingBank: report.openingBank || 0,
      cashSale: report.cashSale || 0,
      bankSale: report.bankSale || 0,
      cashExpense: report.cashExpense || 0,
      bankExpense: report.bankExpense || 0,
      bankToCash: report.bankToCash || 0,
      cashToBank: report.cashToBank || 0,
      note: report.note || '',
    });
  };

  const editClosingCash = editFormData.openingCash + editFormData.cashSale + editFormData.bankToCash - editFormData.cashExpense - editFormData.cashToBank;
  const editClosingBank = editFormData.openingBank + editFormData.bankSale + editFormData.cashToBank - editFormData.bankExpense - editFormData.bankToCash;

  // Admin Save Edited Report
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReport?.id || !isAdmin) return;

    setEditSaving(true);
    try {
      const updatedFields = {
        date: new Date(editFormData.date).toISOString(),
        openingCash: Number(editFormData.openingCash) || 0,
        openingBank: Number(editFormData.openingBank) || 0,
        cashSale: Number(editFormData.cashSale) || 0,
        bankSale: Number(editFormData.bankSale) || 0,
        cashExpense: Number(editFormData.cashExpense) || 0,
        bankExpense: Number(editFormData.bankExpense) || 0,
        bankToCash: Number(editFormData.bankToCash) || 0,
        cashToBank: Number(editFormData.cashToBank) || 0,
        closingCash: editClosingCash,
        closingBank: editClosingBank,
        note: editFormData.note || '',
      };

      await updateDoc(doc(db, 'dailyReports', editingReport.id), updatedFields);
      toast.success('Daily report updated successfully');

      // Update selected report if open in viewer
      if (selectedReport?.id === editingReport.id) {
        setSelectedReport({
          ...selectedReport,
          ...updatedFields,
        });
      }

      setEditingReport(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'dailyReports');
      toast.error('Failed to update daily report');
    } finally {
      setEditSaving(false);
    }
  };

  // Print & PDF Download Handler
  const handlePrintReport = (report: DailyReport) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Pop-up blocked! Please allow pop-ups to print/download PDF.');
      return;
    }

    const businessName = selectedBusiness?.name || 'Business Report';
    const entityName = report.branchId !== 'global' 
      ? (branches.find(b => b.id === report.branchId)?.name || 'Branch')
      : (services.find(s => s.id === report.serviceId)?.name || 'Digital Service');
    const reportDateStr = format(new Date(report.date), 'EEEE, MMMM dd, yyyy');
    const openingCash = Number(report.openingCash) || 0;
    const openingBank = Number(report.openingBank) || 0;
    const cashSale = Number(report.cashSale) || 0;
    const bankSale = Number(report.bankSale) || 0;
    const cashExpense = Number(report.cashExpense) || 0;
    const bankExpense = Number(report.bankExpense) || 0;
    const bankToCash = Number(report.bankToCash) || 0;
    const cashToBank = Number(report.cashToBank) || 0;
    const closingCash = Number(report.closingCash) || 0;
    const closingBank = Number(report.closingBank) || 0;
    const netProfitLoss = cashSale + bankSale - cashExpense - bankExpense;
    const totalLiquidity = closingCash + closingBank;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Daily Report - ${entityName} - ${format(new Date(report.date), 'yyyy-MM-dd')}</title>
          <meta charset="utf-8" />
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { 
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; 
              padding: 32px; 
              color: #0f172a;
              background: #ffffff;
              line-height: 1.4;
            }
            .report-container {
              max-width: 760px;
              margin: 0 auto;
              border: 1px solid #e2e8f0;
              border-radius: 12px;
              padding: 28px;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              border-bottom: 2px solid #0f172a;
              padding-bottom: 18px;
              margin-bottom: 24px;
            }
            .brand-title {
              font-size: 22px;
              font-weight: 900;
              letter-spacing: -0.5px;
              text-transform: uppercase;
              color: #0f172a;
            }
            .badge {
              display: inline-block;
              background: #f1f5f9;
              color: #2563eb;
              font-size: 11px;
              font-weight: 800;
              padding: 4px 8px;
              border-radius: 6px;
              text-transform: uppercase;
              margin-top: 5px;
            }
            .date-box {
              text-align: right;
            }
            .date-title {
              font-size: 10px;
              font-weight: 800;
              color: #64748b;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .date-value {
              font-size: 14px;
              font-weight: 700;
              color: #0f172a;
              margin-top: 2px;
            }
            .grid-2 {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 20px;
              margin-bottom: 24px;
            }
            .account-card {
              border: 1px solid #e2e8f0;
              border-radius: 10px;
              overflow: hidden;
            }
            .card-header {
              background: #f8fafc;
              border-bottom: 1px solid #e2e8f0;
              padding: 10px 14px;
              font-size: 12px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            .card-header.cash { color: #059669; }
            .card-header.bank { color: #2563eb; }
            .card-body {
              padding: 12px 14px;
            }
            .row {
              display: flex;
              justify-content: space-between;
              padding: 6px 0;
              font-size: 12px;
              border-bottom: 1px dashed #f1f5f9;
            }
            .row:last-child { border-bottom: none; }
            .row.highlight {
              font-weight: 800;
              font-size: 13px;
              padding-top: 8px;
              margin-top: 4px;
              border-top: 1px solid #cbd5e1;
              border-bottom: none;
            }
            .text-emerald { color: #059669; font-weight: 600; }
            .text-rose { color: #e11d48; font-weight: 600; }
            .text-blue { color: #2563eb; font-weight: 600; }
            .summary-banner {
              background: #f8fafc;
              border: 1px solid #cbd5e1;
              border-radius: 10px;
              padding: 16px 20px;
              display: flex;
              justify-content: space-between;
              margin-bottom: 24px;
            }
            .stat-label {
              font-size: 11px;
              font-weight: 800;
              color: #64748b;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .stat-val {
              font-size: 20px;
              font-weight: 900;
              color: #0f172a;
              margin-top: 2px;
            }
            .note-box {
              background: #fffbeb;
              border: 1px solid #fef3c7;
              border-left: 4px solid #f59e0b;
              border-radius: 6px;
              padding: 12px 16px;
              margin-bottom: 24px;
            }
            .note-title {
              font-size: 10px;
              font-weight: 800;
              color: #b45309;
              text-transform: uppercase;
              margin-bottom: 4px;
            }
            .note-desc {
              font-size: 12px;
              color: #451a03;
              font-style: italic;
            }
            .footer {
              border-top: 1px solid #e2e8f0;
              padding-top: 16px;
              display: flex;
              justify-content: space-between;
              font-size: 10px;
              font-weight: 600;
              color: #94a3b8;
              text-transform: uppercase;
            }
            @media print {
              body { padding: 0; background: #fff; }
              .report-container { border: none; padding: 0; max-width: 100%; }
              .no-print { display: none !important; }
            }
          </style>
        </head>
        <body>
          <div class="report-container">
            <div class="header">
              <div>
                <h1 class="brand-title">${businessName}</h1>
                <span class="badge">DAILY REPORT • ${entityName}</span>
              </div>
              <div class="date-box">
                <div class="date-title">Report Date</div>
                <div class="date-value">${reportDateStr}</div>
              </div>
            </div>

            <div class="grid-2">
              <!-- Cash Account -->
              <div class="account-card">
                <div class="card-header cash">
                  <span>Cash Account</span>
                  <span>Closing: ${currency}${closingCash.toLocaleString()}</span>
                </div>
                <div class="card-body">
                  <div class="row"><span>Opening Cash</span><span>${currency}${openingCash.toLocaleString()}</span></div>
                  <div class="row"><span class="text-emerald">Cash Sales (+)</span><span class="text-emerald">${currency}${cashSale.toLocaleString()}</span></div>
                  <div class="row"><span class="text-emerald">Bank to Cash / Withdrawal (+)</span><span class="text-emerald">${currency}${bankToCash.toLocaleString()}</span></div>
                  <div class="row"><span class="text-rose">Cash Expenses (-)</span><span class="text-rose">${currency}${cashExpense.toLocaleString()}</span></div>
                  <div class="row"><span class="text-rose">Cash to Bank / Deposit (-)</span><span class="text-rose">${currency}${cashToBank.toLocaleString()}</span></div>
                  <div class="row highlight"><span>Closing Cash Balance</span><span class="text-emerald">${currency}${closingCash.toLocaleString()}</span></div>
                </div>
              </div>

              <!-- Bank Account -->
              <div class="account-card">
                <div class="card-header bank">
                  <span>Bank Account</span>
                  <span>Closing: ${currency}${closingBank.toLocaleString()}</span>
                </div>
                <div class="card-body">
                  <div class="row"><span>Opening Bank</span><span>${currency}${openingBank.toLocaleString()}</span></div>
                  <div class="row"><span class="text-emerald">Bank Sales (+)</span><span class="text-emerald">${currency}${bankSale.toLocaleString()}</span></div>
                  <div class="row"><span class="text-emerald">Cash to Bank / Deposit (+)</span><span class="text-emerald">${currency}${cashToBank.toLocaleString()}</span></div>
                  <div class="row"><span class="text-rose">Bank Expenses (-)</span><span class="text-rose">${currency}${bankExpense.toLocaleString()}</span></div>
                  <div class="row"><span class="text-rose">Bank to Cash / Withdrawal (-)</span><span class="text-rose">${currency}${bankToCash.toLocaleString()}</span></div>
                  <div class="row highlight"><span>Closing Bank Balance</span><span class="text-blue">${currency}${closingBank.toLocaleString()}</span></div>
                </div>
              </div>
            </div>

            <!-- Internal Transfers (Deposits & Withdrawals) Card -->
            <div style="border: 1px solid #e2e8f0; border-radius: 10px; margin-bottom: 24px; overflow: hidden;">
              <div style="background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 10px 14px; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #475569; display: flex; justify-content: space-between; align-items: center;">
                <span>Bank & Cash Transfers (Deposits & Withdrawals)</span>
                <span style="font-size: 10px; color: #64748b; font-weight: 600;">Inter-Account Movement</span>
              </div>
              <div style="padding: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px;">
                  <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #1e40af; letter-spacing: 0.5px;">Cash to Bank (Bank Deposit)</div>
                  <div style="font-size: 18px; font-weight: 900; color: #2563eb; margin-top: 4px;">${currency}${cashToBank.toLocaleString()}</div>
                  <div style="font-size: 11px; color: #60a5fa; margin-top: 2px;">Cash Drawer ➔ Bank Account</div>
                </div>
                <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 12px;">
                  <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #065f46; letter-spacing: 0.5px;">Bank to Cash (Cash Withdrawal)</div>
                  <div style="font-size: 18px; font-weight: 900; color: #059669; margin-top: 4px;">${currency}${bankToCash.toLocaleString()}</div>
                  <div style="font-size: 11px; color: #34d399; margin-top: 2px;">Bank Account ➔ Cash Drawer</div>
                </div>
              </div>
            </div>

            <div class="summary-banner">
              <div>
                <div class="stat-label">Total Closing Liquidity</div>
                <div class="stat-val">${currency}${totalLiquidity.toLocaleString()}</div>
              </div>
              <div style="text-align: right;">
                <div class="stat-label">Day Net Profit / Loss</div>
                <div class="stat-val" style="color: ${netProfitLoss >= 0 ? '#059669' : '#e11d48'};">
                  ${currency}${netProfitLoss.toLocaleString()}
                </div>
              </div>
            </div>

            ${report.note ? `
              <div class="note-box">
                <div class="note-title">Manager Remarks</div>
                <div class="note-desc">"${report.note}"</div>
              </div>
            ` : ''}

            <div class="footer">
              <span>Generated from ShomeDesk Management System</span>
              <span>Printed: ${new Date().toLocaleString()}</span>
            </div>
          </div>

          <script>
            window.onload = () => {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Filtered & Paginated Reports
  const filteredReports = reports.filter(report => {
    if (!dateFilter) return true;
    try {
      const reportDateStr = format(new Date(report.date), 'yyyy-MM-dd');
      return reportDateStr === dateFilter;
    } catch {
      return false;
    }
  });

  const totalPages = Math.ceil(filteredReports.length / PAGE_SIZE) || 1;
  const paginatedReports = filteredReports.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const currency = selectedBusiness?.currency || '$';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Left Column: Daily Report Form */}
      <div className="space-y-6">
        {!selectedBranch && !selectedService ? (
          <div className="bg-[#1E293B] p-12 rounded-3xl border border-slate-800 shadow-xl text-center space-y-5">
            <div className="bg-slate-900 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-blue-500">
              <FileText size={32} />
            </div>
            <div className="space-y-1">
              <p className="text-slate-200 font-black text-lg uppercase tracking-widest">Select a Branch or Service</p>
              <p className="text-slate-500 text-sm font-bold">Please select a specific branch or digital service from the top menu to submit daily reports.</p>
            </div>
            <button
              type="button"
              onClick={() => setIsStatementOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-2xl text-xs font-black transition-all shadow-lg shadow-blue-900/30 active:scale-95"
            >
              <FileSpreadsheet size={16} />
              <span>Open Monthly Statement</span>
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-[#1E293B] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 text-blue-500 mb-2">
                <div className="flex items-center gap-3">
                  <FileText size={24} />
                  <h2 className="text-lg font-black uppercase tracking-widest">Daily Report</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsStatementOpen(true)}
                    className="px-3.5 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 active:scale-95"
                  >
                    <FileSpreadsheet size={15} />
                    <span>Monthly Statement</span>
                  </button>
                  {isAdmin && (
                    <span className="text-[10px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-400 px-2.5 py-1 rounded-lg border border-amber-500/20">
                      Admin Access
                    </span>
                  )}
                </div>
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
                  label="Bank to Cash (Withdrawal)"
                  value={formData.bankToCash}
                  onChange={(v) => setFormData({ ...formData, bankToCash: v })}
                  icon={<ArrowRightLeft size={16} />}
                />
                <InputGroup
                  label="Cash to Bank (Deposit)"
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

      {/* Right Column: Report History with Date Filter & Pagination */}
      <div className="space-y-6">
        <div className="bg-[#1E293B] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-slate-300">
              <History size={20} className="text-blue-500" />
              <h3 className="text-xs font-black uppercase tracking-[0.2em]">Report History {!selectedBranch && !selectedService && '(All Entities)'}</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsStatementOpen(true)}
                className="px-3.5 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-lg shadow-blue-900/20 active:scale-95"
              >
                <FileSpreadsheet size={14} />
                <span>Monthly Statement</span>
              </button>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                {filteredReports.length} {filteredReports.length === 1 ? 'Report' : 'Reports'}
              </span>
            </div>
          </div>

          {/* Calendar Date Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-slate-900/80 p-3 rounded-2xl border border-slate-800">
            <div className="flex items-center gap-2">
              <Calendar size={15} className="text-blue-400 shrink-0" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Filter by Date:</span>
            </div>
            <div className="flex items-center gap-2">
              <input 
                type="date" 
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="bg-slate-800/90 border border-slate-700 text-white text-xs font-bold rounded-xl px-3 py-1.5 outline-none focus:border-blue-500 transition-colors"
              />
              {dateFilter && (
                <button 
                  onClick={() => setDateFilter('')}
                  className="px-2 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl text-xs font-bold transition-colors flex items-center gap-1"
                  title="Clear Date Filter"
                >
                  <X size={13} />
                  <span className="text-[10px] uppercase font-black">Clear</span>
                </button>
              )}
            </div>
          </div>

          {/* History List */}
          <div className="space-y-3">
            {paginatedReports.map(report => (
              <div key={report.id} className="p-4 bg-slate-900/50 rounded-2xl border border-slate-800 space-y-3 group hover:border-blue-500/30 transition-all">
                <div className="flex justify-between items-center gap-2">
                  <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <Calendar size={12} className="text-slate-500" />
                    {report.date ? format(new Date(report.date), 'MMM dd, yyyy') : 'No Date'}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {/* View Eye Button */}
                    <button 
                      onClick={() => setSelectedReport(report)}
                      className="p-1.5 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded-lg transition-colors"
                      title="View & Print Report"
                    >
                      <Eye size={15} />
                    </button>

                    {/* Admin Edit Button */}
                    {isAdmin && (
                      <button 
                        onClick={() => handleStartEdit(report)}
                        className="p-1.5 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 rounded-lg transition-colors"
                        title="Admin: Edit Report"
                      >
                        <Edit2 size={15} />
                      </button>
                    )}

                    {/* Admin Delete Button */}
                    {isAdmin && (
                      <button 
                        onClick={() => handleDeleteReport(report)}
                        className="p-1.5 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 rounded-lg transition-colors"
                        title="Admin: Delete Report"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}

                    <span className="text-[10px] font-black bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-md uppercase ml-1">
                      {report.branchId !== 'global' 
                        ? (branches.find(b => b.id === report.branchId)?.name || 'Branch')
                        : (services.find(s => s.id === report.serviceId)?.name || 'Service')
                      }
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Closing Cash</p>
                    <p className="text-sm font-black text-emerald-400">{currency}{(report.closingCash || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Closing Bank</p>
                    <p className="text-sm font-black text-blue-400">{currency}{(report.closingBank || 0).toLocaleString()}</p>
                  </div>
                </div>

                {((Number(report.cashToBank) || 0) > 0 || (Number(report.bankToCash) || 0) > 0) && (
                  <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-800/60">
                    {(Number(report.cashToBank) || 0) > 0 && (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1">
                        <ArrowRightLeft size={10} /> Dep (Cash→Bank): {currency}{(report.cashToBank || 0).toLocaleString()}
                      </span>
                    )}
                    {(Number(report.bankToCash) || 0) > 0 && (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                        <ArrowRightLeft size={10} /> W/D (Bank→Cash): {currency}{(report.bankToCash || 0).toLocaleString()}
                      </span>
                    )}
                  </div>
                )}

                {report.note && (
                  <p className="text-[10px] text-slate-400 italic border-t border-slate-800 pt-2 line-clamp-1">"{report.note}"</p>
                )}
              </div>
            ))}

            {filteredReports.length === 0 && (
              <div className="p-12 text-center text-slate-500 font-bold uppercase tracking-widest text-[10px] bg-slate-900/30 rounded-2xl border border-dashed border-slate-800">
                {dateFilter ? `No reports found for ${dateFilter}` : 'No reports found'}
              </div>
            )}
          </div>

          {/* Pagination Controls (Last 10 per page) */}
          {filteredReports.length > 0 && (
            <div className="flex items-center justify-between pt-4 border-t border-slate-800 text-xs text-slate-400">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                Showing {(currentPage - 1) * PAGE_SIZE + 1} - {Math.min(currentPage * PAGE_SIZE, filteredReports.length)} of {filteredReports.length}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="p-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  title="Previous 10"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="px-2 text-[10px] font-black text-slate-300">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="p-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  title="Next 10"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Full Report Details Modal (Eye Button) */}
      <AnimatePresence>
        {selectedReport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#1E293B] border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                <div>
                  <h2 className="text-xl font-black text-white uppercase tracking-tight">Full Daily Report</h2>
                  <p className="text-xs text-slate-500 font-bold">
                    {selectedReport.date ? format(new Date(selectedReport.date), 'EEEE, MMM dd, yyyy') : 'No Date'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {/* Print / Save PDF in Header */}
                  <button 
                    onClick={() => handlePrintReport(selectedReport)}
                    className="p-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-xl transition-all flex items-center gap-1.5 text-xs font-black uppercase tracking-wider"
                    title="Print / Save as PDF"
                  >
                    <Printer size={16} />
                    <Download size={14} />
                    <span>Print / PDF</span>
                  </button>

                  {/* Admin actions in Modal */}
                  {isAdmin && (
                    <>
                      <button 
                        onClick={() => {
                          const rep = selectedReport;
                          setSelectedReport(null);
                          handleStartEdit(rep);
                        }}
                        className="p-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-xl transition-colors"
                        title="Admin: Edit Report"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => handleDeleteReport(selectedReport)}
                        className="p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl transition-colors"
                        title="Admin: Delete Report"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}

                  <button 
                    onClick={() => setSelectedReport(null)}
                    className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 transition-colors ml-1"
                  >
                    <Plus className="rotate-45" size={24} />
                  </button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto flex-1 space-y-6">
                {/* Header Stats */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Entity</p>
                    <p className="text-sm font-bold text-blue-400">
                      {selectedReport.branchId !== 'global' 
                        ? (branches.find(b => b.id === selectedReport.branchId)?.name || 'Branch')
                        : (services.find(s => s.id === selectedReport.serviceId)?.name || 'Service')
                      }
                    </p>
                  </div>
                  <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Submitted By</p>
                    <p className="text-sm font-bold text-white">Manager</p>
                  </div>
                </div>

                {/* Balances Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Wallet size={14} className="text-emerald-500" /> Cash Account
                    </h3>
                    <div className="space-y-2 bg-slate-900/30 p-4 rounded-2xl border border-slate-800/50">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500 font-bold">Opening Cash</span>
                        <span className="text-slate-300 font-black">{currency}{(selectedReport.openingCash || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-emerald-500 font-bold">Cash Sales (+)</span>
                        <span className="text-emerald-400 font-black">{currency}{(selectedReport.cashSale || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-emerald-400 font-bold">Bank to Cash / Withdrawal (+)</span>
                        <span className="text-emerald-400 font-black">{currency}{(selectedReport.bankToCash || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-rose-500 font-bold">Cash Expenses (-)</span>
                        <span className="text-rose-400 font-black">{currency}{(selectedReport.cashExpense || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-rose-400 font-bold">Cash to Bank / Deposit (-)</span>
                        <span className="text-rose-400 font-black">{currency}{(selectedReport.cashToBank || 0).toLocaleString()}</span>
                      </div>
                      <div className="h-px bg-slate-800 my-2" />
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-200 font-black">Closing Cash</span>
                        <span className="text-emerald-400 font-black">{currency}{(selectedReport.closingCash || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Landmark size={14} className="text-blue-500" /> Bank Account
                    </h3>
                    <div className="space-y-2 bg-slate-900/30 p-4 rounded-2xl border border-slate-800/50">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500 font-bold">Opening Bank</span>
                        <span className="text-slate-300 font-black">{currency}{(selectedReport.openingBank || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-emerald-500 font-bold">Bank Sales (+)</span>
                        <span className="text-emerald-400 font-black">{currency}{(selectedReport.bankSale || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-blue-400 font-bold">Cash to Bank / Deposit (+)</span>
                        <span className="text-blue-400 font-black">{currency}{(selectedReport.cashToBank || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-rose-500 font-bold">Bank Expenses (-)</span>
                        <span className="text-rose-400 font-black">{currency}{(selectedReport.bankExpense || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-rose-400 font-bold">Bank to Cash / Withdrawal (-)</span>
                        <span className="text-rose-400 font-black">{currency}{(selectedReport.bankToCash || 0).toLocaleString()}</span>
                      </div>
                      <div className="h-px bg-slate-800 my-2" />
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-200 font-black">Closing Bank</span>
                        <span className="text-blue-400 font-black">{currency}{(selectedReport.closingBank || 0).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bank & Cash Transfers Summary Section */}
                <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-800 space-y-3">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <ArrowRightLeft size={14} className="text-blue-400" /> Bank & Cash Transfers (Deposits & Withdrawals)
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Cash to Bank (Bank Deposit)</span>
                      <p className="text-lg font-black text-blue-400 mt-1">
                        {currency}{(selectedReport.cashToBank || 0).toLocaleString()}
                      </p>
                      <span className="text-[9px] text-slate-500 block mt-0.5">Cash Drawer ➔ Bank Account</span>
                    </div>
                    <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Bank to Cash (Cash Withdrawal)</span>
                      <p className="text-lg font-black text-emerald-400 mt-1">
                        {currency}{(selectedReport.bankToCash || 0).toLocaleString()}
                      </p>
                      <span className="text-[9px] text-slate-500 block mt-0.5">Bank Account ➔ Cash Drawer</span>
                    </div>
                  </div>
                </div>

                {/* Summary Card */}
                <div className="bg-blue-600 rounded-2xl p-6 shadow-xl shadow-blue-900/20 text-white">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-[10px] font-black text-blue-200 uppercase tracking-widest mb-1">Total Liquidity</p>
                      <h4 className="text-2xl font-black">{currency}{(selectedReport.closingCash + selectedReport.closingBank).toLocaleString()}</h4>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black text-blue-200 uppercase tracking-widest mb-1">Net Profit/Loss</p>
                      <h4 className="text-2xl font-black">
                        {currency}{(selectedReport.cashSale + selectedReport.bankSale - selectedReport.cashExpense - selectedReport.bankExpense).toLocaleString()}
                      </h4>
                    </div>
                  </div>
                </div>

                {selectedReport.note && (
                  <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Manager Remarks</p>
                    <p className="text-sm text-slate-300 italic leading-relaxed">"{selectedReport.note}"</p>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-slate-800 bg-slate-900/50 flex gap-3">
                <button
                  onClick={() => handlePrintReport(selectedReport)}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-2xl font-black transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20"
                >
                  <Printer size={18} />
                  Print / Download PDF
                </button>
                <button
                  onClick={() => setSelectedReport(null)}
                  className="bg-slate-800 hover:bg-slate-700 text-white px-8 py-4 rounded-2xl font-black transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Admin Edit Modal */}
      <AnimatePresence>
        {editingReport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#1E293B] border border-amber-500/30 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-amber-500/10 text-amber-400 rounded-xl">
                    <Edit2 size={20} />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-white uppercase tracking-tight">Admin: Edit Daily Report</h2>
                    <p className="text-xs text-slate-500 font-bold">
                      Modify report numbers and recalculate closing balances
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setEditingReport(null)}
                  className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 transition-colors"
                >
                  <Plus className="rotate-45" size={24} />
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="p-6 overflow-y-auto flex-1 space-y-6">
                {/* Date Setting */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5">
                    <Calendar size={14} className="text-amber-400" />
                    Report Date
                  </label>
                  <input
                    type="date"
                    required
                    value={editFormData.date}
                    onChange={(e) => setEditFormData({ ...editFormData, date: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm font-bold text-white outline-none focus:border-amber-500 transition-all"
                  />
                </div>

                {/* Opening Balances */}
                <div className="grid grid-cols-2 gap-4">
                  <InputGroup
                    label="Opening Cash"
                    value={editFormData.openingCash}
                    onChange={(v) => setEditFormData({ ...editFormData, openingCash: v })}
                    icon={<Wallet size={16} className="text-amber-400" />}
                  />
                  <InputGroup
                    label="Opening Bank"
                    value={editFormData.openingBank}
                    onChange={(v) => setEditFormData({ ...editFormData, openingBank: v })}
                    icon={<Landmark size={16} className="text-amber-400" />}
                  />
                </div>

                {/* Sales & Expenses */}
                <div className="grid grid-cols-2 gap-4">
                  <InputGroup
                    label="Cash Sale (+)"
                    value={editFormData.cashSale}
                    onChange={(v) => setEditFormData({ ...editFormData, cashSale: v })}
                    icon={<Calculator size={16} />}
                  />
                  <InputGroup
                    label="Bank Sale (+)"
                    value={editFormData.bankSale}
                    onChange={(v) => setEditFormData({ ...editFormData, bankSale: v })}
                    icon={<Calculator size={16} />}
                  />
                  <InputGroup
                    label="Cash Exp (-)"
                    value={editFormData.cashExpense}
                    onChange={(v) => setEditFormData({ ...editFormData, cashExpense: v })}
                    icon={<Calculator size={16} />}
                  />
                  <InputGroup
                    label="Bank Exp (-)"
                    value={editFormData.bankExpense}
                    onChange={(v) => setEditFormData({ ...editFormData, bankExpense: v })}
                    icon={<Calculator size={16} />}
                  />
                  <InputGroup
                    label="Bank to Cash (Withdrawal)"
                    value={editFormData.bankToCash}
                    onChange={(v) => setEditFormData({ ...editFormData, bankToCash: v })}
                    icon={<ArrowRightLeft size={16} />}
                  />
                  <InputGroup
                    label="Cash to Bank (Deposit)"
                    value={editFormData.cashToBank}
                    onChange={(v) => setEditFormData({ ...editFormData, cashToBank: v })}
                    icon={<ArrowRightLeft size={16} />}
                  />
                </div>

                {/* Recalculated Preview */}
                <div className="bg-slate-900/70 p-5 rounded-2xl border border-amber-500/20 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recalculated Closing Cash</span>
                    <span className="text-lg font-black text-emerald-400">{currency}{editClosingCash.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recalculated Closing Bank</span>
                    <span className="text-lg font-black text-blue-400">{currency}{editClosingBank.toLocaleString()}</span>
                  </div>
                </div>

                {/* Note */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Manager Remarks / Correction Note</label>
                  <textarea
                    value={editFormData.note}
                    onChange={(e) => setEditFormData({ ...editFormData, note: e.target.value })}
                    maxLength={1000}
                    className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm text-white focus:border-amber-500 outline-none transition-all h-20 resize-none"
                    placeholder="Describe correction reason or manager notes..."
                  />
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="submit"
                    disabled={editSaving}
                    className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-900/20"
                  >
                    {editSaving ? <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div> : <Save size={18} />}
                    Save Changes
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingReport(null)}
                    className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-4 rounded-2xl font-black transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Monthly Statement Modal */}
      <MonthlyStatementModal
        isOpen={isStatementOpen}
        onClose={() => setIsStatementOpen(false)}
        selectedBusiness={selectedBusiness}
        branches={branches}
        services={services}
        initialBranchId={selectedBranch?.id}
        initialServiceId={selectedService?.id}
      />
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
        value={value === 0 ? '' : value}
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
