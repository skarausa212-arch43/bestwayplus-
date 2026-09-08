# -*- coding: utf-8 -*-
import os, html, json, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from content import *

ARROW = ('<svg class="ar" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" '
         'stroke-width="1.4" aria-hidden="true"><path d="M4 12L12 4M6 4h6v6"/></svg>')
E = html.escape

def href(slug, mode):
    if mode == "spa":
        return "#/" + ("" if slug == "home" else slug)
    return ("index" if slug == "home" else slug) + ".html"

# ------------------------------------------------------------------ blocks --
def b_statement(bk, m):
    _, text, paras = bk
    ps = "".join(f"<p>{E(p)}</p>" for p in paras)
    return f'''<section class="sec"><div class="wrap split">
<div class="hd"><p class="statement">{E(text)}</p></div>
<div class="stack lead">{ps}</div></div></section>'''

def b_split(bk, m):
    _, eye, head, paras, link = bk
    ps = "".join(f"<p>{E(p)}</p>" for p in paras)
    lk = ""
    if link:
        lk = (f'<p class="pad-t"><a class="tlink" href="{href(link[1],m)}">{E(link[0])} {ARROW}</a></p>')
    return f'''<section class="sec"><div class="wrap split">
<div class="hd"><span class="eyebrow">{E(eye)}</span><h2>{E(head)}</h2></div>
<div class="stack lead">{ps}{lk}</div></div></section>'''

def b_idx(bk, m):
    _, eye, head, intro, rows = bk
    it = "".join(
        f'<a href="{href(r[3],m)}"><span class="n">{E(r[0])}</span>'
        f'<span class="t">{E(r[1])}</span><span class="d">{E(r[2])}</span>{ARROW}</a>' for r in rows)
    intro_h = f'<p class="lead measure pad-t">{E(intro)}</p>' if intro else ""
    return f'''<section class="sec"><div class="wrap">
<div class="sec-intro"><span class="eyebrow">{E(eye)}</span><h2 style="margin-top:16px">{E(head)}</h2>{intro_h}</div>
<div class="idx">{it}</div></div></section>'''

def b_cards(bk, m):
    _, eye, head, intro, items = bk
    cls = "cards" if len(items) % 3 == 0 or len(items) > 4 else "cards two"
    it = "".join(f'<div class="card"><span class="cn">{E(i[0])}</span><h3>{E(i[1])}</h3><p>{E(i[2])}</p></div>'
                 for i in items)
    intro_h = f'<p class="lead measure pad-t">{E(intro)}</p>' if intro else ""
    return f'''<section class="sec tint"><div class="wrap">
<div class="sec-intro"><span class="eyebrow">{E(eye)}</span><h2 style="margin-top:16px">{E(head)}</h2>{intro_h}</div>
<div class="{cls}">{it}</div></div></section>'''

def b_clusters(bk, m):
    _, eye, head, intro, items = bk
    it = ""
    for n, (name, desc, tags) in enumerate(items):
        tg = "".join(f"<span>{E(t)}</span>" for t in tags)
        it += (f'<div class="cluster"><div><span class="cn">{n+1:02d} / {len(items):02d}</span>'
               f'<h3>{E(name)}</h3><p>{E(desc)}</p></div><div class="tags">{tg}</div></div>')
    intro_h = f'<p class="lead measure pad-t">{E(intro)}</p>' if intro else ""
    return f'''<section class="sec"><div class="wrap">
<div class="sec-intro"><span class="eyebrow">{E(eye)}</span><h2 style="margin-top:16px">{E(head)}</h2>{intro_h}</div>
<div class="clusters">{it}</div></div></section>'''

def b_note(bk, m):
    _, label, text = bk
    return f'''<section class="sec"><div class="wrap"><div class="note">
<span class="nl">{E(label)}</span><p>{E(text)}</p></div></div></section>'''

