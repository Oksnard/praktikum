ALTER TABLE "Company" ADD CONSTRAINT "Company_balance_nonnegative" CHECK (balance >= 0);
ALTER TABLE "User" ADD CONSTRAINT "User_spent_nonnegative" CHECK (spent >= 0), ADD CONSTRAINT "User_limit_nonnegative" CHECK ("limit" >= 0);
ALTER TABLE "AiOperation" ADD CONSTRAINT "AiOperation_cost_nonnegative" CHECK (cost >= 0), ADD CONSTRAINT "AiOperation_reserve_nonnegative" CHECK (reserved >= 0);
