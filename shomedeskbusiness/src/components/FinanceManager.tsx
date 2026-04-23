import React, { useState, useEffect } from 'react';
import { db, auth } from '@/src/lib/firebase';
import { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, limit, doc, updateDoc, increment, writeBatch } from 'firebase/firestore';
import { Transaction, AccountType, TransactionType, BankAccount } from '@/src/types';
import { useBusiness } from '@/src/contexts/BusinessContext';
import { currencyService } from '@/src/services/currencyService';
import { handleFirestoreError, OperationType } from '@/src/lib/firestore-utils';
import { toast } from 'sonner';
import { 
  Wallet, 
  Landmark, 
  Plus, 
  Minus, 
  ArrowRightLeft, 
  History,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Save,
  X as XIcon
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { format } from 'date-fns';

interface FinanceManagerProps {
  accountType: AccountType;
}

export default function FinanceManager({ accountType }: FinanceManagerProps) {
  const { selectedBusiness, isAllBusinessesSelected, selectedBranch, selectedService, bankAccounts, businesses, branches, services, userProfile } = useBusiness();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAddBankModalOpen, setIsAddBankModalOpen] = useState(false);
  const [modalType, setModalType] = useState<TransactionType>('income');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAllBusinessesSelected && !selectedBusiness) return;

    let q;
    if (isAllBusinessesSelected) {
      q = query(
        collection(db, 'transactions'),
        where('ownerId', '==', auth.currentUser?.uid),
        orderBy('date', 'desc'),
        limit(100)
      );
    } else {
      q = query(
        collection(db, 'transactions'),
        where('businessId', '==', selectedBusiness!.id),
        where('branchId', '==', selectedBranch?.id || 'global'),
        where('serviceId', '==', selectedService?.id || 'global'),
        orderBy('date', 'desc'),
        limit(100)
      );
    }

    const unsub = onSnapshot(q, async (snapshot) => {
      const rawData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));
      
      // If all businesses selected, convert amounts to INR for display
      let data = rawData;
      if (isAllBusinessesSelected) {
        data = await Promise.all(rawData.map(async (t) => {
          const business = businesses.find(b => b.id === t.businessId);
          const currency = business?.currency || 'INR';
          if (currency === 'INR') return t;
          
          const convertedAmount = await currencyService.convertToINR(t.amount, currency);
          return { ...t, amount: convertedAmount };
        }));
      }

      // Filter transactions relevant to this account type
      const filtered = data.filter(t => {
        const isCorrectAccount = t.fromAccount === accountType || t.toAccount === accountType;
        return isCorrectAccount;
      });

      setTransactions(filtered);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'transactions');
      setLoading(false);
    });

    return () => unsub();
  }, [selectedBusiness, selectedBranch, accountType, isAllBusinessesSelected]);

  const filteredBankAccounts = isAllBusinessesSelected 
    ? bankAccounts.filter(ba => ba.businessId === 'global')
    : bankAccounts.filter(ba => 
        ba.businessId === selectedBusiness?.id && 
        (selectedBranch ? ba.branchId === selectedBranch.id : (selectedService ? ba.serviceId === selectedService.id : ba.branchId === 'global'))
      );

  const balance = accountType === 'bank' 
    ? filteredBankAccounts.reduce((acc, ba) => acc + ba.balance, 0)
    : transactions.reduce((acc, t) => {
        if (t.toAccount === accountType) return acc + t.amount;
        if (t.fromAccount === accountType) return acc - t.amount;
        return acc;
      }, 0);

  const openModal = (type: TransactionType) => {
    setModalType(type);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6 md:space-y-8 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div className="space-y-1">
          <h1 className="text-xl md:text-3xl font-black tracking-tight flex items-center gap-2 md:gap-3">
            {accountType === 'cash' ? <Wallet className="text-amber-400 w-6 h-6 md:w-8 md:h-8" /> : <Landmark className="text-blue-400 w-6 h-6 md:w-8 md:h-8" />}
            <span className="truncate">
              {isAllBusinessesSelected 
                ? `Company Main ${accountType === 'cash' ? 'Cash' : 'Bank'}` 
                : (selectedBranch 
                    ? `${selectedBranch.name} ${accountType === 'cash' ? 'Cash' : 'Bank'}`
                    : (selectedService
                        ? `${selectedService.name} ${accountType === 'cash' ? 'Cash' : 'Bank'}`
                        : `${selectedBusiness?.name} Main ${accountType === 'cash' ? 'Cash' : 'Bank'}`
                      )
                  )
              }
            </span>
          </h1>
          <p className="text-slate-400 font-bold text-[10px] md:text-sm uppercase tracking-widest truncate">
            {isAllBusinessesSelected 
              ? 'Global company liquidity' 
              : (selectedBranch 
                  ? `Manage ${selectedBranch.name} liquidity`
                  : (selectedService
                      ? `Manage ${selectedService.name} digital revenue`
                      : `Manage ${selectedBusiness?.name} central liquidity`
                    )
                )
            }
          </p>
        </div>
        <div className="text-left md:text-right w-full md:w-auto">
          <p className="text-[9px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest mb-0.5 md:mb-1">Total {accountType} Balance</p>
          <p className={cn("text-2xl md:text-4xl font-black tracking-tighter", balance >= 0 ? "text-emerald-400" : "text-rose-400")}>
            {selectedBusiness?.currency || 'INR'}{balance.toLocaleString()}
          </p>
        </div>
      </div>

      {accountType === 'bank' && (
        <div className="space-y-3 md:space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-widest">Active Accounts</h3>
            {userProfile?.role !== 'accountant' && (
              <button 
                onClick={() => setIsAddBankModalOpen(true)}
                className="flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-1.5 md:py-2 bg-blue-600/10 text-blue-400 rounded-lg md:rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest hover:bg-blue-600/20 transition-all"
              >
                <Plus size={12} className="md:w-3.5 md:h-3.5" />
                Add Bank
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
            {filteredBankAccounts.map(bank => (
              <div key={bank.id} className="bg-[#1E293B] p-3 md:p-4 rounded-xl md:rounded-2xl border border-slate-800 shadow-lg group hover:border-blue-500/30 transition-all">
                <div className="flex justify-between items-start mb-1 md:mb-2">
                  <p className="text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-widest truncate">{bank.bankName}</p>
                  {bank.businessId === 'global' && (
                    <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-500 text-[7px] md:text-[8px] font-black uppercase tracking-widest rounded-full">Global</span>
                  )}
                </div>
                <h4 className="text-xs md:text-sm font-black text-slate-200 truncate">{bank.accountName}</h4>
                <p className="text-base md:text-lg font-black text-blue-400 mt-0.5 md:mt-1">
                  {isAllBusinessesSelected ? 'INR' : (selectedBusiness?.currency || 'INR')}
                  {bank.balance.toLocaleString()}
                </p>
              </div>
            ))}
            {filteredBankAccounts.length === 0 && (
              <div className="col-span-full p-6 md:p-8 bg-slate-800/20 border border-dashed border-slate-800 rounded-xl md:rounded-2xl text-center">
                <p className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-widest">No bank accounts found</p>
              </div>
            )}
          </div>
        </div>
      )}

      {userProfile?.role !== 'accountant' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <ActionButton onClick={() => openModal('income')} label="Income" icon={<Plus size={18} className="md:w-5 md:h-5" />} color="bg-emerald-600 shadow-emerald-900/20" />
          <ActionButton onClick={() => openModal('expense')} label="Expense" icon={<Minus size={18} className="md:w-5 md:h-5" />} color="bg-rose-600 shadow-rose-900/20" />
          <ActionButton onClick={() => openModal('transfer')} label="Transfer" icon={<ArrowRightLeft size={18} className="md:w-5 md:h-5" />} color="bg-blue-600 shadow-blue-900/20" />
          <ActionButton onClick={() => openModal('withdraw')} label="Withdraw" icon={<ArrowDownRight size={18} className="md:w-5 md:h-5" />} color="bg-indigo-600 shadow-indigo-900/20" />
        </div>
      )}

      <div className="bg-[#1E293B] rounded-3xl border border-slate-800 shadow-xl overflow-hidden">
        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
            <History size={16} />
            Transaction History
          </h3>
        </div>
        <div className="divide-y divide-slate-800">
          {transactions.map((t) => (
            <TransactionItem key={t.id} transaction={t} currentAccount={accountType} currency={selectedBusiness?.currency || 'INR'} />
          ))}
          {transactions.length === 0 && (
            <div className="p-12 text-center text-slate-500 font-bold uppercase tracking-widest text-xs">
              No transactions found
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <TransactionModal 
          type={modalType} 
          accountType={accountType} 
          onClose={() => setIsModalOpen(false)} 
        />
      )}

      {isAddBankModalOpen && (
        <AddBankModal onClose={() => setIsAddBankModalOpen(false)} />
      )}
    </div>
  );
}

