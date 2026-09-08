# -*- coding: utf-8 -*-
BRAND = "Bestway Plus"
LEGAL_NAME = "Bestway Plus Sp. z o.o."
SLOGAN = "Connecting players, clubs, capital and opportunities."

NAV = [("services","Services"),("network","Network"),("about","About"),("faq","FAQ")]

FOOTER = [
    ("Who we serve", [("players","Players"),("clubs","Clubs"),("agents","Licensed Agents"),
                      ("investors","Investors"),("brands","Brands")]),
    ("What we do", [("player-support","Player Support"),("relocation","Relocation"),
                    ("football-business","Football Business"),("recruitment","Recruitment & Scouting"),
                    ("financial-wealth","Financial & Wealth"),("marketing","Marketing & Branding"),
                    ("legal-coordination","Legal Coordination")]),
    ("Company", [("about","About us"),("network","Network"),("faq","FAQ"),
                 ("contact","Contact"),("legal-notices","Legal notices")]),
]

# ---- reusable regulatory language (short, professional, used sparingly) -----
D_AGENT = ("Bestway Plus is not a FIFA Football Agent and does not carry out football agent activity. "
           "Where a mandate requires services reserved for a licensed football agent, those services are "
           "performed directly by an appropriately licensed FIFA Football Agent.")
D_FIN = ("Bestway Plus does not provide regulated investment advice, asset or portfolio management, or "
         "individual financial recommendations. Investment, tax and regulated financial advice is provided "
         "only by appropriately licensed independent professionals where required.")
D_INV = ("Nothing on this page is an offer, solicitation or recommendation to invest. Bestway Plus is not a "
         "licensed investment adviser and gives no assurance as to returns or outcomes.")
D_LEG = ("Legal advice is provided by independent qualified legal professionals. Bestway Plus coordinates "
         "and administers; it does not provide legal or tax advice.")
D_OUT = ("No outcome is guaranteed. We are engaged for work and coordination, not for results that depend "
         "on clubs, markets or third parties.")

CTA = {
 "players":   ("Speak to us in confidence","contact"),
 "clubs":     ("Send us a brief","contact"),
 "agents":    ("Discuss a working partnership","contact"),
 "investors": ("Request a project overview","contact"),
 "brands":    ("Discuss a partnership brief","contact"),
 "general":   ("Start a conversation","contact"),
}

PAGES = {}

PAGES["home"] = dict(
 nav="Home",
 seo_title="Bestway Plus — Football Business, Player Support & Sports Consulting",
 seo_desc="International football business and player support company based in Poland. We connect players, clubs, licensed agents, investors and brands across European football.",
 hero=dict(
   eyebrow="Football business · Player support · Sports consulting",
   h1="Connecting players, clubs, capital and opportunities.",
   sub="Bestway Plus is an international football business and player support company based in Poland. "
       "We work at the intersection of football, business and international opportunity — for players, "
       "clubs, licensed agents, investors and commercial partners.",
   cta=[("Start a conversation","contact","btn"),("What we do","services","btn line")],
 ),
 router=[
   ("01","Players","Career support, relocation, day-to-day life and everything around the contract.","players"),
   ("02","Clubs","Recruitment support, market intelligence, commercial and international development.","clubs"),
   ("03","Licensed agents","Back-office, research and business development for licensed professionals.","agents"),
   ("04","Investors","Football projects, market research and structured introductions.","investors"),
   ("05","Brands","Sponsorship, athlete-brand matching and commercial partnerships.","brands"),
 ],
 blocks=[
  ("statement",
   "Football careers are decided on the pitch. They are built off it.",
   ["A professional career moves fast and across borders. Contracts, countries, languages, taxes, housing, "
    "family, media and money all change at once — usually inside a few weeks, and usually while the player "
    "is expected to perform.",
    "Bestway Plus exists for that surrounding work. We coordinate the professionals a career needs, we do "
    "the research and administration that clubs and agents rarely have time for, and we make sure the "
    "people on each side of a conversation are the right ones.",
    "Our role is deliberately defined. Where a service is reserved for a licensed professional — a football "
    "agent, a lawyer, a tax adviser, a financial adviser — that professional performs it. We organise, "
    "coordinate and support around them."]),
  ("idx","Disciplines","What we do",
   "Nine areas of work. Most mandates combine several of them.",
   [("01","Player Care & Career Support","Career planning, relocation, administration and everyday life around a professional contract.","player-support"),
    ("02","Relocation & International Player Services","Arriving in a new country properly — housing, permits coordination, banking, schooling, integration.","relocation"),
    ("03","Football Business Consulting","Market analysis, club development, European market entry and international expansion.","football-business"),
    ("04","Recruitment, Scouting & Market Intelligence","Talent identification, player research, club requirement analysis and transfer market monitoring.","recruitment"),
    ("05","Support for Licensed Football Agents","Back-office, research, lead generation and operational capacity for licensed agents.","agents"),
    ("06","Financial Coordination & Wealth Support","Budgeting, cash-flow planning and coordination of licensed financial, tax and banking professionals.","financial-wealth"),
    ("07","Investment & Football Projects","Project sourcing, business plan support, due diligence support and investor introductions.","investors"),
    ("08","Marketing, Branding & Sponsorship","Personal branding, media, commercial profiles, sponsor search and partnership development.","marketing"),
    ("09","Legal & Contract Coordination","Documentation, translation, compliance support and coordination of independent legal professionals.","legal-coordination")]),
  ("cards","Method","How we work",
   "Four principles that shape every mandate.",
   [("01","Scope in writing","Every engagement starts with a written scope: what we do, who performs each regulated service, and how we are paid. Before any work begins."),
    ("02","Coordination, not substitution","We do not replace a player's agent, lawyer or adviser. We work alongside them, and we bring in licensed professionals where the law requires it."),
    ("03","One point of contact","A single person owns your file and answers in your time zone. Everything else happens behind that."),
    ("04","Discretion by default","Careers, contracts and capital are private. We name no clients and publish no deals without written permission.")]),
  ("split","Network","One network. Multiple opportunities.",
   ["The value of this company is not a database. It is knowing which specific person to call, in which "
    "country, for a particular problem — and being trusted enough that the call gets returned.",
    "We maintain working relationships across players, clubs, licensed football agents, scouts, investors, "
    "commercial brands and the legal and financial professionals who serve them. Most of what we do is "
    "putting two of those groups in a room properly prepared."],
   ("Explore the network","network")),
  ("note","Regulatory note", D_AGENT + " " + D_FIN),
  ("band","Tell us what you are trying to do.",
   "A short conversation is usually enough to establish whether we are the right partner — and we will say "
   "so directly if we are not.", "Start a conversation","contact"),
 ],
)

