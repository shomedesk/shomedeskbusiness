import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '@/src/lib/firebase';
import { collection, addDoc, query, onSnapshot, serverTimestamp, updateDoc, doc, increment, where } from 'firebase/firestore';
import { Supplier, PurchaseLog, Branch, Business } from '@/src/types';
import { useBusiness } from '@/src/contexts/BusinessContext';
import { handleFirestoreError, OperationType } from '@/src/lib/firestore-utils';
import { toast } from 'sonner';
import { Truck, History, Search, UserPlus, Save, ShoppingCart, AlertCircle, Building2, MapPin } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { format } from 'date-fns';

export default function Suppliers() {
  const { selectedBusiness, selectedBranch, businesses, branches, isAllBusinessesSelected, userProfile } = useBusiness();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseLogs, setPurchaseLogs] = useState<PurchaseLog[]>([]);
  const [activeTab, setActiveTab] = useState<'entry' | 'manage'>('entry');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedBusiness && !isAllBusinessesSelected) {
      setSuppliers([]);
      setPurchaseLogs([]);
      setLoading(false);
      return;
    }

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

      // Query without composite index requirement, sort client-side
      const qSuppliers = query(
        collection(db, 'suppliers'),
        where('businessId', 'in', businessIds.slice(0, 10))
      );

      const qLogs = query(
        collection(db, 'purchaseLogs'),
        where('businessId', 'in', businessIds.slice(0, 10))
      );

      unsubSuppliers = onSnapshot(qSuppliers, (snapshot) => {
        const loaded = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier));
        loaded.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setSuppliers(loaded);
        setLoading(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'suppliers');
        setLoading(false);
      });

      unsubLogs = onSnapshot(qLogs, (snapshot) => {
        const loaded = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseLog));
        loaded.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
        setPurchaseLogs(loaded);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'purchaseLogs');
      });
    } else if (selectedBusiness) {
      let qSuppliers = query(
        collection(db, 'suppliers'), 
        where('businessId', '==', selectedBusiness.id)
      );

      if (isBranchManager && selectedBranch) {
        qSuppliers = query(
          collection(db, 'suppliers'), 
          where('businessId', '==', selectedBusiness.id),
          where('branchId', '==', selectedBranch.id)
        );
      }
      
      let qLogs = query(
        collection(db, 'purchaseLogs'), 
        where('businessId', '==', selectedBusiness.id)
      );

      if (selectedBranch) {
        qLogs = query(
          collection(db, 'purchaseLogs'), 
          where('businessId', '==', selectedBusiness.id),
          where('branchId', '==', selectedBranch.id)
        );
      }

      unsubSuppliers = onSnapshot(qSuppliers, (snapshot) => {
        const loaded = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Supplier));
        loaded.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setSuppliers(loaded);
        setLoading(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'suppliers');
        setLoading(false);
      });

      unsubLogs = onSnapshot(qLogs, (snapshot) => {
        const loaded = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseLog));
        loaded.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
        setPurchaseLogs(loaded);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'purchaseLogs');
      });
    }

    return () => {
      unsubSuppliers();
      unsubLogs();
    };
  }, [selectedBusiness, selectedBranch, isAllBusinessesSelected, businesses, userProfile]);

  const currency = isAllBusinessesSelected ? '₹' : (selectedBusiness?.currency || '$');

  return (
    <div className="space-y-6">
      <div className="flex bg-[#1E293B] p-1 rounded-2xl border border-slate-800 shadow-lg">
        <TabButton active={activeTab === 'entry'} onClick={() => setActiveTab('entry')} label="Bill Entry" icon={<ShoppingCart size={16} />} />
        <TabButton active={activeTab === 'manage'} onClick={() => setActiveTab('manage')} label="Suppliers Directory & Add" icon={<UserPlus size={16} />} />
      </div>

      {activeTab === 'entry' ? (
        <div className="space-y-6">
          {userProfile?.role === 'accountant' ? (
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
          {userProfile?.role === 'accountant' ? (
            <div className="bg-[#1E293B] p-8 rounded-3xl border border-slate-800 shadow-xl text-center">
              <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">Read Only Access</p>
            </div>
          ) : (
            <AddSupplierForm />
          )}
          <SupplierDirectory suppliers={suppliers} currency={currency} businesses={businesses} branches={branches} isAllBusinessesSelected={isAllBusinessesSelected} />
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
  const { selectedBusiness, selectedBranch, businesses, branches, isAllBusinessesSelected } = useBusiness();
  const [selectedBranchId, setSelectedBranchId] = useState<string>(selectedBranch?.id || '');
  const [formData, setFormData] = useState({
    supplierId: '',
    invoiceNumber: '',
    billAmount: 0,
    paidAmount: 0,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedBranch?.id) {
      setSelectedBranchId(selectedBranch.id);
    } else if (branches.length > 0 && !selectedBranchId) {
      setSelectedBranchId(branches[0].id);
    }
  }, [selectedBranch, branches]);

  const activeBusiness = selectedBusiness || (businesses.length > 0 ? businesses[0] : null);
  const relevantBranches = branches.filter(b => !activeBusiness || b.businessId === activeBusiness.id);

  const selectedSupplier = suppliers.find(s => s.id === formData.supplierId);
  const oldDue = selectedSupplier?.totalDue || 0;
  const netDue = oldDue + formData.billAmount - formData.paidAmount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness) {
      toast.error('Please select or create a business first');
      return;
    }
    if (!selectedBranchId && relevantBranches.length > 0) {
      toast.error('Please select a branch for this purchase log');
      return;
    }
    if (!formData.supplierId || !formData.invoiceNumber.trim()) {
      toast.error('Please select a supplier and provide an Invoice Number');
      return;
    }

    setLoading(true);
    try {
      const logPayload: Record<string, any> = {
        businessId: activeBusiness.id,
        ownerId: activeBusiness.ownerId || auth.currentUser?.uid || '',
        branchId: selectedBranchId || 'main',
        supplierId: formData.supplierId,
        supplierName: selectedSupplier?.name || 'Unknown',
        invoiceNumber: formData.invoiceNumber.trim(),
        openingDue: oldDue,
        billAmount: Number(formData.billAmount) || 0,
        paidAmount: Number(formData.paidAmount) || 0,
        amount: Number(formData.billAmount) || 0,
        netDue,
        date: new Date().toISOString(),
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'purchaseLogs'), logPayload);
      
      const dueDelta = (Number(formData.billAmount) || 0) - (Number(formData.paidAmount) || 0);
      if (dueDelta !== 0) {
        await updateDoc(doc(db, 'suppliers', formData.supplierId), {
          totalDue: increment(dueDelta)
        });
      }

      toast.success('Purchase bill logged successfully');
      setFormData({ supplierId: '', invoiceNumber: '', billAmount: 0, paidAmount: 0 });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'purchaseLogs');
      toast.error('Failed to save purchase bill');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-[#1E293B] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-blue-500">
          <ShoppingCart size={24} />
          <h2 className="text-lg font-black uppercase tracking-widest">Log Purchase Bill</h2>
        </div>
        {activeBusiness && (
          <span className="text-[11px] font-bold text-slate-400 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
            {activeBusiness.name}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {relevantBranches.length > 0 && (
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Branch *</label>
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm text-slate-200 focus:border-blue-500 outline-none transition-all"
            >
              {relevantBranches.map(b => (
                <option key={b.id} value={b.id}>{b.name} ({b.branchCode || 'BR'})</option>
              ))}
            </select>
          </div>
        )}

        <div className={cn("space-y-2", relevantBranches.length === 0 && "col-span-full")}>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Select Supplier *</label>
          <select
            value={formData.supplierId}
            onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
            className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm text-slate-200 focus:border-blue-500 outline-none transition-all"
          >
            <option value="">-- Choose Supplier ({suppliers.length} available) --</option>
            {suppliers.map(s => (
              <option key={s.id} value={s.id}>{s.name} {s.phone ? `(${s.phone})` : ''}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <InputGroup label="Invoice No *" value={formData.invoiceNumber} onChange={(v) => setFormData({ ...formData, invoiceNumber: v as string })} type="text" maxLength={100} />
        <InputGroup label={`Prev. Due (${currency})`} value={oldDue} readOnly color="text-rose-400" />
        <InputGroup label={`Bill Amount (${currency}) *`} value={formData.billAmount} onChange={(v) => setFormData({ ...formData, billAmount: v as number })} min={0} max={1000000000} />
        <InputGroup label={`Paid Amount (${currency})`} value={formData.paidAmount} onChange={(v) => setFormData({ ...formData, paidAmount: v as number })} min={0} max={1000000000} />
        <div className="col-span-2">
          <InputGroup label={`Net Due (${currency})`} value={netDue} readOnly color="text-blue-400" />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || !formData.supplierId}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg shadow-blue-900/20"
      >
        {loading ? <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div> : <Save size={20} />}
        Save Purchase Entry
      </button>
    </form>
  );
}

function AddSupplierForm() {
  const { selectedBusiness, selectedBranch, businesses, branches, isAllBusinessesSelected, userProfile } = useBusiness();
  const [chosenBusinessId, setChosenBusinessId] = useState<string>(selectedBusiness?.id || '');
  const [chosenBranchId, setChosenBranchId] = useState<string>(selectedBranch?.id || '');

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    contactPerson: '',
    category: '',
    email: '',
    address: '',
    country: '',
    openingDue: 0,
  });
  const [loading, setLoading] = useState(false);

  // Keep target business synced
  useEffect(() => {
    if (selectedBusiness?.id) {
      setChosenBusinessId(selectedBusiness.id);
    } else if (businesses.length > 0 && !chosenBusinessId) {
      setChosenBusinessId(businesses[0].id);
    }
  }, [selectedBusiness, businesses]);

  // Keep branch synced
  useEffect(() => {
    if (selectedBranch?.id) {
      setChosenBranchId(selectedBranch.id);
    }
  }, [selectedBranch]);

  const activeBusiness = businesses.find(b => b.id === chosenBusinessId) || selectedBusiness || businesses[0];
  const activeBranches = branches.filter(b => activeBusiness && b.businessId === activeBusiness.id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness) {
      toast.error('No business selected. Please create or select a business first.');
      return;
    }
    if (!formData.name.trim()) {
      toast.error('Supplier name is required');
      return;
    }
    if (!formData.phone.trim()) {
      toast.error('Phone number is required');
      return;
    }

    setLoading(true);
    try {
      // Clean document payload: DO NOT send undefined values to Firestore!
      const supplierData: Record<string, any> = {
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        businessId: activeBusiness.id,
        ownerId: activeBusiness.ownerId || auth.currentUser?.uid || '',
        totalDue: Number(formData.openingDue) || 0,
      };

      // Assign branch if selected
      const isBranchManager = userProfile?.role === 'branch_manager';
      if (isBranchManager && selectedBranch?.id) {
        supplierData.branchId = selectedBranch.id;
      } else if (chosenBranchId && chosenBranchId !== 'global') {
        supplierData.branchId = chosenBranchId;
      }

      if (formData.contactPerson.trim()) {
        supplierData.contactPerson = formData.contactPerson.trim();
      }
      if (formData.category.trim()) {
        supplierData.category = formData.category.trim();
      }
      if (formData.email.trim()) {
        supplierData.email = formData.email.trim();
      }
      if (formData.address.trim()) {
        supplierData.address = formData.address.trim();
      }
      if (formData.country.trim()) {
        supplierData.country = formData.country.trim();
      }

      await addDoc(collection(db, 'suppliers'), supplierData);
      toast.success(`Supplier "${formData.name.trim()}" added successfully!`);
      setFormData({
        name: '',
        phone: '',
        contactPerson: '',
        category: '',
        email: '',
        address: '',
        country: '',
        openingDue: 0,
      });
    } catch (error) {
      console.error('Add supplier error:', error);
      handleFirestoreError(error, OperationType.WRITE, 'suppliers');
      toast.error('Failed to add supplier. Please verify business permission.');
    } finally {
      setLoading(false);
    }
  };

  if (businesses.length === 0) {
    return (
      <div className="bg-[#1E293B] p-8 rounded-3xl border border-slate-800 shadow-xl text-center space-y-3">
        <AlertCircle size={32} className="mx-auto text-amber-500" />
        <p className="text-slate-200 font-bold">No Business Found</p>
        <p className="text-slate-400 text-xs">Please create or register a business first before adding suppliers.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-[#1E293B] p-6 rounded-3xl border border-emerald-500/20 shadow-xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-emerald-500">
          <UserPlus size={24} />
          <h2 className="text-lg font-black uppercase tracking-widest">Add New Supplier</h2>
        </div>
        {activeBusiness && (
          <span className="text-[11px] font-bold text-emerald-400 bg-emerald-950/40 px-3 py-1 rounded-full border border-emerald-500/30 flex items-center gap-1.5">
            <Building2 size={12} />
            {activeBusiness.name}
          </span>
        )}
      </div>

      {/* Target Business and Branch assignment */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isAllBusinessesSelected && businesses.length > 1 && (
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Target Business *</label>
            <select
              value={chosenBusinessId}
              onChange={(e) => setChosenBusinessId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm text-slate-200 focus:border-emerald-500 outline-none transition-all"
            >
              {businesses.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        )}

        {userProfile?.role !== 'branch_manager' && activeBranches.length > 0 && (
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Branch Scope</label>
            <select
              value={chosenBranchId}
              onChange={(e) => setChosenBranchId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm text-slate-200 focus:border-emerald-500 outline-none transition-all"
            >
              <option value="global">All Branches (Global Supplier)</option>
              {activeBranches.map(br => (
                <option key={br.id} value={br.id}>{br.name} ({br.branchCode || 'BR'})</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <InputGroup 
          label="Supplier / Company Name *" 
          value={formData.name} 
          onChange={(v) => setFormData({ ...formData, name: v as string })} 
          type="text" 
          maxLength={100} 
        />
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InputGroup 
            label="Phone Number *" 
            value={formData.phone} 
            onChange={(v) => setFormData({ ...formData, phone: v as string })} 
            type="text" 
            maxLength={30} 
          />
          <InputGroup 
            label="Contact Person" 
            value={formData.contactPerson} 
            onChange={(v) => setFormData({ ...formData, contactPerson: v as string })} 
            type="text" 
            maxLength={100} 
          />
          <InputGroup 
            label="Category / Goods Supplied" 
            value={formData.category} 
            onChange={(v) => setFormData({ ...formData, category: v as string })} 
            type="text" 
            maxLength={100} 
          />
          <InputGroup 
            label="Email Address" 
            value={formData.email} 
            onChange={(v) => setFormData({ ...formData, email: v as string })} 
            type="text" 
            maxLength={100} 
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InputGroup 
            label="Address" 
            value={formData.address} 
            onChange={(v) => setFormData({ ...formData, address: v as string })} 
            type="text" 
            maxLength={500} 
          />
          <InputGroup 
            label={`Opening / Previous Due (${activeBusiness?.currency || '$'})`} 
            value={formData.openingDue} 
            onChange={(v) => setFormData({ ...formData, openingDue: v as number })} 
            type="number" 
            min={0}
            max={1000000000}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg shadow-emerald-900/20 cursor-pointer"
      >
        {loading ? <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div> : <Save size={20} />}
        Add Supplier
      </button>
    </form>
  );
}

function RecentLogs({ logs, currency, branches, businesses, isAllBusinessesSelected }: { logs: PurchaseLog[]; currency: string; branches: Branch[]; businesses: Business[]; isAllBusinessesSelected: boolean }) {
  return (
    <div className="bg-[#1E293B] p-6 rounded-3xl border border-slate-800 shadow-xl">
      <div className="flex items-center gap-3 text-slate-400 mb-6">
        <History size={20} />
        <h3 className="text-xs font-black uppercase tracking-[0.2em]">Recent Purchase Logs</h3>
      </div>
      <div className="space-y-3">
        {logs.slice(0, 15).map(log => (
          <div key={log.id} className="p-4 bg-slate-900/50 rounded-2xl border border-slate-800 flex justify-between items-center">
            <div className="space-y-1">
              <p className="text-sm font-bold text-slate-200">{log.supplierName}</p>
              <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                <span>INV: {log.invoiceNumber}</span>
                <span className="text-slate-700">•</span>
                <span>{log.date ? format(new Date(log.date), 'MMM dd, yyyy') : 'Recent'}</span>
                {log.branchId && (
                  <>
                    <span className="text-slate-700">•</span>
                    <span className="text-blue-400">{branches.find(b => b.id === log.branchId)?.name || 'Branch'}</span>
                  </>
                )}
                {isAllBusinessesSelected && (
                  <>
                    <span className="text-slate-700">•</span>
                    <span className="text-amber-400">{businesses.find(b => b.id === log.businessId)?.name || 'Business'}</span>
                  </>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-black text-blue-400">{currency}{(log.billAmount || (log as any).amount || 0).toLocaleString()}</p>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Paid: {currency}{(log.paidAmount || 0).toLocaleString()}</p>
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

function SupplierDirectory({ suppliers, currency, businesses, branches, isAllBusinessesSelected }: { suppliers: Supplier[]; currency: string; businesses: Business[]; branches: Branch[]; isAllBusinessesSelected: boolean }) {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return suppliers;
    const term = searchTerm.toLowerCase();
    return suppliers.filter(s => 
      s.name.toLowerCase().includes(term) ||
      (s.phone && s.phone.includes(term)) ||
      (s.contactPerson && s.contactPerson.toLowerCase().includes(term)) ||
      (s.category && s.category.toLowerCase().includes(term))
    );
  }, [suppliers, searchTerm]);

  return (
    <div className="bg-[#1E293B] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-slate-400">
          <Truck size={20} />
          <h3 className="text-xs font-black uppercase tracking-[0.2em]">Supplier Directory ({filtered.length})</h3>
        </div>
        <div className="relative w-full sm:w-64">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search suppliers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:border-emerald-500 outline-none transition-all"
          />
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map(s => {
          const branchObj = s.branchId ? branches.find(b => b.id === s.branchId) : null;
          const businessObj = businesses.find(b => b.id === s.businessId);

          return (
            <div key={s.id} className="p-4 bg-slate-900/50 rounded-2xl border border-slate-800 flex justify-between items-center hover:border-slate-700 transition-all">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-slate-200">{s.name}</p>
                  {s.category && (
                    <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">
                      {s.category}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-500">
                  <span className="text-slate-400">{s.phone}</span>
                  {s.contactPerson && (
                    <>
                      <span className="text-slate-700">•</span>
                      <span>Contact: {s.contactPerson}</span>
                    </>
                  )}
                  {branchObj && (
                    <>
                      <span className="text-slate-700">•</span>
                      <span className="text-blue-400 flex items-center gap-1">
                        <MapPin size={10} />
                        {branchObj.name}
                      </span>
                    </>
                  )}
                  {isAllBusinessesSelected && businessObj && (
                    <>
                      <span className="text-slate-700">•</span>
                      <span className="text-amber-400">{businessObj.name}</span>
                    </>
                  )}
                </div>
                {s.address && (
                  <p className="text-[10px] text-slate-500 truncate max-w-xs sm:max-w-md">{s.address}</p>
                )}
              </div>
              <div className="text-right pl-4">
                <p className={cn("text-sm font-black", (s.totalDue || 0) > 0 ? "text-rose-400" : "text-emerald-400")}>
                  {currency}{(s.totalDue || 0).toLocaleString()}
                </p>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Due</p>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="p-8 text-center text-slate-500 font-bold uppercase tracking-widest text-xs">
            {searchTerm ? 'No suppliers match your search' : 'No suppliers added yet'}
          </div>
        )}
      </div>
    </div>
  );
}

function InputGroup({ 
  label, 
  value, 
  onChange, 
  readOnly, 
  type = "number", 
  color, 
  maxLength, 
  min, 
  max 
}: { 
  label: string; 
  value: string | number; 
  onChange?: (v: string | number) => void; 
  readOnly?: boolean; 
  type?: string; 
  color?: string; 
  maxLength?: number; 
  min?: number; 
  max?: number; 
}) {
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
          "w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm text-slate-200 focus:border-emerald-500 outline-none transition-all",
          readOnly && "opacity-60 cursor-not-allowed",
          color
        )}
      />
    </div>
  );
}
