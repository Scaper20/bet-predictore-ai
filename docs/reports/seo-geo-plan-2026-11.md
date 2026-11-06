# SEO and GEO plan for the whole site

Checklist item 4.6 · 6 November 2026 · scope widened by the founder from NPFL, CAF and AFCON to every page, and from search engines to every AI answer engine, Grok first.

## The short version

1. **Search and AI engines send almost nothing today.** In the 30 days to 6 November, Vercel counted about 113 visitors from Google, 7 from Bing and 4 from ChatGPT. The site's technical SEO is already good, so the gap is content and reach, not a broken setup.
2. **Vercel's "30,592 visitors in October" is mostly not people.** Nigeria is 2,376 visitors with 17,344 page views (7.3 pages each). Everyone else averages about 1.2 pages, from India, the Philippines, Bangladesh, Brazil, Indonesia and Pakistan, and 10,904 of them hit the sign-up page. That answers the open part of 4.1: use Nigerian traffic as the real audience. It also matters for cost (below).
3. **Grok cannot be tuned through the website.** Grok leans mainly on posts on X, plus ordinary web results. No crawler name for it is documented by xAI, so no robots.txt rule can be trusted. For Grok, the lever is the KiqStat X account (the 4.4 pack), and the site's job is to be easy to quote from it.
4. **The first fixes are small** (done today: a proper title for the Track page, and a "how to cite us" block in llms.txt). The big work is a content plan: one always-on hub page per competition, per-competition track records, and a small set of question-style articles.

## What I checked

| Area | Finding |
|---|---|
| Titles and descriptions | Unique and keyword-led on predictions, per-league predictions, guides, how-it-works. The Track page was the exception ("Track Record"); fixed. |
| Canonical tags | Present, self-referencing, on every page tested. |
| Structured data | Organisation and WebSite on every page; FAQPage on home and About; match, team and player pages have their own. Nothing on the Track page, pricing, guides or per-league pages. |
| Server-rendered text | The pages tested return full text in the first response (110 to 340 KB), so crawlers that do not run JavaScript, which is most AI crawlers, can read them. |
| Sitemap | Good: core pages, leagues, clubs, players, upcoming matches. League pages are listed only while fixtures exist, so NPFL, CAF and AFCON drop out between rounds. |
| llms.txt | Exists and is built from the live catalogue. Now carries citation guidance and the official X, Instagram and LinkedIn profiles. |
| robots.txt | Blocks AI training crawlers (GPTBot, ClaudeBot, Google-Extended, CCBot and others) and SEO-tool bots. Allows search and answer crawlers (Googlebot, Bingbot, OAI-SearchBot, ChatGPT-User, PerplexityBot). |
| Head-to-head pages | `/football/h2h?a=..&b=..` can be any pair of teams, each with its own canonical. On 15 to 28 October it took up to 1,197 visitors a day and nearly nothing before or after. That looks like a crawl or scrape of the pair space, not readers. |

I could not check Google Search Console, Bing Webmaster Tools, GA4 or the X account's analytics. Everything about what is indexed or ranking is therefore unmeasured; step 1 below fixes that.

## Part 1: Measure first (week 1)