PAGES["services"] = dict(
 nav="Services",
 seo_title="Services — Bestway Plus | Football Business & Player Support",
 seo_desc="Services for players, clubs, licensed agents, investors and brands: player support, relocation, recruitment, football business consulting, financial coordination and marketing.",
 hero=dict(eyebrow="Services", h1="Two ways in: who you are, or what you need.",
   sub="Every mandate is different. Start from the audience you belong to, or go straight to the discipline "
       "you are looking for.",
   cta=[("Start a conversation","contact","btn")]),
 router=[
   ("01","Players","Career support, relocation, administration, branding and financial coordination.","players"),
   ("02","Clubs","Recruitment support, market intelligence, commercial and international development.","clubs"),
   ("03","Licensed agents","Operational and research capacity for licensed football agents.","agents"),
   ("04","Investors","Football projects, research, structuring support and introductions.","investors"),
   ("05","Brands","Sponsorship strategy, athlete-brand matching and commercial partnerships.","brands"),
 ],
 blocks=[
  ("idx","By discipline","What we do",
   "Nine areas of work, each with its own page.",
   [("01","Player Care & Career Support","Career planning, professional development, lifestyle and administrative support.","player-support"),
    ("02","Relocation & International Player Services","Housing, permits coordination, banking, family, schooling and local integration.","relocation"),
    ("03","Football Business Consulting","Market analysis, club development, European market entry, commercial strategy.","football-business"),
    ("04","Recruitment, Scouting & Market Intelligence","Talent sourcing, player research, club needs analysis, transfer market monitoring.","recruitment"),
    ("05","Support for Licensed Football Agents","Back-office, research, lead generation, marketing and coordination.","agents"),
    ("06","Financial Coordination & Wealth Support","Budgeting, cash-flow planning and coordination of licensed advisers.","financial-wealth"),
    ("07","Investment & Football Projects","Project sourcing, business plan support, due diligence support, investor relations.","investors"),
    ("08","Marketing, Branding & Sponsorship","Personal branding, media, commercial profiles, sponsor search.","marketing"),
    ("09","Legal & Contract Coordination","Documentation, translation, compliance support, lawyer introductions.","legal-coordination")]),
  ("note","Regulatory note", D_AGENT),
  ("band","Not sure which of these you need?",
   "Describe the situation in a few lines. We will tell you which part of the work is ours, which part "
   "belongs to a licensed professional, and whether it is worth a meeting.", "Start a conversation","contact"),
 ],
)

# ============================== AUDIENCE PAGES ==============================
PAGES["players"] = dict(
 nav="Players", parent=("services","Services"),
 seo_title="For Players — Career, Relocation & Life Support | Bestway Plus",
 seo_desc="Support for professional and emerging footballers: career planning, relocation, administration, personal branding and coordination of licensed legal, tax and financial professionals.",
 hero=dict(eyebrow="For players", h1="Everything around the contract.",
   sub="You have an agent for the deal. This is the rest of it — the country, the paperwork, the money, "
       "the family, the image and the years after the last contract.",
   cta=[("Speak to us in confidence","contact","btn"),("Player support in detail","player-support","btn line")]),
 blocks=[
  ("plate","Photography — 4:5\nPlayer portrait, natural light\nTo be supplied by the client",
   "A career is short and expensive to get wrong.",
   ["Most players change country at least once. Each move resets everything that is not football: where you "
    "live, how you are taxed, which bank will take you, whether your partner can work, where the children "
    "go to school, who reads your contract before you sign it.",
    "None of that is your agent's job, and none of it is the club's. It is ours. We hold the administrative "
    "side of a professional career so that the player's attention stays on the pitch.",
    "We work with the player's existing agent, not around them. Where a matter is reserved for a licensed "
    "professional, we bring in the right one and coordinate the work."]),
  ("idx","Where we help","What this covers", "",
   [("01","Career support","Career planning, professional development, career strategy and post-career preparation.","player-support"),
    ("02","Relocation","Housing, permits coordination, banking, insurance, schooling, mobility and family support.","relocation"),
    ("03","Financial coordination","Budgeting, cash-flow planning and introductions to licensed financial, tax and banking professionals.","financial-wealth"),
    ("04","Personal branding","Media presence, commercial profile, sponsorship search and reputation management.","marketing"),
    ("05","Legal coordination","Documentation, translation and introductions to independent qualified lawyers.","legal-coordination")]),
  ("cards","Also","Two things players ask about early", "",
   [("01","Your agent stays your agent","We are not a football agency and we do not seek representation mandates. If you already work with a licensed agent, we work alongside them."),
    ("02","Life after football","Careers end earlier than anyone plans for. Second-career planning, education and business preparation are part of the work, not an afterthought."),
    ("03","Confidentiality","Nothing about a player's contract, finances or family is discussed outside the mandate. We publish no names.")]),
  ("note","Regulatory note", D_AGENT + " " + D_LEG),
  ("band","If it is not football, it is probably ours.",
   "Tell us where you are moving, or what is not working. The first conversation costs nothing and commits "
   "you to nothing.", "Speak to us in confidence","contact"),
 ],
)

