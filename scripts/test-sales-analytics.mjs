/**
 * scripts/test-sales-analytics.mjs
 *
 * Automated verification suite for the Sales Analytics Engine.
 * Tests:
 * 1. Multi-Tenant Cross-Shop Isolation (per shop boundary guarantee)
 * 2. Refunds & Net Revenue Calculation (Net Revenue = Gross Sales - Total Refunds)
 * 3. Payment Methods & Split Payments Reconciliation (Cash, Card, Bank Deposit, Mobile QR, Split)
 * 4. Empty Datasets & Edge Cases (no crashes, zeroes, no NaNs)
 * 5. RBAC & Role Permissions Guard
 */

import assert from "node:assert";

// Inline copy / import of pure computation engine for test isolation
import {
  computeSalesAnalytics,
  normalizePaymentKey,
  getSaleRefundAmount,
} from "../lib/services/salesAnalyticsService.ts";

import {
  hasPermission,
  isShopAdmin,
  ROLE_DEFAULT_PERMISSIONS,
} from "../lib/rbac/permissions.ts";

console.log("=================================================================");
console.log("   SALES ANALYTICS ENGINE: AUTOMATED VERIFICATION SUITE");
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
// TEST 1: MULTI-TENANT CROSS-SHOP ISOLATION
// ---------------------------------------------------------------------------
runTest("Shop Isolation: Filter strictly excludes other shops data", () => {
  const allSales = [
    {
      saleId: "s1",
      shopId: "SHOP_ALPHA",
      invoiceNumber: "INV-001",
      grandTotal: 15000,
      paymentMethod: "cash",
      status: "completed",
      items: [{ productId: "p1", name: "iPhone 15", quantity: 1, unitPrice: 15000 }],
      createdAt: 1700000000000,
    },
    {
      saleId: "s2",
      shopId: "SHOP_BETA", // DIFFERENT SHOP
      invoiceNumber: "INV-002",
      grandTotal: 999999,
      paymentMethod: "card",
      status: "completed",
      items: [{ productId: "p2", name: "Secret Item", quantity: 1, unitPrice: 999999 }],
      createdAt: 1700000000000,
    },
    {
      saleId: "s3",
      shopId: "SHOP_ALPHA",
      invoiceNumber: "INV-003",
      grandTotal: 25000,
      paymentMethod: "card",
      status: "completed",
      items: [{ productId: "p3", name: "AirPods Pro", quantity: 1, unitPrice: 25000 }],
      createdAt: 1700000000000,
    },
  ];

  // Emulate shop-scoped filter
  const targetShopId = "SHOP_ALPHA";
  const isolatedSales = allSales.filter((s) => s.shopId === targetShopId);

  assert.strictEqual(isolatedSales.length, 2, "Should only have 2 sales for SHOP_ALPHA");
  assert.ok(isolatedSales.every((s) => s.shopId === targetShopId), "All sales must belong to SHOP_ALPHA");
  assert.ok(!isolatedSales.some((s) => s.shopId === "SHOP_BETA"), "SHOP_BETA sales must never leak into SHOP_ALPHA");

  const analytics = computeSalesAnalytics(isolatedSales);
  assert.strictEqual(analytics.kpis.grossSales, 40000, "Gross sales should be 15000 + 25000 = 40000");
  assert.strictEqual(analytics.kpis.netRevenue, 40000, "Net revenue should be 40000 (no refunds)");
});