def b_plate(bk, m):
    _, cap, head, paras = bk
    ps = "".join(f"<p>{E(p)}</p>" for p in paras)
    cap_h = "<br>".join(E(l) for l in cap.split("\n"))
    return f'''<section class="sec"><div class="wrap split">
<div><div class="plate"><span class="cap">{cap_h}</span></div></div>
<div class="stack"><h2>{E(head)}</h2><div class="stack lead">{ps}</div></div></div></section>'''

def b_faq(bk, m):
    _, eye, head, items = bk
    it = "".join(f'<details{" open" if n==0 else ""}><summary>{E(q)}</summary>'
                 f'<div class="ans">{E(a)}</div></details>' for n,(q,a) in enumerate(items))
    hd = f'<div class="sec-intro"><span class="eyebrow">{E(eye)}</span></div>' if eye else ""
    return f'<section class="sec"><div class="wrap">{hd}<div class="faq">{it}</div></div></section>'

def b_legal(bk, m):
    _, eye, head, items = bk
    it = "".join(f'<div class="cluster"><div><span class="cn">Notice {n+1:02d}</span><h3>{E(t)}</h3></div>'
                 f'<div><p class="dim" style="font-size:15px;line-height:1.72">{E(b)}</p></div></div>'
                 for n,(t,b) in enumerate(items))
    return f'<section class="sec"><div class="wrap"><div class="clusters">{it}</div></div></section>'

def b_band(bk, m):
    _, head, text, cta, target = bk
    return f'''<section class="band"><div class="wrap in">
<div><h2 style="max-width:18ch">{E(head)}</h2><p class="lead pad-t measure">{E(text)}</p></div>
<div><a class="btn" href="{href(target,m)}">{E(cta)} {ARROW}</a></div></div></section>'''

def b_contact_form(bk, m):
    return '''<section class="sec flush"><div class="wrap split">
<div class="hd"><span class="eyebrow">Enquiry</span><h2>Send a message</h2>
<p class="lead pad-t">Every enquiry is read by a person. If your request is outside what we do, we will say
so and, where we can, point you somewhere better.</p></div>
<form class="form" id="enq" novalidate>
<div class="f2">
<label><span>Name</span><input name="name" autocomplete="name" required></label>
<label><span>Organisation</span><input name="org" autocomplete="organization"></label>
</div>
<div class="f2">
<label><span>Country</span><input name="country" autocomplete="country-name"></label>
<label><span>Email</span><input name="email" type="email" autocomplete="email" required></label>
</div>
<label><span>I am writing as</span><select name="role">
<option>Please select</option><option>Player</option><option>Club</option>
<option>Licensed football agent</option><option>Scout</option><option>Investor</option>
<option>Brand or sponsor</option><option>Other</option></select></label>
<label><span>What are you trying to do?</span><textarea name="msg"
placeholder="Three lines is enough. A date, a country or a budget band helps more than a long description."></textarea></label>
<div id="formnote" role="status"></div>
<div><button class="btn" type="submit">Send enquiry</button></div>
<p class="dim" style="font-size:12.5px;line-height:1.7">Prototype: this form is a demonstration and does not
transmit anything yet. In the live site it delivers to the enquiry address and stores nothing else.</p>
</form></div></section>
<section class="sec"><div class="wrap split">
<div class="hd"><span class="eyebrow">Company</span><h2>Details</h2></div>
<div class="grid2">
<div class="stack"><span class="eyebrow">Registered</span><p class="lead">Bestway Plus Sp. z o.o.<br>Poland</p></div>
<div class="stack"><span class="eyebrow">Coverage</span><p class="lead">International, primarily Europe</p></div>
<div class="stack"><span class="eyebrow">Enquiries</span><p class="lead">Placeholder — full company details,
registered address and contact channels to be published here before launch.</p></div>
<div class="stack"><span class="eyebrow">Confidentiality</span><p class="lead">Enquiries are treated as
confidential and are not shared outside the company.</p></div>
</div></div></section>'''

