-- T011 Customer Domain — Migration A (Optimistic Lock, BR09)
ALTER TABLE "customers" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
