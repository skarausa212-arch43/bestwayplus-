# -*- coding: utf-8 -*-
import os, html, json, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from content import *

DOMAIN = "bestwayfootball.pl"
import i18n
from assets import SPRITE, logo, icon, GRID, CONTACT_RAIL, FAVICON
BRAND = "Bestway Football"
TAGLINE = "Players. Clubs. Opportunities."
META_LINE = "Est. 2024 \u00b7 Wroc\u0142aw \u00b7 Europe \u00b7 Global"

ROMAN = ["","I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII"]
def rn(v):
    try: return ROMAN[int(str(v).lstrip("0") or 0)]
    except (ValueError, IndexError): return str(v)

ARROW = ('<svg class="ar" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" '
         'stroke-width="1.4" aria-hidden="true"><path d="M4 12L12 4M6 4h6v6"/></svg>')
LANG = "en"

def E(text):
    """Экранирование и перевод одной операцией. Весь видимый текст шаблонов уже
    проходит через E(), поэтому локализация не требует правки самих шаблонов."""
    return html.escape(i18n.t(str(text), LANG))

def alt_href(slug, lang):
    """Корне-абсолютная ссылка на ту же страницу в другом языке. Внутри одного
    языка ссылки остаются относительными, поэтому дерево можно перенести."""
    base = "/" if lang == "en" else "/%s/" % lang
    return base if slug == "home" else base + slug + ".html"


def lang_switch(slug, mode):
    if mode != "static":
        return ""
    links = "".join(
        '<a href="%s" hreflang="%s" lang="%s"%s>%s</a>'
        % (alt_href(slug, l), l, l, ' class="on" aria-current="true"' if l == LANG else "", i18n.LABEL[l])
        for l in i18n.LOCALES)
    return '<div class="langs" role="group" aria-label="%s">%s</div>' % (E("Language"), links)


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
    it = "".join(f'<div class="cluster"><div><span class="cn">{E("Notice")} {n+1:02d}</span><h3>{E(t)}</h3></div>'
                 f'<div><p class="dim" style="font-size:15px;line-height:1.72">{E(b)}</p></div></div>'
                 for n,(t,b) in enumerate(items))
    return f'<section class="sec"><div class="wrap"><div class="clusters">{it}</div></div></section>'

def b_band(bk, m):
    _, head, text, cta, target = bk
    return f'''<section class="band"><div class="wrap in">
<div><h2 style="max-width:18ch">{E(head)}</h2><p class="lead pad-t measure">{E(text)}</p></div>
<div><a class="btn" href="{href(target,m)}">{E(cta)} {ARROW}</a></div></div></section>'''

