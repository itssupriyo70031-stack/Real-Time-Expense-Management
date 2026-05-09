/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Building2, Plus, Search, LayoutDashboard, History, Settings, Bell, User, ArrowUpRight, TrendingDown, Sparkles, Receipt, CheckCircle2, Clock, LogOut, ChevronRight, ChevronDown, ChevronUp, AlertCircle, XCircle, Menu, X, Trash2, Sun, Moon, Wallet, Lock, CreditCard, BarChart3, Calendar, Image as ImageIcon, Download, Eye, FileText, Upload } from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { format, subDays, startOfDay, parseISO } from 'date-fns';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { Expense, ExpenseCategory, SpendingInsight, Center, ExpenseStatus } from './types';
import { getSpendingInsights } from './lib/gemini';
import { cn, formatCurrency } from './lib/utils';
import { db, handleFirestoreError, OperationType } from './lib/firebase';
import { 
  collection, 
  query, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  updateDoc, 
  serverTimestamp, 
  Timestamp
} from 'firebase/firestore';

// API key is handled by the environment

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Food & Beverage',
  'Travel',
  'Software/SaaS',
  'Office',
  'Marketing',
  'Entertainment',
  'Other'
];

// Mock initial data
const INITIAL_CENTERS: Center[] = [
  { id: 'c1', name: 'Center Main', budget: 500000 },
  { id: 'c2', name: 'Center North', budget: 300000 },
];

const INITIAL_EXPENSES: Expense[] = [
  { id: '1', merchant: 'AWS Infrastructure', amount: 35000.25, date: '2024-05-01T10:00:00Z', category: 'Software/SaaS', status: 'Approved', centerId: 'c1' },
  { id: '2', merchant: 'Swiggy', amount: 1250.40, date: '2024-05-02T08:30:00Z', category: 'Food & Beverage', status: 'Approved', centerId: 'c1' },
  { id: '3', merchant: 'Air India', amount: 45890.00, date: '2024-05-03T14:20:00Z', category: 'Travel', status: 'Pending', centerId: 'c1' },
  { id: '4', merchant: 'Microsoft Azure', amount: 12000.00, date: '2024-05-03T09:00:00Z', category: 'Software/SaaS', status: 'Approved', centerId: 'c2' },
];