PAGES["clubs"] = dict(
 nav="Clubs", parent=("services","Services"),
 seo_title="For Clubs — Recruitment Support & Market Intelligence | Bestway Plus",
 seo_desc="Support for football clubs: international player research, recruitment support, scouting networks, market entry, commercial development and investor introductions.",
 hero=dict(eyebrow="For clubs", h1="Research, reach and the work between windows.",
   sub="Extra capacity for sporting and commercial departments — international player research, market "
       "intelligence, partner search and the coordination that makes a foreign signing actually work.",
   cta=[("Send us a brief","contact","btn"),("Recruitment & scouting","recruitment","btn line")]),
 blocks=[
  ("clusters","Sporting side","Recruitment and intelligence",
   "Most clubs do not lack opinions about players. They lack the time to research the ones nobody has "
   "mentioned yet, in markets they do not cover.",
   [("Recruitment support",
     "We work from your requirement, not from a list we are trying to place. Position profile, budget band, "
     "playing model and squad rules first; candidates second.",
     ["Club Requirement Analysis","Recruitment Consulting","Player Scouting Support","Talent Identification",
      "Candidate Screening","Club Recruitment Support","International Talent Search","Emerging Market Scouting"]),
    ("Market intelligence",
     "Continuous monitoring rather than a one-off report — so that a decision in January rests on something "
     "gathered before December.",
     ["Player Market Intelligence","Transfer Market Monitoring","Club Needs Analysis","Player Performance Research",
      "Market Value Research","League Analysis","Club Analysis","Recruitment Intelligence","International Market Reports"]),
    ("Scouting network",
     "Building and connecting scouting capacity in markets where you have none, and introducing licensed "
     "agents where representation is involved.",
     ["Scouting Network Development","Player Database & Market Research","Performance Data Analysis",
      "Player Profile Preparation","Career Benchmarking"])]),
  ("clusters","Business side","Commercial and international development",
   "The same club, seen as a business with partners, sponsors and markets it has not entered.",
   [("Commercial development",
     "Sponsorship and partnership work aimed at categories and territories the club does not currently reach.",
     ["Commercial Development","Sponsorship Support","Corporate Partnerships","International Brand Development",
      "Strategic Partnerships","Business Development"]),
    ("International expansion",
     "Entering a new market as a club: who to talk to, what it costs, what the regulatory and commercial "
     "ground looks like.",
     ["Market Entry Support","International Business Development","Club-to-Club Relationship Support",
      "International Partner Network","Investor Introductions","Football Market Analysis"]),
    ("Integration of foreign signings",
     "The reason expensive signings underperform is often nothing to do with football. We handle the arrival.",
     ["Player Integration Support","Relocation Coordination","International Communication Support",
      "Translation Support","Family Relocation Support"])]),
  ("note","Regulatory note", D_AGENT + " " + D_INV),
  ("band","Send the requirement, not the shortlist.",
   "Position, budget band, playing model and timeline. We will come back with what the market actually "
   "holds, including the answer that it holds nothing.", "Send us a brief","contact"),
 ],
)

PAGES["agents"] = dict(
 nav="Licensed Agents", parent=("services","Services"),
 seo_title="Support for Licensed Football Agents — Back-Office & Research | Bestway Plus",
 seo_desc="Operational partner for licensed FIFA Football Agents: back-office, player and club research, lead generation, marketing, documentation coordination and CRM management.",
 hero=dict(eyebrow="For licensed football agents", h1="The capacity behind a licensed practice.",
   sub="A licence lets you do the regulated work. It does not give you a research desk, a back office or a "
       "second market. That is what we provide — as a business partner, never as a substitute.",
   cta=[("Discuss a working partnership","contact","btn")]),
 blocks=[
  ("split","The premise","We do not compete with you.",
   ["We hold no representation mandates and do not seek them. Every service on this page is support work "
    "around a licensed agent's practice: research, administration, marketing, coordination and business "
    "development.",
    "Any activity that legally requires a FIFA Football Agent licence is performed by the licensed agent — "
    "by you, in your own mandates, or by a licensed agent engaged separately where a client comes to us "
    "first. That boundary is written into every engagement.",
    "In practice most partnerships start narrow: one market, one research brief, or simply taking the "
    "administration off an agent who is travelling four days a week."], None),
  ("clusters","Scope","What we take off your desk", "",
   [("Back office",
     "The recurring administrative load of a practice, run properly and on time.",
     ["Agent Back-Office Support","Administrative Support","Documentation Coordination","Communication Support",
      "Translation Support","Travel & Meeting Coordination","CRM & Database Management"]),
    ("Research",
     "Structured research on players, clubs and markets — prepared to a standard you can put in front of a "
     "sporting director without editing it.",
     ["Market Research","Player Research","Club Research","Player Profile Preparation","Performance Data Analysis",
      "Transfer Market Monitoring"]),
    ("Growth",
     "New markets, new counterparties and the commercial side of an agency practice.",
     ["Lead Generation","Business Development","International Partner Search","Marketing Support",
      "Commercial Support","Strategic Partnerships"])]),
  ("cards","Terms","How partnerships are structured", "",
   [("01","Project","A single research brief, a market pass, or one file's administration."),
    ("02","Retainer","Standing capacity for agents working several markets or several files per window."),
    ("03","Partnership","A defined commercial arrangement for a market or a client segment, agreed in writing."),]),
  ("note","Regulatory note", D_AGENT + " Fees for support services are agreed separately from, and never "
   "as a share of, activity reserved to a licensed agent unless that agent's own regulatory framework "
   "expressly permits it."),
  ("band","One market. One brief. See how it goes.",
   "Most partnerships start with a single piece of work rather than a contract.",
   "Discuss a working partnership","contact"),
 ],
)

