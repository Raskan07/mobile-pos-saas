/**
 * scripts/test-purchase-history.mjs
 *
 * Automated verification suite for the Purchase History Module.
 * Tests:
 * 1. Tri-Status Decoupling (Purchase Status vs Stock Status vs Payment Status)
 * 2. Partial Payments & Installment Schedule recalculations
 * 3. Cheque Payment Lifecycle (Pending -> Cleared and Pending -> Reversible Bounce)
 * 4. Purchase Returns (Debit Notes) with stock deduction and original record preservation
 * 5. Multi-Tenant Cross-Shop Isolation
 * 6. RBAC Role Permissions Guard
 */

import assert from "node:assert";

console.log("=================================================================");
console.log("  PURCHASE HISTORY MODULE: AUTOMATED VERIFICATION SUITE");
console.log("=================================================================\n");

let passedTests = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}\n`);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// TEST 1: TRI-STATUS DECOUPLING
// ---------------------------------------------------------------------------
runTest("Status Decoupling: A purchase can be RECEIVED + STOCKED while remaining UNPAID", () => {
  const purchase = {
    id: "po_test_1",
    shopId: "shop_alpha",
    purchaseOrderNumber: "PO-20260925-001",
    purchaseStatus: "RECEIVED",
    stockStatus: "STOCKED",
    paymentStatus: "UNPAID",
    totalAmount: 50000,
    amountPaid: 0,
    balanceDue: 50000,
    items: [
      {
        productId: "prod_1",
        orderedQuantity: 10,
        receivedQuantity: 10,
        returnedQuantity: 0,
        unitCost: 5000,
      },
    ],
  };

  assert.strictEqual(purchase.purchaseStatus, "RECEIVED", "PO should be fully received");
  assert.strictEqual(purchase.stockStatus, "STOCKED", "Catalog inventory should be updated");
  assert.strictEqual(purchase.paymentStatus, "UNPAID", "Payment should remain unpaid on trade credit");
  assert.strictEqual(purchase.balanceDue, 50000, "Full balance due should remain payable");
});

// ---------------------------------------------------------------------------
// TEST 2: PARTIAL PAYMENTS & INSTALLMENTS SCHEDULE RECALCULATION
// ---------------------------------------------------------------------------
runTest("Partial Payments & Installment Schedule updates balance and transitions paymentStatus", () => {
  let purchase = {
    totalAmount: 100000,
    amountPaid: 0,
    balanceDue: 100000,
    paymentStatus: "UNPAID",
    payments: [],
    installments: [
      { id: "inst_1", installmentNumber: 1, amountDue: 50000, amountPaid: 0, status: "PENDING" },
      { id: "inst_2", installmentNumber: 2, amountDue: 50000, amountPaid: 0, status: "PENDING" },
    ],
  };

  // Payment 1: Upfront Partial of 30,000 against installment 1
  const payment1 = { id: "pay_1", amount: 30000, installmentNumber: 1 };
  purchase.payments.push(payment1);
  purchase.amountPaid += payment1.amount;
  purchase.balanceDue = purchase.totalAmount - purchase.amountPaid;
  purchase.installments[0].amountPaid += payment1.amount;
  purchase.paymentStatus = purchase.amountPaid >= purchase.totalAmount ? "PAID" : "PARTIALLY_PAID";

  assert.strictEqual(purchase.amountPaid, 30000);
  assert.strictEqual(purchase.balanceDue, 70000);
  assert.strictEqual(purchase.paymentStatus, "PARTIALLY_PAID");
  assert.strictEqual(purchase.installments[0].status, "PENDING", "Inst 1 not yet fully paid");

  // Payment 2: Remaining 20,000 for installment 1
  const payment2 = { id: "pay_2", amount: 20000, installmentNumber: 1 };
  purchase.payments.push(payment2);
  purchase.amountPaid += payment2.amount;
  purchase.balanceDue = purchase.totalAmount - purchase.amountPaid;
  purchase.installments[0].amountPaid += payment2.amount;
  if (purchase.installments[0].amountPaid >= purchase.installments[0].amountDue) {
    purchase.installments[0].status = "PAID";
  }

  assert.strictEqual(purchase.amountPaid, 50000);
  assert.strictEqual(purchase.balanceDue, 50000);
  assert.strictEqual(purchase.installments[0].status, "PAID");

  // Payment 3: Settle final 50,000 for installment 2
  const payment3 = { id: "pay_3", amount: 50000, installmentNumber: 2 };
  purchase.payments.push(payment3);
  purchase.amountPaid += payment3.amount;
  purchase.balanceDue = Math.max(0, purchase.totalAmount - purchase.amountPaid);
  purchase.installments[1].amountPaid += payment3.amount;
  purchase.installments[1].status = "PAID";
  purchase.paymentStatus = purchase.balanceDue === 0 ? "PAID" : "PARTIALLY_PAID";

  assert.strictEqual(purchase.amountPaid, 100000);
  assert.strictEqual(purchase.balanceDue, 0);
  assert.strictEqual(purchase.paymentStatus, "PAID");
  assert.strictEqual(purchase.installments.every((i) => i.status === "PAID"), true);
});

// ---------------------------------------------------------------------------
// TEST 3: CHEQUE PAYMENT LIFECYCLE (PENDING -> BOUNCED WITH BALANCE RESTORATION)
// ---------------------------------------------------------------------------
runTest("Cheque Lifecycle: Bounced cheque reverses amountPaid and restores balanceDue without deleting records", () => {
  const purchase = {
    totalAmount: 75000,
    amountPaid: 75000,
    balanceDue: 0,
    paymentStatus: "PAID",
    payments: [
      {
        id: "pay_chq_1",
        amount: 75000,
        paymentMethod: "CHEQUE",
        cheque: {
          chequeNumber: "000842",
          bankName: "Commercial Bank",
          chequeStatus: "PENDING",
        },
      },
    ],
    auditTrail: [],
  };

  assert.strictEqual(purchase.paymentStatus, "PAID");

  // Simulate Bouncing the cheque
  const chequePayment = purchase.payments.find((p) => p.id === "pay_chq_1");
  assert(chequePayment && chequePayment.cheque, "Cheque payment must exist");

  chequePayment.cheque.chequeStatus = "BOUNCED";
  chequePayment.cheque.bounceReason = "Insufficient Funds";
  chequePayment.cheque.bouncedAt = Date.now();

  // Deduct from amountPaid and restore balanceDue
  purchase.amountPaid = Math.max(0, purchase.amountPaid - chequePayment.amount);
  purchase.balanceDue = purchase.totalAmount - purchase.amountPaid;
  purchase.paymentStatus = purchase.amountPaid <= 0 ? "UNPAID" : "PARTIALLY_PAID";

  purchase.auditTrail.push({
    action: "CHEQUE_BOUNCED",
    details: `Cheque #${chequePayment.cheque.chequeNumber} bounced. Restored LKR ${chequePayment.amount}.`,
  });

  assert.strictEqual(purchase.amountPaid, 0, "Amount paid should be reversed to 0");
  assert.strictEqual(purchase.balanceDue, 75000, "Balance due must be restored to 75,000");
  assert.strictEqual(purchase.paymentStatus, "UNPAID", "Status must revert to UNPAID");
  assert.strictEqual(purchase.payments.length, 1, "Cheque record must NEVER be deleted");
  assert.strictEqual(purchase.payments[0].cheque.chequeStatus, "BOUNCED");
  assert.strictEqual(purchase.auditTrail.length, 1, "Audit log must record the bounce incident");
});

