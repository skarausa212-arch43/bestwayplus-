# bestwayfootball.pl — marketing site

Static HTML. No build step, no runtime, no dependencies. Nineteen pages sharing
`assets/site.css`, generated from `content.py` by `generate.py` so the copy
lives in one place.

```bash
cd site && python3 generate.py    # regenerates pages, sitemap, robots, headers
```

`_headers` and `_redirects` are read by Netlify and Cloudflare Pages. On any
other host, apply the same headers at the edge and redirect `www` to the apex.

## Publishing

Point the host at this directory as the publish root. Nothing needs compiling.

- **Cloudflare Pages / Netlify** — connect the repository, set the build
  command to `python3 generate.py`, the output directory to `site`, and add the
  custom domain.
- **Any static host** — upload the contents of `site/` as-is.

After the first deploy, confirm `https://bestwayfootball.pl/sitemap.xml` lists
all nineteen pages and `robots.txt` points at it.

## Before it goes live

The contact page and the footer carry placeholders. Fill in before launch:

- registered address and company registration details
- a real enquiry email address (`agents@bestwayfootball.pl` is a placeholder)
- photography in the marked slots — nothing may imply a relationship with a
  club or player that has not been confirmed in writing

The regulatory notices are already correct and should not be softened: the
company is not a FIFA Football Agent, and the page says so.
