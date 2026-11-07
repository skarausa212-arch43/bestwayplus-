# NFC: issuing batches and writing tags

## How ownership works

Each physical toy has:

1. **An NFC tag** containing one NDEF URI record: `https://<APP_URL>/t/<public_token>`  
   *Public.* Anyone who scans it sees the toy's passport (character, serial, edition, status) — never the owner's identity.
2. **A one‑time activation code** printed on a card inside the sealed box, e.g. `K7QF-29XM`.  
   *Secret.* Only its HMAC is stored. Whoever enters it first (logged in) becomes the owner. After use it is burned.

Copying the URL (or cloning the tag) gives nothing beyond the public passport. Ordinary NTAG21x tags **can be cloned** — we do not claim otherwise. Ownership relies on the code, transfers rely on a separate one‑time transfer code.

## Issue a batch

1. Log in as admin → **Admin → Batches & NFC**.
2. Choose the character, quantity, a batch code (e.g. `GEN-2026-01`), edition and tag type → **Create batch & NFC links**.
3. **Download “CSV (links + codes)” immediately.** Activation codes are shown once and cannot be retrieved later.  
   Columns: `serial, url, activation_code, ndef_record`.
4. Later you can download **“Links CSV”** (URLs only) for re‑encoding. A lost code can be replaced via **Admin → Toys → New code** (only while the toy is not activated; the old code stops working).

## Write the tags

Recommended chips: **NTAG215/216** (NTAG213 works; the URL is ~60 bytes). Mount the tag in the base, antenna facing down, away from metal paint.

### Phone (small runs, demos)
* Android/iOS app **NXP TagWriter** (or "NFC Tools"): *Write → New dataset → Link (URL)* → paste the `url` column → write → *verify by scanning with the camera‑less NFC reader*.
* NFC Tools has *“Write multiple”* using a CSV — import the `url` column.
* After writing, **lock** the tag (TagWriter: *Protect tag → permanently lock*), otherwise anyone can rewrite it.

### Desktop (production)
* USB reader **ACR122U / ACR1252U** + software that reads a CSV and writes one NDEF URI per tag (e.g. *NFC Tools PC*, or a script with `nfcpy`):

```python
# pip install nfcpy ; rows from the CSV
import csv, nfc, ndef
rows = list(csv.DictReader(open("modu-batch-GEN-2026-01-codes.csv")))
clf = nfc.ContactlessFrontend("usb")
for r in rows:
    input(f"Place tag for {r['serial']} and press Enter")
    tag = clf.connect(rdwr={"on-connect": lambda t: False})
    tag.ndef.records = [ndef.UriRecord(r["url"])]
    print("written", r["serial"], tag.identifier.hex())  # optionally store the UID
```

### Print & pack
* Print the serial on the base sticker and the **activation code on a scratch‑off card** inside the box (not on the outside!).
* QA: scan 1 in 20 tags; the page must show *“Awaiting activation”* and the right serial.

## Demo without a physical toy
`npm run db:reset` creates 3 free demo bears and writes `.data/demo-tags.csv` with URLs + codes. `/activate` lists demo tags while `DEMO_MODE` is on. For a real figure, write one demo URL to an NFC sticker and keep the code card at hand.

## Roadmap: secure tags (NTAG 424 DNA)

Prepared in the schema: `nfc_tags.tag_type = 'ntag424_dna'`, `sdm_key_ref` (KMS key reference) and `sdm_last_counter`.

With SUN (Secure Unique NFC) the tag appends an encrypted UID+counter and a CMAC to the URL on every tap: `/t/<token>?e=<picc_data>&c=<cmac>`. The server will:
1. decrypt `e` with the tag's key (keys in a KMS/HSM, diversified per tag),
2. verify `c`,
3. require `counter > sdm_last_counter` (blocks replayed URLs) and store it.

Then the passport can show “✓ genuine chip” and activation can require a fresh tap. This needs per‑tag key provisioning at encoding time — see LEGAL-AND-INTEGRATIONS.md.