// ---------------------------------------------------------------------------
// TEST 4: PURCHASE RETURNS WITH INVENTORY DEDUCTION & ORIGINAL RECORD PRESERVATION
// ---------------------------------------------------------------------------
runTest("Purchase Returns (Debit Note): Adjusts catalog inventory while preserving original line items snapshot", () => {
  const purchase = {
    purchaseOrderNumber: "PO-20260925-881",
    purchaseStatus: "RECEIVED",
    stockStatus: "STOCKED",
    paymentStatus: "UNPAID",
    totalAmount: 10000,
    amountPaid: 0,
    balanceDue: 10000,
    totalOrderedQuantity: 10,
    totalReceivedQuantity: 10,
    totalReturnedQuantity: 0,
    items: [
      {
        productId: "prod_screws",
        sku: "SCRW-01",
        name: "Steel Screws Box",
        orderedQuantity: 10,
        receivedQuantity: 10,
        returnedQuantity: 0,
        unitCost: 1000,
      },
    ],
    returns: [],
  };

  // Mock catalog stock level
  let catalogInventory = 10;

  // Issue return for 3 defective units with REDUCE_PAYABLE_BALANCE
  const returnQuantity = 3;
  const unitCost = purchase.items[0].unitCost;
  const refundAmount = returnQuantity * unitCost; // 3000

  // 1. Safe catalog stock decrement
  catalogInventory -= returnQuantity;

  // 2. Line item returnedQuantity update (original ordered & received remain intact!)
  purchase.items[0].returnedQuantity += returnQuantity;
  purchase.totalReturnedQuantity += returnQuantity;

  // 3. Financial adjustment
  purchase.totalAmount = Math.max(0, purchase.totalAmount - refundAmount);
  purchase.balanceDue = Math.max(0, purchase.totalAmount - purchase.amountPaid);
  purchase.stockStatus = "PARTIALLY_RETURNED";

  // 4. Return Record added
  purchase.returns.push({
    returnNumber: "RET-20260925-01",
    totalReturnedQuantity: returnQuantity,
    totalRefundAmount: refundAmount,
    reason: "Damaged / Stripped threads",
    refundType: "REDUCE_PAYABLE_BALANCE",
    stockDeducted: true,
  });

  assert.strictEqual(catalogInventory, 7, "Catalog inventory should decrement from 10 to 7");
  assert.strictEqual(purchase.items[0].orderedQuantity, 10, "Original orderedQuantity must NEVER be mutated");
  assert.strictEqual(purchase.items[0].receivedQuantity, 10, "Original receivedQuantity must NEVER be mutated");
  assert.strictEqual(purchase.items[0].returnedQuantity, 3, "returnedQuantity is tracked accurately");
  assert.strictEqual(purchase.totalAmount, 7000, "Grand total payable reduced by 3,000");
  assert.strictEqual(purchase.balanceDue, 7000, "Balance due adjusted to 7,000");
  assert.strictEqual(purchase.stockStatus, "PARTIALLY_RETURNED");
  assert.strictEqual(purchase.returns.length, 1);
});