def b_contact_form(bk, m):
    C = COMPANY
    return f'''<section class="sec flush"><div class="wrap split">
<div class="hd"><span class="eyebrow">{E("Enquiry")}</span><h2>{E("Send a message")}</h2>
<p class="lead pad-t">{E("Every enquiry is read by a person. If your request is outside what we do, we will say so and, where we can, point you somewhere better.")}</p></div>
<form class="form" id="enq" novalidate>
<div class="f2">
<label><span>{E("Name")}</span><input name="name" autocomplete="name" required></label>
<label><span>{E("Organisation")}</span><input name="org" autocomplete="organization"></label>
</div>
<div class="f2">
<label><span>{E("Country")}</span><input name="country" autocomplete="country-name"></label>
<label><span>{E("Email")}</span><input name="email" type="email" autocomplete="email" required></label>
</div>
<label><span>{E("I am writing as")}</span><select name="role">
<option>{E("Please select")}</option><option>{E("Player")}</option><option>{E("Club")}</option>
<option>{E("Licensed football agent")}</option><option>{E("Scout")}</option><option>{E("Investor")}</option>
<option>{E("Brand or sponsor")}</option><option>{E("Other")}</option></select></label>
<label><span>{E("What are you trying to do?")}</span><textarea name="msg"
placeholder="{E("Three lines is enough. A date, a country or a budget band helps more than a long description.")}"></textarea></label>
<div id="formnote" role="status"></div>
<div><button class="btn" type="submit">{E("Send enquiry")}</button></div>
<p class="dim" style="font-size:12.5px;line-height:1.7">{E("Prototype: this form is a demonstration and does not transmit anything yet. In the live site it delivers to the enquiry address and stores nothing else.")}</p>
</form></div></section>
<section class="sec"><div class="wrap split">
<div class="hd"><span class="eyebrow">{E("Company")}</span><h2>{E("Details")}</h2></div>
<div class="grid2">
<div class="stack"><span class="eyebrow">{E("Registered office")}</span><p class="lead">{C["legal_name"]}<br>{C["street_pl"]}<br>{C["postcode"]} {C["city"]}, {C["country"]}<br><span class="dim" style="font-size:14px">{E("Trading as Bestway Football")}</span></p></div>
<div class="stack"><span class="eyebrow">{E("Coverage")}</span><p class="lead">{E("International, primarily Europe")}</p></div>
<div class="stack"><span class="eyebrow">{E("Web")}</span><p class="lead"><a class="tlink" style="font-size:13px"
href="https://bestwayfootball.pl">bestwayfootball.pl</a></p></div>
<div class="stack"><span class="eyebrow">{E("Registration")}</span><p class="lead">NIP {C["nip"]}<br>REGON {C["regon"]}<br>KRS {C["krs"]}</p></div>
<div class="stack"><span class="eyebrow">{E("Enquiries")}</span><p class="lead"><a class="tlink" style="font-size:13px"
href="mailto:{C["email"]}">{C["email"]}</a></p></div>
<div class="stack"><span class="eyebrow">{E("Confidentiality")}</span><p class="lead">{E("Enquiries are treated as confidential and are not shared outside the company.")}</p></div>
</div></div></section>'''

def b_tiles(bk, m):
    _, eye, head, intro = bk
    it = "".join(
        f'<a class="tile" href="{href(t[3],m)}">{icon(t[0])}'
        f'<span class="tt">{t[1]}</span><span class="ts">{t[2]}</span></a>' for t in GRID)
    intro_h = f'<p class="lead measure pad-t">{E(intro)}</p>' if intro else ""
    return f'''<section class="sec"><div class="wrap">
<div class="sec-intro"><span class="eyebrow">{E(eye)}</span><h2>{E(head)}</h2>{intro_h}</div>
<div class="tiles">{it}</div></div></section>'''

def b_manifesto(bk, m):
    _, eye, words, paras = bk
    ws = "".join(f"<span>{E(w)}</span>" for w in words)
    ps = "".join(f"<p>{E(p)}</p>" for p in paras)
    return f'''<section class="sec tint"><div class="wrap split">
<div class="hd"><span class="eyebrow">{E(eye)}</span><div class="words">{ws}</div></div>
<div class="stack lead">{ps}</div></div></section>'''

def b_rail(bk, m):
    _, label = bk
    it = "".join(f'<span>{icon(n)}</span>' for n in CONTACT_RAIL)
    return f'''<section class="sec"><div class="wrap">
<span class="eyebrow">{E(label)}</span>
<div class="rail" style="margin-top:20px">{it}</div></div></section>'''

RENDER = {"tiles":b_tiles,"manifesto":b_manifesto,"rail":b_rail,"statement":b_statement,"split":b_split,"idx":b_idx,"cards":b_cards,"clusters":b_clusters,
          "note":b_note,"plate":b_plate,"faq":b_faq,"legal":b_legal,"band":b_band,
          "contact_form":b_contact_form}

