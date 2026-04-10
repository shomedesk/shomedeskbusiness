import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/src/lib/firebase';
import { Toaster } from 'sonner';
import { BusinessProvider } from '@/src/contexts/BusinessContext';
import Layout from '@/src/components/Layout';
import Auth from '@/src/components/Auth';
import Home from '@/src/components/Home';
import Dashboard from '@/src/components/Dashboard';
import ReportForm from '@/src/components/ReportForm';
import Suppliers from '@/src/components/Suppliers';
import FinanceManager from '@/src/components/FinanceManager';
import Settings from '@/src/components/Settings';
import BranchGuard from '@/src/components/BranchGuard';
import RoleGuard from '@/src/components/RoleGuard';
import Tasks from '@/src/components/Tasks';
import Audit from '@/src/components/Audit';
import Reports from '@/src/components/Reports';
import CashCount from '@/src/components/CashCount';
import CurrencySettings from '@/src/components/CurrencySettings';
import { PayrollDashboard } from '@/src/components/Payroll/PayrollDashboard';
import { DocumentVault } from '@/src/components/Vault/DocumentVault';
import { ErrorBoundary } from '@/src/components/ErrorBoundary';

export default function App() {
  const [user, loading] = useAuthState(auth);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <BusinessProvider>
        <BrowserRouter>
          <Toaster position="top-center" richColors />
          <Routes>
            {!user ? (
              <Route path="*" element={<Auth />} />
            ) : (
              <Route element={<Layout />}>
                <Route path="/" element={<Home />} />
                <Route 
                  path="/audit" 
                  element={
                    <RoleGuard allowedRoles={['admin', 'manager', 'accountant']}>
                      <Audit />
                    </RoleGuard>
                  } 
                />
                <Route 
                  path="/dashboard" 
                  element={
                    <RoleGuard allowedRoles={['admin', 'manager', 'accountant']}>
                      <Dashboard />
                    </RoleGuard>
                  } 
                />
                <Route 
                  path="/finance/cash" 
                  element={
                    <RoleGuard allowedRoles={['admin', 'manager', 'accountant']}>
                      <FinanceManager accountType="cash" />
                    </RoleGuard>
                  } 
                />
                <Route 
                  path="/finance/bank" 
                  element={
                    <RoleGuard allowedRoles={['admin', 'manager', 'accountant']}>
                      <FinanceManager accountType="bank" />
                    </RoleGuard>
                  } 
                />
                <Route 
                  path="/finance/transactions" 
                  element={
                    <RoleGuard allowedRoles={['admin', 'manager', 'accountant']}>
                      <Dashboard />
                    </RoleGuard>
                  } 
                />
                <Route path="/tasks" element={<BranchGuard><Tasks /></BranchGuard>} />
                <Route path="/report" element={<BranchGuard><ReportForm /></BranchGuard>} />
                <Route path="/cash-count" element={<BranchGuard><CashCount /></BranchGuard>} />
                <Route path="/suppliers" element={<BranchGuard><Suppliers /></BranchGuard>} />
                <Route path="/reports" element={<BranchGuard><Reports /></BranchGuard>} />
                <Route path="/payroll" element={<PayrollDashboard />} />
                <Route path="/vault" element={<DocumentVault />} />
                <Route 
                  path="/settings/currencies" 
                  element={
                    <RoleGuard allowedRoles={['admin', 'manager']}>
                      <CurrencySettings />
                    </RoleGuard>
                  } 
                />
                <Route 
                  path="/settings/branches" 
                  element={
                    <RoleGuard allowedRoles={['admin', 'manager']}>
                      <Settings />
                    </RoleGuard>
                  } 
                />
                <Route 
                  path="/settings/business" 
                  element={
                    <RoleGuard allowedRoles={['admin', 'manager']}>
                      <Settings />
                    </RoleGuard>
                  } 
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            )}
          </Routes>
        </BrowserRouter>
      </BusinessProvider>
    </ErrorBoundary>
  );
}