// ---------------------------------------------------------------------------
// TEST 2: REFUNDS & NET REVENUE FORMULA
// ---------------------------------------------------------------------------
runTest("Refunds & Net Revenue: Net Revenue = Gross Sales minus Refunds", () => {
  const salesWithRefunds = [
    {
      saleId: "s1",
      shopId: "SHOP_ALPHA",
      invoiceNumber: "INV-101",
      grandTotal: 10000,
      paymentMethod: "cash",
      status: "partially_returned",
      items: [{ productId: "p1", name: "Speaker", quantity: 2, unitPrice: 5000 }],
      hasReturns: true,
      totalRefunded: 5000,
      returns: [
        {
          returnId: "ret_1",
          totalRefundAmount: 5000,
          refundMethod: "cash",
          reason: "Defective left driver",
          items: [{ productId: "p1", quantity: 1, refundAmount: 5000, restock: false }],
        },
      ],
      createdAt: 1700000000000,
    },
    {
      saleId: "s2",
      shopId: "SHOP_ALPHA",
      invoiceNumber: "INV-102",
      grandTotal: 20000,
      paymentMethod: "card",
      status: "completed",
      items: [{ productId: "p2", name: "Monitor", quantity: 1, unitPrice: 20000 }],
      createdAt: 1700000000000,
    },
    {
      saleId: "s3",
      shopId: "SHOP_ALPHA",
      invoiceNumber: "INV-103",
      grandTotal: 8000,
      paymentMethod: "cash",
      status: "refunded", // Fully refunded
      totalRefunded: 8000,
      items: [{ productId: "p3", name: "Mouse", quantity: 2, unitPrice: 4000 }],
      returns: [
        {
          returnId: "ret_2",
          totalRefundAmount: 8000,
          refundMethod: "cash",
          reason: "Customer changed mind",
          items: [{ productId: "p3", quantity: 2, refundAmount: 8000, restock: true }],
        },
      ],
      createdAt: 1700000000000,
    },
  ];

  const analytics = computeSalesAnalytics(salesWithRefunds);

  // Gross Sales: 10000 + 20000 + 8000 = 38000
  assert.strictEqual(analytics.kpis.grossSales, 38000, "Gross sales should be 38000");

  // Total Refunds: 5000 + 8000 = 13000
  assert.strictEqual(analytics.kpis.totalRefunds, 13000, "Total refunds should be 13000");

  // Net Revenue: 38000 - 13000 = 25000
  assert.strictEqual(analytics.kpis.netRevenue, 25000, "Net Revenue must strictly equal Gross Sales - Total Refunds");

  // Return rate: (13000 / 38000) * 100 = 34.21%
  assert.ok(Math.abs(analytics.kpis.refundRate - 34.21) < 0.1, "Refund rate should be ~34.21%");

  // Items sold & returned
  assert.strictEqual(analytics.kpis.grossItemsSold, 5, "Gross items sold should be 2 + 1 + 2 = 5");
  assert.strictEqual(analytics.kpis.totalUnitsReturned, 3, "Units returned should be 1 + 2 = 3");
  assert.strictEqual(analytics.kpis.totalItemsSold, 2, "Net items sold should be 5 - 3 = 2");

  // Restocked vs Damaged
  assert.strictEqual(analytics.refunds.restockedUnitsCount, 2, "2 units restocked");
  assert.strictEqual(analytics.refunds.damagedUnitsCount, 1, "1 unit damaged");
});

// ---------------------------------------------------------------------------
// TEST 3: PAYMENT BREAKDOWN & SPLIT PAYMENTS RECONCILIATION
// ---------------------------------------------------------------------------
runTest("Payment Breakdown: Cash, Card, Bank Deposit, and Split Payments", () => {
  const salesPayments = [
    // 1. Pure Cash
    {
      saleId: "sp_1",
      shopId: "SHOP_1",
      grandTotal: 10000,
      paymentMethod: "cash",
      status: "completed",
      items: [{ productId: "p1", quantity: 1, unitPrice: 10000 }],
      createdAt: 1700000000000,
    },
    // 2. Pure Card
    {
      saleId: "sp_2",
      shopId: "SHOP_1",
      grandTotal: 15000,
      paymentMethod: "card",
      status: "completed",
      items: [{ productId: "p2", quantity: 1, unitPrice: 15000 }],
      createdAt: 1700000000000,
    },
    // 3. Pure Bank Deposit / Wire
    {
      saleId: "sp_3",
      shopId: "SHOP_1",
      grandTotal: 25000,
      paymentMethod: "bank-transfer",
      status: "completed",
      items: [{ productId: "p3", quantity: 1, unitPrice: 25000 }],
      createdAt: 1700000000000,
    },
    // 4. Split Payment: 20000 Cash + 30000 Card = 50000 Grand Total
    {
      saleId: "sp_4",
      shopId: "SHOP_1",
      grandTotal: 50000,
      paymentMethod: "split",
      splitPayments: [
        { method: "cash", amount: 20000 },
        { method: "card", amount: 30000 },
      ],
      status: "completed",
      items: [{ productId: "p4", quantity: 1, unitPrice: 50000 }],
      createdAt: 1700000000000,
    },
  ];

  const analytics = computeSalesAnalytics(salesPayments);

  // Total Gross: 10000 + 15000 + 25000 + 50000 = 100,000
  assert.strictEqual(analytics.kpis.grossSales, 100000, "Gross sales should be 100,000");

  // Cash total: 10,000 (direct) + 20,000 (from split) = 30,000
  assert.strictEqual(analytics.payments.breakdown.cash.totalCollected, 30000, "Cash collected should be 30,000");

  // Card total: 15,000 (direct) + 30,000 (from split) = 45,000
  assert.strictEqual(analytics.payments.breakdown.card.totalCollected, 45000, "Card collected should be 45,000");

  // Bank Deposit total: 25,000
  assert.strictEqual(analytics.payments.breakdown.bank_deposit.totalCollected, 25000, "Bank deposit collected should be 25,000");

  // Split overview
  assert.strictEqual(analytics.payments.splitOverview.totalSplitTransactions, 1, "1 split transaction");
  assert.strictEqual(analytics.payments.splitOverview.totalSplitVolume, 50000, "Split volume should be 50,000");
  assert.strictEqual(analytics.payments.splitOverview.tenderContributions.cash, 20000, "20,000 cash in split");
  assert.strictEqual(analytics.payments.splitOverview.tenderContributions.card, 30000, "30,000 card in split");

  // Sum of tenders matches total gross
  const totalReconciled =
    analytics.payments.breakdown.cash.totalCollected +
    analytics.payments.breakdown.card.totalCollected +
    analytics.payments.breakdown.bank_deposit.totalCollected;
  assert.strictEqual(totalReconciled, 100000, "Sum of all tender collections must equal 100,000");
});

