export interface RecurringGroupPublic {
  id: string;
  merchantKey: string;
  displayName: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  avgAmount: string;
  cadenceDays: number;
  firstSeen: string;
  lastSeen: string;
  nextExpected: string | null;
  isDismissed: boolean;
  txCount: number;
}

export interface DetectResult {
  detected: number;
  updated: number;
  totalGroups: number;
}
