export interface DashboardSummary {
  month: string;
  income: string;
  expenses: string;
  net: string;
  budgetTotalLimit: string;
  budgetTotalSpent: string;
  budgetPercentUsed: number;
}

export interface DashboardCategorySlice {
  categoryId: string | null;
  categoryName: string;
  color: string;
  amount: string;
}

export interface DashboardTrendPoint {
  month: string;
  income: string;
  expenses: string;
}