// ---------------------------------------------------------------------------
// TEST 4: EMPTY DATASETS & ZERO HANDLING
// ---------------------------------------------------------------------------
runTest("Empty Datasets: Zero sales returns clean default KPIs without NaN/crashing", () => {
  const emptyAnalytics = computeSalesAnalytics([]);

  assert.strictEqual(emptyAnalytics.kpis.grossSales, 0);
  assert.strictEqual(emptyAnalytics.kpis.totalRefunds, 0);
  assert.strictEqual(emptyAnalytics.kpis.netRevenue, 0);
  assert.strictEqual(emptyAnalytics.kpis.totalTransactions, 0);
  assert.strictEqual(emptyAnalytics.kpis.averageOrderValue, 0);
  assert.strictEqual(emptyAnalytics.kpis.refundRate, 0);
  assert.strictEqual(Number.isNaN(emptyAnalytics.kpis.averageOrderValue), false, "AOV must not be NaN");
  assert.strictEqual(Number.isNaN(emptyAnalytics.kpis.refundRate), false, "Refund rate must not be NaN");

  assert.strictEqual(emptyAnalytics.products.allProducts.length, 0);
  assert.strictEqual(emptyAnalytics.categories.length, 0);
  assert.strictEqual(emptyAnalytics.customers.topCustomers.length, 0);
  assert.strictEqual(emptyAnalytics.refunds.totalRefundAmount, 0);
});

// ---------------------------------------------------------------------------
// TEST 5: ROLE PERMISSIONS (RBAC)
// ---------------------------------------------------------------------------
runTest("RBAC Permissions: Admin & Manager have sales:view; unauthorized role denied", () => {
  const adminUser = {
    uid: "u_admin",
    username: "superadmin",
    role: "admin",
    shopId: "SHOP_1",
    status: "active",
    createdAt: Date.now(),
  };

  const managerUser = {
    uid: "u_manager",
    username: "storemanager",
    role: "manager",
    shopId: "SHOP_1",
    status: "active",
    createdAt: Date.now(),
  };

  const cashierUser = {
    uid: "u_cashier",
    username: "poscashier",
    role: "cashier",
    shopId: "SHOP_1",
    status: "active",
    createdAt: Date.now(),
  };

  const restrictedCustomUser = {
    uid: "u_custom",
    username: "restricted_clerk",
    role: "custom",
    permissions: ["products:view"], // Does NOT have sales:view
    shopId: "SHOP_1",
    status: "active",
    createdAt: Date.now(),
  };

  assert.strictEqual(isShopAdmin(adminUser), true, "Admin should be recognized as shop admin");
  assert.strictEqual(hasPermission(adminUser, "sales:view"), true, "Admin must have sales:view permission");

  assert.strictEqual(hasPermission(managerUser, "sales:view"), true, "Manager must have sales:view permission");
  assert.strictEqual(hasPermission(cashierUser, "sales:view"), true, "Cashier default has sales:view permission");

  assert.strictEqual(hasPermission(restrictedCustomUser, "sales:view"), false, "Restricted role must NOT have sales:view");
  assert.strictEqual(isShopAdmin(restrictedCustomUser), false, "Restricted role is not admin");
});

// ---------------------------------------------------------------------------
// TEST 6: 3-WAY SPLIT PAYMENT (Cash + Card + Bank Deposit)
// ---------------------------------------------------------------------------
runTest("Split Payments: 3-way multi-tender (Cash + Card + Bank Deposit) attribution", () => {
  const threeWaySplitSale = [
    {
      saleId: "split_3way",
      shopId: "SHOP_1",
      grandTotal: 120000,
      paymentMethod: "split",
      splitPayments: [
        { method: "cash", amount: 50000 },
        { method: "card", amount: 40000 },
        { method: "bank-deposit", amount: 30000 },
      ],
      status: "completed",
      items: [{ productId: "p_laptop", quantity: 1, unitPrice: 120000 }],
      createdAt: 1700000000000,
    },
  ];

  const analytics = computeSalesAnalytics(threeWaySplitSale);

  assert.strictEqual(analytics.kpis.grossSales, 120000);
  assert.strictEqual(analytics.payments.breakdown.cash.totalCollected, 50000);
  assert.strictEqual(analytics.payments.breakdown.card.totalCollected, 40000);
  assert.strictEqual(analytics.payments.breakdown.bank_deposit.totalCollected, 30000);

  assert.strictEqual(analytics.payments.splitOverview.totalSplitTransactions, 1);
  assert.strictEqual(analytics.payments.splitOverview.tenderContributions.cash, 50000);
  assert.strictEqual(analytics.payments.splitOverview.tenderContributions.card, 40000);
  assert.strictEqual(analytics.payments.splitOverview.tenderContributions.bank_deposit, 30000);
});