PAGES["investors"] = dict(
 nav="Investors", parent=("services","Services"),
 seo_title="Investment & Football Projects — Advisory Support | Bestway Plus",
 seo_desc="Support for investors in football: project sourcing, market research, business plan and financial model coordination, due diligence support and structured introductions.",
 hero=dict(eyebrow="For investors", h1="Football as a business, examined properly.",
   sub="Project sourcing, research and preparation for investors and entrepreneurs looking at clubs, "
       "academies, infrastructure and sports-technology in Europe.",
   cta=[("Request a project overview","contact","btn")]),
 blocks=[
  ("split","Position","What we are, and what we are not.",
   ["We are a consulting and coordination company. We find and prepare opportunities, we do the groundwork "
    "that makes them assessable, and we introduce the parties who should be talking to each other.",
    "We are not an investment adviser, a broker or a fund. We do not solicit investment, we do not promise "
    "returns, and we do not present opportunities as recommendations. Regulated advice, valuation opinions "
    "and audit work are performed by the appropriate licensed professionals.",
    "That distinction matters more in football than in most sectors, because the sector attracts a great "
    "deal of confident language and very little documentation."], None),
  ("clusters","Scope","Where we are useful", "",
   [("Sourcing and screening",
     "Finding projects that fit a defined thesis, and filtering out the large majority that do not survive "
     "a first look.",
     ["Football Project Sourcing","Club Investment Opportunities","Football Academy Projects",
      "Sports Infrastructure Projects","Sports-Tech Opportunities","Sponsorship Investment Opportunities"]),
    ("Preparation and analysis",
     "Turning an idea into something an investor and their advisers can actually read.",
     ["Investment Project Preparation","Business Plan Support","Financial Model Coordination",
      "Investor Presentation Preparation","Market Research for Investors","Commercial Due Diligence Support",
      "Competition Analysis"]),
    ("Introductions and relations",
     "Bringing the right counterparties together and keeping the process organised afterwards.",
     ["Investor Introductions","Strategic Partner Search","Investor Relations Support",
      "Football Investment Consulting","Football Industry Advisory"])]),
  ("cards","Process","How a project moves", "",
   [("01","Thesis","We start from what you are actually trying to own, in which market, at what size. Without that, sourcing is noise."),
    ("02","Groundwork","Market, competition, regulatory ground and commercial reality — assembled before anyone travels."),
    ("03","Handover","Licensed advisers, auditors and lawyers take the decision-critical work. We coordinate and keep the process moving.")]),
  ("note","Important notice", D_INV + " " + D_FIN),
  ("band","Tell us the thesis first.",
   "Sector, geography, ticket size and horizon. We will tell you honestly whether we see anything worth "
   "your time.", "Request a project overview","contact"),
 ],
)

PAGES["brands"] = dict(
 nav="Brands", parent=("services","Services"),
 seo_title="Sponsorship & Commercial Partnerships in Football | Bestway Plus",
 seo_desc="Sponsorship strategy, athlete-brand matching, endorsement sourcing and international commercial partnership development for brands entering football.",
 hero=dict(eyebrow="For brands and sponsors", h1="Football is a channel. Most brands buy it badly.",
   sub="Sponsorship and partnership work built around what the brand needs to achieve — audience, market, "
       "credibility — rather than around whichever property happens to be for sale.",
   cta=[("Discuss a partnership brief","contact","btn")]),
 blocks=[
  ("clusters","Scope","Commercial partnership work", "",
   [("Strategy first",
     "What the sponsorship is for, who it is meant to reach, and what success would look like twelve months "
     "later — established before any property is discussed.",
     ["Sponsorship Strategy","Commercial Partnerships","International Brand Development","Corporate Partnerships"]),
    ("Matching",
     "Connecting brands with athletes, clubs and projects whose audience and positioning genuinely fit.",
     ["Athlete-Brand Matching","Sponsor Search","Brand Introductions","Endorsement Opportunity Sourcing"]),
    ("Execution support",
     "Negotiation support and the practical work that turns a signed sponsorship into something visible.",
     ["Partnership Negotiation Support","Sponsorship Activation Support","Commercial Partnership Development",
      "Sponsorship Presentation"])]),
  ("split","Reach","Where a European football partnership makes sense",
   ["Football gives a brand access to audiences that are difficult to buy elsewhere: young, international, "
    "concentrated and emotionally engaged. It also gives them to competitors, at scale, badly targeted.",
    "Our work is narrowing that. A regional brand entering a new market usually needs a specific club and a "
    "specific set of players, not a category-wide campaign. A consumer brand wants credibility with an "
    "audience that detects insincerity immediately.",
    "We prepare both sides properly and negotiate on brief — and where a player is represented, we work "
    "through their licensed agent."], None),
  ("note","Regulatory note", D_AGENT),
  ("band","What is the brief?",
   "Market, audience, budget band and timeframe. We will say whether football is the right channel at all.",
   "Discuss a partnership brief","contact"),
 ],
)

# ============================ DISCIPLINE PAGES ==============================
PAGES["player-support"] = dict(
 nav="Player Support", parent=("services","Services"),
 seo_title="Player Care & Career Support — Professional Footballers | Bestway Plus",
 seo_desc="Career planning, professional development, lifestyle and administrative support for professional footballers, delivered alongside the player's licensed agent.",
 hero=dict(eyebrow="Discipline 01", h1="Player care and career support.",
   sub="Comprehensive support for professional footballers outside the regulated activity of a football "
       "agent — the planning, the administration and the daily life that a career depends on.",
   cta=[("Speak to us in confidence","contact","btn")]),
 blocks=[
  ("clusters","Scope","What this covers", "",
   [("Career",
     "Where the career is going, what it needs next, and what happens when it ends — reviewed regularly "
     "rather than only when a contract expires.",
     ["Career Planning & Development","Player Career Support","Career Strategy","Professional Development",
      "Post-Career Planning","Second Career Development","Education & Language Support"]),
    ("Arrival and administration",
     "The unglamorous work that decides whether a move settles or fails in the first three months.",
     ["Player Relocation Support","Adaptation in a New Country","Administrative Support","Housing Assistance",
      "Vehicle & Mobility Assistance","Banking & Administrative Assistance","Family Relocation Support"]),
    ("Coordination of professionals",
     "Bringing in the right licensed specialist and managing them, so the player is not negotiating with "
     "four advisers in a second language.",
     ["Insurance Coordination","Tax Adviser Coordination","Legal Adviser Coordination"]),
    ("Day to day",
     "Personal support for players and families whose schedule is set by someone else.",
     ["Lifestyle Management","Personal Assistance","Concierge Services for Players"])]),
  ("split","Boundaries","What this is not.",
   ["This is not representation. We do not negotiate playing contracts, we do not approach clubs on a "
    "player's behalf as a representative, and we do not seek representation mandates.",
    "Where a player needs those services, they are performed by a licensed FIFA Football Agent — the "
    "player's own, or one introduced and engaged separately.",
    "We are equally clear about advice: tax, legal and financial matters are handled by qualified "
    "independent professionals. Our role is to find the right ones, brief them properly and keep the work "
    "moving."], None),
  ("note","Regulatory note", D_AGENT + " " + D_LEG),
  ("band","Most players call us during a move.",
   "That is usually the right moment, but not the only one. Career planning works better before the "
   "contract year, not during it.", "Speak to us in confidence","contact"),
 ],
)