# ------------------------------------------------------------------ shells --
def header(slug, m):
    nav = "".join('<a href="%s" data-nav="%s"%s>%s</a>'
                  % (href(s,m), s, ' class="on"' if s==slug else '', E(t)) for s,t in NAV)
    return f'''<header class="hdr"><div class="wrap hdr-in">
<a class="logo" href="{href("home",m)}">{logo()}<span class="wm"><b>Bestway</b><i>Football</i></span></a>
<button class="burger" id="burger" type="button" aria-label="Menu" aria-expanded="false">
<span></span><span></span><span></span></button>
<nav class="nav" id="nav">{nav}<a class="btn sm" href="{href("contact",m)}" style="margin-block:10px">{E("Contact")}</a></nav>
{lang_switch(slug, m)}
<a class="btn sm" href="{href("contact",m)}">{E("Contact")}</a>
</div></header>'''

def footer(m):
    cols = ""
    for title, links in FOOTER:
        ls = "".join(f'<a href="{href(s,m)}">{E(t)}</a>' for s,t in links)
        cols += f'<div class="fcol"><span class="fh">{E(title)}</span>{ls}</div>'
    return f'''<footer class="ftr"><div class="wrap">
<div class="fmap">
<div class="fcol flock">{logo()}
<div><p style="font-size:15px;line-height:1.5;max-width:32ch">{E(SLOGAN)}</p>
<p class="dim" style="font-size:13px;line-height:1.65;max-width:34ch;margin-top:12px">{E(LEGAL_NAME)},
{E("trading as Bestway Football. Football business. Player support. Investment. Opportunities.")}<br>{E(META_LINE)}</p>
<p class="dim" style="font-size:13px;line-height:1.65;max-width:34ch;margin-top:10px">{COMPANY["street_pl"]}, {COMPANY["postcode"]} {COMPANY["city"]}, {COMPANY["country"]}<br>
NIP {COMPANY["nip"]} &#183; REGON {COMPANY["regon"]} &#183; KRS {COMPANY["krs"]}<br>
<a class="tlink" href="mailto:{COMPANY["email"]}">{COMPANY["email"]}</a></p></div>
<a class="dom" href="https://{DOMAIN}">{DOMAIN}</a></div>
{cols}</div>
<p class="fdisc">{E("Bestway Plus is not a FIFA Football Agent and does not carry out football agent activity; services reserved for a licensed football agent are performed by an appropriately licensed FIFA Football Agent. The company does not provide regulated investment, legal or tax advice — these are provided by appropriately licensed independent professionals where required. Nothing on this website is an offer or recommendation to invest, and no outcome is guaranteed.")}</p>
<div class="fbar"><span>&copy; {E(LEGAL_NAME)}</span>
<span>{E("Prototype — demonstration content")}</span>
<a href="{href("legal-notices",m)}">{E("Legal notices")}</a></div>
</div></footer>'''

def page_body(slug, m):
    p = PAGES[slug]; h = p["hero"]; out = []
    is_home = slug == "home"
    crumbs = ""
    if p.get("parent"):
        ps, pt = p["parent"]
        crumbs = (f'<div class="crumbs"><a href="{href("home",m)}">{E("Home")}</a><span>/</span>'
                  f'<a href="{href(ps,m)}">{E(pt)}</a></div>')
    cta = "".join(f'<a class="{c}" href="{href(t,m)}">{E(l)} {ARROW if c=="btn" else ""}</a>'
                  for l,t,c in h.get("cta",[]))
    cta_h = f'<div class="hero-cta">{cta}</div>' if cta else ""
    if is_home:
        out.append(f'''<section class="hero"><div class="wrap">
<div class="lock">{logo(detail=True)}<div class="wm"><b>Bestway</b><i>Football</i></div>
<span class="tagline">{E(TAGLINE)}</span></div>
<span class="eyebrow">{E(h["eyebrow"])}</span><h1>{E(h["h1"])}</h1>
<p class="hero-sub">{E(h["sub"])}</p>{cta_h}
<div class="hero-meta"><span>{E(META_LINE)}</span></div></div></section>''')
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