| # | Action | Owner |
|---|---|---|
| 1.1 | Verify `www.kiqstat.app` in **Google Search Console** and **Bing Webmaster Tools**, submit `/sitemap.xml` to both | Founder (10 minutes), then I read the numbers |
| 1.2 | Export 90 days of Search Console queries and pages once connected | Founder |
| 1.3 | Add **IndexNow** (Bing, Yandex and others; Copilot and ChatGPT search draw on Bing's index) so new match and league pages are pushed instead of waited for | Claude (one route + a key file) |
| 1.4 | Decide how to count real traffic: report Nigeria and engaged sessions, not raw Vercel visitors | Claude, in the monthly report |

## Part 2: Traditional SEO, whole site

### A. Fix what already exists

| # | Action | Why | Owner |
|---|---|---|---|
| 2.1 | Done: Track page title and description | It is the page AI engines should cite; it had the weakest title on the site | Claude (done) |
| 2.2 | Add `WebPage`/`Dataset`-style structured data to the Track page with the current counts | Gives engines a citable, dated figure | Claude |
| 2.3 | Add `Product`/`Offer` structured data to Pricing (plans, naira prices) | Plan and price answers | Claude |
| 2.4 | Head-to-head: list only popular pairs in the sitemap, mark all other pairs `noindex,follow`, and add the filter to robots.txt | Stops the crawl trap and the cost of rendering every pair; keeps genuine pair pages that people search | Claude, after the founder agrees |
| 2.5 | Keep league pages in the sitemap year-round for the competitions that matter to the audience (NPFL, CAF Champions League, AFCON, Premier League, Champions League) | Off-season gaps lose ranking history | Claude |

### B. A permanent page for every competition

For each competition in the catalogue (starting with NPFL, CAF Champions League, AFCON and its qualifiers, World Cup qualifying CAF, Premier League, Champions League), a page that is **never empty**, even between fixtures:

- the table, the next fixtures and the last results,
- the model's team ratings for that competition,
- **that competition's own track record** (settled picks, wins and losses),
- a short plain-language explainer written for the competition (format, how many teams, when the season runs), checked by the founder,
- FAQ markup with the questions people actually ask ("Who is favourite to win the NPFL?", "When is the next CAF Champions League round?").

Why this first: the strongest ranking and citation signal KiqStat has that a generic fixtures site does not is its own settled record, per competition. Start with five competitions, then extend.

### C. Question-style articles (about 12 to start)

The guides page is one long page. Break it into separate articles so each can rank and be quoted for its own question:

1. What does a 70% chance actually mean?
2. How to read BTTS, GG and NG
3. Over/under 2.5 explained
4. Double chance explained
5. How accurate are football predictions? (written around the Track page, with live numbers)
6. How our model works, in plain English (from the existing How it works)
7. NPFL: how the season works and how to follow it
8. CAF Champions League: format and fixtures
9. AFCON: format, qualifiers, and how national teams are rated
10. Should you trust a booking code? How to check one (Code Hub)
11. Bankroll basics and responsible play
12. Nigerian league teams to watch this month (updated monthly)

Each gets a named author line and a "last reviewed" date, the single signal AI engines and Google most often weigh for gambling-adjacent topics.

### D. Technical and cost

| # | Action | Owner |
|---|---|---|
| 2.6 | Reduce home page weight (317 KB HTML) | Claude |
| 2.7 | Rate-limit or cache pages that scrapers hammer (h2h, sign-up) at the edge, so non-human traffic stops costing Vercel money | Claude, with a Vercel firewall rule from the founder |
| 2.8 | Keep the existing crawler rules; do not allow training crawlers again until step 2.7 is in place | Founder decision |

## Part 3: GEO, getting quoted by AI answer engines

What answer engines do differently: they read a page, lift a clear passage, and name the source. The content that gets lifted is specific, dated, written as an answer, and consistent across sources.

### Across every engine

- **Answer-first paragraphs.** The first two sentences of a page state the answer (what the page is, the number, the date). Done on the match pages; extend to league, Track and guide pages.
- **Citable numbers with dates.** "As of 6 November 2026, KiqStat has settled N picks" on the Track page and per competition; never a number without a date.
- **One name, same facts everywhere.** KiqStat, kiqstat.app, @kiqstat, the same one-line description on the site, X, Instagram, LinkedIn and in llms.txt. Inconsistent descriptions make engines skip a source.
- **Entity markup.** Organisation with `sameAs` to the official profiles (already on every page).
- **Independent mentions.** AI engines trust what other sites say about you. The 8 ChatGPT-driven payers suggest one is already doing it; find out which pages it cites (ask ChatGPT, Perplexity and Gemini the questions a user would ask, weekly, and record the sources they show).

### Engine by engine

| Engine | What drives it | Status | What to do |
|---|---|---|---|
| **Grok** | Posts on X first, then web results. xAI documents no crawler, and third-party trackers report it often does not identify itself, so robots.txt cannot be relied on. Reported to cite X more than any other single source, and to cite wrongly often. | Not controllable from the site | Make the X account the Grok strategy: a consistent bio, pinned post, daily factual posts with the match page link (4.4), posts that state the answer in the first line ("Man City v Arsenal: model gives City 48%, draw 27%, Arsenal 25%. Why:"), replies to accounts already asking for predictions, and the Track screenshot each week. Check what Grok says about KiqStat every week and correct errors with a pinned post. |
| **ChatGPT** | OAI-SearchBot and ChatGPT-User fetch pages, plus Bing's index | Allowed | IndexNow and Bing Webmaster; strong per-competition pages; keep the Track page current. GPTBot (training) is blocked; that does not remove us from ChatGPT search. |
| **Perplexity** | Its own crawler and live search | Allowed | Same as above; question-style articles perform best here. |
| **Google AI Overviews and Gemini** | Googlebot and the normal index | Allowed (Google-Extended only controls training) | Search Console, structured data, FAQ blocks, E-E-A-T signals (author, reviewed date). |
| **Microsoft Copilot** | Bing's index | Allowed | Bing Webmaster Tools and IndexNow. |
| **Claude** | Web search results when it searches; ClaudeBot (training) is blocked | Partly | Same open-web content; I have not verified which search index Claude uses, so no special action is promised. |
| **Meta AI, Apple Intelligence** | Their own crawlers (meta-externalagent, Applebot) | Training variants blocked | No action until the cost fix (2.7). |

### The weekly GEO check (Claude)

Ask each engine the same 15 questions ("best football prediction site in Nigeria", "NPFL predictions this weekend", "is KiqStat accurate", ...), record whether KiqStat is mentioned, which pages are cited and what is said about it, and add the result to the monthly report. This is the only way to see GEO progress, since no engine reports it.

## Part 4: Order of work

| When | What |
|---|---|
| This week | Search Console and Bing verified; IndexNow; Track-page and Pricing structured data; head-to-head clean-up (after approval); first weekly GEO check |
| Weeks 2 to 3 | Permanent pages for NPFL, CAF Champions League, AFCON, Premier League, Champions League with per-competition track records |
| Weeks 3 to 6 | Articles 1 to 6 (the ones that answer trust questions), then 7 to 12 |
| Monthly | Report: Nigerian engaged sessions, Search Console clicks and impressions, GEO check results, signups and payers from search and AI referrals |

## What I need from you

1. Verify the site in Google Search Console and Bing Webmaster Tools and give me read access (or send the exports).
2. Agree the head-to-head change (2.4), which stops most pairs being indexable.
3. Decide whether to keep training crawlers blocked for now (my recommendation: yes, until the scraper traffic is rate-limited).
4. Provide or approve the plain-language explainers for the competition pages, and a named author for the articles.
5. Confirm the X account is the one in the site's structured data (`@kiqstat`) and whether to add a Grok-visible pinned post on it.

## Evidence and limits

- Traffic numbers: Vercel Web Analytics for the project, 7 October to 6 November 2026 (October alone: 30,592 visitors, 49,757 page views).
- Grok: no official xAI documentation exists for site owners. Third-party trackers ([Trakkr](https://trakkr.ai/bots/xai-searchbot), [Botcrawl](https://botcrawl.com/bot/xai-grok/), [StackFox](https://stackfox.co/research/grok-user-agent), [ContextBolt](https://contextbolt.com/blog/grok-seo/)) list several user agents, disagree on robots.txt compliance, and one reports Grok's crawler using browser-like strings. Treat all of it as unverified; the advice above does not depend on it.
- I have not seen Search Console, Bing, GA4 or any engine's own reporting, so rankings, indexation and AI mentions are unmeasured today.
