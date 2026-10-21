"use client";

/**
 * components/analytics/CustomerAnalyticsSection.tsx
 *
 * Customer Intelligence & Segmentation derived strictly from the single filtered dataset.
 * Features:
 * - Registered vs Walk-In guest split (Revenue, Orders, AOV)
 * - Top spending customers leaderboard
 * - Repeat customer metrics
 * - Styled with iOS featured dark glass cards
 */

import React from "react";
import { Users, UserCheck, ShoppingBag, Award, Phone, Mail, ArrowUpRight } from "lucide-react";
import { CustomerAnalytics } from "@/lib/services/salesAnalyticsService";
import IOSFeaturedCard from "./IOSFeaturedCard";

interface CustomerAnalyticsSectionProps {
  customers: CustomerAnalytics;
  currencySymbol?: string;
}

export default function CustomerAnalyticsSection({
  customers,
  currencySymbol = "LKR",
}: CustomerAnalyticsSectionProps) {
  const {
    registeredCustomersCount,
    registeredRevenue,
    registeredTransactions,
    registeredAOV,
    walkInRevenue,
    walkInTransactions,
    walkInAOV,
    topCustomers,
    repeatCustomerCount,
    registeredRevenueShare,
  } = customers;

  return (
    <div className="space-y-4">
      {/* ── Highlight iOS Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {/* Registered Customer Share */}
        <IOSFeaturedCard
          eyebrow="CLIENTELE"
          title="Registered Revenue Share"
          icon={UserCheck}
          value={`${registeredRevenueShare.toFixed(1)}%`}
          subtitle={`${currencySymbol} ${registeredRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} from identified profiles`}
          badge={{ text: "Profiles", variant: "positive" }}
        />

        {/* Registered AOV */}
        <IOSFeaturedCard
          eyebrow="TICKET SIZE"
          title="Registered Customer AOV"
          icon={ShoppingBag}
          value={`${currencySymbol} ${registeredAOV.toFixed(2)}`}
          subtitle={`${registeredTransactions} registered orders`}
          badge={{ text: "Avg Ticket", variant: "info" }}
        />

        {/* Walk-in AOV */}
        <IOSFeaturedCard
          eyebrow="GUEST CHECKOUTS"
          title="Walk-in Guest AOV"
          icon={Users}
          value={`${currencySymbol} ${walkInAOV.toFixed(2)}`}
          subtitle={`${walkInTransactions} guest orders (${currencySymbol} ${walkInRevenue.toFixed(2)})`}
          badge={{ text: "Walk-ins", variant: "neutral" }}
        />

        {/* Repeat Customer Count */}
        <IOSFeaturedCard
          eyebrow="RETENTION"
          title="Repeat Customers"
          icon={Award}
          value={`${repeatCustomerCount}`}
          subtitle="Customers with >1 purchase in this period"
          badge={{ text: "Loyal", variant: "warning" }}
        />
      </div>

      {/* ── Top Customers Leaderboard ── */}
      <div className="rounded-2xl bg-[#0c0d15]/85 backdrop-blur-xl border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] p-4 sm:p-4.5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">
              VALUED PATRONS
            </span>
            <h3 className="text-sm font-bold text-white tracking-tight">
              Top Customers by Total Spend
            </h3>
          </div>
          <div className="text-[11px] text-zinc-400">
            {topCustomers.length} active registered patrons
          </div>
        </div>

        {topCustomers.length === 0 ? (
          <div className="py-12 text-center text-zinc-500 space-y-2">
            <Users className="w-8 h-8 mx-auto text-zinc-600" />
            <div className="text-xs">No registered customer transactions recorded in this period</div>
            <div className="text-[11px] text-zinc-400">
              Select or register a customer at checkout to track patron analytics.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-zinc-400">
                  <th className="py-2.5 px-3">Rank</th>
                  <th className="py-2.5 px-3">Customer Name</th>
                  <th className="py-2.5 px-3">Contact</th>
                  <th className="py-2.5 px-3 text-right">Orders</th>
                  <th className="py-2.5 px-3 text-right">Avg Ticket Size</th>
                  <th className="py-2.5 px-3 text-right">Total Spent</th>
                  <th className="py-2.5 px-3 text-right">Last Visit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {topCustomers.map((cust, idx) => (
                  <tr key={cust.customerId || idx} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 px-3 font-mono text-zinc-500 font-bold">
                      #{idx + 1}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-semibold text-zinc-200">{cust.name}</div>
                    </td>
                    <td className="py-3 px-3 text-zinc-400 font-mono text-[11px]">
                      {cust.phone || cust.email || "—"}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-zinc-300">
                      {cust.ordersCount}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-zinc-400">
                      {currencySymbol} {cust.avgTicketSize.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-400 font-bold">
                      {currencySymbol} {cust.totalSpent.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-3 text-right text-[11px] text-zinc-400">
                      {new Date(cust.lastPurchaseDate).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