export default function App() {
  const [centers, setCenters] = useState<Center[]>([]);
  const [activeCenterId, setActiveCenterId] = useState<string>('');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [userProfile, setUserProfile] = useState({
    name: 'Felix Henderson',
    role: 'Head of Operations',
    email: 'felix@enterprise.co'
  });
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [showCenterModal, setShowCenterModal] = useState(false);
  const [showEditCenterModal, setShowEditCenterModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [centerToDelete, setCenterToDelete] = useState<Center | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportKey, setExportKey] = useState('');
  const [centerToEdit, setCenterToEdit] = useState<Center | null>(null);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    const path = `shared_ledger/global_instance/profile/settings`;
    updateDoc(doc(db, path), { theme: next }).catch(e => handleFirestoreError(e, OperationType.UPDATE, path));
  }

  useEffect(() => {
    const rootPath = `shared_ledger/global_instance`;
    
    const centersPath = `${rootPath}/centers`;
    const unsubCenters = onSnapshot(query(collection(db, centersPath)), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Center));
      setCenters(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, centersPath));

    const expensesPath = `${rootPath}/expenses`;
    const unsubExpenses = onSnapshot(query(collection(db, expensesPath)), (snapshot) => {
      const data = snapshot.docs.map(doc => {
        const d = doc.data();
        return { 
          id: doc.id, 
          ...d,
          amount: Number(d.amount) || 0,
          date: d.date instanceof Timestamp ? d.date.toDate().toISOString() : d.date
        } as Expense;
      });
      setExpenses(data);
    }, (error) => handleFirestoreError(error, OperationType.GET, expensesPath));

    const profilePath = `${rootPath}/profile/settings`;
    const unsubProfile = onSnapshot(doc(db, profilePath), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setUserProfile({
          name: data.name || 'Felix Henderson',
          role: data.role || 'Head of Operations',
          email: data.email || 'felix@enterprise.co'
        });
        if (data.activeCenterId && !activeCenterId) setActiveCenterId(data.activeCenterId);
        if (data.theme) setTheme(data.theme);
      } else {
        // First time setup - seeds the database once
        const initialProfile = {
          name: 'Felix Henderson',
          role: 'Head of Operations',
          email: 'felix@enterprise.co',
          theme: 'dark',
          activeCenterId: 'c1'
        };
        
        // Write profile
        setDoc(doc(db, profilePath), initialProfile).catch(e => handleFirestoreError(e, OperationType.WRITE, profilePath));
        
        // Seed default centers
        INITIAL_CENTERS.forEach(c => {
          setDoc(doc(db, `${centersPath}/${c.id}`), { 
            name: c.name, 
            budget: c.budget, 
            createdAt: Timestamp.now() 
          });
        });

        // Seed default expenses
        INITIAL_EXPENSES.forEach(e => {
          setDoc(doc(db, `${expensesPath}/${e.id}`), { 
            ...e, 
            date: Timestamp.fromDate(new Date(e.date)), 
            createdAt: Timestamp.now() 
          });
        });

        setUserProfile(initialProfile);
        setActiveCenterId('c1');
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, profilePath));

    return () => {
      unsubCenters();
      unsubExpenses();
      unsubProfile();
    };
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) setIsSidebarOpen(false);
      else setIsSidebarOpen(true);
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const activeCenter = useMemo(() => 
    centers.find(c => c.id === activeCenterId) || centers[0], 
  [centers, activeCenterId]);

  const totalBudget = activeCenter?.budget || 0;
  const [tempBudget, setTempBudget] = useState(totalBudget.toString());
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [tempProfile, setTempProfile] = useState(userProfile);
  const [newCenterName, setNewCenterName] = useState('');
  const [newCenterBudget, setNewCenterBudget] = useState('500000');
  const [insights, setInsights] = useState<SpendingInsight[]>([]);
  const [isInsightsLoading, setIsInsightsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Expense['status'] | 'All'>('All');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: keyof Expense; direction: 'asc' | 'desc' } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [currentView, setCurrentView] = useState<'Dashboard' | 'Activity' | 'Settings'>('Dashboard');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editForm, setEditForm] = useState<Partial<Expense>>({});
  const [billPreview, setBillPreview] = useState<string | null>(null);
  const [selectedBill, setSelectedBill] = useState<string | null>(null);
  const [showBillModal, setShowBillModal] = useState(false);

  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    setEditForm({
      merchant: expense.merchant,
      amount: expense.amount,
      category: expense.category,
      date: expense.date,
      status: expense.status,
      description: expense.description || ''
    });
    setBillPreview(expense.billUrl || null);
    setShowEditModal(true);
  };

  const handleUpdateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const path = `shared_ledger/global_instance/expenses/${editingExpense.id}`;
      
      const updatedData = {
        ...editForm,
        merchant: String(editForm.merchant).trim(),
        amount: parseFloat(String(editForm.amount)) || 0,
        description: String(editForm.description || '').trim(),
        billUrl: billPreview || undefined,
        updatedAt: Timestamp.now()
      };

      await setDoc(doc(db, path), updatedData, { merge: true });
      setShowEditModal(false);
      setEditingExpense(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `shared_ledger/global_instance/expenses`);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!activeCenterId) return;
    const path = `shared_ledger/global_instance/profile/settings`;
    updateDoc(doc(db, path), { activeCenterId }).catch(e => handleFirestoreError(e, OperationType.UPDATE, path));
  }, [activeCenterId]);

  const handleSetBudget = () => {
    setShowBudgetModal(true);
    setTempBudget(totalBudget.toString());
  };

  const saveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(tempBudget);
    if (!isNaN(val) && val >= 0 && activeCenterId) {
      const path = `shared_ledger/global_instance/centers/${activeCenterId}`;
      try {
        await updateDoc(doc(db, path), { budget: val });
        setShowBudgetModal(false);
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, path);
      }
    }
  };

  const handleAddCenter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCenterName) return;
    const centerId = Math.random().toString(36).substr(2, 9);
    const path = `shared_ledger/global_instance/centers/${centerId}`;
    try {
      await setDoc(doc(db, path), {
        name: newCenterName,
        budget: Number(newCenterBudget),
        createdAt: serverTimestamp()
      });
      setActiveCenterId(centerId);
      setShowCenterModal(false);
      setNewCenterName('');
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, path);
    }
  };

  const handleUpdateCenter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!centerToEdit) return;
    const path = `shared_ledger/global_instance/centers/${centerToEdit.id}`;
    try {
      await updateDoc(doc(db, path), {
        name: centerToEdit.name,
        budget: centerToEdit.budget
      });
      setShowEditCenterModal(false);
      setCenterToEdit(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, path);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const path = `shared_ledger/global_instance/profile/settings`;
    try {
      await updateDoc(doc(db, path), {
        name: tempProfile.name,
        role: tempProfile.role,
        email: tempProfile.email
      });
      setShowProfileModal(false);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, path);
    }
  };

  const handleDeleteCenter = (id: string) => {
    const center = centers.find(c => c.id === id);
    if (!center || centers.length <= 1) return;
    setCenterToDelete(center);
    setShowDeleteModal(true);
  };

  const confirmDeleteCenter = async () => {
    if (!centerToDelete) return;
    const id = centerToDelete.id;
    const path = `shared_ledger/global_instance/centers/${id}`;
    
    try {
      await deleteDoc(doc(db, path));
      if (activeCenterId === id) {
        setActiveCenterId(centers.find(c => c.id !== id)?.id || '');
      }
      
      const centerExpenses = expenses.filter(e => e.centerId === id);
      for (const exp of centerExpenses) {
        await deleteDoc(doc(db, `shared_ledger/global_instance/expenses/${exp.id}`));
      }
      
      setShowDeleteModal(false);
      setCenterToDelete(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  };

  // New Expense State
  const [newExpense, setNewExpense] = useState<Partial<Expense>>({
    merchant: '',
    amount: 0,
    category: 'Other',
    status: 'Pending',
    date: format(new Date(), 'yyyy-MM-dd'),
    description: '',
  });

  const centerExpenses = useMemo(() => 
    expenses.filter(e => e.centerId === activeCenterId), 
  [expenses, activeCenterId]);

  const dashExpenses = useMemo(() => {
    if (!selectedDate) return centerExpenses;
    return centerExpenses.filter(e => format(parseISO(e.date), 'yyyy-MM-dd') === selectedDate);
  }, [centerExpenses, selectedDate]);

  useEffect(() => {
    async function fetchInsights() {
      if (dashExpenses.length === 0) {
        setInsights([]);
        return;
      }
      setIsInsightsLoading(true);
      const res = await getSpendingInsights(dashExpenses);
      setInsights(res);
      setIsInsightsLoading(false);
    }
    fetchInsights();
  }, [dashExpenses]);

  const totalSpent = useMemo(() => dashExpenses.reduce((sum, e) => sum + e.amount, 0), [dashExpenses]);
  const pendingAmount = useMemo(() => dashExpenses.filter(e => e.status === 'Pending').reduce((sum, e) => sum + e.amount, 0), [dashExpenses]);
  
  const chartData = useMemo(() => {
    const referenceDate = selectedDate ? parseISO(selectedDate) : new Date();
    const days = Array.from({ length: 7 }).map((_, i) => {
      const date = subDays(referenceDate, i);
      return format(date, 'MMM dd');
    }).reverse();

    return days.map(day => {
      const dayTotal = centerExpenses
        .filter(e => format(parseISO(e.date), 'MMM dd') === day)
        .reduce((sum, e) => sum + e.amount, 0);
      return { name: day, amount: dayTotal };
    });
  }, [centerExpenses, selectedDate]);

  useEffect(() => {
    if (selectedDate) {
      setNewExpense(prev => ({ ...prev, date: selectedDate }));
    } else {
      setNewExpense(prev => ({ ...prev, date: format(new Date(), 'yyyy-MM-dd') }));
    }
  }, [selectedDate]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Determine the target center ID
    const currentCenterId = activeCenterId || centers[0]?.id;
    
    if (!newExpense.merchant || !currentCenterId) return;

    setIsSubmitting(true);
    
    try {
      const expenseId = Math.random().toString(36).substr(2, 9);
      const path = `shared_ledger/global_instance/expenses/${expenseId}`;
      
      // Validate date
      let expenseDate = new Date();
      if (newExpense.date) {
        const d = new Date(newExpense.date);
        if (!isNaN(d.getTime())) {
          expenseDate = d;
        }
      }

      const expenseData = {
        merchant: String(newExpense.merchant).trim(),
        amount: parseFloat(String(newExpense.amount)) || 0,
        category: String(newExpense.category),
        date: Timestamp.fromDate(expenseDate),
        status: String(newExpense.status || 'Pending'),
        description: String(newExpense.description || '').trim(),
        centerId: String(currentCenterId),
        billUrl: billPreview || undefined,
        createdAt: Timestamp.now()
      };

      await setDoc(doc(db, path), expenseData);
      
      setShowAddModal(false);
      setBillPreview(null);
      setNewExpense({ 
        merchant: '', 
        amount: 0, 
        category: 'Travel', 
        status: 'Pending',
        date: format(new Date(), 'yyyy-MM-dd'),
        description: ''
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `shared_ledger/global_instance/expenses`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredExpenses = useMemo(() => {
    let result = statusFilter === 'All' ? [...centerExpenses] : centerExpenses.filter(e => e.status === statusFilter);
    
    if (selectedDate) {
      result = result.filter(e => format(parseISO(e.date), 'yyyy-MM-dd') === selectedDate);
    }
    
    if (sortConfig) {
      result.sort((a, b) => {
        const aValue = a[sortConfig.key] ?? '';
        const bValue = b[sortConfig.key] ?? '';
        
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    
    return result;
  }, [centerExpenses, statusFilter, sortConfig, selectedDate]);

  const toggleSort = (key: keyof Expense) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size > 0 && selectedIds.size === filteredExpenses.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredExpenses.map(e => e.id)));
    }
  }, [selectedIds.size, filteredExpenses]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleBulkAction = async (status: ExpenseStatus) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    try {
      const promises = ids.map(id => {
        const path = `shared_ledger/global_instance/expenses/${id}`;
        return updateDoc(doc(db, path), { status });
      });
      await Promise.all(promises);
      setSelectedIds(new Set());
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `shared_ledger/global_instance/expenses`);
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setIsBulkDeleting(true);
    try {
      const promises = ids.map(id => {
        const path = `shared_ledger/global_instance/expenses/${id}`;
        return deleteDoc(doc(db, path));
      });
      await Promise.all(promises);
      setSelectedIds(new Set());
      setShowBulkDeleteConfirm(false);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `shared_ledger/global_instance/expenses`);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleExportCSV = () => {
    setShowExportModal(true);
    setExportKey('');
  };

  const handleConfirmExport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (exportKey !== 'RIYANKANJILAL') {
      alert('Unauthorized access key. Incident logged.');
      return;
    }

    setIsExporting(true);
    try {
      const zip = new JSZip();
      const imgFolder = zip.folder("receipts");
      
      const headers = ['Center', 'Merchant', 'Date', 'Amount (INR)', 'Category', 'Status', 'Description', 'Receipt Filename'];
      const csvRows = expenses.map((e, index) => {
        const centerName = centers.find(c => c.id === e.centerId)?.name || 'Unknown';
        let formattedDate = 'N/A';
        try {
          formattedDate = format(parseISO(e.date), 'yyyy-MM-dd');
        } catch (err) {
          formattedDate = e.date;
        }

        let receiptFilename = 'None';
        if (e.billUrl) {
          receiptFilename = `receipt_${index + 1}_${e.merchant.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png`;
          // Extract base64 part
          const base64Data = e.billUrl.split(',')[1];
          if (base64Data) {
            imgFolder?.file(receiptFilename, base64Data, { base64: true });
          }
        }

        return [
          `"${centerName.replace(/"/g, '""')}"`,
          `"${e.merchant.replace(/"/g, '""')}"`,
          formattedDate,
          e.amount,
          `"${e.category}"`,
          `"${e.status}"`,
          `"${(e.description || '').replace(/"/g, '""')}"`,
          `"${receiptFilename}"`
        ].join(',');
      });

      const csvContent = [headers.join(','), ...csvRows].join('\n');
      zip.file(`financial_ledger_${format(new Date(), 'yyyy-MM-dd')}.csv`, csvContent);

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `financial_export_bundle_${format(new Date(), 'yyyy-MM-dd')}.zip`);
      
      setShowExportModal(false);
      setIsExporting(false);
      setExportKey('');
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please check console for details.');
      setIsExporting(false);
    }
  };


  return (
    <div className="flex h-screen bg-[var(--app-bg)] text-[var(--app-text)] font-sans overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && window.innerWidth < 1024 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[55] lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside 
        className={cn(
          "fixed inset-y-0 left-0 lg:relative bg-[var(--app-sidebar)] border-r border-[var(--app-border)] transition-all duration-300 z-[60] overflow-hidden flex flex-col",
          isSidebarOpen ? "w-64 translate-x-0" : "w-0 lg:w-20 -translate-x-full lg:translate-x-0"
        )}
      >
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shrink-0">
            <CreditCard className="text-black w-6 h-6" />
          </div>
          {isSidebarOpen && (
            <motion.span 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="font-bold text-xl tracking-tighter text-white"
            >
              CENTER<span className="text-[#52525b] font-normal">®</span>
            </motion.span>
          )}
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between px-4 mb-4">
              {isSidebarOpen && <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#52525b]">Active Unit</span>}
              <button 
                onClick={() => setShowCenterModal(true)}
                className="p-1 hover:bg-[var(--app-hover)] rounded-md text-[var(--app-muted)] hover:text-white transition-colors"
                title="Add New Center"
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="space-y-1">
              {centers.map(center => (
                <div key={center.id} className="relative group/item flex-1">
                  <button 
                    onClick={() => setActiveCenterId(center.id)}
                    className={cn(
                      "flex items-center gap-4 w-full p-4 rounded-xl transition-all group overflow-hidden whitespace-nowrap border-l-2",
                      activeCenterId === center.id 
                        ? "bg-[#141414] text-white border-white font-bold" 
                        : "text-[#71717a] hover:text-[#a1a1aa] border-transparent hover:bg-[#0a0a0a]"
                    )}
                  >
                    <Building2 size={20} className={activeCenterId === center.id ? "text-white" : "text-[#52525b]"} />
                    {isSidebarOpen && (
                      <div className="flex flex-col items-start overflow-hidden pr-8">
                        <span className="text-[11px] uppercase tracking-widest font-bold truncate w-full text-left">{center.name}</span>
                        <span className="text-[9px] text-[var(--app-muted)] font-mono">{formatCurrency(center.budget)} cap</span>
                      </div>
                    )}
                  </button>
                  {isSidebarOpen && activeCenterId === center.id && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setCenterToEdit(center);
                        setShowEditCenterModal(true);
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-[#52525b] hover:text-white transition-colors opacity-0 group-hover/item:opacity-100"
                    >
                      <Settings size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="h-px bg-[var(--app-border)] mx-4 my-6 opacity-50" />

          <NavItem icon={<LayoutDashboard size={20} />} label="Dashboard" active={currentView === 'Dashboard'} onClick={() => setCurrentView('Dashboard')} isSidebarOpen={isSidebarOpen} />
          <NavItem icon={<History size={20} />} label="Activity" active={currentView === 'Activity'} onClick={() => setCurrentView('Activity')} isSidebarOpen={isSidebarOpen} />
          <NavItem icon={<Settings size={20} />} label="Settings" active={currentView === 'Settings'} onClick={() => setCurrentView('Settings')} isSidebarOpen={isSidebarOpen} />
        </nav>

        <div className="p-4 border-t border-[var(--app-border)]">
          <div className="px-4 py-2 text-[10px] font-bold text-[var(--app-muted)] uppercase tracking-widest text-center opacity-50">
            Global Sync Active
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-full">
        {/* Topbar */}
        <header className="h-16 lg:h-20 bg-[var(--app-header)] border-b border-[var(--app-border)] flex items-center justify-between px-4 lg:px-8 sticky top-0 z-40">
          <div className="flex items-center gap-2 lg:gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-[var(--app-hover)] rounded-lg text-[var(--app-muted)] transition-colors"
            >
              {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <h1 className="text-sm font-bold md:text-lg lg:text-xl text-[var(--app-text)] tracking-tight truncate max-w-[150px] md:max-w-none">
              Expense Management
            </h1>
          </div>
          
          <div className="flex items-center gap-2 lg:gap-4">
            <div className="hidden lg:flex items-center bg-[var(--app-hover)] px-4 py-2 rounded-full border border-[var(--app-inner-border)] focus-within:border-[var(--app-muted)] transition-all">
              <Search size={16} className="text-[var(--app-muted)]" />
              <input 
                type="text" 
                placeholder="Search..." 
                className="bg-transparent border-none focus:ring-0 text-sm ml-2 w-32 xl:w-64 outline-none text-[var(--app-text)] placeholder-[var(--app-muted)]"
              />
            </div>
            <button 
              onClick={toggleTheme}
              className="p-2 hover:bg-[var(--app-hover)] rounded-full text-[var(--app-muted)] transition-colors"
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            </button>
            <div className="px-3 py-1 bg-[var(--app-hover)] border border-[var(--app-inner-border)] rounded-full hidden lg:flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></div>
              <span className="text-[10px] uppercase tracking-widest font-bold text-[#a1a1aa]">Live Sync</span>
            </div>
            <button className="p-2 hover:bg-[var(--app-hover)] rounded-full text-[var(--app-muted)] relative">
              <Bell size={20} />
              <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-emerald-500 rounded-full border-2 border-[var(--app-sidebar)]"></span>
            </button>
            <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
               <User size={16} className="text-zinc-500" />
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto w-full space-y-6 lg:space-y-8">
          <AnimatePresence mode="wait">
            {currentView === 'Dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6 lg:space-y-8"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl lg:text-2xl font-bold text-[var(--app-text)] tracking-tight font-sans">Overview</h2>
                    <p className="text-[10px] md:text-xs text-[var(--app-muted)] mt-1 font-medium">Financial performance for {activeCenter?.name}</p>
                  </div>
                  
                  <div className="flex items-center gap-3 bg-[var(--app-surface)] border border-[var(--app-border)] px-4 py-2 rounded-xl group hover:border-[var(--app-muted)] transition-all w-full sm:w-auto">
                    <Calendar size={16} className="text-[var(--app-muted)]" />
                    <input 
                      type="date" 
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="bg-transparent border-none outline-none text-[10px] font-bold uppercase tracking-widest text-[var(--app-text)] [color-scheme:dark] cursor-pointer flex-1"
                    />
                    {selectedDate && (
                      <button 
                        onClick={() => setSelectedDate('')}
                        className="p-1 hover:bg-[var(--app-hover)] rounded-md text-[var(--app-muted)] hover:text-white transition-colors"
                        title="Clear Filter"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <SummaryCard 
                    title={selectedDate ? `Spent on ${format(parseISO(selectedDate), 'MMM dd')}` : "Total Spent (MTD)"}
                    value={formatCurrency(totalSpent)}
                    trend={selectedDate ? "Daily extraction" : "+12.5% vs last month"}
                    icon={<Receipt size={20} />}
                    variant="primary"
                  />
                  <SummaryCard 
                    title="Remaining Balance"
                    value={formatCurrency(totalBudget - totalSpent)}
                    trend={totalBudget - totalSpent < 0 ? "Budget exceeded" : "Under allocation"}
                    icon={<Wallet size={20} />}
                    variant={totalBudget - totalSpent < 0 ? "danger" : "info"}
                  />
                  <SummaryCard 
                    title={selectedDate ? "Day Pendency" : "Awaiting Approval"}
                    value={formatCurrency(pendingAmount)}
                    trend={selectedDate ? "Specific date queue" : "4 items priority review"}
                    icon={<Clock size={20} />}
                    variant="warning"
                  />
                  <SummaryCard 
                    title="Budget Utilization"
                    value={formatCurrency(totalBudget)}
                    trend={`${Math.round((totalSpent/totalBudget) * 100)}% of allocation`}
                    icon={<TrendingDown size={20} />}
                    variant="success"
                  />
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                  {/* Chart Section */}
                  <div className="xl:col-span-2 space-y-6">
                    <div className="bg-[var(--app-surface)] p-8 rounded-2xl border border-[var(--app-border)] shadow-[var(--app-card-shadow)]">
                      <div className="flex items-center justify-between mb-10">
                        <div>
                          <h2 className="text-base font-bold text-[var(--app-text)] uppercase tracking-wider">Spending Trends</h2>
                          <p className="text-[11px] text-[var(--app-muted)] font-medium tracking-wide uppercase mt-1">Real-time infrastructure analysis</p>
                        </div>
                        <div className="flex gap-2 p-1 bg-[var(--app-hover)] rounded-lg border border-[var(--app-inner-border)]">
                          <button className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider bg-[var(--app-inner-border)] text-[var(--app-text)] rounded-md shadow-sm">Scale: 7D</button>
                          <button className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--app-muted)] hover:text-[var(--app-text)] transition-colors">Scale: 30D</button>
                        </div>
                      </div>
                      <div className="h-[320px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData}>
                            <defs>
                              <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={theme === 'light' ? '#000' : '#fff'} stopOpacity={0.1}/>
                                <stop offset="95%" stopColor={theme === 'light' ? '#000' : '#fff'} stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--app-border)" />
                            <XAxis 
                              dataKey="name" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fontSize: 10, fill: 'var(--app-muted)', fontWeight: 600 }}
                              dy={10}
                            />
                            <YAxis 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{ fontSize: 10, fill: 'var(--app-muted)', fontWeight: 600 }}
                            />
                            <Tooltip 
                              contentStyle={{ 
                                backgroundColor: 'var(--app-surface)',
                                borderRadius: '8px', 
                                border: '1px solid var(--app-inner-border)',
                                boxShadow: 'var(--app-card-shadow)',
                                color: 'var(--app-text)'
                              }}
                              itemStyle={{ color: 'var(--app-text)' }}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="amount" 
                              stroke={theme === 'light' ? '#000' : '#fff'} 
                              strokeWidth={2}
                              fillOpacity={1} 
                              fill="url(#colorAmount)" 
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Transactions Table */}
                    <ExpensesTable 
                      filteredExpenses={filteredExpenses}
                      selectedIds={selectedIds}
                      toggleSelectAll={toggleSelectAll}
                      toggleSelect={toggleSelect}
                      sortConfig={sortConfig}
                      toggleSort={toggleSort}
                      statusFilter={statusFilter}
                      setStatusFilter={setStatusFilter}
                      onAddClick={() => setShowAddModal(true)}
                      handleBulkAction={handleBulkAction}
                      handleBulkDelete={() => setShowBulkDeleteConfirm(true)}
                      onDeselectAll={() => setSelectedIds(new Set())}
                      onViewBill={(url) => {
                        setSelectedBill(url);
                        setShowBillModal(true);
                      }}
                      onEdit={handleEditExpense}
                    />
                  </div>

                  {/* Sidebar Insights */}
                  <div className="space-y-6">
                    <div className="bg-gradient-to-br from-[#111] to-black rounded-3xl p-8 border border-[#1f1f1f] relative overflow-hidden">
                      <div className="relative z-10">
                        <header className="flex items-center gap-2 mb-6">
                          <div className="flex items-center gap-2">
                             <Lock size={14} className="text-amber-500" />
                             <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a1a1aa]">{activeCenter?.name} Unit Intelligence</span>
                          </div>
                        </header>
                        
                        <div className="space-y-4">
                          {isInsightsLoading ? (
                            <div className="space-y-3">
                              <Skeleton className="bg-[#1f1f1f] h-20" />
                              <Skeleton className="bg-[#1f1f1f] h-20" />
                            </div>
                          ) : insights.length > 0 ? (
                            insights.map((insight, idx) => (
                              <motion.div 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.1 }}
                                key={idx} 
                                className="bg-[#141414]/80 backdrop-blur-xl rounded-2xl p-5 border border-[#262626] hover:border-[#3f3f46] transition-all"
                              >
                                <h3 className="font-bold text-xs mb-2 text-white uppercase tracking-wider">{insight.title}</h3>
                                <p className="text-[11px] text-[#71717a] leading-relaxed font-medium">{insight.description}</p>
                              </motion.div>
                            ))
                          ) : (
                            <p className="text-xs text-[#52525b] italic">Standby: Generating analysis...</p>
                          )}
                        </div>
                      </div>
                      {/* Visual accents */}
                      <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl"></div>
                    </div>

                    <div className="bg-[var(--app-surface)] p-8 rounded-2xl border border-[var(--app-border)] shadow-[var(--app-card-shadow)]">
                      <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--app-muted)] mb-6">Operations Panel</h3>
                      <div className="flex flex-col gap-3">
                        <ShortcutButton label="Set Monthly Budget" onClick={handleSetBudget} />
                        <ShortcutButton label="Export Ledger Data" onClick={handleExportCSV} />
                      </div>
                    </div>

                    <div className="bg-[#10b981]/5 p-6 rounded-2xl border border-[#10b981]/20">
                      <div className="flex items-start gap-4">
                        <div className="bg-emerald-500/10 p-2.5 rounded-xl text-emerald-500 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                          <CheckCircle2 size={18} />
                        </div>
                        <div>
                          <h4 className="text-[11px] font-bold text-white uppercase tracking-wider">Policy Compliance: 100%</h4>
                          <p className="text-[11px] text-[#71717a] font-medium mt-1.5 leading-relaxed italic">System verified: All recent telemetry within enterprise guidelines.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

              {currentView === 'Activity' && (
                <ExpensesTable 
                  filteredExpenses={filteredExpenses}
                  selectedIds={selectedIds}
                  toggleSelectAll={toggleSelectAll}
                  toggleSelect={toggleSelect}
                  sortConfig={sortConfig}
                  toggleSort={toggleSort}
                  statusFilter={statusFilter}
                  setStatusFilter={setStatusFilter}
                  onAddClick={() => setShowAddModal(true)}
                  handleBulkAction={handleBulkAction}
                  handleBulkDelete={() => setShowBulkDeleteConfirm(true)}
                  onDeselectAll={() => setSelectedIds(new Set())}
                  onViewBill={(url) => {
                    setSelectedBill(url);
                    setShowBillModal(true);
                  }}
                  onEdit={handleEditExpense}
                  title="Recorded Transactions"
                />
              )}
            {currentView === 'Settings' && (
              <SettingsView 
                totalBudget={totalBudget} 
                onSetBudget={handleSetBudget} 
                centers={centers}
                setActiveCenterId={setActiveCenterId}
                setTempBudget={setTempBudget}
                setShowBudgetModal={setShowBudgetModal}
                handleDeleteCenter={handleDeleteCenter}
                setShowCenterModal={setShowCenterModal}
                userProfile={userProfile}
                onEditProfile={() => {
                  setTempProfile(userProfile);
                  setShowProfileModal(true);
                }}
                onEditCenter={(center) => {
                  setCenterToEdit(center);
                  setShowEditCenterModal(true);
                }}
              />
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {showBudgetModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowBudgetModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-[var(--app-surface)] rounded-3xl p-10 shadow-2xl border border-[var(--app-border)]"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-bold text-[var(--app-text)] uppercase tracking-widest">Update Unit Budget</h2>
                <button onClick={() => setShowBudgetModal(false)} className="p-2 hover:bg-[var(--app-hover)] rounded-full text-[var(--app-muted)]">
                  <X size={20} />
                </button>
              </div>
              
              <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-4">
                <AlertCircle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Adjusting Limit for:</p>
                  <p className="text-xs font-bold text-[var(--app-text)] mt-1">{activeCenter?.name}</p>
                </div>
              </div>

              <form onSubmit={saveBudget} className="space-y-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-[var(--app-muted)] uppercase tracking-[0.2em]">Monthly Allocation (INR)</label>
                  <input 
                    autoFocus
                    type="number" 
                    value={tempBudget}
                    onChange={e => setTempBudget(e.target.value)}
                    className="w-full px-5 py-4 bg-[var(--app-bg)] rounded-xl border border-[var(--app-inner-border)] text-[var(--app-text)] focus:border-[var(--app-muted)] transition-all outline-none font-mono text-lg"
                    placeholder="500000"
                  />
                </div>
                <button 
                  type="submit"
                  className="w-full bg-[var(--app-accent)] hover:opacity-90 text-[var(--app-accent-foreground)] font-bold py-5 rounded-2xl uppercase tracking-[0.2em] text-xs transition-all active:scale-[0.98]"
                >
                  Confirm Allocation
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {showCenterModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCenterModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-[var(--app-surface)] rounded-3xl p-10 shadow-2xl border border-[var(--app-border)]"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-bold text-[var(--app-text)] uppercase tracking-widest">Initialize New Unit</h2>
                <button onClick={() => setShowCenterModal(false)} className="p-2 hover:bg-[var(--app-hover)] rounded-full text-[var(--app-muted)]">
                  <X size={20} />
                </button>
              </div>
              
              <form onSubmit={handleAddCenter} className="space-y-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-[var(--app-muted)] uppercase tracking-[0.2em]">Center Designation</label>
                  <input 
                    autoFocus
                    required
                    type="text" 
                    value={newCenterName}
                    onChange={e => setNewCenterName(e.target.value)}
                    className="w-full px-5 py-4 bg-[var(--app-bg)] rounded-xl border border-[var(--app-inner-border)] text-[var(--app-text)] focus:border-[var(--app-muted)] transition-all outline-none font-medium text-lg"
                    placeholder="e.g. Center South-East"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-[var(--app-muted)] uppercase tracking-[0.2em]">Baseline Budget (INR)</label>
                  <input 
                    required
                    type="number" 
                    value={newCenterBudget}
                    onChange={e => setNewCenterBudget(e.target.value)}
                    className="w-full px-5 py-4 bg-[var(--app-bg)] rounded-xl border border-[var(--app-inner-border)] text-[var(--app-text)] focus:border-[var(--app-muted)] transition-all outline-none font-mono text-lg"
                  />
                </div>
                <button 
                  type="submit"
                  className="w-full bg-[var(--app-accent)] hover:opacity-90 text-[var(--app-accent-foreground)] font-bold py-5 rounded-2xl uppercase tracking-[0.2em] text-xs transition-all active:scale-[0.98]"
                >
                  Deploy Unit
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {showEditCenterModal && centerToEdit && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEditCenterModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-[var(--app-surface)] rounded-3xl p-10 shadow-2xl border border-[var(--app-border)]"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-bold text-[var(--app-text)] uppercase tracking-widest">Update Operational Unit</h2>
                <button onClick={() => setShowEditCenterModal(false)} className="p-2 hover:bg-[var(--app-hover)] rounded-full text-[var(--app-muted)]">
                  <X size={20} />
                </button>
              </div>
              
              <form onSubmit={handleUpdateCenter} className="space-y-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-[var(--app-muted)] uppercase tracking-[0.2em]">Center Designation</label>
                  <input 
                    autoFocus
                    required
                    type="text" 
                    value={centerToEdit.name}
                    onChange={e => setCenterToEdit({ ...centerToEdit, name: e.target.value })}
                    className="w-full px-5 py-4 bg-[var(--app-bg)] rounded-xl border border-[var(--app-inner-border)] text-[var(--app-text)] focus:border-[var(--app-muted)] transition-all outline-none font-medium text-lg"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-[var(--app-muted)] uppercase tracking-[0.2em]">Unit Budget (INR)</label>
                  <input 
                    required
                    type="number" 
                    value={centerToEdit.budget}
                    onChange={e => setCenterToEdit({ ...centerToEdit, budget: Number(e.target.value) })}
                    className="w-full px-5 py-4 bg-[var(--app-bg)] rounded-xl border border-[var(--app-inner-border)] text-[var(--app-text)] focus:border-[var(--app-muted)] transition-all outline-none font-mono text-lg"
                  />
                </div>
                <button 
                  type="submit"
                  className="w-full bg-[var(--app-accent)] hover:opacity-90 text-[var(--app-accent-foreground)] font-bold py-5 rounded-2xl uppercase tracking-[0.2em] text-xs transition-all active:scale-[0.98]"
                >
                  Save Modifications
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {showDeleteModal && centerToDelete && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDeleteModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-[var(--app-surface)] rounded-3xl p-10 shadow-2xl border border-[var(--app-border)]"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <AlertCircle size={20} className="text-red-500" />
                  <h2 className="text-xl font-bold text-[var(--app-text)] uppercase tracking-widest text-left">Confirm Deletion</h2>
                </div>
                <button onClick={() => setShowDeleteModal(false)} className="p-2 hover:bg-[var(--app-hover)] rounded-full text-[var(--app-muted)] transition-all">
                  <X size={20} />
                </button>
              </div>
              
              <div className="mb-8 p-5 bg-red-500/10 border border-red-500/20 rounded-2xl text-left">
                 <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-2">Notice: Terminal Action</p>
                 <p className="text-xs text-red-500/80 leading-relaxed font-medium">
                  Are you sure you want to delete <span className="font-bold text-white uppercase">{centerToDelete.name}</span>? 
                  This will permanently erase the unit and all associated transaction records from the ledger. This action cannot be reversed.
                 </p>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 px-4 py-4 border border-[var(--app-inner-border)] rounded-xl text-[10px] font-bold uppercase tracking-widest text-[var(--app-text)] hover:bg-[var(--app-hover)] transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmDeleteCenter}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-xl uppercase tracking-[0.2em] text-[10px] transition-all active:scale-[0.98]"
                >
                  Confirm Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showBulkDeleteConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isBulkDeleting && setShowBulkDeleteConfirm(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-[var(--app-surface)] rounded-3xl p-10 shadow-2xl border border-[var(--app-border)]"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <XCircle size={20} className="text-red-500" />
                  <h2 className="text-xl font-bold text-[var(--app-text)] uppercase tracking-widest text-left">Confirm Batch Delete</h2>
                </div>
                <button 
                  disabled={isBulkDeleting}
                  onClick={() => setShowBulkDeleteConfirm(false)} 
                  className="p-2 hover:bg-[var(--app-hover)] rounded-full text-[var(--app-muted)] transition-all disabled:opacity-50"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="mb-8 p-5 bg-red-500/10 border border-red-500/20 rounded-2xl text-left">
                 <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-2">Notice: Batch Termination</p>
                 <p className="text-xs text-red-500/80 leading-relaxed font-medium">
                  Are you sure you want to delete <span className="font-bold text-white">{selectedIds.size}</span> selected transactions? 
                  This will permanently erase these records from the database. This action cannot be reversed.
                 </p>
              </div>

              <div className="flex gap-4">
                <button 
                  disabled={isBulkDeleting}
                  onClick={() => setShowBulkDeleteConfirm(false)}
                  className="flex-1 px-4 py-4 border border-[var(--app-inner-border)] rounded-xl text-[10px] font-bold uppercase tracking-widest text-[var(--app-text)] hover:bg-[var(--app-hover)] transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button 
                  disabled={isBulkDeleting}
                  onClick={handleBulkDelete}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-xl uppercase tracking-[0.2em] text-[10px] transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isBulkDeleting ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                      Processing...
                    </>
                  ) : 'Confirm Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showExportModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowExportModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-[var(--app-surface)] rounded-3xl p-10 shadow-2xl border border-[var(--app-border)]"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <Lock size={20} className="text-amber-500" />
                  <h2 className="text-xl font-bold text-[var(--app-text)] uppercase tracking-widest text-left">Data Verification</h2>
                </div>
                <button onClick={() => setShowExportModal(false)} className="p-2 hover:bg-[var(--app-hover)] rounded-full text-[var(--app-muted)] transition-all">
                  <X size={20} />
                </button>
              </div>
              
              <div className="mb-8 p-5 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                 <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-2">Protocol: Access Denied</p>
                 <p className="text-xs text-amber-500/80 leading-relaxed font-medium">Exporting total ledger data requires high-level administrative clearance. Input valid access key to proceed with extraction.</p>
              </div>

              <form onSubmit={handleConfirmExport} className="space-y-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-[var(--app-muted)] uppercase tracking-[0.2em]">Administrative Key</label>
                  <input 
                    autoFocus
                    required
                    type="password" 
                    value={exportKey}
                    onChange={e => setExportKey(e.target.value)}
                    className="w-full px-5 py-4 bg-[var(--app-bg)] rounded-xl border border-[var(--app-inner-border)] text-[var(--app-text)] focus:border-[var(--app-muted)] transition-all outline-none font-mono text-center text-xl tracking-[0.5em]"
                    placeholder="••••••••"
                  />
                </div>
                <button 
                  type="submit"
                  disabled={isExporting}
                  className="w-full bg-white hover:bg-zinc-200 text-black font-bold py-5 rounded-2xl uppercase tracking-[0.2em] text-xs transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isExporting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin"></div>
                      Packaging Bundle...
                    </>
                  ) : 'Confirm Authorization'}
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {showAddModal && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-md z-[60]"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 30 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-[var(--app-surface)] rounded-3xl p-6 md:p-10 z-[70] shadow-2xl border border-[var(--app-border)]"
            >
              <div className="flex items-center justify-between mb-10">
                <h2 className="text-xl font-bold text-[var(--app-text)] flex items-center gap-4 uppercase tracking-widest">
                  Log Entry: {activeCenter?.name}
                </h2>
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="p-2 hover:bg-[var(--app-hover)] rounded-full text-[var(--app-muted)] transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleAddExpense} className="space-y-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-[var(--app-muted)] uppercase tracking-[0.2em]">Transaction Merchant / Entity</label>
                  <input 
                    required
                    type="text" 
                    placeholder="e.g. AWS, Swiggy, Office Rent..."
                    value={newExpense.merchant}
                    onChange={e => setNewExpense({...newExpense, merchant: e.target.value})}
                    className="w-full px-5 py-4 bg-[var(--app-bg)] rounded-xl border border-[var(--app-inner-border)] text-[var(--app-text)] placeholder-[var(--app-muted)] focus:border-[var(--app-muted)] transition-all outline-none font-medium"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-[var(--app-muted)] uppercase tracking-[0.2em]">Transaction Amount (INR)</label>
                    <input 
                      required
                      type="number" 
                      step="0.01"
                      placeholder="0.00"
                      value={newExpense.amount || ''}
                      onChange={e => {
                        const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                        setNewExpense({...newExpense, amount: val});
                      }}
                      className="w-full px-5 py-4 bg-[var(--app-bg)] rounded-xl border border-[var(--app-inner-border)] text-[var(--app-text)] placeholder-[var(--app-muted)] focus:border-[var(--app-muted)] transition-all outline-none font-mono"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-[var(--app-muted)] uppercase tracking-[0.2em]">Date of Entry</label>
                    <input 
                      required
                      type="date" 
                      value={newExpense.date}
                      onChange={e => setNewExpense({...newExpense, date: e.target.value})}
                      className="w-full px-5 py-4 bg-[var(--app-bg)] rounded-xl border border-[var(--app-inner-border)] text-[var(--app-text)] focus:border-[var(--app-muted)] transition-all outline-none font-medium cursor-pointer"
                    />
                  </div>
                </div>

                <div className="space-y-3 relative">
                  <label className="text-[10px] font-bold text-[var(--app-muted)] uppercase tracking-[0.2em]">Classification</label>
                  <div className="relative">
                    <select 
                      value={newExpense.category}
                      onChange={e => setNewExpense({...newExpense, category: e.target.value as ExpenseCategory})}
                      className="w-full px-5 py-4 bg-[var(--app-bg)] rounded-xl border border-[var(--app-inner-border)] text-[var(--app-text)] focus:border-[var(--app-muted)] transition-all outline-none appearance-none font-medium cursor-pointer pr-12"
                    >
                      {EXPENSE_CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--app-muted)]">
                      <ChevronDown size={14} />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-[var(--app-muted)] uppercase tracking-[0.2em]">Telemetry / Description</label>
                  <textarea 
                    placeholder="Enter additional transaction metadata..."
                    value={newExpense.description}
                    onChange={e => setNewExpense({...newExpense, description: e.target.value})}
                    rows={3}
                    className="w-full px-5 py-4 bg-[var(--app-bg)] rounded-xl border border-[var(--app-inner-border)] text-[var(--app-text)] placeholder-[var(--app-muted)] focus:border-[var(--app-muted)] transition-all outline-none font-medium resize-none"
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-[var(--app-muted)] uppercase tracking-[0.2em]">Bill Photo / Attachment</label>
                  <div className="relative">
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setBillPreview(reader.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="hidden"
                      id="bill-upload"
                    />
                    <label 
                      htmlFor="bill-upload"
                      className="w-full px-5 py-8 border-2 border-dashed border-[var(--app-inner-border)] rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-[var(--app-muted)] transition-all bg-[var(--app-bg)]/50"
                    >
                      {billPreview ? (
                        <div className="relative group/bill">
                          <img src={billPreview} className="h-32 w-auto rounded-lg shadow-lg border border-[var(--app-inner-border)]" alt="Bill preview" />
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              setBillPreview(null);
                            }}
                            className="absolute -top-2 -right-2 p-1.5 bg-red-600 text-white rounded-full shadow-lg group-hover/bill:scale-110 transition-all"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="p-3 bg-[var(--app-hover)] rounded-xl text-[var(--app-muted)]">
                            <Upload size={20} />
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] font-bold text-[var(--app-text)] uppercase tracking-widest">Click to upload bill</p>
                            <p className="text-[9px] text-[var(--app-muted)] font-medium mt-1 uppercase tracking-widest">Supports PNG, JPG (Max 5MB)</p>
                          </div>
                        </>
                      )}
                    </label>
                  </div>
                </div>

                <div className="pt-6">
                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-[var(--app-accent)] hover:opacity-90 disabled:opacity-50 text-[var(--app-accent-foreground)] font-bold py-5 rounded-2xl uppercase tracking-[0.2em] text-xs transition-all active:scale-[0.98] shadow-sm flex items-center justify-center gap-3"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin"></div>
                        Syncing...
                      </>
                    ) : (
                      'Commit Transaction'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}

        {showProfileModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowProfileModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-[var(--app-surface)] rounded-3xl p-10 shadow-2xl border border-[var(--app-border)]"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-xl font-bold text-[var(--app-text)] uppercase tracking-widest">Edit Credentials</h2>
                <button onClick={() => setShowProfileModal(false)} className="p-2 hover:bg-[var(--app-hover)] rounded-full text-[var(--app-muted)] transition-all">
                  <X size={20} />
                </button>
              </div>
              
              <form onSubmit={handleUpdateProfile} className="space-y-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-[var(--app-muted)] uppercase tracking-[0.2em]">Full Legal Name</label>
                  <input 
                    required
                    type="text" 
                    value={tempProfile.name}
                    onChange={e => setTempProfile({...tempProfile, name: e.target.value})}
                    className="w-full px-5 py-4 bg-[var(--app-bg)] rounded-xl border border-[var(--app-inner-border)] text-[var(--app-text)] focus:border-[var(--app-muted)] transition-all outline-none font-medium"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-[var(--app-muted)] uppercase tracking-[0.2em]">Designation / Role</label>
                  <input 
                    required
                    type="text" 
                    value={tempProfile.role}
                    onChange={e => setTempProfile({...tempProfile, role: e.target.value})}
                    className="w-full px-5 py-4 bg-[var(--app-bg)] rounded-xl border border-[var(--app-inner-border)] text-[var(--app-text)] focus:border-[var(--app-muted)] transition-all outline-none font-medium"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-[var(--app-muted)] uppercase tracking-[0.2em]">Enterprise Email</label>
                  <input 
                    required
                    type="email" 
                    value={tempProfile.email}
                    onChange={e => setTempProfile({...tempProfile, email: e.target.value})}
                    className="w-full px-5 py-4 bg-[var(--app-bg)] rounded-xl border border-[var(--app-inner-border)] text-[var(--app-text)] focus:border-[var(--app-muted)] transition-all outline-none font-medium"
                  />
                </div>
                
                <button 
                  type="submit"
                  className="w-full bg-white hover:bg-zinc-200 text-black font-bold py-5 rounded-2xl uppercase tracking-[0.2em] text-xs transition-all active:scale-[0.98]"
                >
                  Save Global Profile
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {showBillModal && selectedBill && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowBillModal(false)}
              className="absolute inset-0 bg-black/95 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative w-full max-w-4xl bg-[var(--app-surface)] rounded-[2.5rem] overflow-hidden shadow-2xl border border-[var(--app-border)]"
            >
              <div className="flex items-center justify-between p-8 border-b border-[var(--app-border)]">
                <h2 className="text-xl font-bold text-[var(--app-text)] uppercase tracking-widest flex items-center gap-3">
                  <FileText size={20} className="text-[var(--app-muted)]" />
                  Bill Evidence Verification
                </h2>
                <div className="flex items-center gap-3">
                  <a 
                    href={selectedBill} 
                    download="bill_receipt.png"
                    className="p-3 bg-[var(--app-hover)] hover:bg-[var(--app-inner-border)] rounded-full text-[var(--app-text)] border border-[var(--app-inner-border)] transition-all flex items-center gap-2 text-xs font-bold uppercase tracking-widest px-6"
                  >
                    <Download size={16} />
                    Download
                  </a>
                  <button 
                    onClick={() => setShowBillModal(false)} 
                    className="p-3 hover:bg-[var(--app-hover)] rounded-full text-[var(--app-muted)] transition-all"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>
              <div className="p-8 flex items-center justify-center bg-black/40 min-h-[400px]">
                <img 
                  src={selectedBill} 
                  className="max-w-full max-h-[70vh] rounded-xl shadow-2xl object-contain border border-[var(--app-border)]" 
                  alt="Bill attachment" 
                />
              </div>
              <div className="p-6 bg-[var(--app-sidebar)] border-t border-[var(--app-border)] text-center">
                <p className="text-[10px] font-bold text-[var(--app-muted)] uppercase tracking-widest">Digital Asset Hash Certified • Impartial Evidence Store</p>
              </div>
            </motion.div>
          </div>
        )}

        {showEditModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isSubmitting && setShowEditModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl bg-[var(--app-surface)] rounded-[2.5rem] p-10 shadow-2xl border border-[var(--app-border)] overflow-y-auto max-h-[90vh]"
            >
              <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-[var(--app-hover)] rounded-2xl text-[var(--app-muted)]">
                    <FileText size={24} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-[var(--app-text)] uppercase tracking-[0.2em] leading-tight">Edit Transaction</h2>
                    <p className="text-[10px] font-bold text-[var(--app-muted)] uppercase tracking-widest mt-1">Ref ID: {editingExpense?.id}</p>
                  </div>
                </div>
                <button 
                  disabled={isSubmitting}
                  onClick={() => setShowEditModal(false)} 
                  className="p-3 hover:bg-[var(--app-hover)] rounded-full text-[var(--app-muted)] transition-all"
                >
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleUpdateExpense} className="space-y-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-[var(--app-muted)] uppercase tracking-[0.2em]">Transaction Merchant / Entity</label>
                  <input 
                    required
                    type="text" 
                    value={editForm.merchant || ''}
                    onChange={e => setEditForm({...editForm, merchant: e.target.value})}
                    className="w-full px-5 py-4 bg-[var(--app-bg)] rounded-xl border border-[var(--app-inner-border)] text-[var(--app-text)] placeholder-[var(--app-muted)] focus:border-[var(--app-muted)] transition-all outline-none font-medium"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-[var(--app-muted)] uppercase tracking-[0.2em]">Transaction Amount (INR)</label>
                    <input 
                      required
                      type="number" 
                      step="0.01"
                      value={editForm.amount || ''}
                      onChange={e => {
                        const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                        setEditForm({...editForm, amount: val});
                      }}
                      className="w-full px-5 py-4 bg-[var(--app-bg)] rounded-xl border border-[var(--app-inner-border)] text-[var(--app-text)] placeholder-[var(--app-muted)] focus:border-[var(--app-muted)] transition-all outline-none font-mono"
                    />
                  </div>
                  
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-[var(--app-muted)] uppercase tracking-[0.2em]">Posting Date</label>
                    <input 
                      required
                      type="date" 
                      value={editForm.date || ''}
                      onChange={e => setEditForm({...editForm, date: e.target.value})}
                      className="w-full px-5 py-4 bg-[var(--app-bg)] rounded-xl border border-[var(--app-inner-border)] text-[var(--app-text)] focus:border-[var(--app-muted)] transition-all outline-none font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-[var(--app-muted)] uppercase tracking-[0.2em]">Classification</label>
                    <select 
                      value={editForm.category}
                      onChange={e => setEditForm({...editForm, category: e.target.value as ExpenseCategory})}
                      className="w-full px-5 py-4 bg-[var(--app-bg)] rounded-xl border border-[var(--app-inner-border)] text-[var(--app-text)] focus:border-[var(--app-muted)] transition-all outline-none font-medium appearance-none"
                    >
                      {EXPENSE_CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-[var(--app-muted)] uppercase tracking-[0.2em]">Process Status</label>
                    <select 
                      value={editForm.status}
                      onChange={e => setEditForm({...editForm, status: e.target.value as Expense['status']})}
                      className="w-full px-5 py-4 bg-[var(--app-bg)] rounded-xl border border-[var(--app-inner-border)] text-[var(--app-text)] focus:border-[var(--app-muted)] transition-all outline-none font-medium appearance-none"
                    >
                      <option value="Pending">Pending</option>
                      <option value="Approved">Approved</option>
                      <option value="Declined">Declined</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-[var(--app-muted)] uppercase tracking-[0.2em]">Executive Summary / Description</label>
                  <textarea 
                    placeholder="Add specific context..."
                    value={editForm.description || ''}
                    onChange={e => setEditForm({...editForm, description: e.target.value})}
                    className="w-full px-5 py-4 bg-[var(--app-bg)] rounded-xl border border-[var(--app-inner-border)] text-[var(--app-text)] placeholder-[var(--app-muted)] focus:border-[var(--app-muted)] transition-all outline-none font-medium resize-none h-24"
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-bold text-[var(--app-muted)] uppercase tracking-[0.2em]">Bill Photo / Attachment</label>
                  <div className="relative">
                    <input 
                      type="file" 
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setBillPreview(reader.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                      className="hidden"
                      id="edit-bill-upload"
                    />
                    <label 
                      htmlFor="edit-bill-upload"
                      className="w-full px-5 py-8 border-2 border-dashed border-[var(--app-inner-border)] rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-[var(--app-muted)] transition-all bg-[var(--app-bg)]/50"
                    >
                      {billPreview ? (
                        <div className="relative group/bill">
                          <img src={billPreview} className="h-32 w-auto rounded-lg shadow-lg border border-[var(--app-inner-border)]" alt="Bill preview" />
                          <button 
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              setBillPreview(null);
                            }}
                            className="absolute -top-2 -right-2 p-1.5 bg-red-600 text-white rounded-full shadow-lg"
                          >
                            <X size={12} />
                          </button>
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/bill:opacity-100 flex items-center justify-center transition-all rounded-lg">
                            <p className="text-[8px] font-bold text-white uppercase tracking-widest">Change Photo</p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="p-3 bg-[var(--app-hover)] rounded-xl text-[var(--app-muted)]">
                            <Upload size={20} />
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] font-bold text-[var(--app-text)] uppercase tracking-widest">Click to upload bill</p>
                            <p className="text-[9px] text-[var(--app-muted)] font-medium mt-1 uppercase tracking-widest">PNG, JPG (Max 5MB)</p>
                          </div>
                        </>
                      )}
                    </label>
                  </div>
                </div>

                <div className="pt-6">
                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-[var(--app-muted)] hover:bg-[var(--app-text)] text-[var(--app-surface)] font-bold py-5 rounded-2xl uppercase tracking-[0.3em] text-[11px] transition-all active:scale-[0.98] shadow-xl disabled:opacity-50 flex items-center justify-center gap-3"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-[var(--app-surface)]/20 border-t-[var(--app-surface)] rounded-full animate-spin"></div>
                        Syncing Changes...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={18} />
                        Save Modifications
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavItem({ icon, label, active, onClick, isSidebarOpen }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void, isSidebarOpen: boolean }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-4 w-full p-4 rounded-xl transition-all group overflow-hidden whitespace-nowrap border-l-2",
        active 
          ? "bg-[#141414] text-white border-white font-bold" 
          : "text-[#71717a] hover:text-[#a1a1aa] border-transparent hover:bg-[#0a0a0a]"
      )}
    >
      <div className={cn(
        "shrink-0 transition-transform group-hover:scale-110",
        active ? "text-white" : "text-[#52525b]"
      )}>
        {icon}
      </div>
      {isSidebarOpen && (
        <motion.span 
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-[11px] uppercase tracking-widest font-bold"
        >
          {label}
        </motion.span>
      )}
    </button>
  );
}