# Корне-абсолютный путь: один и тот же файл обслуживает /, /pl/ и /ru/.
CSS_LINK = '<link rel="stylesheet" href="/assets/site.css">'
FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700'
         '&family=Montserrat:wght@500;600;700;800&display=swap" rel="stylesheet">')

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
   note.textContent=__SENT__;
   note.classList.add("on"); f.querySelector("button[type=submit]").disabled=true;});
 // Below-the-fold sections fade up as they enter view. The .pending class is
 // only ever added here — never in CSS by default — so a reader with no JS,
 // or JS that hasn't run yet, sees full content, not a page waiting on a
 // script that may never fire.
 if("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches){
   var targets=[].slice.call(document.querySelectorAll("main section")).filter(function(el){
     return !el.classList.contains("hero") && !el.classList.contains("phero");});
   targets.forEach(function(el,i){
     el.classList.add("reveal","pending");
     el.style.transitionDelay=(i%3)*0.08+"s";});
   var io=new IntersectionObserver(function(entries){
     entries.forEach(function(e){
       if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target);}});
   },{threshold:.12,rootMargin:"0px 0px -60px 0px"});
   targets.forEach(function(el){io.observe(el);});
 }
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

def js_common():
    sent = i18n.t("Received. In the live site this reaches the enquiry desk, "
                  "which answers every serious message.", LANG)
    return JS_COMMON.replace("__SENT__", json.dumps(sent, ensure_ascii=False))


# Выбор языка запоминается и применяется только на английском корне: возврат
# на /, если раньше выбрали PL или RU, ведёт в выбранный язык. На остальных
# страницах адрес всегда важнее сохранённого выбора.
JS_LANG = '''
(function(){"use strict";
 var KEY="bwf.lang", here=document.documentElement.lang||"en";
 document.addEventListener("click",function(ev){
   var a=ev.target.closest?ev.target.closest(".langs a"):null;
   if(a){try{localStorage.setItem(KEY,a.getAttribute("hreflang"));}catch(e){}}});
 if(!__ROOT__) return;
 var saved; try{saved=localStorage.getItem(KEY);}catch(e){}
 if(saved && saved!==here && (saved==="pl"||saved==="ru")) location.replace("/"+saved+"/");
})();'''


def build_static(outdir, lang="en"):
    global LANG
    LANG = lang
    out = outdir if lang == "en" else os.path.join(outdir, lang)
    os.makedirs(out, exist_ok=True)
    for slug, p in PAGES.items():
        fn = ("index" if slug == "home" else slug) + ".html"
        canon = alt_href(slug, lang).lstrip("/")
        alts = "".join(
            '<link rel="alternate" hreflang="%s" href="https://%s%s">' % (l, DOMAIN, alt_href(slug, l))
            for l in i18n.LOCALES)
        alts += '<link rel="alternate" hreflang="x-default" href="https://%s%s">' % (DOMAIN, alt_href(slug, "en"))
        js_lang = JS_LANG.replace("__ROOT__", "true" if slug == "home" else "false")
        doc = f'''<!DOCTYPE html>
<html lang="{i18n.HTML_LANG[lang]}"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="dark">
<title>{E(p["seo_title"])}</title>
<meta name="description" content="{E(p["seo_desc"])}">
<meta property="og:title" content="{E(p["seo_title"])}">
<meta property="og:description" content="{E(p["seo_desc"])}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Bestway Plus">
<meta property="og:url" content="https://{DOMAIN}/{canon}">
<link rel="canonical" href="https://{DOMAIN}/{canon}">
{alts}
<link rel="icon" href="{FAVICON}">
{FONTS}
{CSS_LINK}
</head><body>
{SPRITE}
{header(slug,"static")}
<main>
{page_body(slug,"static")}
</main>
{footer("static")}
<script>{js_common()}</script>
<script>{js_lang}</script>
</body></html>'''
        open(os.path.join(out, fn), "w", encoding="utf-8").write(doc)
    return len(PAGES)

