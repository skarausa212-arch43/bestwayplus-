import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';

process.env.NODE_ENV = 'test';
process.env.BCRYPT_ROUNDS = '4'; // keep the suite fast; production uses the config default

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'driveway-test-'));
process.env.DB_FILE = path.join(tmp, 'test.sqlite');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');

const { createApp } = await import('../src/app.js');
const { getDb, closeDb } = await import('../src/db/index.js');
const { seedSales } = await import('../scripts/seed.js');
const sharp = (await import('sharp')).default;

seedSales(getDb());
const app = createApp();

/** Signs a user up and returns an agent that keeps their session cookie. */
async function signUp(email, name = 'Test User', extra = {}) {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/signup')
    .send({ email, name, password: 'supersecret', phone: '(555) 010-0000', zip: '78701', ...extra });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return agent;
}

const carPayload = (over = {}) => ({
  make: 'Honda',
  model: 'Civic Si',
  year: 2020,
  miles: 38000,
  price: 22000,
  body: 'Sedan',
  transmission: 'Manual',
  fuel: 'Gasoline',
  city: 'Austin',
  state: 'TX',
  description: 'One owner, clean title, service records from new.',
  ...over
});

const makeJpeg = (w = 900, h = 600) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 30, g: 90, b: 200 } } })
    .jpeg()
    .toBuffer();

