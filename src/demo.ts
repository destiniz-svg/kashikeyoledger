/**
 * A tiny runnable demo of the ledger. Run with: `npm run demo`.
 *
 * Scenario: a small business is capitalised, buys supplies for cash, and makes
 * a sale on credit. The trial balance at the end should be in balance.
 */
import { Ledger, account, credit, debit } from "./ledger.ts";
import { formatMoney, fromMajor } from "./money.ts";

const ledger = new Ledger();

ledger.addAccount(account("cash", "Cash", "asset"));
ledger.addAccount(account("ar", "Accounts Receivable", "asset"));
ledger.addAccount(account("supplies", "Supplies", "asset"));
ledger.addAccount(account("capital", "Owner's Capital", "equity"));
ledger.addAccount(account("sales", "Sales Revenue", "income"));

ledger.post({
  date: "2026-07-01",
  description: "Owner invests capital",
  postings: [debit("cash", fromMajor(10_000)), credit("capital", fromMajor(10_000))],
});

ledger.post({
  date: "2026-07-03",
  description: "Buy supplies for cash",
  postings: [debit("supplies", fromMajor(1_250)), credit("cash", fromMajor(1_250))],
});

ledger.post({
  date: "2026-07-10",
  description: "Sale on account",
  postings: [debit("ar", fromMajor(4_800)), credit("sales", fromMajor(4_800))],
});

console.log("Trial balance");
console.log("-------------");
for (const row of ledger.trialBalance()) {
  console.log(
    `${row.name.padEnd(22)} ${row.type.padEnd(10)} ${formatMoney(row.balance).padStart(12)}`,
  );
}
console.log("-------------");
console.log(`Out of balance by: ${formatMoney(ledger.outOfBalanceBy())}`);