PAGES["relocation"] = dict(
 nav="Relocation", parent=("services","Services"),
 seo_title="Relocation & International Player Services | Bestway Plus",
 seo_desc="Relocation coordination for footballers moving to European clubs: housing, immigration specialist coordination, banking, insurance, schooling, language and local integration.",
 hero=dict(eyebrow="Discipline 02", h1="Arriving properly.",
   sub="Relocation coordination for players and families moving into European football — from the first "
       "flight to the point where daily life no longer needs help.",
   cta=[("Speak to us in confidence","contact","btn")]),
 blocks=[
  ("clusters","Scope","What relocation actually involves", "",
   [("Legal status",
     "Immigration is specialist work with hard deadlines. We coordinate the specialists and track the "
     "dates against the football calendar.",
     ["Immigration Specialist Coordination","Residence & Work Permit Support through external specialists",
      "Documentation Management","Everyday Administrative Support"]),
    ("Home and money",
     "The practical foundations, arranged before arrival rather than discovered afterwards.",
     ["Relocation Coordination","Housing Search","Banking Setup Assistance","Insurance Coordination",
      "Transportation"]),
    ("Family",
     "Moves fail because of families more often than because of football.",
     ["Family Relocation","Schools & Education Support","Language Services","Local Integration"])]),
  ("cards","Sequence","How a relocation is run", "",
   [("01","Before the signature","Status check, timeline and cost estimate. Some moves are harder than the parties assume, and it is cheaper to know early."),
    ("02","First two weeks","Documents lodged, address, bank, insurance, phone, transport. A single contact handles all of it."),
    ("03","First season","School, language, family employment where possible, and the annual renewals nobody remembers.")]),
  ("note","Regulatory note",
   "Immigration, residence and work permit matters are handled by qualified external specialists. "
   "Bestway Plus coordinates the process and manages documentation; it does not provide immigration or "
   "legal advice."),
  ("band","Tell us the country and the date.",
   "Those two facts determine almost everything else.", "Speak to us in confidence","contact"),
 ],
)

PAGES["football-business"] = dict(
 nav="Football Business", parent=("services","Services"),
 seo_title="Football Business Consulting & Market Entry in Europe | Bestway Plus",
 seo_desc="Football business consulting: club development, European market analysis, international expansion, commercial strategy, strategic partnerships and industry advisory.",
 hero=dict(eyebrow="Discipline 03", h1="Football business consulting.",
   sub="Advisory and research for clubs, academies, sports organisations and companies entering or "
       "expanding within European football.",
   cta=[("Send us a brief","contact","btn")]),
 blocks=[
  ("clusters","Scope","Areas of work", "",
   [("Markets",
     "Understanding a football market before committing to it — structure, economics, regulation and the "
     "people who actually decide things.",
     ["Football Market Analysis","Market Research","Competition Analysis","Player Market Research",
      "European Football Market Entry"]),
    ("Organisations",
     "Working with clubs and academies on how they are built, funded and positioned.",
     ["Club Development Consulting","Football Industry Advisory","Sports Project Development",
      "Business Development"]),
    ("Expansion",
     "Growth beyond the home market — commercially, institutionally and through partnerships.",
     ["International Expansion","Commercial Strategy","Strategic Partnerships","Club-to-Club Relationship Support",
      "Football Business Consulting"])]),
  ("statement",
   "Most football projects fail on ordinary business grounds, not football ones.",
   ["Underestimated running costs, revenue assumptions borrowed from a different market, governance that "
    "cannot survive a bad season, and partners chosen because they were available rather than because they "
    "were right.",
    "Our work is deliberately unromantic. We research the market, examine the assumptions, and set out what "
    "the project would need in order to work — including, when it applies, the conclusion that it will not."]),
  ("note","Regulatory note", D_OUT),
  ("band","What are you trying to build?",
   "Bring the plan you already have. It is usually faster to test an existing thesis than to start from "
   "an empty page.", "Send us a brief","contact"),
 ],
)

PAGES["recruitment"] = dict(
 nav="Recruitment & Scouting", parent=("services","Services"),
 seo_title="Recruitment, Scouting & Market Intelligence in Football | Bestway Plus",
 seo_desc="Talent identification, player and club research, recruitment consulting, scouting network development and transfer market intelligence for clubs and licensed agents.",
 hero=dict(eyebrow="Discipline 04", h1="Recruitment, scouting and market intelligence.",
   sub="Research and sourcing support for clubs, licensed agents and academies — the work that happens "
       "before a name is put forward.",
   cta=[("Send us a brief","contact","btn")]),
 blocks=[
  ("clusters","Scope","Two connected disciplines", "",
   [("Talent sourcing",
     "Identifying and preparing candidates against a defined requirement, in markets the client does not "
     "cover themselves.",
     ["Player Scouting Support","Talent Identification","Talent Sourcing","International Talent Search",
      "Emerging Market Scouting","Candidate Screening","Player Profile Preparation"]),
    ("Recruitment support",
     "Helping a club convert a requirement into a decision, without taking on activity reserved for a "
     "licensed agent.",
     ["Recruitment Consulting","Club Recruitment Support","Club Requirement Analysis",
      "Scouting Network Development","Player Database & Market Research"]),
    ("Market intelligence",
     "Continuous data and research on players, clubs and leagues, produced to be read rather than filed.",
     ["Player Market Intelligence","Transfer Market Monitoring","Club Needs Analysis",
      "Player Performance Research","Performance Data Analysis","Market Value Research","League Analysis",
      "Club Analysis","Career Benchmarking","Recruitment Intelligence","International Market Reports"])]),
  ("split","Boundary","Where our work stops.",
   ["We research, prepare and introduce. We do not represent players and we do not perform the regulated "
    "activity of a football agent.",
    "When a piece of work reaches the point where representation is required — negotiating on a player's "
    "behalf, or acting for a party in a transfer — a licensed FIFA Football Agent takes it from there. In "
    "many mandates that agent is the client themselves.",
    "We are equally willing to connect a club with a licensed agent or an independent scout where that is "
    "the right answer. Being useful is more valuable to us than being in the middle."], None),
  ("note","Regulatory note", D_AGENT + " " + D_OUT),
  ("band","Start with the requirement.",
   "Position, profile, budget band, timeline and the constraints you are working under.",
   "Send us a brief","contact"),
 ],
)

