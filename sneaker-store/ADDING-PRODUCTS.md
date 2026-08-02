# How to publish a product to the StuffWeKnow store

This store is a single-page app (`sneaker-store/index.html`) served by a
zero-dependency Node backend (`sneaker-store/server.js`). Adding a product
means editing **two files** (keep them in sync) and pushing to the deploy
branch. The live server pulls the branch every minute and restarts itself.

> You supply the product photo and write an **original** description. Do not
> paste copyrighted text from other stores — write your own copy.

---

## 1. Where products live

**A) `sneaker-store/index.html` → the `PRODUCTS` array** (visual catalog).
Find `const PRODUCTS=[` and add one object per product.

**B) `sneaker-store/server.js` → the `CATALOG` object** (price source of truth).
Find `const CATALOG = {` and add one line with the **same `id`** and the **same price**.
Orders are validated against this — if an id is missing here, checkout rejects it.

Both must agree on `id` and `price`.

---

## 2. Product object (in `PRODUCTS`)

```js
{
  id:'ad9',                 // unique short id, must also go in server.js CATALOG
  brand:'adidas',           // 'adidas' | 'nike'  (brand tag + filter)
  type:'sneakers',          // 'sneakers' | 'accessories'
  name:'Model Name',        // product title
  price:79,                 // our price in USD (number)
  old:99,                   // optional: original price -> shown struck through (discount). 0 or omit = no discount
  badges:['NEW'],           // optional: any of NEW, LIMITED, 'LOW STOCK', PREMIUM, 'DROP 01', 'SOLD OUT'
  featured:true,            // optional: adds a blue glow to the card
  soldOut:false,            // optional: true = greyed out, not buyable, SOLD OUT veil
  sizes:['40','41','42','43','44','45'], // optional. Omit for sneakers -> defaults to EU 39-46. Accessories default to One Size
  out:['46'],               // optional: sizes shown but out of stock (struck through)
  photoBg:'#eaedee',        // background behind the photo tile (use light grey for studio shots on white)
  img:'data:image/jpeg;base64,<...>',   // the product photo as a data URI (see section 3)
  desc:'Your own original description here.'
}
```

### If you do NOT have a photo
Omit `img` and the app draws a generated SVG instead. Then provide:
- `colors:['#111827','#3A7BFF','#e5e7eb']` — `[main, accent, sole]` for a sneaker,
  or for accessories set `acc:'cap' | 'bag' | 'sock' | 'ball'`.
Using a real photo (section 3) always looks better.

---

## 3. Embedding the photo

The site is self-contained: photos are embedded as **base64 data URIs** (no
external image hosting). Convert the image file to a data URI and paste it as
`img`.

**Recommended:** crop tight to the product, ~760×760, JPEG quality ~82 (keeps it
~60–90 KB). Any tool works. Examples:

```bash
# quick: exact file -> data URI (no resize)
printf 'data:image/jpeg;base64,'; base64 -w0 shoe.jpg
```

```python
# better: crop-to-square + resize + compress, prints the data URI
from PIL import Image; import base64, io
im = Image.open('shoe.jpg').convert('RGB')
s = min(im.size); im = im.crop(((im.width-s)//2,(im.height-s)//2,(im.width+s)//2,(im.height+s)//2)).resize((760,760))
b = io.BytesIO(); im.save(b,'JPEG',quality=82,optimize=True)
print('data:image/jpeg;base64,'+base64.b64encode(b.getvalue()).decode())
```

Product studio shots usually sit on a light background — set `photoBg` to that
colour (e.g. `#eaedee`) so the tile blends seamlessly. For a photo with a
transparent/dark background, use `photoBg:'var(--surface)'`.

---

## 4. Matching entry in `server.js`

In `const CATALOG = { ... }` add:

```js
ad9: { name: 'Model Name', price: 79 },
```

Same `id`, same `price` as in `PRODUCTS`. (Name is used on receipts.)

---

## 5. Deploy

Commit both files and push to the deploy branch:

```bash
git add sneaker-store/index.html sneaker-store/server.js
git commit -m "Add product: Model Name"
git push origin claude/new-american-server-jmg9bw
```

The live server (`/opt/solehaus-src`) pulls this branch every minute; when
`sneaker-store/` changes it restarts the store service automatically. New
products appear on stuffweknow.com within ~60 seconds. No SSH needed.

> Note: the deploy branch is shared with another project (the mail server).
> Only touch files under `sneaker-store/`. If `git push` is rejected, run
> `git pull --rebase origin claude/new-american-server-jmg9bw` and push again.

---

## 6. Checklist per product

- [ ] Unique `id`, added to **both** `PRODUCTS` and `CATALOG`
- [ ] `price` identical in both files
- [ ] Photo embedded as a base64 data URI in `img` (+ `photoBg` set)
- [ ] `sizes` set (or intentionally default), `badges`/`old` if applicable
- [ ] **Original** `desc` (your own words)
- [ ] Committed + pushed to `claude/new-american-server-jmg9bw`
