-- T012 Supplier Domain — Migration A (Optimistic Lock, BR09)
ALTER TABLE "suppliers" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