PAGES["financial-wealth"] = dict(
 nav="Financial & Wealth", parent=("services","Services"),
 seo_title="Financial Coordination & Wealth Support for Athletes | Bestway Plus",
 seo_desc="Financial organisation for professional athletes: budgeting, cash-flow planning, administration and coordination of licensed tax, banking, insurance and wealth professionals.",
 hero=dict(eyebrow="Discipline 06", h1="Financial coordination and wealth support.",
   sub="Organisation, planning support and coordination of licensed professionals — for athletes whose "
       "income arrives quickly, in several countries, and for a limited number of years.",
   cta=[("Speak to us in confidence","contact","btn")]),
 blocks=[
  ("split","Position","Coordination, not advice.",
   ["This is the part of the page worth reading carefully. Bestway Plus does not provide regulated "
    "investment advice, does not manage assets or portfolios, and does not make individual financial "
    "recommendations.",
    "What we do is organisational: helping an athlete understand their own cash flow, keeping the "
    "administration in order across countries, and putting them in front of properly licensed advisers "
    "instead of whoever was introduced at a dinner.",
    "Every regulated decision — investment, tax, structuring — is taken with an appropriately licensed "
    "independent professional, engaged by the client."], None),
  ("clusters","Scope","What this covers", "",
   [("Organisation and planning",
     "Knowing what comes in, what goes out, and what the year after next looks like.",
     ["Financial Planning Coordination","Personal Budgeting Support","Cash-Flow Planning",
      "Financial Organisation","Income & Expense Planning","International Financial Administration"]),
    ("Coordination of licensed professionals",
     "Selecting, briefing and managing the specialists — and making sure they talk to each other.",
     ["Tax Adviser Coordination","Accountant Coordination","Banking Relationship Support",
      "Insurance Coordination","Wealth Structuring Coordination","Asset Protection Coordination",
      "Real Estate Advisory Coordination","Retirement Planning Coordination"]),
    ("Introductions",
     "Access to regulated institutions and advisers, without us standing between the client and them.",
     ["Introduction to licensed financial advisers","Introduction to banks, investment firms and wealth managers"])]),
  ("note","Important notice", D_FIN + " " + D_INV),
  ("band","The best time is the first professional contract.",
   "The second best is now.", "Speak to us in confidence","contact"),
 ],
)

PAGES["marketing"] = dict(
 nav="Marketing & Branding", parent=("services","Services"),
 seo_title="Personal Branding, Marketing & Sponsorship in Football | Bestway Plus",
 seo_desc="Personal branding for athletes, digital presence, media relations, commercial profiles, sponsor search and brand partnership development for players, agents and clubs.",
 hero=dict(eyebrow="Discipline 08", h1="Marketing, branding and sponsorship.",
   sub="Building a commercial profile that is accurate, international and useful — for players, licensed "
       "agents, clubs and sports projects.",
   cta=[("Start a conversation","contact","btn")]),
 blocks=[
  ("clusters","Scope","Three layers of work", "",
   [("Identity and presence",
     "What the athlete or organisation actually stands for, expressed consistently across every surface a "
     "sporting director, journalist or sponsor will look at.",
     ["Personal Branding for Athletes","Brand Identity","Digital Presence","Social Media Strategy",
      "Content Strategy","Social Media Management","Website Development Coordination",
      "Photo & Video Production Coordination"]),
    ("Reputation and media",
     "Managing what is said, and being ready before it is.",
     ["Reputation Management","PR Coordination","Media Relations","Player Media Kit"]),
    ("Commercial",
     "Turning attention into partnerships, on terms that survive contact with a legal department.",
     ["Commercial Profile Development","Sponsorship Presentation","Sponsorship Search","Brand Partnerships",
      "Commercial Partnership Development"])]),
  ("split","Approach","Restraint is a commercial asset.",
   ["A great deal of football marketing is volume: more posts, more content, more visibility. Serious "
    "sponsors are not buying volume. They are buying credibility, consistency and an audience that "
    "actually believes the athlete.",
    "We build slowly and in the athlete's own voice, in the languages that matter for their market. For "
    "younger players, we are usually arguing for less exposure rather than more.",
    "Where a player is represented, commercial arrangements are agreed through their licensed agent."], None),
  ("note","Regulatory note", D_AGENT),
  ("band","A profile is not a highlight reel.",
   "Tell us who needs to be convinced, and of what.", "Start a conversation","contact"),
 ],
)

PAGES["legal-coordination"] = dict(
 nav="Legal Coordination", parent=("services","Services"),
 seo_title="Legal & Contract Coordination in Football | Bestway Plus",
 seo_desc="Contract administration, documentation, translation, compliance support and introductions to independent qualified lawyers for players, clubs and licensed agents.",
 hero=dict(eyebrow="Discipline 09", h1="Legal and contract coordination.",
   sub="Administration, documentation and coordination around legal work — performed with, and never "
       "instead of, independent qualified legal professionals.",
   cta=[("Start a conversation","contact","btn")]),
 blocks=[
  ("clusters","Scope","What this covers", "",
   [("Coordination",
     "Selecting and briefing the right lawyer in the right jurisdiction, and keeping the matter moving "
     "across time zones and languages.",
     ["Legal Services Coordination","Lawyer Introduction","International Legal Coordination","Compliance Support"]),
    ("Administration",
     "The document work around a contract, done accurately and on schedule.",
     ["Contract Administration","Document Preparation Support","Documentation Management",
      "Translation & Interpretation"])]),
  ("note","Important notice", D_LEG + " Bestway Plus does not draft, opine on or negotiate legal terms on "
   "its own account. " + D_AGENT),
  ("band","Send the document and the deadline.",
   "We will tell you which specialist it needs and in which country.", "Start a conversation","contact"),
 ],
)

