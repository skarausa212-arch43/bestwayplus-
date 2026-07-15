/**
 * LUMI platform analytics (22_ANALYTICS_METRICS.md).
 *
 * Pure, versioned metric computation over plain snapshots — no DB, no PII
 * (§"never log sensitive data"). The server passes in already-loaded arrays;
 * this module turns them into the documented KPI tree + alert set. Money stays
 * in the same major units the store uses.
 *
 * SCHEMA_VERSION is bumped whenever a metric's definition changes so dashboards
 * and downstream warehouses can reconcile (§"version analytics schemas").
 */
'use strict';

const SCHEMA_VERSION = '2026.07.1';
const DAY = 86400000;
const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);   // one-decimal %
const avg = (xs) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : 0);

function computePlatformMetrics({ bookings = [], users = [], reviews = [], lumiScores = [], now = Date.now() } = {}) {
  const monthAgo = now - 30 * DAY;
  const customers = users.filter((u) => u.role === 'customer' && !u.deletedAt);
  const providers = users.filter((u) => u.role === 'cleaner' && !u.deletedAt);

  const completed = bookings.filter((b) => b.status === 'completed');
  const cancelled = bookings.filter((b) => b.status === 'cancelled');
  const accepted = bookings.filter((b) => (b.timeline || []).some((t) => t.status === 'accepted'));

  // ── Executive KPIs ──
  const gmv = completed.reduce((s, b) => s + (b.price || 0), 0);          // gross merchandise value
  const netRevenue = completed.reduce((s, b) => s + (b.commission || 0), 0); // platform take
  const grossMargin = pct(netRevenue, gmv);

  const activeCustomerIds = new Set(bookings.filter((b) => b.createdAt >= monthAgo).map((b) => b.customerId));
  const activeProviderIds = new Set(completed.filter((b) => b.updatedAt >= monthAgo && b.cleanerId).map((b) => b.cleanerId));

  // North Star: completed successful bookings per active customer.
  const northStar = activeCustomerIds.size ? Math.round((completed.length / activeCustomerIds.size) * 100) / 100 : 0;

  // ── Marketplace ──
  const created = bookings.length;
  const etaSamples = accepted.map((b) => {
    const tl = b.timeline || [];
    const c = tl.find((t) => t.status === 'searching') || { at: b.createdAt };
    const a = tl.find((t) => t.status === 'accepted');
    return a ? (a.at - c.at) / 60000 : null;    // minutes to accept
  }).filter((x) => x != null && x >= 0);

  // ── Customer ──
  const completedByCustomer = {};
  for (const b of completed) completedByCustomer[b.customerId] = (completedByCustomer[b.customerId] || 0) + 1;
  const repeatCustomers = Object.values(completedByCustomer).filter((n) => n >= 2).length;
  const withAny = Object.keys(completedByCustomer).length;
  const subscribers = customers.filter((u) => u.subscription === 'plus').length;

  // ── Financial ──
  const aov = completed.length ? Math.round(gmv / completed.length) : 0;
  const refunds = bookings.filter((b) => b.status === 'refunded' || (b.cancellationFee != null)).length;

  // ── Provider ──
  const onlineProviders = providers.filter((u) => u.online).length;

  // ── Reviews / ratings ──
  const ratingAvg = avg(reviews.map((r) => r.stars).filter((x) => typeof x === 'number'));

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now,
    northStar: { value: northStar, label: 'Completed bookings / active customer' },
    executive: {
      gmv, netRevenue, grossMargin,
      activeCustomers: activeCustomerIds.size,
      activeProviders: activeProviderIds.size,
      monthlyProfit: netRevenue,   // MVP: platform take ≈ profit (no opex modelled)
    },
    marketplace: {
      bookingConversion: pct(completed.length, created),
      acceptanceRate: pct(accepted.length, created),
      completionRate: pct(completed.length, accepted.length || created),
      cancellationRate: pct(cancelled.length, created),
      averageEtaMinutes: avg(etaSamples),
    },
    customer: {
      totalCustomers: customers.length,
      retention: pct(repeatCustomers, withAny || customers.length),
      subscriptionConversion: pct(subscribers, customers.length),
      subscribers,
    },
    provider: {
      totalProviders: providers.length,
      onlineProviders,
      utilization: pct(activeProviderIds.size, providers.length),
      ratingAverage: ratingAvg,
    },
    financial: {
      averageOrderValue: aov,
      refundRate: pct(refunds, completed.length),
      totalBookings: created,
    },
    smartHome: {
      averageLumiScore: Math.round(avg(lumiScores)),
      propertiesTracked: lumiScores.length,
    },
    funnel: [
      { stage: 'Создан', count: created },
      { stage: 'Принят', count: accepted.length },
      { stage: 'Завершён', count: completed.length },
    ],
    alerts: buildAlerts({ bookings, completed, cancelled, refunds, now }),
  };
}

// §"Alerts" — cheap threshold checks over the last 24h vs the prior 24h.
function buildAlerts({ bookings, completed, cancelled, refunds, now }) {
  const alerts = [];
  const dayAgo = now - DAY;
  const twoDayAgo = now - 2 * DAY;
  const revToday = completed.filter((b) => b.updatedAt >= dayAgo).reduce((s, b) => s + (b.commission || 0), 0);
  const revPrev = completed.filter((b) => b.updatedAt >= twoDayAgo && b.updatedAt < dayAgo).reduce((s, b) => s + (b.commission || 0), 0);
  if (revPrev > 0 && revToday < revPrev * 0.6) alerts.push({ key: 'revenue_drop', severity: 'high', text: 'Выручка за сутки упала более чем на 40%.' });

  const created = bookings.length || 1;
  if (cancelled.length / created > 0.4) alerts.push({ key: 'dispatch_slowdown', severity: 'medium', text: 'Высокая доля отмен — возможны проблемы с диспетчеризацией.' });
  if (completed.length && refunds / completed.length > 0.2) alerts.push({ key: 'refund_spike', severity: 'medium', text: 'Всплеск возвратов — проверьте качество услуг.' });
  return alerts;
}

module.exports = { SCHEMA_VERSION, computePlatformMetrics };
