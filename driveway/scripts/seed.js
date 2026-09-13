/**
 * Seeds the sold-price database so valuations and comps are useful on day one.
 * These rows are marked source='seed' — the UI labels them as sample data, and
 * every real accepted offer lands alongside them as source='driveway'.
 *
 *   node scripts/seed.js
 */
import { getDb, now } from '../src/db/index.js';

const SAMPLE_SALES = [
  ['Toyota', 'Camry', 2020, 42000, 19400, 'TX'],
  ['Toyota', 'Camry', 2019, 55000, 17250, 'FL'],
  ['Toyota', 'Camry', 2021, 31000, 21800, 'CA'],
  ['Toyota', 'RAV4', 2020, 39000, 24900, 'CO'],
  ['Toyota', 'GR Supra', 2021, 17000, 44900, 'TX'],
  ['Honda', 'CR-V', 2020, 44000, 23900, 'CO'],
  ['Honda', 'CR-V', 2019, 58000, 21400, 'OH'],
  ['Honda', 'Civic', 2021, 29000, 20950, 'WA'],
  ['Honda', 'Civic', 2019, 47000, 17800, 'IL'],
  ['Honda', 'Accord', 2020, 41000, 22400, 'NC'],
  ['Ford', 'F-150', 2019, 61000, 28400, 'TN'],
  ['Ford', 'F-150', 2020, 48000, 32100, 'TX'],
  ['Ford', 'Mustang GT', 2018, 41000, 29800, 'GA'],
  ['Ford', 'Mustang GT', 2017, 52000, 27200, 'NV'],
  ['Ford', 'Ranger', 2020, 44000, 29200, 'CO'],
  ['Ford', 'Explorer', 2019, 57000, 24600, 'MI'],
  ['Chevrolet', 'Camaro SS', 2019, 34000, 32600, 'TX'],
  ['Chevrolet', 'Silverado', 2020, 50000, 31200, 'OK'],
  ['Chevrolet', 'Equinox', 2021, 33000, 21300, 'PA'],
  ['Tesla', 'Model 3', 2021, 26000, 29900, 'CA'],
  ['Tesla', 'Model 3', 2020, 38000, 26400, 'NY'],
  ['Tesla', 'Model Y', 2021, 30000, 34800, 'WA'],
  ['BMW', 'M4', 2020, 29000, 53400, 'FL'],
  ['BMW', '330i', 2021, 28000, 32900, 'IL'],
  ['BMW', 'X3', 2020, 41000, 31500, 'NJ'],
  ['Jeep', 'Wrangler', 2019, 45000, 33900, 'AZ'],
  ['Jeep', 'Wrangler', 2018, 58000, 29400, 'CO'],
  ['Jeep', 'Grand Cherokee', 2020, 47000, 28900, 'UT'],
  ['Porsche', '911', 2019, 21000, 95500, 'CA'],
  ['Nissan', 'GT-R', 2017, 27000, 79800, 'NV'],
  ['Nissan', 'Altima', 2020, 46000, 16400, 'NC'],
  ['Subaru', 'Outback', 2019, 61000, 19300, 'OR'],
  ['Subaru', 'Forester', 2020, 43000, 22100, 'WA'],
  ['Kia', 'Telluride', 2021, 38000, 34600, 'GA'],
  ['Kia', 'Rio', 2016, 98000, 7900, 'TX'],
  ['Hyundai', 'Elantra', 2022, 16000, 17600, 'NC'],
  ['Hyundai', 'Tucson', 2020, 42000, 20800, 'VA'],
  ['Mercedes-Benz', 'AMG GT', 2018, 22000, 86500, 'FL'],
  ['Mercedes-Benz', 'C300', 2020, 39000, 28700, 'TX'],
  ['Lexus', 'RX 350', 2019, 52000, 30400, 'CA']
];

export function seedSales(db = getDb()) {
  const existing = db.prepare(`SELECT COUNT(*) AS n FROM sales WHERE source = 'seed'`).get().n;
  if (existing) return { inserted: 0, skipped: existing };

  const stmt = db.prepare(
    `INSERT INTO sales (make, model, year, miles, state, price, source, created_at)
     VALUES (?,?,?,?,?,?, 'seed', ?)`
  );
  const ts = now();
  db.transaction(() => {
    SAMPLE_SALES.forEach((s, i) => {
      // Spread the sample sales over the last ~3 months.
      stmt.run(s[0], s[1], s[2], s[3], s[5], s[4], ts - (((i * 7) % 88) + 2) * 86400000);
    });
  })();
  return { inserted: SAMPLE_SALES.length, skipped: 0 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = seedSales();
  console.log(`Seeded sold prices: ${result.inserted} inserted, ${result.skipped} already present.`);
}
