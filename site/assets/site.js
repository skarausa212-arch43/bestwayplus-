// Shared behaviour for every static page (see generate.py's build_static).
// This has to be an external, same-origin file rather than an inline
// <script>: the deployed CSP sends "script-src 'self'" with no
// 'unsafe-inline' and no nonce, so an inline script never runs at all — the
// burger menu, the contact-form validation and the scroll reveal were all
// silently dead until this moved here. Nothing below is templated in per
// build; anything that varies by page or language comes from a data
// attribute in the HTML instead (data-sent, data-root), never from string
// substitution into this file.
(function () {
  "use strict";
  var burger = document.getElementById("burger"), nav = document.getElementById("nav");
  if (burger) {
    burger.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      burger.setAttribute("aria-expanded", String(open));
    });
  }

  document.addEventListener("submit", function (ev) {
    var f = ev.target;
    if (f.id !== "enq") return;
    ev.preventDefault();
    var miss = [].slice.call(f.querySelectorAll("[required]")).filter(function (i) {
      return !i.value.trim();
    });
    var note = document.getElementById("formnote");
    if (miss.length) {
      miss[0].focus();
      miss[0].style.borderBottomColor = "var(--steel)";
      return;
    }
    note.textContent = note.getAttribute("data-sent") || "";
    note.classList.add("on");
    f.querySelector("button[type=submit]").disabled = true;
  });

  // Below-the-fold sections fade up as they enter view. The .pending class is
  // only ever added here — never in CSS by default — so a reader with no JS,
  // or JS that hasn't run yet, sees full content, not a page waiting on a
  // script that may never fire.
  if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    // Grid rows — tiles, cards, cluster entries, index rows, FAQ items —
    // reveal one at a time with a short per-item delay, so a section arrives
    // as a visible cascade rather than one flat block appearing all at once.
    var gridItems = [].slice.call(document.querySelectorAll(
      ".tiles>*,.cards>*,.clusters>*,.idx>*,.faq>*"));
    gridItems.forEach(function (el, i) {
      el.classList.add("reveal", "pending");
      el.style.transitionDelay = (i % 6) * 0.07 + "s";
    });
    // Everything else below the fold — sections with no grid of their own —
    // still fades up as a block; a lone paragraph has nothing to cascade.
    var sections = [].slice.call(document.querySelectorAll("main section")).filter(function (el) {
      return !el.classList.contains("hero") && !el.classList.contains("phero")
        && !el.querySelector(".tiles,.cards,.clusters,.idx,.faq");
    });
    sections.forEach(function (el, i) {
      el.classList.add("reveal", "pending");
      el.style.transitionDelay = (i % 3) * 0.08 + "s";
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: .12, rootMargin: "0px 0px -60px 0px" });
    gridItems.concat(sections).forEach(function (el) { io.observe(el); });
  }
})();

// The chosen language is remembered and applied only from each language's
// root page (data-root, set by build_static on home only): coming back to
// "/" after picking PL or RU earlier lands you back in that language. On any
// other page the URL always wins over the saved choice.
(function () {
  "use strict";
  var KEY = "bwf.lang", here = document.documentElement.lang || "en";
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest ? ev.target.closest(".langs a") : null;
    if (a) { try { localStorage.setItem(KEY, a.getAttribute("hreflang")); } catch (e) {} }
  });
  if (!document.documentElement.hasAttribute("data-root")) return;
  var saved;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  if (saved && saved !== here && (saved === "pl" || saved === "ru")) location.replace("/" + saved + "/");
})();