# ============================== COMPANY PAGES ===============================
PAGES["network"] = dict(
 nav="Network",
 seo_title="International Network — One Network, Multiple Opportunities | Bestway Plus",
 seo_desc="Bestway Plus connects players, clubs, licensed football agents, scouts, investors, brands and legal and financial professionals across international football.",
 hero=dict(eyebrow="Network", h1="One network. Multiple opportunities.",
   sub="The company's real asset is not a database of contacts. It is knowing which specific person to "
       "call, in which country, for a particular problem — and being trusted enough that the call is "
       "returned.",
   cta=[("Start a conversation","contact","btn")]),
 blocks=[
  ("cards","Nodes","Who the network connects", "",
   [("01","Players","Professionals and emerging talent, in Europe and in the markets that feed it."),
    ("02","Clubs","Sporting and commercial departments across several league levels."),
    ("03","Licensed football agents","Licensed professionals who perform the regulated work, in their own mandates and in ours."),
    ("04","Scouts","Independent scouts and scouting networks in markets that larger organisations do not cover."),
    ("05","Investors","Private investors, entrepreneurs and family offices looking at football assets and projects."),
    ("06","Brands","Sponsors and commercial partners seeking credible access to football audiences."),
    ("07","Legal professionals","Independent qualified lawyers across the jurisdictions our clients operate in."),
    ("08","Financial professionals","Licensed tax advisers, accountants, bankers and wealth professionals.")]),
  ("split","Method","How we use it.",
   ["Introductions are only valuable when both sides are prepared. A club does not want an unqualified "
    "profile; an investor does not want an idea with no numbers; a lawyer does not want a document set "
    "arriving three days before a deadline.",
    "So the network is not a service in itself. It is what makes the rest of the work possible: research "
    "that reaches the right desk, projects that arrive assessable, and a licensed professional available "
    "when a matter crosses into regulated territory.",
    "We introduce parties to each other and then step back where our role ends. We are not attempting to "
    "sit permanently between two organisations that should be talking directly."], None),
  ("note","Regulatory note", D_AGENT + " " + D_FIN),
  ("band","Who do you need to reach?",
   "Tell us the problem rather than the person. The right introduction usually is not the obvious one.",
   "Start a conversation","contact"),
 ],
)

PAGES["about"] = dict(
 nav="About",
 seo_title="About Bestway Plus — International Football Business Company in Poland",
 seo_desc="Bestway Plus Sp. z o.o. is an international football business and player support company based in Poland, working with players, clubs, licensed agents, investors and brands.",
 hero=dict(eyebrow="About us", h1="An international football business company, based in Poland.",
   sub="We work at the intersection of football, business and international opportunity — supporting "
       "players, clubs, licensed agents, investors and commercial partners.",
   cta=[("Start a conversation","contact","btn")]),
 blocks=[
  ("plate","Photography — 4:5\nOffice or city, architectural, restrained\nTo be supplied by the client",
   "Our role goes beyond the pitch.",
   ["Bestway Plus Sp. z o.o. is registered in Poland and works internationally, primarily across Europe. "
    "We coordinate professional networks, business development, player support, market research, "
    "marketing, recruitment support and international projects.",
    "The company was built around a straightforward observation: in football, the deal is usually the "
    "smallest part of the work. What surrounds it — the research beforehand, the administration "
    "afterwards, the country the player is now living in, the adviser nobody thought to appoint — decides "
    "whether the deal was any good.",
    "Where regulated professional services are required, we cooperate with appropriately licensed football "
    "agents, lawyers, tax advisers, financial professionals and other specialists. We are precise about "
    "that boundary because clients and counterparties are entitled to know exactly who is doing what."]),
  ("cards","Principles","How we operate", "",
   [("01","Discretion","We do not publish client names, transfers, figures or partners. Anything you see attributed on this site is there because the party concerned agreed to it in writing."),
    ("02","Defined scope","Each engagement is set out in writing before work starts, including which services are performed by licensed third parties."),
    ("03","No guaranteed outcomes","We do not promise transfers, signings, sponsorships or returns. We are engaged for work, judgement and access."),
    ("04","International by default","Poland is where the company is registered. The work is European and, increasingly, wider than that.")]),
  ("split","Positioning","What we are.",
   ["A football business, player support and sports consulting company. Not a football agency, not an "
    "investment firm, not a law practice.",
    "That is a deliberate position rather than a limitation. It lets us work with licensed agents instead "
    "of competing with them, act for clubs without a conflicting representation interest, and coordinate "
    "advisers whose independence is the reason they are worth having.",
    "It also sets a clear standard for how we describe ourselves: we do not claim licences we do not hold, "
    "achievements we cannot evidence, or relationships we have not been authorised to name."], None),
  ("band","Start with a conversation.",
   "Tell us what you are trying to do. If it is not work for us, we will usually know someone it is work "
   "for.", "Start a conversation","contact"),
 ],
)