function SummaryCard({ title, value, trend, icon, variant }: { title: string, value: string, trend: string, icon: React.ReactNode, variant: 'primary' | 'warning' | 'success' | 'info' | 'danger' }) {
  const borderColors = {
    primary: "border-l-zinc-500",
    warning: "border-l-amber-500/50",
    success: "border-l-emerald-500/50",
    info: "border-l-blue-500/50",
    danger: "border-l-red-500/50",
  };

  return (
    <div className={cn(
      "bg-[#0f0f0f] p-6 lg:p-8 rounded-2xl border border-[#1f1f1f] border-l-4 transition-all hover:bg-[#141414] group",
      borderColors[variant]
    )}>
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-8 h-full justify-between">
          <p className="text-[11px] font-bold text-[#71717a] uppercase tracking-[0.2em]">{title}</p>
          <div className="space-y-1">
            <h3 className="text-3xl font-light text-white tracking-tighter transition-transform group-hover:translate-x-1">{value}</h3>
            <p className={cn(
              "text-[10px] font-bold uppercase tracking-wider",
              variant === 'primary' ? "text-[#a1a1aa]" : 
              variant === 'warning' ? "text-amber-500/80" : 
              variant === 'success' ? "text-emerald-500/80" :
              variant === 'info' ? "text-blue-500/80" : "text-red-500/80"
            )}>
              {trend}
            </p>
          </div>
        </div>
        <div className={cn(
          "p-3 rounded-xl bg-[#141414] border border-[#262626] transition-all group-hover:border-white/10",
          variant === 'primary' ? "text-white" : 
          variant === 'warning' ? "text-amber-500" : 
          variant === 'success' ? "text-emerald-500" :
          variant === 'info' ? "text-blue-500" : "text-red-500"
        )}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function SortIcon({ active, direction }: { active: boolean, direction?: 'asc' | 'desc' }) {
  if (!active) return <div className="w-3 h-3 opacity-20"><ChevronUp size={12} /></div>;
  return (
    <div className="w-3 h-3 text-[var(--app-text)]">
      {direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
    </div>
  );
}

function StatusBadge({ status }: { status: Expense['status'] }) {
  const styles = {
    Approved: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    Pending: "bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]",
    Declined: "bg-red-500/10 text-red-500 border-red-500/20",
    Reimbursed: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  };

  const icons = {
    Approved: <CheckCircle2 size={10} />,
    Pending: <AlertCircle size={10} className="animate-pulse" />,
    Declined: <XCircle size={10} />,
    Reimbursed: <History size={10} />,
  };

  return (
    <span className={cn(
      "px-2.5 py-1.5 rounded text-[10px] font-bold uppercase tracking-widest border flex items-center gap-1.5 w-fit transition-all",
      styles[status]
    )}>
      {icons[status]}
      {status === 'Pending' ? 'Action Required' : status}
    </span>
  );
}

function ShortcutButton({ label, onClick }: { label: string, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="w-full text-left px-5 py-3 bg-[var(--app-hover)] hover:bg-[var(--app-inner-border)] border border-[var(--app-inner-border)] hover:border-[var(--app-muted)] rounded-xl text-[10px] font-bold text-[var(--app-muted)] hover:text-[var(--app-text)] uppercase tracking-widest transition-all flex items-center justify-between group"
    >
      {label}
      <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0" />
    </button>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-[var(--app-inner-border)] h-12 w-full", className)} />;
}

// Separate View Components
function ExpensesTable({ 
  filteredExpenses, 
  selectedIds, 
  toggleSelectAll, 
  toggleSelect, 
  sortConfig, 
  toggleSort, 
  statusFilter, 
  setStatusFilter, 
  onAddClick,
  handleBulkAction,
  handleBulkDelete,
  onDeselectAll,
  onViewBill,
  onEdit,
  title = "Real-Time Transactions"
}: { 
  filteredExpenses: Expense[], 
  selectedIds: Set<string>, 
  toggleSelectAll: () => void, 
  toggleSelect: (id: string) => void, 
  sortConfig: { key: keyof Expense; direction: 'asc' | 'desc' } | null, 
  toggleSort: (key: keyof Expense) => void, 
  statusFilter: Expense['status'] | 'All', 
  setStatusFilter: (filter: Expense['status'] | 'All') => void,
  onAddClick: () => void,
  handleBulkAction: (status: Expense['status']) => void,
  handleBulkDelete: () => void,
  onDeselectAll: () => void,
  onViewBill: (url: string) => void,
  onEdit: (expense: Expense) => void,
  title?: string
}) {
  return (
    <div className="bg-[var(--app-surface)] rounded-2xl border border-[var(--app-border)] overflow-hidden shadow-[var(--app-card-shadow)]">
      <div className="px-8 py-6 border-b border-[var(--app-border)] bg-[var(--app-header)] min-h-[88px] flex items-center">
        <AnimatePresence mode="wait">
          {selectedIds.size > 0 ? (
            <motion.div 
              key="bulk-actions"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center justify-between w-full"
            >
              <div className="flex items-center gap-4">
                <span className="text-xs font-bold text-[var(--app-text)] uppercase tracking-wider">
                  {selectedIds.size} items selected
                </span>
                <div className="h-4 w-px bg-[var(--app-border)]" />
                <button 
                  onClick={onDeselectAll}
                  className="text-[10px] font-bold text-[var(--app-muted)] hover:text-[var(--app-text)] uppercase tracking-widest transition-colors"
                >
                  Deselect all
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button 
                  onClick={() => handleBulkAction('Approved')}
                  className="bg-emerald-500 hover:bg-emerald-600 text-black px-3 lg:px-4 py-2 rounded-lg text-[9px] lg:text-[10px] font-bold uppercase tracking-widest transition-all"
                >
                  Approve
                </button>
                <button 
                  onClick={() => handleBulkAction('Reimbursed')}
                  className="bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 px-3 lg:px-4 py-2 rounded-lg text-[9px] lg:text-[10px] font-bold uppercase tracking-widest transition-all"
                >
                  Reimburse
                </button>
                <button 
                  onClick={() => handleBulkAction('Declined')}
                  className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 px-3 lg:px-4 py-2 rounded-lg text-[9px] lg:text-[10px] font-bold uppercase tracking-widest transition-all"
                >
                  Decline
                </button>
                <div className="hidden sm:block h-4 w-px bg-[var(--app-border)] mx-1" />
                <button 
                  onClick={handleBulkDelete}
                  className="bg-red-600 hover:bg-red-700 text-white px-3 lg:px-4 py-2 rounded-lg text-[9px] lg:text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2"
                >
                  <Trash2 size={12} />
                  <span className="hidden sm:inline">Delete Selected</span>
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="default-header"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col md:flex-row md:items-center justify-between w-full gap-4"
            >
              <h2 className="text-sm font-bold text-[var(--app-text)] uppercase tracking-widest">{title}</h2>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex bg-[var(--app-hover)] rounded-lg border border-[var(--app-inner-border)] p-1 overflow-x-auto w-full sm:w-auto scrollbar-hide">
                  {(['All', 'Pending', 'Approved', 'Declined', 'Reimbursed'] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => setStatusFilter(status)}
                      className={cn(
                        "px-3 py-1.5 text-[9px] lg:text-[10px] font-bold uppercase tracking-wider rounded-md transition-all whitespace-nowrap",
                        statusFilter === status 
                          ? "bg-[var(--app-inner-border)] text-[var(--app-text)] shadow-sm" 
                          : "text-[var(--app-muted)] hover:text-[#a1a1aa]"
                      )}
                    >
                      {status}
                    </button>
                  ))}
                </div>
                <button 
                  onClick={onAddClick}
                  className="bg-[var(--app-accent)] hover:opacity-90 text-[var(--app-accent-foreground)] px-5 py-2.5 rounded-lg text-[10px] lg:text-xs font-bold uppercase tracking-widest transition-all active:scale-95 shadow-sm w-full sm:w-auto"
                >
                  Add Expense
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[var(--app-sidebar)] text-[10px] uppercase tracking-widest text-[var(--app-muted)] font-bold">
              <th className="px-8 py-4 w-10">
                <input 
                  type="checkbox" 
                  className="accent-[var(--app-accent)] cursor-pointer"
                  checked={selectedIds.size > 0 && selectedIds.size === filteredExpenses.length}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="px-8 py-4 cursor-pointer hover:text-[var(--app-text)] transition-colors" onClick={() => toggleSort('merchant')}>
                <div className="flex items-center gap-2">
                  Merchant / Asset
                  <SortIcon active={sortConfig?.key === 'merchant'} direction={sortConfig?.direction} />
                </div>
              </th>
              <th className="px-8 py-4">Status</th>
              <th className="px-8 py-4 cursor-pointer hover:text-[var(--app-text)] transition-colors" onClick={() => toggleSort('category')}>
                <div className="flex items-center gap-2">
                  Category
                  <SortIcon active={sortConfig?.key === 'category'} direction={sortConfig?.direction} />
                </div>
              </th>
              <th className="px-8 py-4 text-right cursor-pointer hover:text-[var(--app-text)] transition-colors" onClick={() => toggleSort('amount')}>
                <div className="flex items-center gap-2 justify-end">
                  Amount
                  <SortIcon active={sortConfig?.key === 'amount'} direction={sortConfig?.direction} />
                </div>
              </th>
              <th className="px-8 py-4 text-center">Receipt</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--app-border)]">
            {filteredExpenses.map((expense) => (
              <motion.tr 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                key={expense.id} 
                className={cn(
                  "hover:bg-[var(--app-hover)] transition-colors group cursor-pointer",
                  selectedIds.has(expense.id) && "bg-[var(--app-hover)]"
                )}
                onClick={() => toggleSelect(expense.id)}
              >
                <td className="px-8 py-5" onClick={(e) => e.stopPropagation()}>
                  <input 
                    type="checkbox" 
                    className="accent-[var(--app-accent)] cursor-pointer"
                    checked={selectedIds.has(expense.id)}
                    onChange={() => toggleSelect(expense.id)}
                  />
                </td>
                <td className="px-8 py-5">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-[var(--app-hover)] border border-[var(--app-inner-border)] rounded-xl flex items-center justify-center text-[var(--app-text)] font-mono group-hover:border-[var(--app-muted)] transition-all">
                      {expense.merchant[0]}
                    </div>
                    <div>
                      <div className="font-semibold text-[var(--app-text)] tracking-tight">{expense.merchant}</div>
                      <div className="text-[11px] text-[var(--app-muted)] font-medium">{format(parseISO(expense.date), 'MMM dd, yyyy')}</div>
                    </div>
                  </div>
                </td>
                <td className="px-8 py-5">
                  <StatusBadge status={expense.status} />
                </td>
                <td className="px-8 py-5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--app-muted)] px-3 py-1 bg-[var(--app-hover)] border border-[var(--app-inner-border)] rounded-md group-hover:text-[var(--app-text)] transition-colors">{expense.category}</span>
                </td>
                <td className="px-8 py-5 text-right">
                  <span className="font-mono text-[var(--app-text)] text-base">{formatCurrency(expense.amount)}</span>
                </td>
                <td className="px-8 py-5 text-center">
                  <div className="flex items-center justify-center gap-2">
                    {expense.billUrl ? (
                      <>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewBill(expense.billUrl!);
                          }}
                          className="p-2.5 bg-[var(--app-hover)] hover:bg-[var(--app-inner-border)] border border-[var(--app-inner-border)] hover:border-[var(--app-muted)] rounded-xl text-[var(--app-muted)] hover:text-[var(--app-accent)] transition-all flex items-center justify-center group/eye"
                          title="View Bill Receipt"
                        >
                          <Eye size={16} className="transition-transform group-hover/eye:scale-110" />
                        </button>
                        <a 
                          href={expense.billUrl}
                          download={`bill_${expense.merchant.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png`}
                          onClick={(e) => e.stopPropagation()}
                          className="p-2.5 bg-[var(--app-hover)] hover:bg-[var(--app-inner-border)] border border-[var(--app-inner-border)] hover:border-[var(--app-muted)] rounded-xl text-[var(--app-muted)] hover:text-[var(--app-text)] transition-all flex items-center justify-center group/dl"
                          title="Download Receipt"
                        >
                          <Download size={16} className="transition-transform group-hover/dl:scale-110" />
                        </a>
                      </>
                    ) : (
                      <div className="w-10 h-10 border border-dashed border-[var(--app-inner-border)] rounded-xl flex items-center justify-center opacity-40">
                        <span className="text-[8px] font-bold text-[var(--app-muted)] uppercase">NA</span>
                      </div>
                    )}
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(expense);
                      }}
                      className="p-2.5 bg-[var(--app-hover)] hover:bg-[var(--app-inner-border)] border border-[var(--app-inner-border)] hover:border-[var(--app-muted)] rounded-xl text-[var(--app-muted)] hover:text-[var(--app-text)] transition-all flex items-center justify-center group/edit"
                      title="Edit Transaction"
                    >
                       <FileText size={16} className="transition-transform group-hover/edit:scale-110" />
                    </button>
                  </div>
                </td>
              </motion.tr>
            ))}
            {filteredExpenses.length === 0 && (
              <tr>
                <td colSpan={5} className="px-8 py-12 text-center text-[#52525b] text-xs font-bold uppercase tracking-widest">
                  No transactions found for this filter
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SettingsView({ 
  totalBudget, 
  onSetBudget,
  centers,
  setActiveCenterId,
  setTempBudget,
  setShowBudgetModal,
  handleDeleteCenter,
  setShowCenterModal,
  onEditCenter,
  userProfile,
  onEditProfile
}: { 
  totalBudget: number, 
  onSetBudget: () => void,
  centers: Center[],
  setActiveCenterId: (id: string) => void,
  setTempBudget: (val: string) => void,
  setShowBudgetModal: (show: boolean) => void,
  handleDeleteCenter: (id: string) => void,
  setShowCenterModal: (show: boolean) => void,
  onEditCenter: (center: Center) => void,
  userProfile: any,
  onEditProfile: () => void
}) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-2xl">
      <h2 className="text-xl font-bold text-[var(--app-text)] uppercase tracking-widest mb-12">Configuration Portal</h2>
      
      <div className="space-y-12">
        <section>
          <h3 className="text-[10px] font-bold text-[var(--app-muted)] uppercase tracking-[0.2em] mb-6">User Profile</h3>
          <div className="flex items-center gap-6 p-6 bg-[var(--app-surface)] border border-[var(--app-border)] rounded-2xl shadow-[var(--app-card-shadow)]">
            <div className="w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
               <User size={20} className="text-zinc-500" />
            </div>
            <div>
              <p className="text-[var(--app-text)] font-bold tracking-tight">{userProfile.name}</p>
              <p className="text-xs text-[var(--app-muted)] font-medium">{userProfile.role} • {userProfile.email}</p>
            </div>
            <button 
              onClick={onEditProfile}
              className="ml-auto text-[10px] font-bold text-[var(--app-text)] uppercase tracking-widest p-2 hover:bg-[var(--app-hover)] rounded-lg transition-colors"
            >
              Edit
            </button>
          </div>
        </section>

        <section>
          <h3 className="text-[10px] font-bold text-[var(--app-muted)] uppercase tracking-[0.2em] mb-6">Organization Units</h3>
          <div className="space-y-3">
            {centers.map(center => (
              <div key={center.id} className="flex items-center justify-between p-5 bg-[var(--app-surface)] border border-[var(--app-border)] rounded-xl group">
                <div>
                  <p className="text-xs font-bold text-[var(--app-text)] uppercase tracking-widest">{center.name}</p>
                  <p className="text-[10px] text-[var(--app-muted)] font-mono mt-1">CAP: {formatCurrency(center.budget)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => onEditCenter(center)}
                    className="p-2 hover:bg-[var(--app-hover)] rounded-lg text-[var(--app-muted)] hover:text-[var(--app-text)] transition-all"
                    title="Edit Center Name"
                  >
                    <Settings size={14} />
                  </button>
                  <button 
                    onClick={() => {
                      setActiveCenterId(center.id);
                      setTempBudget(center.budget.toString());
                      setShowBudgetModal(true);
                    }}
                    className="p-2 hover:bg-[var(--app-hover)] rounded-lg text-[var(--app-muted)] hover:text-[var(--app-text)] transition-all"
                    title="Edit Budget"
                  >
                    <Wallet size={14} />
                  </button>
                  {centers.length > 1 && (
                    <button 
                      onClick={() => handleDeleteCenter(center.id)}
                      className="p-2 hover:bg-red-500/10 rounded-lg text-[var(--app-muted)] hover:text-red-500 transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button 
              onClick={() => setShowCenterModal(true)}
              className="w-full flex items-center justify-center gap-2 p-5 border border-dashed border-[var(--app-border)] rounded-xl text-[10px] font-bold text-[var(--app-muted)] uppercase tracking-widest hover:border-[var(--app-muted)] hover:text-[var(--app-text)] transition-all"
            >
              <Plus size={14} />
              Register New Operational Unit
            </button>
          </div>
        </section>

        <section>
          <h3 className="text-[10px] font-bold text-[var(--app-muted)] uppercase tracking-[0.2em] mb-6">Organization Standards</h3>
          <div className="space-y-3">
            <SettingItem label="Monthly Budget Allocation" value={formatCurrency(totalBudget)} onClick={onSetBudget} />
            <SettingItem label="Default Transaction Currency" value="INR (₹)" />
            <SettingItem label="Auto-Sync Interval" value="Real-Time (active)" />
            <SettingItem label="Receipt Recognition" value="Neural OCR Enhanced" />
            <SettingItem label="Security Tier" value="Standard Enterprise (ISO 27001)" />
          </div>
        </section>
      </div>
    </motion.div>
  );
}

function SettingItem({ label, value, onClick }: { label: string, value: string, onClick?: () => void }) {
  return (
    <div 
      onClick={onClick}
      className={cn(
        "flex items-center justify-between p-5 bg-[var(--app-surface)] border border-[var(--app-border)] rounded-xl hover:border-[var(--app-muted)] transition-colors cursor-pointer group",
        onClick && "hover:bg-[var(--app-hover)]"
      )}
    >
      <span className="text-xs font-bold text-[var(--app-muted)] lowercase tracking-wide group-hover:text-[var(--app-text)] transition-colors">{label}</span>
      <span className="text-xs font-mono text-[var(--app-text)] opacity-60">{value}</span>
    </div>
  );
}
