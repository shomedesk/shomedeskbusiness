export interface Business {
  id: string;
  name: string;
  ownerId: string;
  currency: string;
  mobileNumber: string;
  createdAt: any;
}

export interface Branch {
  id: string;
  businessId: string;
  ownerId: string;
  name: string;
  branchCode: string; // Unique human-readable ID
  location: string;
  managerName: string;
  managerId: string; // Username for manager login
  managerPin: string; // For manager login
  mobileNumber: string;
  createdAt: any;
}

export type ServiceType = 'subscription' | 'commission' | 'ad_revenue' | 'software_sale' | 'other';

export interface Service {
  id: string;
  businessId: string;
  ownerId: string;
  name: string;
  type: ServiceType;
  description?: string;
  createdAt: any;
}

export interface BankAccount {
  id: string;
  businessId: string;
  ownerId: string;
  branchId?: string;
  serviceId?: string;
  accountName: string;
  accountNumber: string;
  bankName: string;
  balance: number;
  createdAt: any;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: 'admin' | 'manager' | 'branch_manager' | 'accountant';
  businessId: string;
  branchId?: string;
  ownedBusinessIds?: string[];
  isPlaceholder?: boolean;
}

export type TransactionType = 'income' | 'expense' | 'transfer' | 'withdraw' | 'deposit';
export type AccountType = 'cash' | 'bank';

export interface Transaction {
  id?: string;
  businessId: string;
  ownerId: string;
  branchId: string;
  serviceId?: string; // For digital services
  userId: string;
  type: TransactionType;
  fromAccount?: AccountType;
  toAccount?: AccountType;
  fromBankId?: string;
  toBankId?: string;
  amount: number;
  category: string;
  description: string;
  date: string;
  createdAt: any;
  isFromReport?: boolean;
}

export interface Supplier {
  id?: string;
  businessId: string;
  ownerId: string;
  branchId?: string; // Optional for global suppliers, but branch managers create branch-specific ones
  name: string;
  contactPerson?: string;
  category?: string;
  phone: string;
  email?: string;
  address?: string;
  country?: string;
  totalDue: number;
}

export interface DailyReport {
  id?: string;
  businessId: string;
  ownerId: string;
  branchId: string;
  serviceId?: string;
  managerId: string;
  date: string;
  openingCash: number;
  openingBank: number;
  cashSale: number;
  bankSale: number;
  cashExpense: number;
  bankExpense: number;
  bankToCash: number;
  cashToBank: number;
  closingCash: number;
  closingBank: number;
  note?: string;
  createdAt: any;
}

export interface PurchaseLog {
  id?: string;
  businessId: string;
  ownerId: string;
  branchId: string;
  supplierId: string;
  supplierName: string;
  invoiceNumber: string;
  openingDue: number;
  billAmount: number;
  paidAmount: number;
  netDue: number;
  date: string;
  createdAt: any;
}

export interface Task {
  id?: string;
  businessId: string;
  ownerId: string;
  branchId: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  deadline: string;
  status: 'pending' | 'completed';
  createdAt: any;
}

export interface Employee {
  id: string;
  name: string;
  position: string;
  baseSalary: number;
  joinDate: string;
  status: 'active' | 'inactive';
  branchId: string;
  businessId: string;
  // Advanced details
  phone: string;
  email?: string;
  address?: string;
  bloodGroup?: string;
  emergencyContact?: string;
  nidPassport?: string;
  documentUrl?: string; // Base64 or URL
  documentName?: string;
  // Bank Details
  bankAccountName?: string;
  bankAccountNumber?: string;
  bankName?: string;
  bankBranch?: string;
  ifscCode?: string;
  createdAt?: any;
}

export interface SalaryRequest {
  id: string;
  employeeId: string;
  employeeName?: string;
  month: string;
  year: number;
  baseSalary: number;
  allowances: number;
  overtime: number;
  bonuses: number;
  deductions: number;
  netSalary: number;
  adjustmentNote: string;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
  paymentMethod?: string;
  paymentType?: 'cash' | 'bank' | 'split';
  cashAmount?: number;
  bankAmount?: number;
  sourceAccountId?: string; // Bank account ID if paymentType is 'bank' or 'split'
  destinationType?: 'cash' | 'bank';
  paymentDate?: string;
  businessId: string;
  branchId: string;
  createdAt: any;
  processedBy?: string;
}

export interface Denomination {
  id: string;
  value: number;
  label: string;
  type: 'note' | 'coin';
}

export interface CurrencyConfig {
  id: string;
  code: string;
  name: string;
  symbol: string;
  denominations: Denomination[];
  businessId: string;
  ownerId: string;
  createdAt: any;
}

export interface CashCountRecord {
  id?: string;
  businessId: string;
  branchId: string;
  ownerId: string;
  userId: string;
  currencyId: string;
  date: string;
  counts: { [denominationId: string]: number };
  totalAmount: number;
  note?: string;
  createdAt: any;
}