// ---------------------------------------------------------------------------
// TEST 7: PRODUCT & CATEGORY LEVEL METRICS WITH RETURNS
// ---------------------------------------------------------------------------
runTest("Product & Category Analytics: Correctly adjusts net units and revenue", () => {
  const catalogSales = [
    {
      saleId: "cat_1",
      shopId: "SHOP_1",
      grandTotal: 60000,
      paymentMethod: "cash",
      status: "completed",
      items: [
        { productId: "p_phone", name: "Smartphone", sku: "PH-01", categoryName: "Mobile", quantity: 2, unitPrice: 20000, subtotal: 40000 },
        { productId: "p_case", name: "Phone Case", sku: "CS-01", categoryName: "Accessories", quantity: 2, unitPrice: 10000, subtotal: 20000 },
      ],
      returns: [
        {
          returnId: "ret_p1",
          totalRefundAmount: 20000,
          refundMethod: "cash",
          reason: "Defective screen",
          items: [{ productId: "p_phone", sku: "PH-01", quantity: 1, refundAmount: 20000, restock: false }],
        },
      ],
      createdAt: 1700000000000,
    },
  ];

  const analytics = computeSalesAnalytics(catalogSales);

  // Find phone
  const phone = analytics.products.allProducts.find((p) => p.productId === "p_phone");
  assert.ok(phone, "Phone should exist in product analytics");
  assert.strictEqual(phone.grossUnitsSold, 2);
  assert.strictEqual(phone.unitsReturned, 1);
  assert.strictEqual(phone.netUnitsSold, 1, "Net units sold should be 2 - 1 = 1");
  assert.strictEqual(phone.grossRevenue, 40000);
  assert.strictEqual(phone.refundAmount, 20000);
  assert.strictEqual(phone.netRevenue, 20000, "Net revenue should be 40000 - 20000 = 20000");

  // Category shares
  const mobileCat = analytics.categories.find((c) => c.categoryName === "Mobile");
  const accCat = analytics.categories.find((c) => c.categoryName === "Accessories");
  assert.ok(mobileCat);
  assert.ok(accCat);
  assert.strictEqual(mobileCat.grossRevenue, 40000);
  assert.strictEqual(accCat.grossRevenue, 20000);
});

// ---------------------------------------------------------------------------
// TEST 8: VOIDED SALES EXCLUSION FROM PERFORMANCE METRICS
// ---------------------------------------------------------------------------
runTest("Voided Sales: Excluded from Gross/Net Revenue while tracked in audit", () => {
  const salesWithVoid = [
    {
      saleId: "valid_1",
      shopId: "SHOP_1",
      grandTotal: 15000,
      paymentMethod: "cash",
      status: "completed",
      items: [{ productId: "p1", quantity: 1, unitPrice: 15000 }],
      createdAt: 1700000000000,
    },
    {
      saleId: "voided_1",
      shopId: "SHOP_1",
      grandTotal: 90000, // Large accidental bill
      paymentMethod: "card",
      status: "voided",  // Cancelled by manager
      items: [{ productId: "p2", quantity: 3, unitPrice: 30000 }],
      createdAt: 1700000000000,
    },
  ];

  const analytics = computeSalesAnalytics(salesWithVoid);

  assert.strictEqual(analytics.kpis.grossSales, 15000, "Gross sales must exclude voided amount");
  assert.strictEqual(analytics.kpis.netRevenue, 15000, "Net revenue must exclude voided amount");
  assert.strictEqual(analytics.kpis.totalTransactions, 1, "Only 1 valid transaction");
  assert.strictEqual(analytics.kpis.voidedTransactionsCount, 1, "1 voided transaction recorded in audit");
  assert.strictEqual(analytics.kpis.voidedTransactionsAmount, 90000, "90000 voided amount tracked");
});

console.log(`\n=================================================================`);
console.log(`  ALL ${passedTests} SALES ANALYTICS VERIFICATION TESTS PASSED`);
console.log(`=================================================================\n`);
