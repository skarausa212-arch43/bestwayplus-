/**
 * Fills an empty instance with demonstration inventory so the marketplace can
 * be looked at, reviewed and screenshotted before anybody has listed a car.
 *
 *   node scripts/demo.js
 *
 * Every row it writes is demonstration data: the sellers are fictional, the
 * vehicles are plausible but invented, and nothing here may be presented as a
 * real listing, a real sale, or a marketplace-wide statistic. It is a no-op on
 * a database that already has listings, so it can never overwrite real ones.
 */
import bcrypt from 'bcryptjs';
import { getDb, now } from '../src/db/index.js';
import { createListing } from '../src/models/listing.model.js';

const SELLERS = [
  ['Dana Whitfield', 'dana@example.com', 'Austin', 'TX', '78701'],
  ['Marcus Oyelaran', 'marcus@example.com', 'Denver', 'CO', '80202'],
  ['Priya Raman', 'priya@example.com', 'Seattle', 'WA', '98101'],
  ['Jesse Calloway', 'jesse@example.com', 'Columbus', 'OH', '43215'],
  ['Robin Alvarez', 'robin@example.com', 'Tampa', 'FL', '33602']
];

/* make, model, trim, year, miles, price, body, drivetrain, fuel, transmission, doors, tow, soh, safety */
const CARS = [
  ['Toyota', 'Camry', 'SE Nightshade', 2020, 41200, 19850, 'Sedan', 'FWD', 'Gasoline', 'Automatic', 4, 0, 0, 5],
  ['Honda', 'CR-V', 'EX-L AWD', 2020, 46800, 24400, 'SUV', 'AWD', 'Gasoline', 'Automatic', 5, 1500, 0, 5],
  ['Ford', 'F-150', 'XLT SuperCrew', 2019, 62400, 31900, 'Truck', '4WD', 'Gasoline', 'Automatic', 4, 8200, 0, 4],
  ['Tesla', 'Model 3', 'Long Range', 2021, 28600, 28750, 'Sedan', 'AWD', 'Electric', 'Automatic', 4, 0, 93, 5],
  ['Subaru', 'Outback', 'Premium', 2019, 58900, 22100, 'Wagon', 'AWD', 'Gasoline', 'Automatic', 5, 2700, 0, 5],
  ['Honda', 'Civic', 'Sport Hatchback', 2021, 26400, 21600, 'Hatchback', 'FWD', 'Gasoline', 'Manual', 5, 0, 0, 5],
  ['Lexus', 'RX 350', 'F Sport', 2019, 51300, 30900, 'SUV', 'AWD', 'Gasoline', 'Automatic', 5, 3500, 0, 5],
  ['Chevrolet', 'Bolt EV', 'Premier', 2020, 33800, 15400, 'Hatchback', 'FWD', 'Electric', 'Automatic', 5, 0, 88, 4],
  ['Toyota', 'RAV4', 'XLE Hybrid', 2021, 34700, 27300, 'SUV', 'AWD', 'Hybrid', 'Automatic', 5, 1750, 0, 5],
  ['Mazda', 'MX-5 Miata', 'Club', 2018, 24100, 22400, 'Convertible', 'RWD', 'Gasoline', 'Manual', 2, 0, 0, 4],
  ['Ram', '1500', 'Big Horn', 2018, 74600, 26800, 'Truck', '4WD', 'Gasoline', 'Automatic', 4, 9100, 0, 4],
  ['Honda', 'Odyssey', 'EX-L', 2019, 68200, 24900, 'Van', 'FWD', 'Gasoline', 'Automatic', 5, 3500, 0, 5],
  ['BMW', '330i', 'M Sport', 2020, 39500, 28400, 'Sedan', 'RWD', 'Gasoline', 'Automatic', 4, 0, 0, 5],
  ['Ford', 'Mustang', 'GT Premium', 2019, 31900, 33600, 'Coupe', 'RWD', 'Gasoline', 'Manual', 2, 0, 0, 4],
  ['Toyota', 'Tacoma', 'TRD Off-Road', 2020, 44300, 34900, 'Truck', '4WD', 'Gasoline', 'Automatic', 4, 6400, 0, 4],
  ['Hyundai', 'Ioniq 5', 'SEL', 2022, 18700, 31200, 'Hatchback', 'AWD', 'Electric', 'Automatic', 5, 0, 96, 5]
];

export function seedDemoListings(db = getDb()) {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM listings').get().n;
  if (existing) return { listings: 0, skipped: existing };

  const ts = now();
  const hash = bcrypt.hashSync('demo-password-not-for-real-use', 10);
  const insertUser = db.prepare(
    `INSERT INTO users (name, email, password_hash, phone, zip, created_at)
     VALUES (?,?,?,?,?,?)`
  );
  const userIds = SELLERS.map(([name, email, , , zip]) =>
    Number(insertUser.run(name, email, hash, '', zip, ts - 120 * 86400000).lastInsertRowid));

  CARS.forEach((c, i) => {
    const [, , city, stateCode] = SELLERS[i % SELLERS.length];
    const [make, model, trim, year, miles, price, body, drivetrain, fuel, transmission, doors, towLb, evSoh, safety] = c;
    const id = createListing(userIds[i % userIds.length], {
      make, model, trim, year, miles, price, body, drivetrain, fuel, transmission,
      doors, towLb, evSoh, safety, city, state: stateCode,
      vin: '', description:
        `Demonstration listing. ${year} ${make} ${model} ${trim}, ${miles.toLocaleString('en-US')} miles, `
        + `${drivetrain} ${transmission.toLowerCase()}. Serviced on schedule; records attached.`,
      loanBalance: 0,
      deadlineDays: i % 5 === 0 ? 4 : 0,
      serviceRecords: ['Oil and filter', 'Tires rotated', 'Brake fluid flush']
    });
    // Spread creation times over a couple of months: a few read as just
    // listed, and no demo seller trips the "high volume" flag meant for
    // unlicensed dealers hiding among private sellers.
    const at = ts - i * 4 * 86400000;
    db.prepare('UPDATE listings SET created_at = ?, updated_at = ? WHERE id = ?').run(at, at, id);
  });

  return { listings: CARS.length, sellers: userIds.length, skipped: 0 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = seedDemoListings();
  console.log(r.skipped
    ? `Skipped: ${r.skipped} listings already present.`
    : `Seeded ${r.listings} demonstration listings across ${r.sellers} sellers.`);
}