PAGES["faq"] = dict(
 nav="FAQ",
 seo_title="Frequently Asked Questions — Bestway Plus",
 seo_desc="How Bestway Plus works: relationship with licensed FIFA football agents, regulated services, engagement terms, confidentiality and international coverage.",
 hero=dict(eyebrow="FAQ", h1="Questions we are asked first.",
   sub="Direct answers, including to the ones about what we are not.",
   cta=[("Ask something else","contact","btn line")]),
 blocks=[
  ("faq","Answers","",[
   ("Are you a FIFA Football Agency?",
    "No. Bestway Plus is a football business, player support and sports consulting company. We are not a "
    "FIFA Football Agent and we do not carry out football agent activity. Where a mandate requires services "
    "reserved for a licensed football agent, those services are performed directly by an appropriately "
    "licensed FIFA Football Agent."),
   ("Will you try to take over my player, or replace my agent?",
    "No. We hold no representation mandates and do not seek them. Where a player already works with a "
    "licensed agent, we work alongside that agent — and a significant part of our business is support work "
    "for licensed agents themselves."),
   ("Who actually performs the regulated parts of the work?",
    "Licensed and qualified independent professionals: FIFA Football Agents for agent activity, qualified "
    "lawyers for legal advice, licensed tax and financial advisers for regulated financial matters, and "
    "immigration specialists for permits. Every engagement states in writing who performs what."),
   ("Do you guarantee transfers, signings or investment returns?",
    "No, and we would be cautious of anyone who does. We are engaged for work, research, coordination and "
    "access. Outcomes depend on clubs, markets, regulators and third parties."),
   ("How are you paid?",
    "By written engagement agreed before work begins — typically a project fee, a retainer, or a defined "
    "arrangement for a market or client segment. Terms are set per mandate and confirmed in writing."),
   ("Where do you operate?",
    "The company is registered in Poland and works internationally, primarily across Europe. Individual "
    "mandates regularly involve markets beyond it."),
   ("What languages do you work in?",
    "Working languages are confirmed per mandate. Where a matter requires a language we do not cover "
    "internally, we engage professional translators and interpreters rather than improvising."),
   ("How does a club engage you?",
    "With a requirement rather than a shortlist: position, profile, budget band, timeline and constraints. "
    "We come back with what the market holds — including, sometimes, that it holds nothing suitable."),
   ("Do you invest in clubs or players yourselves?",
    "No. We are a consulting and coordination company. We do not take investment positions, we are not a "
    "licensed investment adviser, and nothing on this website is an offer or recommendation to invest."),
   ("How do you handle confidentiality?",
    "As standard. We do not publish client names, transfers, figures or partners, and we do not use logos "
    "or images to imply relationships that have not been confirmed in writing by the party concerned."),
  ]),
  ("band","Still unanswered?",
   "Ask directly. A short, specific question usually gets a short, specific answer.",
   "Contact us","contact"),
 ],
)

PAGES["contact"] = dict(
 nav="Contact",
 seo_title="Contact — Bestway Plus Sp. z o.o., Poland",
 seo_desc="Contact Bestway Plus, an international football business and player support company based in Poland. Enquiries from players, clubs, licensed agents, investors and brands.",
 hero=dict(eyebrow="Contact", h1="Start a conversation.",
   sub="Tell us who you are and what you are trying to do. We answer every serious enquiry, including the "
       "ones we decline.", cta=[]),
 blocks=[
  ("contact_form",),
  ("cards","Before you write","What helps us answer quickly", "",
   [("01","Say which side you are on","Player, club, licensed agent, investor or brand. It changes the answer entirely."),
    ("02","Give the constraint","A date, a budget band, a country, a deadline. Constraints are more useful than ambitions."),
    ("03","Keep it short","Three lines is enough for a first message. Detail belongs in the conversation that follows.")]),
  ("note","Regulatory note", D_AGENT + " " + D_FIN + " " + D_LEG),
 ],
)

PAGES["legal-notices"] = dict(
 nav="Legal notices",
 seo_title="Legal Notices & Disclaimers — Bestway Plus",
 seo_desc="Regulatory position, scope of services and disclaimers for Bestway Plus Sp. z o.o. regarding football agent activity, financial, investment, legal and tax services.",
 hero=dict(eyebrow="Legal notices", h1="Scope of services and disclaimers.",
   sub="A single page setting out precisely what Bestway Plus does, what it does not do, and who performs "
       "regulated work.", cta=[]),
 blocks=[
  ("legal","Notices","",[
   ("Football agent activity",
    "Bestway Plus Sp. z o.o. is not a FIFA Football Agent and does not hold a FIFA Football Agent licence. "
    "The company does not carry out football agent activity, does not represent players or clubs in "
    "transfer or employment negotiations, and does not seek representation mandates. Where a matter "
    "requires services reserved for a licensed football agent, those services are performed directly by an "
    "appropriately licensed FIFA Football Agent, engaged separately by the client. Nothing on this website "
    "should be read as a representation that Bestway Plus, its owners or its staff hold such a licence."),
   ("Financial services",
    "Bestway Plus does not provide regulated investment advice, portfolio or asset management, insurance "
    "mediation, or individual financial recommendations. Services described as financial coordination or "
    "wealth support are organisational and administrative in nature. Investment, tax and regulated "
    "financial advice is provided only by appropriately licensed independent professionals where required."),
   ("Investment",
    "Nothing on this website constitutes an offer, solicitation, recommendation or inducement to invest in "
    "any asset, security, club, project or undertaking. Bestway Plus is not a licensed investment adviser "
    "or intermediary and gives no assurance, express or implied, as to returns, valuations or outcomes. "
    "Any person considering an investment should obtain independent professional advice."),
   ("Legal and tax",
    "Bestway Plus does not provide legal or tax advice and does not draft, opine on or negotiate legal "
    "terms on its own account. Legal advice is provided by independent qualified legal professionals; tax "
    "advice by appropriately licensed tax advisers. The company's role is coordination, documentation and "
    "administration."),
   ("Immigration and permits",
    "Residence, work permit and immigration matters are handled by qualified external specialists. "
    "Bestway Plus coordinates the process and manages documentation; it does not provide immigration "
    "advice or make representations about the outcome of any application."),
   ("Outcomes",
    "No outcome is guaranteed. Bestway Plus is engaged for defined work, research, coordination and "
    "access. Transfers, signings, sponsorships, partnerships, permits and investments depend on clubs, "
    "counterparties, regulators, markets and other third parties outside the company's control."),
   ("Third parties, names and imagery",
    "Bestway Plus does not use the names, logos, images or marks of clubs, players, competitions or "
    "organisations to imply a relationship, endorsement or completed transaction that has not been "
    "confirmed in writing by the party concerned. Any such material appearing on this website does so "
    "under a written permission."),
   ("Website content",
    "Information on this website is provided for general information about the company's services. It is "
    "not advice, and it does not create a client relationship. Engagements begin only under a written "
    "agreement setting out scope, responsibilities and fees."),
  ]),
  ("band","Questions about scope?",
   "If anything here is unclear in relation to your situation, ask before you engage us — not after.",
   "Contact us","contact"),
 ],
)