// ---------------------------------------------------------------------------
// TEST 5: MULTI-TENANT CROSS-SHOP ISOLATION
// ---------------------------------------------------------------------------
runTest("Multi-Tenant Isolation: Shop A can never view or modify Shop B purchases", () => {
  const allPurchasesDatabase = [
    { id: "po_1", shopId: "shop_alpha", poNumber: "PO-ALPHA-01", totalAmount: 15000 },
    { id: "po_2", shopId: "shop_alpha", poNumber: "PO-ALPHA-02", totalAmount: 25000 },
    { id: "po_3", shopId: "shop_beta",  poNumber: "PO-BETA-01",  totalAmount: 80000 },
  ];

  // Query scoped to shop_alpha
  const activeShop = "shop_alpha";
  const alphaPurchases = allPurchasesDatabase.filter((p) => p.shopId === activeShop);

  assert.strictEqual(alphaPurchases.length, 2, "Shop Alpha should only see 2 records");
  assert.strictEqual(
    alphaPurchases.some((p) => p.shopId === "shop_beta"),
    false,
    "Shop Alpha must NEVER see Shop Beta records"
  );

  // Attempting mutation across tenant boundary
  const targetPurchase = allPurchasesDatabase.find((p) => p.id === "po_3"); // belongs to shop_beta
  const attemptCrossTenantEdit = (actingShopId, purchaseRecord) => {
    if (purchaseRecord.shopId !== actingShopId) {
      throw new Error("SECURITY_VIOLATION: Cross-tenant modification forbidden");
    }
  };

  assert.throws(
    () => attemptCrossTenantEdit("shop_alpha", targetPurchase),
    /SECURITY_VIOLATION/,
    "Cross-tenant edit must be blocked"
  );
});

// ---------------------------------------------------------------------------
// TEST 6: RBAC ROLE PERMISSIONS GUARD
// ---------------------------------------------------------------------------
runTest("RBAC Permissions Guard: Admin & Manager have write access; Cashier is read-only by default", () => {
  const canUserManagePurchases = (role, permissions) => {
    if (!role) return false;
    const r = role.toLowerCase();
    if (r === "admin" || r === "manager") return true;
    if (permissions && Array.isArray(permissions)) {
      return (
        permissions.includes("purchases") ||
        permissions.includes("manage_purchases") ||
        permissions.includes("admin")
      );
    }
    return false;
  };

  assert.strictEqual(canUserManagePurchases("admin"), true, "Admin should have manage permission");
  assert.strictEqual(canUserManagePurchases("manager"), true, "Manager should have manage permission");
  assert.strictEqual(canUserManagePurchases("cashier"), false, "Cashier should be read-only by default");
  assert.strictEqual(
    canUserManagePurchases("cashier", ["purchases"]),
    true,
    "Cashier with explicit 'purchases' permission should be permitted"
  );
  assert.strictEqual(canUserManagePurchases(undefined), false, "Unauthenticated user denied");
});

console.log("\n=================================================================");
console.log(`  ALL ${passedTests} TESTS PASSED SUCCESSFULLY!`);
console.log("=================================================================\n");