function AddBankModal({ onClose }: { onClose: () => void }) {
  const { selectedBusiness, isAllBusinessesSelected, selectedBranch } = useBusiness();
  const [bankName, setBankName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [balance, setBalance] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    setLoading(true);
    try {
      const newBank: Omit<BankAccount, 'id'> = {
        businessId: isAllBusinessesSelected ? 'global' : selectedBusiness!.id,
        branchId: isAllBusinessesSelected ? 'global' : (selectedBranch?.id || 'global'),
        ownerId: auth.currentUser.uid,
        bankName,
        accountName,
        accountNumber,
        balance: parseFloat(balance) || 0,
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'bankAccounts'), newBank);
      toast.success('Bank account added successfully');
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'bankAccounts');
      toast.error('Failed to add bank account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1E293B] w-full max-w-md rounded-3xl border border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
          <h2 className="text-lg font-black uppercase tracking-widest flex items-center gap-2">
            <Landmark className="text-blue-400" />
            Add {isAllBusinessesSelected ? 'Company' : 'Business'} Bank Account
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><XIcon size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Bank Name</label>
            <input
              type="text"
              required
              maxLength={100}
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm outline-none focus:border-blue-500"
              placeholder="e.g. Chase, HSBC"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Account Name</label>
            <input
              type="text"
              required
              maxLength={100}
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm outline-none focus:border-blue-500"
              placeholder="e.g. Main Business Account"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Account Number</label>
            <input
              type="text"
              required
              maxLength={50}
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm outline-none focus:border-blue-500"
              placeholder="•••• •••• •••• 1234"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Initial Balance</label>
            <input
              type="number"
              required
              min={0}
              max={1000000000}
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm outline-none focus:border-blue-500"
              placeholder="0.00"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg shadow-blue-900/20"
          >
            {loading ? <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div> : <Save size={20} />}
            Add Account
          </button>
        </form>
      </div>
    </div>
  );
}

