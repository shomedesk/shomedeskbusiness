import React, { useState, useEffect } from 'react';
import { db } from '@/src/lib/firebase';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { useBusiness } from '@/src/contexts/BusinessContext';
import { Transaction, DailyReport, PurchaseLog, Supplier } from '@/src/types';
import { handleFirestoreError, OperationType } from '@/src/lib/firestore-utils';
import { format, startOfMonth, endOfMonth, parseISO, isWithinInterval } from 'date-fns';
import { FileDown, Search, Calendar, Filter, Download, Table as TableIcon, TrendingUp, TrendingDown, Landmark, Wallet, Printer } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { currencyService } from '@/src/services/currencyService';

type ReportType = 'transactions' | 'dailyReports' | 'purchases' | 'suppliers';

export default function Reports() {
  const { selectedBusiness, selectedBranch, branches, isAllBusinessesSelected, businesses } = useBusiness();
  const [reportType, setReportType] = useState<ReportType>('transactions');
  const [dateRange, setDateRange] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd'),
  });
  const [filterBranchId, setFilterBranchId] = useState<string>('all');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedBranch) {
      setFilterBranchId(selectedBranch.id);
    } else {
      setFilterBranchId('all');
    }
  }, [selectedBranch]);

  const fetchData = async () => {
    if (!selectedBusiness && !isAllBusinessesSelected) return;
    setLoading(true);
    try {
      let results: any[] = [];
      
      if (isAllBusinessesSelected) {
        // Fetch data for all businesses
        const businessIds = businesses.map(b => b.id);
        if (businessIds.length === 0) {
          setData([]);
          setLoading(false);
          return;
        }

        // Firestore 'in' query limit is 10
        const chunks = [];
        for (let i = 0; i < businessIds.length; i += 10) {
          chunks.push(businessIds.slice(i, i + 10));
        }

        const allDocs: any[] = [];
        for (const chunk of chunks) {
          const collectionName = reportType === 'purchases' ? 'purchaseLogs' : reportType;
          let q = query(collection(db, collectionName), where('businessId', 'in', chunk));
          if (filterBranchId !== 'all') {
            q = query(q, where('branchId', '==', filterBranchId));
          }
          const snapshot = await getDocs(q);
          allDocs.push(...snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }
        results = allDocs;

        // Apply currency conversion to INR for consolidated view
        results = await Promise.all(results.map(async (item) => {
          const biz = businesses.find(b => b.id === item.businessId);
          const fromCurrency = biz?.currency || 'USD';
          
          if (reportType === 'transactions') {
            const convertedAmount = await currencyService.convert(item.amount, fromCurrency, 'INR');
            return { ...item, amount: convertedAmount, originalAmount: item.amount, originalCurrency: fromCurrency };
          } else if (reportType === 'dailyReports') {
            const [cCash, cBank, oCash, oBank, cSale, bSale, cExp, bExp] = await Promise.all([
              currencyService.convert(item.closingCash, fromCurrency, 'INR'),
              currencyService.convert(item.closingBank, fromCurrency, 'INR'),
              currencyService.convert(item.openingCash, fromCurrency, 'INR'),
              currencyService.convert(item.openingBank, fromCurrency, 'INR'),
              currencyService.convert(item.cashSale, fromCurrency, 'INR'),
              currencyService.convert(item.bankSale, fromCurrency, 'INR'),
              currencyService.convert(item.cashExpense, fromCurrency, 'INR'),
              currencyService.convert(item.bankExpense, fromCurrency, 'INR'),
            ]);
            return { 
              ...item, 
              closingCash: cCash, closingBank: cBank,
              openingCash: oCash, openingBank: oBank,
              cashSale: cSale, bankSale: bSale,
              cashExpense: cExp, bankExpense: bExp,
              originalCurrency: fromCurrency 
            };
          } else if (reportType === 'purchases') {
            const [bill, paid, due] = await Promise.all([
              currencyService.convert(item.billAmount, fromCurrency, 'INR'),
              currencyService.convert(item.paidAmount, fromCurrency, 'INR'),
              currencyService.convert(item.netDue, fromCurrency, 'INR'),
            ]);
            return { ...item, billAmount: bill, paidAmount: paid, netDue: due, originalCurrency: fromCurrency };
          } else if (reportType === 'suppliers') {
            const due = await currencyService.convert(item.totalDue, fromCurrency, 'INR');
            return { ...item, totalDue: due, originalCurrency: fromCurrency };
          }
          return item;
        }));
      } else {
        // Fetch data for selected business
        const collectionName = reportType === 'purchases' ? 'purchaseLogs' : reportType;
        let q = query(collection(db, collectionName), where('businessId', '==', selectedBusiness!.id));
        
        if (filterBranchId !== 'all') {
          q = query(q, where('branchId', '==', filterBranchId));
        }

        const snapshot = await getDocs(q);
        results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      }

      // Client-side date filtering for better flexibility
      if (reportType !== 'suppliers') {
        results = results.filter((item: any) => {
          const itemDate = parseISO(item.date);
          return isWithinInterval(itemDate, {
            start: parseISO(dateRange.start),
            end: parseISO(dateRange.end),
          });
        });
        
        // Sort by date desc
        results.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      }

      setData(results);
    } catch (error) {
      const collectionName = reportType === 'purchases' ? 'purchaseLogs' : reportType;
      handleFirestoreError(error, OperationType.GET, collectionName);
      toast.error('Failed to fetch report data');
    } finally {
      setLoading(false);
    }
  };

  const printReport = () => {
    if (data.length === 0) {
      toast.error('No data to print');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Pop-up blocked! Please allow pop-ups to print the report.');
      return;
    }

    const reportContent = document.getElementById('report-table-container')?.innerHTML;
    const businessName = isAllBusinessesSelected ? 'Consolidated Business Report' : (selectedBusiness?.name || 'Business Report');
    const reportTitle = `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report`;

    printWindow.document.write(`
      <html>
        <head>
          <title>${businessName} - ${reportTitle}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
            body { 
              font-family: 'Inter', sans-serif; 
              padding: 40px; 
              color: #000;
              background: #fff;
            }
            .header { margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 20px; }
            .header h1 { margin: 0; font-size: 24px; font-weight: 900; text-transform: uppercase; letter-spacing: -1px; }
            .header p { margin: 5px 0 0; color: #666; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { 
              background: #f8fafc; 
              text-align: left; 
              padding: 12px; 
              font-size: 10px; 
              font-weight: 900; 
              text-transform: uppercase; 
              letter-spacing: 1px;
              border-bottom: 2px solid #e2e8f0;
              color: #64748b;
            }
            td { 
              padding: 12px; 
              font-size: 12px; 
              border-bottom: 1px solid #f1f5f9;
              color: #1e293b;
              font-weight: 500;
            }
            .text-right { text-align: right; }
            .footer { margin-top: 40px; font-size: 10px; color: #94a3b8; text-align: center; font-weight: 700; text-transform: uppercase; }
            @media print {
              body { padding: 0; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${businessName}</h1>
            <p>${reportTitle} | ${dateRange.start} to ${dateRange.end} ${isAllBusinessesSelected ? '(All amounts in INR)' : ''}</p>
          </div>
          ${reportContent}
          <div class="footer">
            Generated on ${new Date().toLocaleString()} | ${businessName} Management System
          </div>
          <script>
            window.onload = () => {
              window.print();
              setTimeout(() => window.close(), 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const exportToCSV = () => {
    if (data.length === 0) {
      toast.error('No data to export');
      return;
    }

    try {
      const headers = reportType === 'transactions' 
        ? ['Date', 'Business', 'Branch', 'Type', 'Category', 'Amount', 'Description', 'From Account', 'To Account']
        : reportType === 'dailyReports'
        ? ['Date', 'Business', 'Branch', 'Opening Cash', 'Opening Bank', 'Cash Sale', 'Bank Sale', 'Cash Expense', 'Bank Expense', 'Closing Cash', 'Closing Bank', 'Note']
        : reportType === 'purchases'
        ? ['Date', 'Business', 'Branch', 'Supplier', 'Invoice', 'Bill Amount', 'Paid Amount', 'Net Due']
        : ['Business', 'Supplier Name', 'Contact', 'Phone', 'Email', 'Total Due'];

      const csvRows = [headers.join(',')];

      data.forEach(item => {
        const businessName = businesses.find(b => b.id === item.businessId)?.name || 'N/A';
        const branchName = branches.find(b => b.id === item.branchId)?.name || 'N/A';
        const dateStr = item.date ? format(parseISO(item.date), 'yyyy-MM-dd') : 'N/A';
        
        let row: any[] = [];
        if (reportType === 'transactions') {
          row = [
            dateStr,
            businessName,
            branchName,
            item.type || '',
            item.category || '',
            item.amount || 0,
            `"${(item.description || '').replace(/"/g, '""')}"`,
            item.fromAccount || 'N/A',
            item.toAccount || 'N/A'
          ];
        } else if (reportType === 'dailyReports') {
          row = [
            dateStr,
            businessName,
            branchName,
            item.openingCash || 0,
            item.openingBank || 0,
            item.cashSale || 0,
            item.bankSale || 0,
            item.cashExpense || 0,
            item.bankExpense || 0,
            item.closingCash || 0,
            item.closingBank || 0,
            `"${(item.note || '').replace(/"/g, '""')}"`
          ];
        } else if (reportType === 'purchases') {
          row = [
            dateStr,
            businessName,
            branchName,
            item.supplierName || '',
            item.invoiceNumber || '',
            item.billAmount || 0,
            item.paidAmount || 0,
            item.netDue || 0
          ];
        } else {
          row = [
            businessName,
            item.name || '',
            item.contactPerson || '',
            item.phone || '',
            item.email || '',
            item.totalDue || 0
          ];
        }
        csvRows.push(row.join(','));
      });

      const csvString = csvRows.join('\n');
      const blob = new Blob(['\ufeff' + csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const fileName = `${reportType}_report_${dateRange.start}_to_${dateRange.end}.csv`;
      
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('CSV Report exported successfully');
    } catch (error) {
      console.error('CSV Export error:', error);
      toast.error('Failed to export CSV file');
    }
  };

  const exportToExcel = () => {
    if (data.length === 0) {
      toast.error('No data to export');
      return;
    }

    try {
      const cleanedData = data.map(item => {
        // Clean up data for export - ensure only primitives
        const { id, businessId, ownerId, branchId, createdAt, ...rest } = item;
        const businessName = businesses.find(b => b.id === businessId)?.name || 'N/A';
        const branchName = branches.find(b => b.id === branchId)?.name || 'N/A';
        
        const row: any = {
          'Date': item.date ? format(parseISO(item.date), 'yyyy-MM-dd') : 'N/A',
          'Business': businessName,
          'Branch': branchName,
        };

        // Add specific fields based on report type for better formatting
        if (reportType === 'transactions') {
          row['Type'] = item.type || '';
          row['Category'] = item.category || '';
          row['Amount'] = Number(item.amount) || 0;
          row['Description'] = item.description || '';
          row['From Account'] = item.fromAccount || 'N/A';
          row['To Account'] = item.toAccount || 'N/A';
        } else if (reportType === 'dailyReports') {
          row['Opening Cash'] = Number(item.openingCash) || 0;
          row['Opening Bank'] = Number(item.openingBank) || 0;
          row['Cash Sale'] = Number(item.cashSale) || 0;
          row['Bank Sale'] = Number(item.bankSale) || 0;
          row['Cash Expense'] = Number(item.cashExpense) || 0;
          row['Bank Expense'] = Number(item.bankExpense) || 0;
          row['Closing Cash'] = Number(item.closingCash) || 0;
          row['Closing Bank'] = Number(item.closingBank) || 0;
          row['Note'] = item.note || '';
        } else if (reportType === 'purchases') {
          row['Supplier'] = item.supplierName || '';
          row['Invoice'] = item.invoiceNumber || '';
          row['Bill Amount'] = Number(item.billAmount) || 0;
          row['Paid Amount'] = Number(item.paidAmount) || 0;
          row['Net Due'] = Number(item.netDue) || 0;
        } else if (reportType === 'suppliers') {
          row['Supplier Name'] = item.name || '';
          row['Contact'] = item.contactPerson || '';
          row['Phone'] = item.phone || '';
          row['Email'] = item.email || '';
          row['Total Due'] = Number(item.totalDue) || 0;
        } else {
          // Fallback for any other fields
          Object.keys(rest).forEach(key => {
            const val = (rest as any)[key];
            if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
              row[key] = val;
            } else if (val === null || val === undefined) {
              row[key] = '';
            } else if (val instanceof Date) {
              row[key] = format(val, 'yyyy-MM-dd');
            } else {
              try {
                row[key] = JSON.stringify(val);
              } catch (e) {
                row[key] = String(val);
              }
            }
          });
        }

        return row;
      });

      const worksheet = XLSX.utils.json_to_sheet(cleanedData);
      const workbook = XLSX.utils.book_new();
      
      // Clean sheet name (remove invalid characters)
      const safeSheetName = reportType.replace(/[\[\]\*\?\/\\\:]/g, '').substring(0, 31) || 'Report';
      XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName);
      
      const fileName = `${reportType}_report_${dateRange.start}_to_${dateRange.end}.xlsx`;
      
      // Use a more robust download method for browser environments
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('Report exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export Excel file. Please try again.');
    }
  };

  const currency = isAllBusinessesSelected ? '₹' : (selectedBusiness?.currency || '$');

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-2">
            <FileDown className="text-blue-500" />
            Business Reports
          </h2>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">
            {isAllBusinessesSelected ? 'Consolidated view across all businesses (INR)' : 'Generate and export detailed business insights'}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          {data.length === 0 && (
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mr-2 animate-pulse">
              Generate report to enable exports
            </span>
          )}
          <button
            onClick={printReport}
            disabled={data.length === 0}
            className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-xs transition-all flex items-center gap-2 shadow-lg shadow-slate-900/20"
          >
            <Printer size={18} />
            Print Report
          </button>
          <button
            onClick={exportToCSV}
            disabled={data.length === 0}
            className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-xs transition-all flex items-center gap-2 shadow-lg shadow-slate-900/20"
          >
            <FileDown size={18} />
            Export to CSV
          </button>
          <button
            onClick={exportToExcel}
            disabled={data.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-xs transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/20"
          >
            <Download size={18} />
            Export to Excel
          </button>
        </div>
      </div>

      <div className="bg-[#1E293B] p-6 rounded-3xl border border-slate-800 shadow-xl space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Report Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportType)}
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 text-white focus:border-blue-500 outline-none transition-all font-bold"
            >
              <option value="transactions">Transactions (Income/Expense)</option>
              <option value="dailyReports">Daily Closing Reports</option>
              <option value="purchases">Supplier Purchase Logs</option>
              <option value="suppliers">Supplier Directory</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Branch</label>
            <select
              value={filterBranchId}
              onChange={(e) => setFilterBranchId(e.target.value)}
              disabled={!!selectedBranch}
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 text-white focus:border-blue-500 outline-none transition-all font-bold disabled:opacity-50"
            >
              <option value="all">All Branches</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Start Date</label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 text-white focus:border-blue-500 outline-none transition-all font-bold"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">End Date</label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 text-white focus:border-blue-500 outline-none transition-all font-bold"
            />
          </div>
        </div>

        <button
          onClick={fetchData}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black py-4 px-6 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg shadow-blue-900/20"
        >
          {loading ? <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div> : <Search size={20} />}
          Generate Report
        </button>
      </div>

      {data.length > 0 && (
        <div className="bg-[#1E293B] rounded-3xl border border-slate-800 shadow-xl overflow-hidden">
          <div className="p-6 border-b border-slate-800 flex justify-between items-center">
            <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
              <TableIcon size={18} className="text-blue-500" />
              Report Results ({data.length})
            </h3>
          </div>
          <div id="report-table-container" className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/50">
                  <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">Date</th>
                  {isAllBusinessesSelected && <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">Business</th>}
                  <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">Branch</th>
                  {reportType === 'transactions' && (
                    <>
                      <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">Type</th>
                      <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">Category</th>
                      <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800 text-right">Amount</th>
                    </>
                  )}
                  {reportType === 'dailyReports' && (
                    <>
                      <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800 text-right">Closing Cash</th>
                      <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800 text-right">Closing Bank</th>
                    </>
                  )}
                  {reportType === 'purchases' && (
                    <>
                      <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">Supplier</th>
                      <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800 text-right">Bill</th>
                      <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800 text-right">Paid</th>
                      <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800 text-right">Net Due</th>
                    </>
                  )}
                  {reportType === 'suppliers' && (
                    <>
                      <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">Supplier Name</th>
                      <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">Phone</th>
                      <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800 text-right">Total Due</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {data.map((item, idx) => (
                  <tr key={item.id || idx} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-4 text-xs font-bold text-slate-400">
                      {item.date ? format(parseISO(item.date), 'MMM dd, yyyy') : 'N/A'}
                    </td>
                    {isAllBusinessesSelected && (
                      <td className="p-4 text-xs font-black text-indigo-400 uppercase tracking-tight">
                        {businesses.find(b => b.id === item.businessId)?.name || 'N/A'}
                      </td>
                    )}
                    <td className="p-4 text-xs font-black text-white uppercase tracking-tight">
                      {branches.find(b => b.id === item.branchId)?.name || 'N/A'}
                    </td>
                    {reportType === 'transactions' && (
                      <>
                        <td className="p-4">
                          <span className={cn(
                            "text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest",
                            item.type === 'income' ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                          )}>
                            {item.type}
                          </span>
                        </td>
                        <td className="p-4 text-xs font-bold text-slate-400">{item.category}</td>
                        <td className="p-4 text-sm font-black text-white text-right">{currency}{item.amount.toLocaleString()}</td>
                      </>
                    )}
                    {reportType === 'dailyReports' && (
                      <>
                        <td className="p-4 text-sm font-black text-emerald-400 text-right">{currency}{item.closingCash.toLocaleString()}</td>
                        <td className="p-4 text-sm font-black text-blue-400 text-right">{currency}{item.closingBank.toLocaleString()}</td>
                      </>
                    )}
                    {reportType === 'purchases' && (
                      <>
                        <td className="p-4 text-xs font-bold text-white">{item.supplierName}</td>
                        <td className="p-4 text-sm font-black text-white text-right">{currency}{item.billAmount.toLocaleString()}</td>
                        <td className="p-4 text-sm font-black text-emerald-400 text-right">{currency}{item.paidAmount.toLocaleString()}</td>
                        <td className="p-4 text-sm font-black text-rose-400 text-right">{currency}{item.netDue.toLocaleString()}</td>
                      </>
                    )}
                    {reportType === 'suppliers' && (
                      <>
                        <td className="p-4 text-xs font-bold text-white">{item.name}</td>
                        <td className="p-4 text-xs font-bold text-slate-400">{item.phone}</td>
                        <td className="p-4 text-sm font-black text-rose-400 text-right">{currency}{item.totalDue.toLocaleString()}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
