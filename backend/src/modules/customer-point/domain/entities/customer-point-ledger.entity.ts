export interface CustomerPointLedgerEntity {
  id: string;
  organizationId: string;
  customerId: string;
  referenceType: string | null;
  referenceId: string | null;
  /** Delta có dấu: dương = cộng điểm, âm = trừ điểm. */
  point: number;
  /** Số dư tích lũy ngay sau dòng này. */
  balance: number;
  expiredAt: Date | null;
  createdAt: Date;
}
