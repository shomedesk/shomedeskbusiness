import React, { useState, useEffect } from 'react';
import { db, auth } from '@/src/lib/firebase';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, updateDoc, doc, increment, where } from 'firebase/firestore';
import { Supplier, PurchaseLog, Branch } from '@/src/types';
import { useBusiness } from '@/src/contexts/BusinessContext';
import { handleFirestoreError, OperationType } from '@/src/lib/firestore-utils';
import { toast } from 'sonner';
import { Plus, Truck, History, Search, UserPlus, Save, ShoppingCart, Calculator, ArrowRight } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { format } from 'date-fns';

export default function Suppliers() {
  const { selectedBusiness, selectedBranch, businesses, branches, isAllBusinessesSelected, userProfile } = useBusiness();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseLogs, setPurchaseLogs] = useState<PurchaseLog[]>([]);
  const [activeTab, setActiveTab] = useState<'entry' | 'manage'>('entry');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedBusiness && !isAllBusinessesSelected) return;

    const isBranchManager = userProfile?.role === 'branch_manager';
    let unsubSuppliers: () => void = () => {};
    let unsubLogs: () => void = () => {};

    if (isAllBusinessesSelected) {
      const businessIds = businesses.map(b => b.id);
      if (businessIds.length === 0) {
        setSuppliers([]);
        setPurchaseLogs([]);
        setLoading(false);
        return;
      }

      // Fetch for all businesses
      const qSuppliers = query(
        collection(db, 'suppliers'),
        where('businessId', 'in', businessIds.slice(0, 10)),
        orderBy('name', 'asc')
      );

      const qLogs = query(
        collection(db, 'purchaseLogs'),
        where('businessId', 'in', businessIds.slice(0, 10)),
        orderBy('createdAt', 'desc')
      );

      unsubSuppliers = onSnapshot(qSuppliers, (snapshot) => {
        setSuppliers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier)));
        setLoading(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'suppliers');
      });

      unsubLogs = onSnapshot(qLogs, (snapshot) => {
        setPurchaseLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseLog)));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'purchaseLogs');
      });
    } else {
      let qSuppliers = query(
        collection(db, 'suppliers'), 
        where('businessId', '==', selectedBusiness!.id),
        orderBy('name', 'asc')
      );

      if (isBranchManager && selectedBranch) {
        qSuppliers = query(
          collection(db, 'suppliers'), 
          where('businessId', '==', selectedBusiness!.id),
          where('branchId', '==', selectedBranch.id),
          orderBy('name', 'asc')
        );
      }
      
      let qLogs = query(
        collection(db, 'purchaseLogs'), 
        where('businessId', '==', selectedBusiness!.id),
        orderBy('createdAt', 'desc')
      );

      if (selectedBranch) {
        qLogs = query(
          collection(db, 'purchaseLogs'), 
          where('businessId', '==', selectedBusiness!.id),
          where('branchId', '==', selectedBranch.id),
          orderBy('createdAt', 'desc')
        );
      }

      unsubSuppliers = onSnapshot(qSuppliers, (snapshot) => {
        setSuppliers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier)));
        setLoading(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'suppliers');
      });

      unsubLogs = onSnapshot(qLogs, (snapshot) => {
        setPurchaseLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseLog)));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'purchaseLogs');
      });
    }

    return () => {
      unsubSuppliers();
      unsubLogs();
    };
  }, [selectedBusiness, selectedBranch, isAllBusinessesSelected, businesses]);

  const currency = isAllBusinessesSelected ? '₹' : (selectedBusiness?.currency || '$');

  return (
    <div className="space-y-6">
      <div className="flex bg-[#1E293B] p-1 rounded-2xl border border-slate-800 shadow-lg">
        <TabButton active={activeTab === 'entry'} onClick={() => setActiveTab('entry')} label="Bill Entry" icon={<ShoppingCart size={16} />} />
        <TabButton active={activeTab === 'manage'} onClick={() => setActiveTab('manage')} label="Suppliers" icon={<UserPlus size={16} />} />
      </div>

      {activeTab === 'entry' ? (
        <div className="space-y-6">
          {!selectedBranch ? (
            <div className="bg-[#1E293B] p-12 rounded-3xl border border-slate-800 shadow-xl text-center space-y-4">
              <div className="bg-slate-900 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-blue-500">
                <ShoppingCart size={32} />
              </div>
              <div className="space-y-1">
                <p className="text-slate-200 font-black text-lg uppercase tracking-widest">Select a Branch</p>
                <p className="text-slate-500 text-sm font-bold">Please select a specific branch from the top menu to log purchases.</p>
              </div>
            </div>
          ) : userProfile?.role === 'accountant' ? (
            <div className="bg-[#1E293B] p-8 rounded-3xl border border-slate-800 shadow-xl text-center">
              <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">Read Only Access</p>
            </div>
          ) : (
            <PurchaseEntryForm suppliers={suppliers} currency={currency} />
          )}
          <RecentLogs logs={purchaseLogs} currency={currency} branches={branches} businesses={businesses} isAllBusinessesSelected={isAllBusinessesSelected} />
        </div>
      ) : (
        <div className="space-y-6">
          {!selectedBranch ? (
            <div className="bg-[#1E293B] p-12 rounded-3xl border border-slate-800 shadow-xl text-center space-y-4">
              <div className="bg-slate-900 w-16 h-16 rounded-full flex items-center justify-center mx-auto text-emerald-500">
                <UserPlus size={32} />
              </div>
              <div className="space-y-1">
                <p className="text-slate-200 font-black text-lg uppercase tracking-widest">Select a Branch</p>
                <p className="text-slate-500 text-sm font-bold">Please select a specific branch from the top menu to add new suppliers.</p>
              </div>
            </div>
          ) : userProfile?.role === 'accountant' ? (
            <div className="bg-[#1E293B] p-8 rounded-3xl border border-slate-800 shadow-xl text-center">
              <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">Read Only Access</p>
            </div>
          ) : (
            <AddSupplierForm />
          )}
          <SupplierDirectory suppliers={suppliers} currency={currency} businesses={businesses} isAllBusinessesSelected={isAllBusinessesSelected} />
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all",
        active ? "bg-blue-600 text-white shadow-lg shadow-blue-900/20" : "text-slate-400 hover:text-slate-200"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function PurchaseEntryForm({ suppliers, currency }: { suppliers: Supplier[]; currency: string }) {
  const { selectedBusiness, selectedBranch } = useBusiness();
  const [formData, setFormData] = useState({
    supplierId: '',
    invoiceNumber: '',
    billAmount: 0,
    paidAmount: 0,
  });
  const [loading, setLoading] = useState(false);

  const selectedSupplier = suppliers.find(s => s.id === formData.supplierId);
  const oldDue = selectedSupplier?.totalDue || 0;
  const netDue = oldDue + formData.billAmount - formData.paidAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBusiness || !selectedBranch) return;
    if (!formData.supplierId || !formData.invoiceNumber) {
      toast.error('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      const log: PurchaseLog = {
        businessId: selectedBusiness.id,
        ownerId: selectedBusiness.ownerId,
        branchId: selectedBranch.id,
        supplierId: formData.supplierId,
        supplierName: selectedSupplier?.name || '',
        invoiceNumber: formData.invoiceNumber,
        openingDue: oldDue,
        billAmount: formData.billAmount,
        paidAmount: formData.paidAmount,
        netDue,
        date: new Date().toISOString(),
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'purchaseLogs'), log);
      await updateDoc(doc(db, 'suppliers', formData.supplierId), {
        totalDue: increment(formData.billAmount - formData.paidAmount)
      });

      toast.success('Purchase log saved');
      setFormData({ supplierId: '', invoiceNumber: '', billAmount: 0, paidAmount: 0 });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'purchaseLogs/suppliers');
      toast.error('Failed to save purchase log');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-[#1E293B] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-6">
      <div className="flex items-center gap-3 text-blue-500 mb-2">
        <ShoppingCart size={24} />
        <h2 className="text-lg font-black uppercase tracking-widest">Log Purchase</h2>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Select Supplier</label>
        <select
          value={formData.supplierId}
          onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
          className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm focus:border-blue-500 outline-none transition-all appearance-none"
        >
          <option value="">-- Choose Supplier --</option>
          {suppliers.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <InputGroup label="Invoice No" value={formData.invoiceNumber} onChange={(v) => setFormData({ ...formData, invoiceNumber: v as string })} type="text" maxLength={100} />
        <InputGroup label={`Prev. Due (${currency})`} value={oldDue} readOnly color="text-rose-400" />
        <InputGroup label={`Bill Amount (${currency})`} value={formData.billAmount} onChange={(v) => setFormData({ ...formData, billAmount: v as number })} min={0} max={1000000000} />
        <InputGroup label={`Paid Amount (${currency})`} value={formData.paidAmount} onChange={(v) => setFormData({ ...formData, paidAmount: v as number })} min={0} max={1000000000} />
        <div className="col-span-2">
          <InputGroup label={`Net Due (${currency})`} value={netDue} readOnly color="text-blue-400" />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg shadow-blue-900/20"
      >
        {loading ? <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div> : <Save size={20} />}
        Save Entry
      </button>
    </form>
  );
}

function AddSupplierForm() {
  const { selectedBusiness, selectedBranch, userProfile } = useBusiness();
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    contactPerson: '',
    category: '',
    email: '',
    address: '',
    country: '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBusiness) return;
    if (!formData.name || !formData.phone) {
      toast.error('Name and Phone are required');
      return;
    }

    setLoading(true);
    try {
      const supplier: Supplier = {
        ...formData,
        businessId: selectedBusiness.id,
        ownerId: selectedBusiness.ownerId,
        branchId: userProfile?.role === 'branch_manager' ? selectedBranch?.id : undefined,
        totalDue: 0,
      };
      await addDoc(collection(db, 'suppliers'), supplier);
      toast.success('Supplier added successfully');
      setFormData({ name: '', phone: '', contactPerson: '', category: '', email: '', address: '', country: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'suppliers');
      toast.error('Failed to add supplier');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-[#1E293B] p-6 rounded-3xl border border-emerald-500/20 shadow-xl space-y-6">
      <div className="flex items-center gap-3 text-emerald-500 mb-2">
        <UserPlus size={24} />
        <h2 className="text-lg font-black uppercase tracking-widest">Add Supplier</h2>
      </div>

      <div className="space-y-4">
        <InputGroup label="Supplier Name *" value={formData.name} onChange={(v) => setFormData({ ...formData, name: v as string })} type="text" maxLength={100} />
        <div className="grid grid-cols-2 gap-4">
          <InputGroup label="Phone *" value={formData.phone} onChange={(v) => setFormData({ ...formData, phone: v as string })} type="text" maxLength={20} />
          <InputGroup label="Contact Person" value={formData.contactPerson} onChange={(v) => setFormData({ ...formData, contactPerson: v as string })} type="text" maxLength={100} />
          <InputGroup label="Category" value={formData.category} onChange={(v) => setFormData({ ...formData, category: v as string })} type="text" maxLength={100} />
          <InputGroup label="Email" value={formData.email} onChange={(v) => setFormData({ ...formData, email: v as string })} type="text" maxLength={100} />
        </div>
        <InputGroup label="Address" value={formData.address} onChange={(v) => setFormData({ ...formData, address: v as string })} type="text" maxLength={500} />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg shadow-emerald-900/20"
      >
        {loading ? <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div> : <Save size={20} />}
        Add Supplier
      </button>
    </form>
  );
}

function RecentLogs({ logs, currency, branches, businesses, isAllBusinessesSelected }: { logs: PurchaseLog[]; currency: string; branches: Branch[]; businesses: any[]; isAllBusinessesSelected: boolean }) {
  return (
    <div className="bg-[#1E293B] p-6 rounded-3xl border border-slate-800 shadow-xl">
      <div className="flex items-center gap-3 text-slate-400 mb-6">
        <History size={20} />
        <h3 className="text-xs font-black uppercase tracking-[0.2em]">Recent Logs</h3>
      </div>
      <div className="space-y-3">
        {logs.slice(0, 10).map(log => (
          <div key={log.id} className="p-4 bg-slate-900/50 rounded-2xl border border-slate-800 flex justify-between items-center">
            <div className="space-y-1">
              <p className="text-sm font-bold text-slate-200">{log.supplierName}</p>
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <span>INV: {log.invoiceNumber}</span>
                <span className="text-slate-700">•</span>
                <span>{format(new Date(log.date), 'MMM dd')}</span>
                <span className="text-slate-700">•</span>
                <span className="text-blue-400">{branches.find(b => b.id === log.branchId)?.name || 'Branch'}</span>
                {isAllBusinessesSelected && (
                  <>
                    <span className="text-slate-700">•</span>
                    <span className="text-amber-400">{businesses.find(b => b.id === log.businessId)?.name || 'Business'}</span>
                  </>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-black text-blue-400">{currency}{log.billAmount.toLocaleString()}</p>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Paid: {currency}{log.paidAmount.toLocaleString()}</p>
            </div>
          </div>
        ))}
        {logs.length === 0 && (
          <div className="p-8 text-center text-slate-500 font-bold uppercase tracking-widest text-xs">
            No purchase logs found
          </div>
        )}
      </div>
    </div>
  );
}

function SupplierDirectory({ suppliers, currency, businesses, isAllBusinessesSelected }: { suppliers: Supplier[]; currency: string; businesses: any[]; isAllBusinessesSelected: boolean }) {
  return (
    <div className="bg-[#1E293B] p-6 rounded-3xl border border-slate-800 shadow-xl">
      <div className="flex items-center gap-3 text-slate-400 mb-6">
        <Truck size={20} />
        <h3 className="text-xs font-black uppercase tracking-[0.2em]">Supplier Directory</h3>
      </div>
      <div className="space-y-3">
        {suppliers.map(s => (
          <div key={s.id} className="p-4 bg-slate-900/50 rounded-2xl border border-slate-800 flex justify-between items-center">
            <div className="space-y-1">
              <p className="text-sm font-bold text-slate-200">{s.name}</p>
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{s.phone}</p>
                {isAllBusinessesSelected && (
                  <>
                    <span className="text-slate-700">•</span>
                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                      {businesses.find(b => b.id === s.businessId)?.name || 'Business'}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className={cn("text-sm font-black", s.totalDue > 0 ? "text-rose-400" : "text-emerald-400")}>
                {currency}{s.totalDue.toLocaleString()}
              </p>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Due</p>
            </div>
          </div>
        ))}
        {suppliers.length === 0 && (
          <div className="p-8 text-center text-slate-500 font-bold uppercase tracking-widest text-xs">
            No suppliers found
          </div>
        )}
      </div>
    </div>
  );
}

function InputGroup({ label, value, onChange, readOnly, type = "number", color, maxLength, min, max }: { label: string; value: string | number; onChange?: (v: string | number) => void; readOnly?: boolean; type?: string; color?: string; maxLength?: number; min?: number; max?: number }) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{label}</label>
      <input
        type={type}
        value={value === 0 && type === "number" ? '' : value}
        onChange={(e) => onChange?.(type === "number" ? parseFloat(e.target.value) || 0 : e.target.value)}
        readOnly={readOnly}
        maxLength={maxLength || (type === "text" ? 100 : undefined)}
        min={min !== undefined ? min : (type === "number" ? 0 : undefined)}
        max={max !== undefined ? max : (type === "number" ? 1000000000 : undefined)}
        className={cn(
          "w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm focus:border-blue-500 outline-none transition-all",
          readOnly && "opacity-60 cursor-not-allowed",
          color
        )}
      />
    </div>
  );
}