def build_spa(path, css):
    meta = {s: {"t": p["seo_title"], "d": p["seo_desc"]} for s, p in PAGES.items()}
    body = "".join(f'<div class="page" data-page="{s}" hidden>{page_body(s,"spa")}</div>' for s in PAGES)
    js = JS_SPA.replace("__META__", json.dumps(meta, ensure_ascii=False))
    doc = f'''<title>Bestway Plus</title>
<meta name="description" content="{E(PAGES["home"]["seo_desc"])}">
{SPRITE}
{FONTS}
<style>
{css}
.page[hidden]{{display:none}}
</style>
{header("home","spa")}
<main>{body}</main>
{footer("spa")}
<script>{js_common()}</script>
<script>{js}</script>
'''
    open(path, "w", encoding="utf-8").write(doc)
    return len(doc)

def build_meta(outdir):
    """robots.txt, sitemap.xml and edge headers — regenerated with the pages so
    a new page cannot be added without appearing in the sitemap."""
    from datetime import date
    today = date.today().isoformat()

    urls = []
    for slug in PAGES:
        priority = "1.0" if slug == "home" else "0.7"
        # Каждый язык — отдельный URL, и в каждом перечислены остальные:
        # иначе поисковик считает переводы дублями друг друга.
        links = "".join(
            f'\n    <xhtml:link rel="alternate" hreflang="{l}" href="https://{DOMAIN}{alt_href(slug, l)}"/>'
            for l in i18n.LOCALES)
        for lang in i18n.LOCALES:
            loc = f"https://{DOMAIN}{alt_href(slug, lang)}"
            urls.append(
                f"  <url>\n    <loc>{loc}</loc>\n    <lastmod>{today}</lastmod>\n"
                f"    <changefreq>monthly</changefreq>\n    <priority>{priority}</priority>"
                f"{links}\n  </url>"
            )

    sitemap = ('<?xml version="1.0" encoding="UTF-8"?>\n'
               '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n'
               '        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
               + "\n".join(urls) + "\n</urlset>\n")
    open(os.path.join(outdir, "sitemap.xml"), "w", encoding="utf-8").write(sitemap)

    open(os.path.join(outdir, "robots.txt"), "w", encoding="utf-8").write(
        f"User-agent: *\nAllow: /\n\nSitemap: https://{DOMAIN}/sitemap.xml\n"
    )

    # Netlify and Cloudflare Pages both read _headers.
    open(os.path.join(outdir, "_headers"), "w", encoding="utf-8").write(
        "/*\n"
        "  X-Content-Type-Options: nosniff\n"
        "  X-Frame-Options: DENY\n"
        "  Referrer-Policy: strict-origin-when-cross-origin\n"
        "  Permissions-Policy: camera=(), geolocation=(), microphone=()\n"
        "  Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline' "
        "https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data:; script-src 'self'; frame-ancestors 'none'; base-uri 'self'\n"
        "  Strict-Transport-Security: max-age=63072000; includeSubDomains\n"
    )

    open(os.path.join(outdir, "_redirects"), "w", encoding="utf-8").write(
        f"https://www.{DOMAIN}/*  https://{DOMAIN}/:splat  301!\n"
        "/index.html  /  301!\n"
    )


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    # The stylesheet lives with the built site; this script regenerates the
    # pages around it rather than owning a second copy.
    site = here
    css = open(os.path.join(site, "assets", "site.css"), encoding="utf-8").read()
    total = 0
    for lang in i18n.LOCALES:
        total += build_static(site, lang)
    build_meta(site)

    print("страниц собрано:", total, "| языков:", len(i18n.LOCALES),
          "| sitemap, robots и headers обновлены")
    for lang in i18n.LOCALES[1:]:
        miss = i18n.missing(lang)
        if miss:
            print(f"  {lang.upper()}: без перевода {len(miss)} строк "
                  f"({sum(len(x.split()) for x in miss)} слов)")
            if os.environ.get("DUMP_MISSING"):
                import json as _j
                _j.dump(miss, open(os.path.join(here, f"missing-{lang}.json"), "w"),
                        ensure_ascii=False, indent=0)
