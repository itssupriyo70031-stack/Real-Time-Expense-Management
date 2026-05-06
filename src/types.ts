/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ExpenseCategory = 'Travel' | 'Food & Beverage' | 'Software/SaaS' | 'Marketing' | 'Office' | 'Entertainment' | 'Other';

export type ExpenseStatus = 'Pending' | 'Approved' | 'Declined' | 'Reimbursed';

export interface Center {
  id: string;
  name: string;
  budget: number;
}

export interface Expense {
  id: string;
  merchant: string;
  amount: number;
  date: string;
  category: ExpenseCategory;
  status: ExpenseStatus;
  description?: string;
  centerId: string;
}

export interface SpendingInsight {
  title: string;
  description: string;
  type: 'info' | 'warning' | 'success';
}