test.after(() => {
  closeDb();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('health endpoint answers', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test('signup validates input and rejects duplicates', async () => {
  const weak = await request(app).post('/api/auth/signup').send({ name: 'X', email: 'bad', password: '123' });
  assert.equal(weak.status, 400);
  assert.ok(weak.body.details.email);

  await signUp('dupe@example.com');
  const again = await request(app).post('/api/auth/signup').send({
    name: 'Other', email: 'dupe@example.com', password: 'supersecret'
  });
  assert.equal(again.status, 409);
});

test('login rejects a wrong password without revealing the account exists', async () => {
  await signUp('login@example.com');
  const res = await request(app).post('/api/auth/login').send({ email: 'login@example.com', password: 'nope-nope' });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Wrong email or password.');

  const missing = await request(app).post('/api/auth/login').send({ email: 'ghost@example.com', password: 'nope-nope' });
  assert.equal(missing.body.error, res.body.error);
});

test('session survives via cookie and logout clears it', async () => {
  const agent = await signUp('session@example.com');
  const me = await agent.get('/api/auth/me');
  assert.equal(me.body.user.email, 'session@example.com');

  await agent.post('/api/auth/logout').expect(200);
  const after = await agent.get('/api/auth/me');
  assert.equal(after.body.user, null);
});

test('passwords are stored hashed, sessions are stored hashed', () => {
  const row = getDb().prepare('SELECT password_hash FROM users WHERE email = ?').get('session@example.com');
  assert.ok(row.password_hash.startsWith('$2'));
  assert.ok(!row.password_hash.includes('supersecret'));
  const s = getDb().prepare('SELECT token_hash FROM sessions LIMIT 1').get();
  if (s) assert.match(s.token_hash, /^[a-f0-9]{64}$/);
});

test('creating a listing requires auth and validates the VIN', async () => {
  const anon = await request(app).post('/api/listings').send(carPayload());
  assert.equal(anon.status, 401);

  const agent = await signUp('seller1@example.com', 'Sam Seller');
  const badVin = await agent.post('/api/listings').send(carPayload({ vin: 'IOQ0000000000000O' }));
  assert.equal(badVin.status, 400);
  assert.ok(badVin.body.details.vin);
});

test('listing valuation is anchored on comparable sales, not the make alone', async () => {
  const agent = await signUp('seller2@example.com', 'Val Seller');
  const civic = await agent.post('/api/listings').send(carPayload());
  assert.equal(civic.status, 201);
  const l = civic.body.listing;
  assert.equal(l.valuationBasis, 'comps');
  assert.ok(l.marketValue > 15000 && l.marketValue < 24000, `civic value ${l.marketValue}`);
  assert.ok(l.daysToSell > 0);
  assert.ok(l.guaranteedFloor < l.marketValue);

  // A Rio must not be valued off a Telluride just because both are Kias.
  const rio = await agent.post('/api/listings').send(
    carPayload({ make: 'Kia', model: 'Rio', year: 2015, miles: 120000, price: 7000 })
  );
  assert.ok(rio.body.listing.marketValue < 12000, `rio value ${rio.body.listing.marketValue}`);
});

test('photos upload, resize, and come back on the listing', async () => {
  const agent = await signUp('photos@example.com', 'Pat Photo');
  const created = await agent.post('/api/listings').send(carPayload());
  const id = created.body.listing.id;

  const res = await agent
    .post(`/api/listings/${id}/photos`)
    .attach('photos', await makeJpeg(2400, 1600), 'front.jpg')
    .field('tags', 'front');
  assert.equal(res.status, 201, JSON.stringify(res.body));

  const photos = res.body.listing.photos;
  assert.equal(photos.length, 1);
  assert.equal(photos[0].tag, 'front');
  assert.ok(photos[0].width <= 1600, 'full-size photo is capped');

  const file = await request(app).get(photos[0].thumbUrl);
  assert.equal(file.status, 200);
  assert.match(file.headers['content-type'], /image\/jpeg/);
});

test('non-images are rejected', async () => {
  const agent = await signUp('badfile@example.com');
  const created = await agent.post('/api/listings').send(carPayload());
  const res = await agent
    .post(`/api/listings/${created.body.listing.id}/photos`)
    .attach('photos', Buffer.from('definitely not an image'), 'evil.txt');
  assert.equal(res.status, 400);
});

test('a stranger cannot touch someone else\'s listing', async () => {
  const owner = await signUp('owner@example.com');
  const other = await signUp('other@example.com');
  const id = (await owner.post('/api/listings').send(carPayload())).body.listing.id;

  assert.equal((await other.patch(`/api/listings/${id}/price`).send({ price: 1000 })).status, 403);
  assert.equal((await other.delete(`/api/listings/${id}`)).status, 403);
});

test('search filters and price history work', async () => {
  const agent = await signUp('search@example.com');
  const id = (await agent.post('/api/listings').send(carPayload({ make: 'Subaru', model: 'Outback', price: 19000 }))).body.listing.id;

  const hit = await request(app).get('/api/listings').query({ make: 'Subaru' });
  assert.ok(hit.body.items.some((l) => l.id === id));

  const miss = await request(app).get('/api/listings').query({ make: 'Subaru', maxPrice: 5000 });
  assert.ok(!miss.body.items.some((l) => l.id === id));

  await agent.patch(`/api/listings/${id}/price`).send({ price: 17500 }).expect(200);
  const detail = await request(app).get(`/api/listings/${id}`);
  assert.equal(detail.body.listing.price, 17500);
  assert.equal(detail.body.listing.priceHistory.length, 2);
});

test('buyer context prices out tax, registration and shipping by ZIP', async () => {
  const agent = await signUp('ctx@example.com');
  const id = (await agent.post('/api/listings').send(carPayload({ state: 'TX', city: 'Austin' }))).body.listing.id;

  const res = await request(app).get(`/api/listings/${id}`).query({ zip: '90210' });
  const ctx = res.body.buyerContext;
  assert.equal(ctx.state, 'CA');
  assert.ok(ctx.costToOwn.salesTax > 0);
  assert.equal(ctx.costToOwn.dueAtPurchase, 22000 + ctx.costToOwn.salesTax + ctx.costToOwn.titleAndRegistration);
  assert.ok(ctx.costToOwn.allInPerMonth > 0);
  assert.equal(ctx.registration.outOfState, true);
  assert.ok(ctx.shipping.price > 0);
});

test('offers: own listing is refused, scam messages are flagged for the seller', async () => {
  const seller = await signUp('s3@example.com', 'Sally Seller');
  const buyer = await signUp('b3@example.com', 'Bob Buyer');
  const id = (await seller.post('/api/listings').send(carPayload())).body.listing.id;

  assert.equal((await seller.post(`/api/listings/${id}/offers`).send({ amount: 21000 })).status, 403);

  const offer = await buyer.post(`/api/listings/${id}/offers`).send({
    amount: 21000,
    message: 'I am out of the country and cannot see it. My shipping agent will pick it up, I will send a wire transfer.'
  });
  assert.equal(offer.status, 201);
  assert.equal(offer.body.offer.status, 'pending');
  assert.ok(offer.body.offer.scamFlags.length >= 2);

  const received = await seller.get('/api/offers/received');
  assert.equal(received.body.items.length, 1);
  assert.ok(received.body.items[0].scamFlags.length >= 2);
  // Contact details stay hidden until the deal is done.
  assert.equal(received.body.items[0].buyer.phone, null);
});

test('auto-negotiation accepts, counters and declines instantly', async () => {
  const seller = await signUp('s4@example.com', 'Rules Seller');
  const buyer = await signUp('b4@example.com', 'Rules Buyer');
  const rules = { acceptAt: 21000, counterAt: 21500, declineBelow: 17000 };

  const mk = async () =>
    (await seller.post('/api/listings').send({ ...carPayload(), rules })).body.listing.id;

  const high = await buyer.post(`/api/listings/${await mk()}/offers`).send({ amount: 21500 });
  assert.equal(high.body.offer.status, 'accepted');

  const midId = await mk();
  const mid = await buyer.post(`/api/listings/${midId}/offers`).send({ amount: 19000 });
  assert.equal(mid.body.offer.status, 'countered');

  const low = await buyer.post(`/api/listings/${await mk()}/offers`).send({ amount: 12000 });
  assert.equal(low.body.offer.status, 'declined');

  // Buyer takes the counter, which closes the deal at the counter price.
  const taken = await buyer.post(`/api/offers/${mid.body.offer.id}/accept-counter`);
  assert.equal(taken.status, 200);
  assert.equal(taken.body.amount, 21500);

  const sold = await request(app).get(`/api/listings/${midId}`);
  assert.equal(sold.body.listing.status, 'sold');
  assert.equal(sold.body.listing.sale.price, 21500);

  const rejected = await buyer.post(`/api/offers/${mid.body.offer.id}/accept-counter`);
  assert.equal(rejected.status, 400, 'a closed offer cannot be accepted twice');
});

test('rules with impossible thresholds are refused', async () => {
  const seller = await signUp('s5@example.com');
  const res = await seller.post('/api/listings').send({
    ...carPayload(),
    rules: { acceptAt: 10000, counterAt: 15000, declineBelow: 20000 }
  });
  assert.equal(res.status, 400);
});

test('accepting an offer closes the listing and declines the rest', async () => {
  const seller = await signUp('s6@example.com');
  const b1 = await signUp('b6a@example.com', 'Buyer One');
  const b2 = await signUp('b6b@example.com', 'Buyer Two');
  const id = (await seller.post('/api/listings').send(carPayload())).body.listing.id;

  const o1 = await b1.post(`/api/listings/${id}/offers`).send({ amount: 20000 });
  const o2 = await b2.post(`/api/listings/${id}/offers`).send({ amount: 21000 });

  await seller.post(`/api/offers/${o2.body.offer.id}/accept`).expect(200);

  const mine = await b1.get('/api/offers/made');
  assert.equal(mine.body.items.find((o) => o.id === o1.body.offer.id).status, 'declined');

  const closed = await b1.post(`/api/listings/${id}/offers`).send({ amount: 25000 });
  assert.equal(closed.status, 400);

  // Seller now sees the winning buyer's contact details.
  const received = await seller.get('/api/offers/received');
  const won = received.body.items.find((o) => o.id === o2.body.offer.id);
  assert.equal(won.status, 'accepted');
  assert.ok(won.buyer.phone);
});

test('an accepted offer becomes a public sold-price comp', async () => {
  const before = (await request(app).get('/api/sales').query({ q: 'Mazda MX-5' })).body.total;

  const seller = await signUp('s7@example.com');
  const buyer = await signUp('b7@example.com');
  const id = (await seller.post('/api/listings').send(carPayload({ make: 'Mazda', model: 'MX-5', price: 18000 }))).body.listing.id;
  const offer = await buyer.post(`/api/listings/${id}/offers`).send({ amount: 17250 });
  await seller.post(`/api/offers/${offer.body.offer.id}/accept`).expect(200);

  const after = await request(app).get('/api/sales').query({ q: 'Mazda MX-5' });
  assert.equal(after.body.total, before + 1);
  const sale = after.body.items[0];
  assert.equal(sale.price, 17250);
  assert.equal(sale.source, 'driveway');
});

test('standing bids fire automatically at a matching new listing', async () => {
  const buyer = await signUp('standing@example.com', 'Standing Buyer');
  const seller = await signUp('s8@example.com', 'Bid Seller');

  const bid = await buyer.post('/api/standing-bids').send({
    make: 'Toyota', model: 'Tacoma', yearMin: 2016, maxMiles: 90000, amount: 27000
  });
  assert.equal(bid.status, 201);

  const created = await seller.post('/api/listings').send(
    carPayload({ make: 'Toyota', model: 'Tacoma TRD', year: 2018, miles: 62000, price: 28000 })
  );
  assert.equal(created.body.standingBidOffers, 1, 'the bid fired at publish time');

  const received = await seller.get('/api/offers/received');
  const auto = received.body.items.find((o) => o.fromStanding);
  assert.ok(auto, 'seller sees the standing-bid offer');
  assert.equal(auto.amount, 27000);

  // A car outside the bid's limits must not trigger anything.
  const noMatch = await seller.post('/api/listings').send(
    carPayload({ make: 'Toyota', model: 'Tacoma TRD', year: 2012, miles: 140000, price: 15000 })
  );
  assert.equal(noMatch.body.standingBidOffers, 0);
});

test('holds take the car off the market for other buyers', async () => {
  const seller = await signUp('s9@example.com');
  const b1 = await signUp('b9a@example.com');
  const b2 = await signUp('b9b@example.com');
  const id = (await seller.post('/api/listings').send(carPayload())).body.listing.id;

  const hold = await b1.post(`/api/listings/${id}/hold`);
  assert.equal(hold.status, 201);

  assert.equal((await b2.post(`/api/listings/${id}/hold`)).status, 400);
  assert.equal((await b1.get('/api/my/holds')).body.items.length, 1);

  await b1.delete(`/api/listings/${id}/hold`).expect(200);
  assert.equal((await b2.post(`/api/listings/${id}/hold`)).status, 201);
});

test('taking the guaranteed floor closes the listing at a wholesale price', async () => {
  const seller = await signUp('s10@example.com');
  const created = await seller.post('/api/listings').send(carPayload());
  const { id, marketValue, guaranteedFloor } = created.body.listing;

  const res = await seller.post(`/api/listings/${id}/take-floor`);
  assert.equal(res.status, 200);
  assert.equal(res.body.price, guaranteedFloor);
  assert.ok(res.body.price < marketValue);

  const after = await request(app).get(`/api/listings/${id}`);
  assert.equal(after.body.listing.status, 'sold');
});

test('favourites toggle and the wanted board accepts posts', async () => {
  const user = await signUp('fav@example.com');
  const seller = await signUp('s11@example.com');
  const id = (await seller.post('/api/listings').send(carPayload())).body.listing.id;

  assert.equal((await user.post(`/api/listings/${id}/favorite`)).body.favorited, true);
  assert.equal((await user.get('/api/my/favorites')).body.items.length, 1);
  assert.equal((await user.post(`/api/listings/${id}/favorite`)).body.favorited, false);

  await user.post('/api/wanted').send({ title: '2018-2021 Toyota RAV4 under 60k', budget: 25000 }).expect(201);
  const board = await request(app).get('/api/wanted');
  assert.ok(board.body.items.some((w) => w.title.includes('RAV4')));
});

test('a buyer never sees the seller\'s auto-negotiation thresholds or loan balance', async () => {
  const seller = await signUp('s12@example.com');
  const buyer = await signUp('b12@example.com');
  const id = (await seller.post('/api/listings').send({
    ...carPayload(),
    loanBalance: 14000,
    rules: { acceptAt: 21000, counterAt: 21500, declineBelow: 17000 }
  })).body.listing.id;

  const asSeller = await seller.get(`/api/listings/${id}`);
  assert.equal(asSeller.body.listing.loanBalance, 14000);
  assert.equal(asSeller.body.listing.equity, 22000 - 14000);
  assert.equal(asSeller.body.listing.rules.acceptAt, 21000);

  const asBuyer = await buyer.get(`/api/listings/${id}`);
  assert.equal(asBuyer.body.listing.loanBalance, undefined);
  assert.equal(asBuyer.body.listing.equity, undefined);
  assert.deepEqual(asBuyer.body.listing.rules, { enabled: true });
});

test('best offer is exposed only as a range', async () => {
  const seller = await signUp('s13@example.com');
  const buyer = await signUp('b13@example.com');
  const id = (await seller.post('/api/listings').send(carPayload())).body.listing.id;
  await buyer.post(`/api/listings/${id}/offers`).send({ amount: 18450 });

  const res = await request(app).get(`/api/listings/${id}`);
  assert.equal(res.body.listing.offerCount, 1);
  assert.deepEqual(res.body.listing.bestOfferRange, { low: 18000, high: 19000 });
  const body = JSON.stringify(res.body.listing);
  assert.ok(!body.includes('18450'), 'the exact offer amount never reaches other buyers');
});

test('a round offer amount is still reported as a band, not a number', async () => {
  const seller = await signUp('s14@example.com');
  const buyer = await signUp('b14@example.com');
  const id = (await seller.post('/api/listings').send(carPayload())).body.listing.id;
  await buyer.post(`/api/listings/${id}/offers`).send({ amount: 19000 });

  const range = (await request(app).get(`/api/listings/${id}`)).body.listing.bestOfferRange;
  assert.notEqual(range.low, range.high, 'a round number must not collapse into an exact figure');
  assert.deepEqual(range, { low: 19000, high: 20000 });
});