function ActionButton({ onClick, label, icon, color }: { onClick: () => void; label: string; icon: React.ReactNode; color: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-2 md:gap-3 p-4 md:p-6 rounded-2xl md:rounded-3xl text-white font-black transition-all active:scale-95 shadow-lg",
        color
      )}
    >
      <div className="bg-white/20 p-1.5 md:p-2 rounded-lg md:rounded-xl">{icon}</div>
      <span className="text-[10px] md:text-xs uppercase tracking-widest">{label}</span>
    </button>
  );
}

interface TransactionItemProps {
  transaction: Transaction;
  currentAccount: AccountType;
  currency: string;
}

const TransactionItem: React.FC<TransactionItemProps> = ({ transaction, currentAccount, currency }) => {
  const isIncoming = transaction.toAccount === currentAccount;
  
  return (
    <div className="p-4 flex justify-between items-center hover:bg-slate-800/50 transition-colors">
      <div className="flex items-center gap-4">
        <div className={cn(
          "p-2 rounded-xl",
          isIncoming ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
        )}>
          {isIncoming ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
        </div>
        <div>
          <p className="text-sm font-bold text-slate-200">{transaction.category}</p>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            {transaction.description || transaction.type} • {format(new Date(transaction.date), 'MMM dd, HH:mm')}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className={cn("text-sm font-black", isIncoming ? "text-emerald-400" : "text-rose-400")}>
          {isIncoming ? '+' : '-'} {currency}{transaction.amount.toLocaleString()}
        </p>
      </div>
    </div>
  );
}

function TransactionModal({ type, accountType, onClose }: { type: TransactionType; accountType: AccountType; onClose: () => void }) {
  const { selectedBusiness, isAllBusinessesSelected, selectedBranch, selectedService, bankAccounts, businesses, branches, services } = useBusiness();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [fromBankId, setFromBankId] = useState('');
  const [toBankId, setToBankId] = useState('');
  const [targetBusinessId, setTargetBusinessId] = useState('');
  const [targetBranchId, setTargetBranchId] = useState('');
  const [targetServiceId, setTargetServiceId] = useState('');
  const [transferType, setTransferType] = useState<'cash-to-bank' | 'bank-to-cash' | 'bank-to-bank' | 'business-to-company' | 'company-to-business' | 'company-cash-to-branch-cash' | 'branch-cash-to-company-cash'>('cash-to-bank');
  const [loading, setLoading] = useState(false);

  // Set default transfer type based on context
  useEffect(() => {
    if (type === 'transfer') {
      if (isAllBusinessesSelected) {
        setTransferType('company-cash-to-branch-cash');
      } else if (selectedBranch) {
        setTransferType('branch-cash-to-company-cash');
      } else {
        setTransferType('cash-to-bank');
      }
    }
  }, [type, isAllBusinessesSelected, selectedBranch]);

  // Auto-select banks based on transfer type
  useEffect(() => {
    if (type === 'transfer') {
      if (transferType === 'business-to-company') {
        const firstBusinessBank = bankAccounts.find(b => b.businessId !== 'global');
        const firstCompanyBank = bankAccounts.find(b => b.businessId === 'global');
        if (firstBusinessBank) setFromBankId(firstBusinessBank.id);
        if (firstCompanyBank) setToBankId(firstCompanyBank.id);
      } else if (transferType === 'company-to-business') {
        const firstCompanyBank = bankAccounts.find(b => b.businessId === 'global');
        const firstBusinessBank = bankAccounts.find(b => b.businessId !== 'global');
        if (firstCompanyBank) setFromBankId(firstCompanyBank.id);
        if (firstBusinessBank) setToBankId(firstBusinessBank.id);
      }
    }
  }, [transferType, type, bankAccounts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    if (!isAllBusinessesSelected && !selectedBusiness) return;

    setLoading(true);
    try {
      const amt = parseFloat(amount);
      let businessId = isAllBusinessesSelected ? (targetBusinessId || 'global') : selectedBusiness!.id;
      
      // For transfers between business and company banks, associate with the business so it shows in branch history
      if (transferType === 'business-to-company' || transferType === 'company-to-business') {
        const branchBankId = transferType === 'business-to-company' ? fromBankId : toBankId;
        const branchBank = bankAccounts.find(b => b.id === branchBankId);
        if (branchBank && branchBank.businessId !== 'global') {
          businessId = branchBank.businessId;
        }
      }

      const commonData = {
        ownerId: selectedBusiness?.ownerId || auth.currentUser.uid,
        userId: auth.currentUser.uid,
        amount: amt,
        category: category || type.toUpperCase(),
        description,
        date: new Date().toISOString(),
        createdAt: serverTimestamp(),
      };

      const batch = writeBatch(db);

      if (type === 'income') {
        const transactionRef = doc(collection(db, 'transactions'));
        const transaction: Transaction = {
          ...commonData,
          businessId,
          branchId: isAllBusinessesSelected ? (targetBranchId || 'global') : (selectedBranch?.id || 'global'),
          serviceId: isAllBusinessesSelected ? (targetServiceId || 'global') : (selectedService?.id || 'global'),
          type,
          toAccount: accountType,
        };
        if (accountType === 'bank') {
          transaction.toBankId = toBankId;
          batch.update(doc(db, 'bankAccounts', toBankId), { balance: increment(amt) });
        }
        batch.set(transactionRef, transaction);
      } else if (type === 'expense') {
        const transactionRef = doc(collection(db, 'transactions'));
        const transaction: Transaction = {
          ...commonData,
          businessId,
          branchId: isAllBusinessesSelected ? (targetBranchId || 'global') : (selectedBranch?.id || 'global'),
          serviceId: isAllBusinessesSelected ? (targetServiceId || 'global') : (selectedService?.id || 'global'),
          type,
          fromAccount: accountType,
        };
        if (accountType === 'bank') {
          transaction.fromBankId = fromBankId;
          batch.update(doc(db, 'bankAccounts', fromBankId), { balance: increment(-amt) });
        }
        batch.set(transactionRef, transaction);
      } else if (type === 'transfer') {
        if (transferType === 'cash-to-bank') {
          const transactionRef = doc(collection(db, 'transactions'));
          batch.set(transactionRef, {
            ...commonData,
            businessId,
            branchId: isAllBusinessesSelected ? (targetBranchId || 'global') : (selectedBranch?.id || 'global'),
            serviceId: isAllBusinessesSelected ? (targetServiceId || 'global') : (selectedService?.id || 'global'),
            type,
            fromAccount: 'cash',
            toAccount: 'bank',
            toBankId,
          });
          batch.update(doc(db, 'bankAccounts', toBankId), { balance: increment(amt) });
        } else if (transferType === 'bank-to-cash') {
          const transactionRef = doc(collection(db, 'transactions'));
          batch.set(transactionRef, {
            ...commonData,
            businessId,
            branchId: isAllBusinessesSelected ? (targetBranchId || 'global') : (selectedBranch?.id || 'global'),
            serviceId: isAllBusinessesSelected ? (targetServiceId || 'global') : (selectedService?.id || 'global'),
            type,
            fromAccount: 'bank',
            toAccount: 'cash',
            fromBankId,
          });
          batch.update(doc(db, 'bankAccounts', fromBankId), { balance: increment(-amt) });
        } else if (transferType === 'bank-to-bank') {
          const transactionRef = doc(collection(db, 'transactions'));
          batch.set(transactionRef, {
            ...commonData,
            businessId,
            branchId: isAllBusinessesSelected ? (targetBranchId || 'global') : (selectedBranch?.id || 'global'),
            serviceId: isAllBusinessesSelected ? (targetServiceId || 'global') : (selectedService?.id || 'global'),
            type,
            fromAccount: 'bank',
            toAccount: 'bank',
            fromBankId,
            toBankId,
          });
          batch.update(doc(db, 'bankAccounts', fromBankId), { balance: increment(-amt) });
          batch.update(doc(db, 'bankAccounts', toBankId), { balance: increment(amt) });
        } else if (transferType === 'business-to-company') {
          // 1. Transaction for Business/Branch (Out)
          const t1Ref = doc(collection(db, 'transactions'));
          batch.set(t1Ref, {
            ...commonData,
            businessId: selectedBusiness?.id || businessId,
            branchId: isAllBusinessesSelected ? (targetBranchId || 'global') : (selectedBranch?.id || 'global'),
            serviceId: isAllBusinessesSelected ? (targetServiceId || 'global') : (selectedService?.id || 'global'),
            type,
            fromAccount: 'bank',
            toAccount: 'bank',
            fromBankId,
            toBankId,
            description: description || `Transfer to Company Main Bank`,
          });
          
          // 2. Transaction for Company Main (In)
          const t2Ref = doc(collection(db, 'transactions'));
          batch.set(t2Ref, {
            ...commonData,
            businessId: 'global',
            branchId: 'global',
            serviceId: 'global',
            type,
            fromAccount: 'bank',
            toAccount: 'bank',
            fromBankId,
            toBankId,
            description: description || `Transfer from ${selectedBusiness?.name || 'Business'}`,
          });

          batch.update(doc(db, 'bankAccounts', fromBankId), { balance: increment(-amt) });
          batch.update(doc(db, 'bankAccounts', toBankId), { balance: increment(amt) });
        } else if (transferType === 'company-to-business') {
          const targetBiz = businesses.find(b => b.id === targetBusinessId) || selectedBusiness;
          
          // 1. Transaction for Company Main (Out)
          const t1Ref = doc(collection(db, 'transactions'));
          batch.set(t1Ref, {
            ...commonData,
            businessId: 'global',
            branchId: 'global',
            serviceId: 'global',
            type,
            fromAccount: 'bank',
            toAccount: 'bank',
            fromBankId,
            toBankId,
            description: description || `Transfer to ${targetBiz?.name || 'Business'} Bank`,
          });
          
          // 2. Transaction for Business/Branch (In)
          const t2Ref = doc(collection(db, 'transactions'));
          batch.set(t2Ref, {
            ...commonData,
            businessId: targetBiz?.id || businessId,
            branchId: isAllBusinessesSelected ? (targetBranchId || 'global') : (selectedBranch?.id || 'global'),
            serviceId: isAllBusinessesSelected ? (targetServiceId || 'global') : (selectedService?.id || 'global'),
            type,
            fromAccount: 'bank',
            toAccount: 'bank',
            fromBankId,
            toBankId,
            description: description || `Transfer from Company Main Bank`,
          });

          batch.update(doc(db, 'bankAccounts', fromBankId), { balance: increment(-amt) });
          batch.update(doc(db, 'bankAccounts', toBankId), { balance: increment(amt) });
        } else if (transferType === 'company-cash-to-branch-cash') {
          const targetBranch = branches.find(b => b.id === targetBranchId);
          if (!targetBranch) throw new Error('Target branch not found');
          
          // 1. Transaction for Company Main (Out)
          const t1Ref = doc(collection(db, 'transactions'));
          batch.set(t1Ref, {
            ...commonData,
            businessId: 'global',
            branchId: 'global',
            serviceId: 'global',
            type,
            fromAccount: 'cash',
            description: description || `Transfer to ${targetBranch.name}`,
          });
          
          // 2. Transaction for Branch (In)
          const t2Ref = doc(collection(db, 'transactions'));
          batch.set(t2Ref, {
            ...commonData,
            businessId: targetBranch.businessId,
            branchId: targetBranch.id,
            serviceId: 'global',
            type,
            toAccount: 'cash',
            description: description || `Transfer from Company Main`,
          });
        } else if (transferType === 'branch-cash-to-company-cash') {
          if (!selectedBranch) throw new Error('Source branch not selected');
          
          // 1. Transaction for Branch (Out)
          const t1Ref = doc(collection(db, 'transactions'));
          batch.set(t1Ref, {
            ...commonData,
            businessId: selectedBusiness!.id,
            branchId: selectedBranch.id,
            serviceId: 'global',
            type,
            fromAccount: 'cash',
            description: description || `Transfer to Company Main`,
          });
          
          // 2. Transaction for Company Main (In)
          const t2Ref = doc(collection(db, 'transactions'));
          batch.set(t2Ref, {
            ...commonData,
            businessId: 'global',
            branchId: 'global',
            serviceId: 'global',
            type,
            toAccount: 'cash',
            description: description || `Transfer from ${selectedBranch.name}`,
          });
        }
      } else if (type === 'withdraw') {
        const transactionRef = doc(collection(db, 'transactions'));
        const transaction: Transaction = {
          ...commonData,
          businessId,
          branchId: isAllBusinessesSelected ? (targetBranchId || 'global') : (selectedBranch?.id || 'global'),
          serviceId: isAllBusinessesSelected ? (targetServiceId || 'global') : (selectedService?.id || 'global'),
          type,
          fromAccount: 'bank',
          toAccount: 'cash',
          fromBankId,
        };
        batch.update(doc(db, 'bankAccounts', fromBankId), { balance: increment(-amt) });
        batch.set(transactionRef, transaction);
      }

      await batch.commit();
      toast.success('Transaction recorded successfully');
      onClose();
    } catch (error) {
      console.error(error);
      toast.error('Failed to record transaction');
    } finally {
      setLoading(false);
    }
  };

  const businessBanks = bankAccounts.filter(b => b.businessId !== 'global');
  const companyBanks = bankAccounts.filter(b => b.businessId === 'global');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1E293B] w-full max-w-md max-h-[90vh] rounded-3xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
        <div className="p-4 md:p-6 border-b border-slate-800 flex justify-between items-center flex-shrink-0">
          <h2 className="text-lg font-black uppercase tracking-widest flex items-center gap-2">
            {type === 'income' && <Plus className="text-emerald-400" />}
            {type === 'expense' && <Minus className="text-rose-400" />}
            {type === 'transfer' && <ArrowRightLeft className="text-blue-400" />}
            {type} {accountType}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><XIcon size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
          {type === 'transfer' && (
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Transfer Type</label>
              <select 
                value={transferType}
                onChange={(e) => setTransferType(e.target.value as any)}
                className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm outline-none focus:border-blue-500"
              >
                <optgroup label="Internal Transfers">
                  <option value="cash-to-bank">Cash to Bank</option>
                  <option value="bank-to-cash">Bank to Cash</option>
                  <option value="bank-to-bank">Bank to Bank</option>
                </optgroup>
                <optgroup label="Cross-Level Transfers">
                  <option value="business-to-company">Business Bank to Company Main Bank</option>
                  <option value="company-to-business">Company Main Bank to Business Bank</option>
                  <option value="company-cash-to-branch-cash">Company Main Cash to Branch Cash</option>
                  <option value="branch-cash-to-company-cash">Branch Cash to Company Main Cash</option>
                </optgroup>
              </select>
            </div>
          )}

          {type === 'transfer' && transferType === 'company-cash-to-branch-cash' && (
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Target Branch</label>
              <select 
                required
                value={targetBranchId}
                onChange={(e) => setTargetBranchId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm outline-none focus:border-blue-500"
              >
                <option value="">Select Branch</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>
                    {businesses.find(biz => biz.id === b.businessId)?.name} - {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {isAllBusinessesSelected && type !== 'transfer' && (
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Target Business</label>
              <select 
                value={targetBusinessId}
                onChange={(e) => setTargetBusinessId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm outline-none focus:border-blue-500"
              >
                <option value="global">Company (Global)</option>
                {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}

          {/* Branch/Service Selectors when in All mode or no specific branch/service selected */}
          {type !== 'transfer' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Target Branch</label>
                <select 
                  value={targetBranchId}
                  onChange={(e) => {
                    setTargetBranchId(e.target.value);
                    if (e.target.value) setTargetServiceId('');
                  }}
                  className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm outline-none focus:border-blue-500"
                >
                  <option value="">No Branch (Global)</option>
                  {branches
                    .filter(b => isAllBusinessesSelected ? (targetBusinessId === 'global' || b.businessId === targetBusinessId) : b.businessId === selectedBusiness?.id)
                    .map(b => <option key={b.id} value={b.id}>{b.name}</option>)
                  }
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Target Service</label>
                <select 
                  value={targetServiceId}
                  onChange={(e) => {
                    setTargetServiceId(e.target.value);
                    if (e.target.value) setTargetBranchId('');
                  }}
                  className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm outline-none focus:border-blue-500"
                >
                  <option value="">No Service (Global)</option>
                  {services
                    .filter(s => isAllBusinessesSelected ? (targetBusinessId === 'global' || s.businessId === targetBusinessId) : s.businessId === selectedBusiness?.id)
                    .map(s => <option key={s.id} value={s.id}>{s.name}</option>)
                  }
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* From Bank selector */}
            {(
              (type === 'expense' && accountType === 'bank') || 
              (type === 'withdraw') ||
              (type === 'transfer' && (transferType === 'bank-to-cash' || transferType === 'bank-to-bank' || transferType === 'business-to-company' || transferType === 'company-to-business'))
            ) && (
              <div className="space-y-2 col-span-2 sm:col-span-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">From Bank</label>
                <select 
                  required
                  value={fromBankId}
                  onChange={(e) => setFromBankId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm outline-none focus:border-blue-500"
                >
                  <option value="">Select Bank</option>
                  {transferType === 'business-to-company' ? businessBanks.map(b => <option key={b.id} value={b.id}>{b.bankName} ({b.accountName})</option>) :
                   transferType === 'company-to-business' ? companyBanks.map(b => <option key={b.id} value={b.id}>{b.bankName} ({b.accountName})</option>) :
                   bankAccounts.map(b => <option key={b.id} value={b.id}>{b.bankName} ({b.accountName})</option>)}
                </select>
              </div>
            )}

            {/* To Bank selector */}
            {(
              (type === 'income' && accountType === 'bank') ||
              (type === 'transfer' && (transferType === 'cash-to-bank' || transferType === 'bank-to-bank' || transferType === 'business-to-company' || transferType === 'company-to-business'))
            ) && (
              <div className="space-y-2 col-span-2 sm:col-span-1">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">To Bank</label>
                <select 
                  required
                  value={toBankId}
                  onChange={(e) => setToBankId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm outline-none focus:border-blue-500"
                >
                  <option value="">Select Bank</option>
                  {transferType === 'business-to-company' ? companyBanks.map(b => <option key={b.id} value={b.id}>{b.bankName} ({b.accountName})</option>) :
                   transferType === 'company-to-business' ? businessBanks.map(b => <option key={b.id} value={b.id}>{b.bankName} ({b.accountName})</option>) :
                   bankAccounts.map(b => <option key={b.id} value={b.id}>{b.bankName} ({b.accountName})</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Amount</label>
            <input
              type="number"
              required
              min="0"
              max="1000000000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-lg font-black text-blue-400 outline-none focus:border-blue-500"
              placeholder="0.00"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Category</label>
            <input
              type="text"
              required
              maxLength={100}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm outline-none focus:border-blue-500"
              placeholder="e.g. Sales, Rent, Salary"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Description</label>
            <textarea
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm outline-none focus:border-blue-500 h-24 resize-none"
              placeholder="Optional details..."
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg shadow-blue-900/20"
          >
            {loading ? <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div> : <Save size={20} />}
            Record Transaction
          </button>
        </form>
      </div>
    </div>
  );
}

function X({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"></line>
      <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
  );
}