RENDER = {"statement":b_statement,"split":b_split,"idx":b_idx,"cards":b_cards,"clusters":b_clusters,
          "note":b_note,"plate":b_plate,"faq":b_faq,"legal":b_legal,"band":b_band,
          "contact_form":b_contact_form}

# ------------------------------------------------------------------ shells --
def header(slug, m):
    nav = "".join('<a href="%s" data-nav="%s"%s>%s</a>'
                  % (href(s,m), s, ' class="on"' if s==slug else '', E(t)) for s,t in NAV)
    return f'''<header class="hdr"><div class="wrap hdr-in">
<a class="logo" href="{href("home",m)}"><b>Bestway Plus</b><i>Poland</i></a>
<button class="burger" id="burger" type="button" aria-label="Menu" aria-expanded="false">
<span></span><span></span><span></span></button>
<nav class="nav" id="nav">{nav}<a class="btn sm" href="{href("contact",m)}" style="margin-block:10px">Contact</a></nav>
<a class="btn sm" href="{href("contact",m)}">Contact</a>
</div></header>'''

def footer(m):
    cols = ""
    for title, links in FOOTER:
        ls = "".join(f'<a href="{href(s,m)}">{E(t)}</a>' for s,t in links)
        cols += f'<div class="fcol"><span class="fh">{E(title)}</span>{ls}</div>'
    return f'''<footer class="ftr"><div class="wrap">
<div class="fmap">
<div class="fcol"><span class="fh">{E(LEGAL_NAME)}</span>
<p class="dim" style="font-size:14.5px;line-height:1.65;max-width:32ch">{E(SLOGAN)}</p>
<p class="dim" style="font-size:13px;line-height:1.65;max-width:34ch">International football business,
player support and sports consulting. Registered in Poland.</p></div>
{cols}</div>
<p class="fdisc">Bestway Plus is not a FIFA Football Agent and does not carry out football agent activity;
services reserved for a licensed football agent are performed by an appropriately licensed FIFA Football
Agent. The company does not provide regulated investment, legal or tax advice — these are provided by
appropriately licensed independent professionals where required. Nothing on this website is an offer or
recommendation to invest, and no outcome is guaranteed.</p>
<div class="fbar"><span>&copy; {E(LEGAL_NAME)}</span>
<span>Prototype — demonstration content</span>
<a href="{href("legal-notices",m)}">Legal notices</a></div>
</div></footer>'''

def page_body(slug, m):
    p = PAGES[slug]; h = p["hero"]; out = []
    is_home = slug == "home"
    crumbs = ""
    if p.get("parent"):
        ps, pt = p["parent"]
        crumbs = (f'<div class="crumbs"><a href="{href("home",m)}">Home</a><span>/</span>'
                  f'<a href="{href(ps,m)}">{E(pt)}</a></div>')
    cta = "".join(f'<a class="{c}" href="{href(t,m)}">{E(l)} {ARROW if c=="btn" else ""}</a>'
                  for l,t,c in h.get("cta",[]))
    cta_h = f'<div class="hero-cta">{cta}</div>' if cta else ""
    if is_home:
        out.append(f'''<section class="hero"><div class="hero-light"></div><div class="hero-beams"></div>
<div class="wrap"><span class="eyebrow">{E(h["eyebrow"])}</span><h1>{E(h["h1"])}</h1>
<p class="hero-sub">{E(h["sub"])}</p>{cta_h}</div></section>''')
    else:
        out.append(f'''<section class="phero"><div class="wrap">{crumbs}
<span class="eyebrow">{E(h["eyebrow"])}</span><h1 style="margin-top:20px">{E(h["h1"])}</h1>
<p class="lead">{E(h["sub"])}</p>{cta_h}</div></section>''')
    if p.get("router"):
        rt = "".join(f'<a href="{href(r[3],m)}"><span class="n">{E(r[0])}</span>'
                     f'<span class="t">{E(r[1])}</span><span class="d">{E(r[2])}</span></a>'
                     for r in p["router"])
        out.append(f'<div class="wrap"><div class="router">{rt}</div></div>')
    for bk in p.get("blocks", []):
        out.append(RENDER[bk[0]](bk, m))
    return "\n".join(out)

