-- Add REFUND to the PaymentType enum.
-- Used when the store pays a customer back (e.g. layaway cancellation
-- where an advance was taken). A REFUND record decreases the
-- customer's CR balance / increases their DR balance.
ALTER TYPE "PaymentType" ADD VALUE IF NOT EXISTS 'REFUND';
