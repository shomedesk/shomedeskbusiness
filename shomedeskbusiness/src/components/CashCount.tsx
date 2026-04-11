import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/src/lib/firebase';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { useBusiness } from '@/src/contexts/BusinessContext';
import { handleFirestoreError, OperationType } from '@/src/lib/firestore-utils';
import { CurrencyConfig, Denomination, CashCountRecord } from '@/src/types';
import { Banknote, Coins, Save, History, Plus, Trash2, Calculator, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { cn } from '@/src/lib/utils';

export default function CashCount() {
  const { selectedBusiness, selectedBranch, businesses, branches, isAllBusinessesSelected, userProfile } = useBusiness();
  const [currencyConfig, setCurrencyConfig] = useState<CurrencyConfig | null>(null);
  const [counts, setCounts] = useState<{ [key: string]: number }>({});
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<CashCountRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!selectedBusiness && !isAllBusinessesSelected) return;

    // Fetch currency config for this business's currency code
    // If all businesses, we might need a more complex way, but for now let's use the first business's currency or OMR
    const businessId = selectedBusiness?.id || (businesses.length > 0 ? businesses[0].id : null);
    const currencyCode = selectedBusiness?.currency || 'OMR';

    if (!businessId) return;

    const q = query(
      collection(db, 'currencyConfigs'),
      where('businessId', '==', businessId),
      where('code', '==', currencyCode)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        setCurrencyConfig({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as CurrencyConfig);
      } else {
        // Fallback to a default OMR config if none exists
        const defaultOMR: CurrencyConfig = {
          id: 'default-omr',
          code: 'OMR',
          name: 'Omani Rial',
          symbol: 'RO',
          businessId: businessId,
          ownerId: selectedBusiness?.ownerId || userProfile?.uid || '',
          createdAt: new Date(),
          denominations: [
            { id: 'n50', value: 50, label: '50 Rial', type: 'note' },
            { id: 'n20', value: 20, label: '20 Rial', type: 'note' },
            { id: 'n10', value: 10, label: '10 Rial', type: 'note' },
            { id: 'n5', value: 5, label: '5 Rial', type: 'note' },
            { id: 'n1', value: 1, label: '1 Rial', type: 'note' },
            { id: 'n05', value: 0.5, label: '500 Baisa', type: 'note' },
            { id: 'n025', value: 0.25, label: '250 Baisa', type: 'note' },
            { id: 'n01', value: 0.1, label: '100 Baisa', type: 'note' },
            { id: 'c050', value: 0.05, label: '50 Baisa', type: 'coin' },
            { id: 'c025', value: 0.025, label: '25 Baisa', type: 'coin' },
            { id: 'c010', value: 0.01, label: '10 Baisa', type: 'coin' },
            { id: 'c005', value: 0.005, label: '5 Baisa', type: 'coin' },
          ]
        };
        setCurrencyConfig(defaultOMR);
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'currencyConfigs');
    });

    return () => unsub();
  }, [selectedBusiness, isAllBusinessesSelected, businesses]);

  useEffect(() => {
    if (!selectedBusiness && !isAllBusinessesSelected) return;

    let unsub: () => void = () => {};

    if (isAllBusinessesSelected) {
      const businessIds = businesses.map(b => b.id);
      if (businessIds.length === 0) {
        setHistory([]);
        return;
      }

      const q = query(
        collection(db, 'cashCounts'),
        where('businessId', 'in', businessIds.slice(0, 10))
      );

      unsub = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as CashCountRecord));
        setHistory(list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'cashCounts');
      });
    } else if (selectedBranch) {
      const q = query(
        collection(db, 'cashCounts'),
        where('businessId', '==', selectedBusiness!.id),
        where('branchId', '==', selectedBranch.id)
      );

      unsub = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as CashCountRecord));
        setHistory(list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'cashCounts');
      });
    }

    return () => unsub();
  }, [selectedBusiness, selectedBranch, isAllBusinessesSelected, businesses]);

  const totalAmount = useMemo(() => {
    if (!currencyConfig) return 0;
    return currencyConfig.denominations.reduce((acc, den) => {
      const count = counts[den.id] || 0;
      return acc + (count * den.value);
    }, 0);
  }, [counts, currencyConfig]);

  const handleCountChange = (id: string, value: string) => {
    const num = parseInt(value) || 0;
    setCounts(prev => ({ ...prev, [id]: num }));
  };

  const handleSave = async () => {
    if (!selectedBusiness || !selectedBranch || !userProfile || !currencyConfig) return;
    if (totalAmount === 0) {
      toast.error('Total amount cannot be zero');
      return;
    }

    try {
      const record: CashCountRecord = {
        businessId: selectedBusiness.id,
        branchId: selectedBranch.id,
        ownerId: selectedBusiness.ownerId,
        userId: userProfile.uid,
        currencyId: currencyConfig.id,
        date: format(new Date(), 'yyyy-MM-dd'),
        counts,
        totalAmount,
        note,
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'cashCounts'), record);
      toast.success('Cash count saved successfully');
      setCounts({});
      setNote('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'cashCounts');
      toast.error('Failed to save cash count');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!selectedBranch) {
    return (
      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-12 text-center">
        <Calculator className="w-16 h-16 text-slate-700 mx-auto mb-4" />
        <h2 className="text-xl font-black text-slate-300">Select a Branch</h2>
        <p className="text-slate-500 mt-2">Please select a branch to perform cash counting.</p>
      </div>
    );
  }

  const notes = currencyConfig?.denominations.filter(d => d.type === 'note') || [];
  const coins = currencyConfig?.denominations.filter(d => d.type === 'coin') || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
            <Calculator className="text-blue-500" />
            Cash Denomination
          </h1>
          <p className="text-slate-500 font-medium mt-1">
            Count physical cash for <span className="text-blue-400">{selectedBranch.name}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all"
          >
            <History size={18} />
            {showHistory ? 'Back to Counter' : 'History'}
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold transition-all"
          >
            <Printer size={18} />
            Print
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {showHistory ? (
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-[#1E293B] border border-slate-800 rounded-3xl overflow-hidden"
          >
            <div className="p-6 border-b border-slate-800 bg-slate-900/50">
              <h2 className="text-lg font-black text-white">Counting History</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-900/30 border-b border-slate-800">
                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Date</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Location</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Amount</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Note</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                    {history.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-500 font-bold italic">
                          No history found
                        </td>
                      </tr>
                    ) : (
                      history.map((record) => (
                        <tr key={record.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="px-6 py-4">
                            <p className="text-sm font-bold text-slate-200">{format(record.createdAt?.toDate() || new Date(), 'dd MMM yyyy')}</p>
                            <p className="text-[10px] font-bold text-slate-500">{format(record.createdAt?.toDate() || new Date(), 'hh:mm a')}</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm font-bold text-blue-400">{branches.find(b => b.id === record.branchId)?.name || 'Branch'}</p>
                            {isAllBusinessesSelected && (
                              <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">
                                {businesses.find(b => b.id === record.businessId)?.name || 'Business'}
                              </p>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm font-black text-blue-400">
                              {currencyConfig?.symbol} {record.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 3 })}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-xs text-slate-400 truncate max-w-[200px]">{record.note || '-'}</p>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button className="text-blue-500 hover:text-blue-400 text-xs font-bold">View Details</button>
                          </td>
                        </tr>
                      ))
                    )}
                </tbody>
              </table>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="counter"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            {/* Notes Section */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-[#1E293B] border border-slate-800 rounded-3xl p-6 shadow-xl print:border-none print:shadow-none">
                <div className="flex items-center gap-3 mb-6 border-b border-slate-800 pb-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                    <Banknote size={24} />
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-white">Banknotes</h2>
                    <p className="text-xs text-slate-500 font-bold">Enter quantity for each note</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {notes.map((den) => (
                    <DenominationInput
                      key={den.id}
                      denomination={den}
                      count={counts[den.id] || 0}
                      onChange={(val) => handleCountChange(den.id, val)}
                      symbol={currencyConfig?.symbol || ''}
                      isAccountant={userProfile?.role === 'accountant'}
                    />
                  ))}
                </div>

                {coins.length > 0 && (
                  <>
                    <div className="flex items-center gap-3 mt-10 mb-6 border-b border-slate-800 pb-4">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                        <Coins size={24} />
                      </div>
                      <div>
                        <h2 className="text-lg font-black text-white">Coins</h2>
                        <p className="text-xs text-slate-500 font-bold">Enter quantity for each coin</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {coins.map((den) => (
                        <DenominationInput
                          key={den.id}
                          denomination={den}
                          count={counts[den.id] || 0}
                          onChange={(val) => handleCountChange(den.id, val)}
                          symbol={currencyConfig?.symbol || ''}
                          isAccountant={userProfile?.role === 'accountant'}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Summary Section */}
            <div className="space-y-6">
              <div className="bg-blue-600 rounded-3xl p-8 shadow-2xl shadow-blue-900/40 text-white sticky top-24">
                <p className="text-blue-100 text-xs font-black uppercase tracking-widest mb-2">Total Cash Amount</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-blue-200">{currencyConfig?.symbol}</span>
                  <h3 className="text-5xl font-black tracking-tighter">
                    {totalAmount.toLocaleString(undefined, { minimumFractionDigits: 3 })}
                  </h3>
                </div>

                <div className="mt-8 space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-blue-200 uppercase tracking-widest ml-1">Remarks / Note</label>
                    <textarea
                      value={note}
                      maxLength={1000}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Add any notes here..."
                      className="w-full bg-blue-700/50 border border-blue-400/30 rounded-2xl p-4 text-sm font-bold placeholder:text-blue-300/50 outline-none focus:border-white transition-all mt-1 min-h-[100px]"
                    />
                  </div>

                  {userProfile?.role !== 'accountant' && (
                    <button
                      onClick={handleSave}
                      disabled={totalAmount === 0}
                      className="w-full bg-white text-blue-600 hover:bg-blue-50 py-4 rounded-2xl font-black flex items-center justify-center gap-2 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Save size={20} />
                      Save Record
                    </button>
                  )}
                  
                  {userProfile?.role !== 'accountant' && (
                    <button
                      onClick={() => setCounts({})}
                      className="w-full bg-blue-700/50 hover:bg-blue-700 text-white py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
                    >
                      <Trash2 size={16} />
                      Clear All
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6">
                <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Quick Summary</h4>
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-400 font-bold">Notes Total</span>
                    <span className="text-slate-200 font-black">
                      {currencyConfig?.symbol} {notes.reduce((acc, den) => acc + ((counts[den.id] || 0) * den.value), 0).toLocaleString(undefined, { minimumFractionDigits: 3 })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-400 font-bold">Coins Total</span>
                    <span className="text-slate-200 font-black">
                      {currencyConfig?.symbol} {coins.reduce((acc, den) => acc + ((counts[den.id] || 0) * den.value), 0).toLocaleString(undefined, { minimumFractionDigits: 3 })}
                    </span>
                  </div>
                  <div className="h-px bg-slate-800 my-2" />
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-400 font-bold">Total Items</span>
                    <span className="text-slate-200 font-black">
                      {Object.values(counts).reduce((acc, val) => acc + val, 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DenominationInput({ 
  denomination, 
  count, 
  onChange, 
  symbol,
  isAccountant
}: { 
  denomination: Denomination; 
  count: number; 
  onChange: (val: string) => void;
  symbol: string;
  isAccountant: boolean;
}) {
  const total = count * denomination.value;

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex items-center gap-4 hover:border-blue-500/50 transition-all group">
      <div className="flex-1">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{denomination.label}</p>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400">{denomination.value.toLocaleString()} x</span>
          <input
            type="number"
            value={count || ''}
            min={0}
            max={1000000}
            onChange={(e) => onChange(e.target.value)}
            disabled={isAccountant}
            placeholder="0"
            className={cn(
              "w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-sm font-black text-white outline-none focus:border-blue-500 transition-all",
              isAccountant && "opacity-50 cursor-not-allowed"
            )}
          />
        </div>
      </div>
      <div className="text-right">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Subtotal</p>
        <p className={cn(
          "text-sm font-black transition-all",
          total > 0 ? "text-blue-400" : "text-slate-600"
        )}>
          {symbol} {total.toLocaleString(undefined, { minimumFractionDigits: 3 })}
        </p>
      </div>
    </div>
  );
}