CSS_LINK = '<link rel="stylesheet" href="assets/site.css">'
FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..125,400..800'
         '&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">')

JS_COMMON = '''
(function(){"use strict";
 var burger=document.getElementById("burger"),nav=document.getElementById("nav");
 if(burger){burger.addEventListener("click",function(){
   var open=nav.classList.toggle("open");
   burger.setAttribute("aria-expanded",String(open));});}
 document.addEventListener("submit",function(ev){
   var f=ev.target; if(f.id!=="enq")return; ev.preventDefault();
   var miss=[].slice.call(f.querySelectorAll("[required]")).filter(function(i){return !i.value.trim();});
   var note=document.getElementById("formnote");
   if(miss.length){miss[0].focus();miss[0].style.borderBottomColor="var(--steel)";return;}
   note.textContent="Received. In the live site this reaches the enquiry desk, which answers every serious message.";
   note.classList.add("on"); f.querySelector("button[type=submit]").disabled=true;});
})();'''

JS_SPA = '''
(function(){"use strict";
 var META=__META__, pages=document.querySelectorAll(".page"), nav=document.getElementById("nav");
 function show(slug){
   if(!META[slug]) slug="home";
   pages.forEach(function(p){p.hidden = (p.dataset.page!==slug);});
   document.title=META[slug].t;
   var d=document.querySelector('meta[name="description"]'); if(d) d.setAttribute("content",META[slug].d);
   document.querySelectorAll("[data-nav]").forEach(function(a){
     a.classList.toggle("on", a.dataset.nav===slug);});
   if(nav) nav.classList.remove("open");
   window.scrollTo(0,0);
 }
 function route(){ show((location.hash||"#/").replace(/^#\\//,"") || "home"); }
 window.addEventListener("hashchange",route); route();
})();'''

def build_static(outdir):
    os.makedirs(os.path.join(outdir, "assets"), exist_ok=True)
    for slug, p in PAGES.items():
        fn = ("index" if slug == "home" else slug) + ".html"
        doc = f'''<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="dark">
<title>{E(p["seo_title"])}</title>
<meta name="description" content="{E(p["seo_desc"])}">
<meta property="og:title" content="{E(p["seo_title"])}">
<meta property="og:description" content="{E(p["seo_desc"])}">
<meta property="og:type" content="website">
{FONTS}
{CSS_LINK}
</head><body>
{header(slug,"static")}
<main>
{page_body(slug,"static")}
</main>
{footer("static")}
<script>{JS_COMMON}</script>
</body></html>'''
        open(os.path.join(outdir, fn), "w", encoding="utf-8").write(doc)
    return len(PAGES)

def build_spa(path, css):
    meta = {s: {"t": p["seo_title"], "d": p["seo_desc"]} for s, p in PAGES.items()}
    body = "".join(f'<div class="page" data-page="{s}" hidden>{page_body(s,"spa")}</div>' for s in PAGES)
    js = JS_SPA.replace("__META__", json.dumps(meta, ensure_ascii=False))
    doc = f'''<title>Bestway Plus</title>
<meta name="description" content="{E(PAGES["home"]["seo_desc"])}">
{FONTS}
<style>
{css}
.page[hidden]{{display:none}}
</style>
{header("home","spa")}
<main>{body}</main>
{footer("spa")}
<script>{JS_COMMON}</script>
<script>{js}</script>
'''
    open(path, "w", encoding="utf-8").write(doc)
    return len(doc)

if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    css = open(os.path.join(here, "site.css"), encoding="utf-8").read()
    site = "/home/user/bestwayplus-/site"
    n = build_static(site)
    open(os.path.join(site, "assets", "site.css"), "w", encoding="utf-8").write(css)
    size = build_spa(os.path.join(here, "..", "bwp-corporate.html"), css)
    print("static pages:", n, "| spa bytes:", size)
