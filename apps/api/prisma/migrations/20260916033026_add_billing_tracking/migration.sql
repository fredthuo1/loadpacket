-- AlterTable
ALTER TABLE "loads" ADD COLUMN     "amount_paid" DECIMAL(12,2),
ADD COLUMN     "billing_recipient_email" TEXT,
ADD COLUMN     "billing_recipient_name" TEXT,
ADD COLUMN     "billing_submitted_at" TIMESTAMP(3),
ADD COLUMN     "invoice_issued_at" TIMESTAMP(3),
ADD COLUMN     "invoice_number" TEXT,
ADD COLUMN     "paid_at" TIMESTAMP(3),
ADD COLUMN     "payment_due_at" TIMESTAMP(3),
ADD COLUMN     "payment_terms_days" INTEGER;
