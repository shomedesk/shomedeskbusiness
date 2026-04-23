import React, { useState, useEffect } from 'react';
import { db, auth } from '@/src/lib/firebase';
import { collection, query, where, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { DailyReport } from '@/src/types';
import { TrendingUp, TrendingDown, Wallet, Landmark, ArrowUpRight, ArrowDownRight, Shield, AlertTriangle, Clock } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { format, differenceInDays, parseISO } from 'date-fns';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useBusiness } from '@/src/contexts/BusinessContext';
import { handleFirestoreError, OperationType } from '@/src/lib/firestore-utils';

import { currencyService } from '@/src/services/currencyService';

interface BranchDocument {
  id: string;
  name: string;
  documentNumber: string;
  nextRenewalDate: string;
  branchId: string;
}

export default function Dashboard() {
  const { selectedBusiness, isAllBusinessesSelected, businesses, selectedBranch, selectedService } = useBusiness();
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [expiringDocs, setExpiringDocs] = useState<BranchDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.currentUser || (!selectedBusiness && !isAllBusinessesSelected)) return;

    // Fetch expiring documents
    let docQ;
    if (isAllBusinessesSelected) {
      if (businesses.length > 0) {
        docQ = query(collection(db, 'branchDocuments'), where('businessId', 'in', businesses.map(b => b.id).slice(0, 10)));
      }
    } else {
      docQ = query(collection(db, 'branchDocuments'), where('businessId', '==', selectedBusiness!.id));
      if (selectedBranch) {
        docQ = query(docQ, where('branchId', '==', selectedBranch.id));
      }
    }

    let unsubDocs = () => {};
    if (docQ) {
      unsubDocs = onSnapshot(docQ, (snapshot) => {
        const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as BranchDocument));
        const expiring = docs.filter(d => {
          const days = differenceInDays(parseISO(d.nextRenewalDate), new Date());
          return days <= 30;
        });
        setExpiringDocs(expiring.sort((a, b) => a.nextRenewalDate.localeCompare(b.nextRenewalDate)));
      });
    }

    let q;
    if (isAllBusinessesSelected) {
      if (businesses.length === 0) {
        setLoading(false);
        return;
      }
      q = query(
        collection(db, 'dailyReports'),
        where('businessId', 'in', businesses.map(b => b.id).slice(0, 10)),
        orderBy('date', 'desc'),
        limit(100)
      );
    } else if (selectedBranch) {
      q = query(
        collection(db, 'dailyReports'),
        where('businessId', '==', selectedBusiness!.id),
        where('branchId', '==', selectedBranch.id),
        orderBy('date', 'desc'),
        limit(30)
      );
    } else if (selectedService) {
      q = query(
        collection(db, 'dailyReports'),
        where('businessId', '==', selectedBusiness!.id),
        where('serviceId', '==', selectedService.id),
        orderBy('date', 'desc'),
        limit(30)
      );
    } else {
      q = query(
        collection(db, 'dailyReports'),
        where('businessId', '==', selectedBusiness!.id),
        orderBy('date', 'desc'),
        limit(30)
      );
    }

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const rawData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DailyReport));
      
      // If all businesses selected, convert to INR
      let data = rawData;
      if (isAllBusinessesSelected) {
        data = await Promise.all(rawData.map(async (report) => {
          const business = businesses.find(b => b.id === report.businessId);
          const currency = business?.currency || 'INR';
          
          return {
            ...report,
            cashSale: await currencyService.convertToINR(report.cashSale, currency),
            bankSale: await currencyService.convertToINR(report.bankSale, currency),
            cashExpense: await currencyService.convertToINR(report.cashExpense, currency),
            bankExpense: await currencyService.convertToINR(report.bankExpense, currency),
            closingCash: await currencyService.convertToINR(report.closingCash, currency),
            closingBank: await currencyService.convertToINR(report.closingBank, currency),
          };
        }));
      }

      if (!selectedBranch || isAllBusinessesSelected) {
        // Aggregate reports by date
        const aggregated: { [date: string]: DailyReport } = {};
        data.forEach(report => {
          const date = report.date.split('T')[0];
          if (!aggregated[date]) {
            aggregated[date] = { ...report };
          } else {
            aggregated[date].cashSale += report.cashSale;
            aggregated[date].bankSale += report.bankSale;
            aggregated[date].cashExpense += report.cashExpense;
            aggregated[date].bankExpense += report.bankExpense;
            aggregated[date].closingCash += report.closingCash;
            aggregated[date].closingBank += report.closingBank;
          }
        });
        setReports(Object.values(aggregated).sort((a, b) => b.date.localeCompare(a.date)));
      } else {
        setReports(data);
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'dailyReports');
      setLoading(false);
    });

    return () => {
      unsubscribe();
      unsubDocs();
    };
  }, [selectedBusiness, isAllBusinessesSelected, businesses, selectedBranch]);

  const latestReport = reports[0];
  const profit = latestReport ? (latestReport.cashSale + latestReport.bankSale) - (latestReport.cashExpense + latestReport.bankExpense) : 0;
  const currency = isAllBusinessesSelected ? '₹' : (selectedBusiness?.currency || '$');

  const chartData = reports.slice().reverse().map(r => ({
    date: format(new Date(r.date), 'MMM dd'),
    profit: (r.cashSale + r.bankSale) - (r.cashExpense + r.bankExpense),
    cash: r.closingCash,
    bank: r.closingBank
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {expiringDocs.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 p-4 md:p-6 rounded-2xl md:rounded-3xl">
          <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
            <div className="p-1.5 md:p-2 bg-amber-500/20 rounded-lg md:rounded-xl text-amber-500">
              <AlertTriangle size={16} className="md:w-5 md:h-5" />
            </div>
            <div>
              <h3 className="text-[10px] md:text-sm font-black text-amber-500 uppercase tracking-widest">Renewal Alerts</h3>
              <p className="text-[8px] md:text-[10px] text-amber-500/70 font-bold uppercase tracking-widest">Documents expiring within 30 days</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {expiringDocs.map(doc => {
              const days = differenceInDays(parseISO(doc.nextRenewalDate), new Date());
              return (
                <div key={doc.id} className="bg-slate-900/50 p-3 md:p-4 rounded-xl md:rounded-2xl border border-amber-500/10 flex justify-between items-center">
                  <div className="overflow-hidden">
                    <p className="text-[10px] md:text-xs font-black text-white uppercase tracking-tight truncate">{doc.name}</p>
                    <p className="text-[8px] md:text-[10px] font-bold text-slate-500 uppercase tracking-widest truncate">ID: {doc.documentNumber}</p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <p className={cn("text-[10px] md:text-xs font-black", days < 0 ? "text-red-500" : "text-amber-500")}>
                      {days < 0 ? 'EXPIRED' : `${days}d`}
                    </p>
                    <p className="text-[8px] md:text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      {format(parseISO(doc.nextRenewalDate), 'MMM dd')}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          label="Profit / Loss"
          value={profit}
          currency={currency}
          icon={profit >= 0 ? <TrendingUp size={16} className="md:w-5 md:h-5" /> : <TrendingDown size={16} className="md:w-5 md:h-5" />}
          color={profit >= 0 ? "text-emerald-400" : "text-rose-400"}
          bg="bg-emerald-500/10"
          border="border-emerald-500/20"
        />
        <StatCard
          label="Cash in Hand"
          value={latestReport?.closingCash || 0}
          currency={currency}
          icon={<Wallet size={16} className="md:w-5 md:h-5" />}
          color="text-amber-400"
          bg="bg-amber-500/10"
          border="border-amber-500/20"
        />
        <StatCard
          label="Bank Balance"
          value={latestReport?.closingBank || 0}
          currency={currency}
          icon={<Landmark size={16} className="md:w-5 md:h-5" />}
          color="text-blue-400"
          bg="bg-blue-500/10"
          border="border-blue-500/20"
        />
        <StatCard
          label="Total Liquidity"
          value={(latestReport?.closingCash || 0) + (latestReport?.closingBank || 0)}
          currency={currency}
          icon={<ArrowUpRight size={16} className="md:w-5 md:h-5" />}
          color="text-indigo-400"
          bg="bg-indigo-500/10"
          border="border-indigo-500/20"
        />
      </div>

      <div className="bg-[#1E293B] p-4 md:p-6 rounded-2xl md:rounded-3xl border border-slate-800 shadow-xl">
        <h3 className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4 md:mb-6">Profit Trend (30 Days)</h3>
        <div className="h-48 md:h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
              <XAxis dataKey="date" stroke="#64748B" fontSize={8} tickLine={false} axisLine={false} />
              <YAxis stroke="#64748B" fontSize={8} tickLine={false} axisLine={false} tickFormatter={(v) => `${currency}${v >= 1000 ? (v/1000).toFixed(1)+'k' : v}`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '12px', fontSize: '10px' }}
                itemStyle={{ color: '#F8FAFC' }}
              />
              <Area type="monotone" dataKey="profit" stroke="#3B82F6" strokeWidth={2} fillOpacity={1} fill="url(#colorProfit)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-[#1E293B] p-4 md:p-6 rounded-2xl md:rounded-3xl border border-slate-800 shadow-xl">
        <h3 className="text-[10px] md:text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-3 md:mb-4">Recent Activity</h3>
        <div className="space-y-2 md:space-y-4">
          {reports.slice(0, 5).map((r) => (
            <div key={r.id} className="flex justify-between items-center p-2.5 md:p-3 bg-slate-900/50 rounded-xl md:rounded-2xl border border-slate-800">
              <div>
                <p className="text-xs md:text-sm font-bold text-slate-200">{format(new Date(r.date), 'MMM dd, yyyy')}</p>
                <p className="text-[8px] md:text-[10px] font-bold text-slate-500 uppercase tracking-wider">Daily Report Submitted</p>
              </div>
              <div className="text-right">
                <p className={cn("text-xs md:text-sm font-black", (r.cashSale + r.bankSale - r.cashExpense - r.bankExpense) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                  {currency}{(r.cashSale + r.bankSale - r.cashExpense - r.bankExpense).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
          {reports.length === 0 && (
            <div className="p-8 md:p-12 text-center text-slate-500 font-bold uppercase tracking-widest text-[10px] md:text-xs">
              No recent activity
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, currency, icon, color, bg, border }: { label: string; value: number; currency: string; icon: React.ReactNode; color: string; bg: string; border: string }) {
  return (
    <div className={cn("p-3 md:p-5 rounded-2xl md:rounded-3xl border shadow-lg transition-all hover:scale-[1.02]", bg, border)}>
      <div className={cn("mb-2 md:mb-3 p-1.5 md:p-2 w-fit rounded-lg md:rounded-xl bg-white/5", color)}>
        {icon}
      </div>
      <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5 md:mb-1">{label}</p>
      <p className={cn("text-sm md:text-xl font-black tracking-tight", color)}>
        {currency}{value.toLocaleString()}
      </p>
    </div>
  );
}
