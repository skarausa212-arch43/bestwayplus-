# LUMI AI layer

Implements `docs/10_AI_ARCHITECTURE.md`. The guiding rule: **AI assists; the
backend makes business decisions.** AI is kept behind a swappable interface so
providers can change without touching business logic, every response carries a
`{model, version, confidence, timestamp}` envelope, and low-confidence results
flag a fallback.

```
ai/
  ai-provider.js     AIProvider interface + HeuristicAIProvider (deterministic default)
  prompts/           Versioned prompt specs (id.v1.json) — model, i/o schema, notes
```

## Interface

```js
const { createAIProvider } = require('./ai/ai-provider');
const ai = createAIProvider();          // heuristic default; pass an impl to swap

ai.analyzeImages(images)                // photo signals (advisory)
ai.estimateBooking(input)               // duration / workers / difficulty (advisory)
ai.recommendServices(tasks)             // prioritized recommendations
ai.answerHomeQuestion(question, tl)     // answer over verified service history
// each returns { data, meta: { module, model, promptVersion, confidence, fallback, at } }
```

To swap in an LLM provider, implement the same method shape and pass it to
`createAIProvider(impl)`. Business code never depends on the implementation.

## Where it's wired (server.js)

| Endpoint | AI role |
|----------|---------|
| `POST /api/estimate` | Authoritative price from the pricing engine **plus** advisory AI signals (`aiSignals`) and `ai` meta. |
| `POST /api/concierge` | NL → ready-to-book bundle, with confidence (0.85 matched / 0.4 generic fallback). |
| `POST /api/ai/photo-analysis` | Advisory photo signals — never auto-charges. |
| Smart Home / Passport | Recommendations & history Q&A follow the same advisory pattern. |

## Safety (§ AI Safety)

Never exposes hidden platform fees, never fabricates history (`answerHomeQuestion`
only reports what is in the timeline), and never claims certainty when confidence
is low (`meta.fallback = true` below 0.55). Prompts are versioned files, not
hardcoded in the UI.

## Verify

```bash
node ai/test.js
```
