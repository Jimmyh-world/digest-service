# Digest Service - Architecture & Design

**Created:** 2025-11-07
**Purpose:** Technical design document for digest generation microservice
**Pattern:** Microservices architecture (Beast-hosted heavy processing)

---

## 🎯 PROBLEM STATEMENT

**Current Issue:**
Mundus digest generation uses Supabase Edge Functions, which:
- Timeout after ~30 seconds (risky with 100-article processing)
- Limited debugging capabilities
- Per-invocation costs
- Deno runtime (different from main stack)

**Solution:**
Move to dedicated Node.js microservice on Beast for:
- No timeout limits
- Full control over runtime
- Better debugging
- Cost efficiency (Beast already paid for)
- Matches existing PDF service pattern

---

## 🏗️ SYSTEM ARCHITECTURE

### Three-Machine Context

```
┌─────────────────────────────────────────────┐
│ Chromebook (Orchestrator)                  │
│ - Planning and design                       │
│ - Code review                               │
│ - Documentation                             │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ Guardian Pi 5 (Coordinator)                 │
│ - Webhook receiver                          │
│ - Kafka publisher                           │
│ - Always-on services                        │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ Beast (Heavy Processing) ⭐ THIS SERVICE    │
│ - Mundus container (8081)                   │
│ - PDF service (3002)                        │
│ - Digest service (3003) ← NEW             │
│ - Docker builds                             │
│ - AI processing                             │
└─────────────────────────────────────────────┘
```

### Service Topology

```
                    Users
                      ↓
        ┌─────────────────────────────┐
        │  Render.com / Beast         │
        │  Frontend (React)           │
        └─────────────┬───────────────┘
                      ↓
        ┌─────────────────────────────┐
        │  Mundus Backend (Express)   │
        │  Port: 8081                 │
        │  Container: mundus          │
        └─┬───────────────────────┬───┘
          ↓                       ↓
┌─────────────────┐   ┌─────────────────────┐
│ PDF Service     │   │ Digest Service ⭐   │
│ Port: 3002      │   │ Port: 3003          │
│ mundus-pdf      │   │ mundus-digest       │
│ Network: mundus │   │ Network: mundus     │
└─────────────────┘   └──────────┬──────────┘
                                 ↓
                    ┌────────────────────────┐
                    │ Anthropic API          │
                    │ Claude Sonnet 4        │
                    └────────────────────────┘
                                 ↓
                    ┌────────────────────────┐
                    │ Supabase PostgreSQL    │
                    │ - mundus_prompts       │
                    │ - digest_clients       │
                    │ - articles             │
                    └────────────────────────┘
```

---

## 📊 DATA FLOW

### Full Request Lifecycle

```
1. User clicks "Generate" in Frontend
   ↓
2. Frontend → POST /api/v2/digest/generate-mundus
   Headers: { Authorization: Bearer <JWT> }
   Body: { client_id: "uuid" }
   ↓
3. Mundus Backend (digest-controllers.mjs)
   - Validates JWT
   - Queries articles from database (100 articles)
   - Calculates time range (daily/weekly/monthly)
   ↓
4. Backend → POST http://mundus-digest:3003/generate-digest
   Body: {
     client_id: "uuid",
     articles: [...100 articles...],
     country: "Sweden"
   }
   ↓
5. Digest Service (NEW)
   - Loads client from Supabase
   - Loads prompt from database (mundus_prompts)
   - Formats articles for AI
   - Builds prompt with variables
   - Calls Anthropic API (25-30s)
   - Parses JSON response
   ↓
6. Digest Service → Returns JSON
   {
     success: true,
     report: { ... structured digest ... },
     email: { subject, body_html },
     metadata: { articles_reviewed, main_stories, ... }
   }
   ↓
7. Backend saves to database (digests table)
   - content_json: report data
   - email_subject, email_body: from AI
   - state: 'pending_review'
   ↓
8. Backend → Returns to Frontend
   {
     success: true,
     digest_id: "uuid",
     stats: { articles_reviewed, main_stories }
   }
   ↓
9. Frontend navigates to /digest/reports?state=pending_review
```

---

## 🔧 COMPONENT DESIGN

### 1. Express Server (src/server.js)

**Responsibilities:**
- HTTP server on port 3003
- Request validation
- Error handling
- Health checks
- Logging

**Endpoints:**
- `GET /health` - Health check (uptime, status)
- `POST /generate-digest` - Main digest generation

**Error Handling:**
```javascript
try {
  // Process
} catch (error) {
  console.error('[DIGEST] Error:', error.message);
  res.status(500).json({
    success: false,
    error: error.message
  });
}
```

---

### 2. Digest Generator (src/services/digest-generator.js)

**Main orchestrator - coordinates all steps**

**Flow:**
```javascript
export async function generateDigest({ client_id, articles, country }) {
  // 1. Load client details
  const client = await loadClient(client_id);

  // 2. Load prompt template from database
  const { prompt, config } = await loadPrompt('mundus-multi-article-digest', {
    client_name: client.name,
    client_brief: client.preferences?.client_brief,
    language: client.preferences?.language || 'en',
    country: country || 'Country',
    articles: formatArticles(articles),
    article_count: articles.length
  });

  // 3. Call Anthropic API
  const aiResponse = await callAnthropicAPI({
    prompt,
    model: config.model,
    max_tokens: config.max_tokens,
    temperature: config.temperature
  });

  // 4. Parse JSON response
  const digestData = parseAIResponse(aiResponse.content[0].text);

  // 5. Return structured data
  return {
    report: digestData.report,
    email: digestData.email,
    metadata: {
      ...digestData.metadata,
      model: aiResponse.model,
      usage: aiResponse.usage
    }
  };
}
```

---

### 3. Prompt Loader (src/services/prompt-loader.js)

**Responsibilities:**
- Load prompts from Supabase (mundus_prompts table)
- Load variable definitions (mundus_prompt_variables)
- Interpolate variables into template
- Return prompt + config (model, max_tokens, temperature)

**Database Schema:**
```sql
-- mundus_prompts
{
  id: uuid,
  name: 'mundus-multi-article-digest',
  system_prompt: 'You are...',
  user_prompt_template: 'Generate digest for {{client_name}}...',
  model: 'claude-sonnet-4-20250514',
  max_tokens: 16000,
  temperature: 1.0
}

-- mundus_prompt_variables
{
  prompt_id: uuid,
  variable_name: 'client_name',
  variable_type: 'string',
  default_value: null,
  description: 'Name of the client'
}
```

**Variable Interpolation:**
```javascript
// Template: "Generate digest for {{client_name}} focusing on {{country}}"
// Variables: { client_name: "Swedish Inst", country: "Sweden" }
// Result: "Generate digest for Swedish Inst focusing on Sweden"
```

---

### 4. Article Formatter (src/services/article-formatter.js)

**Converts database articles to AI-readable format**

**Input (database format):**
```javascript
{
  article_id: "uuid",
  title: "Nordic Climate Summit",
  summary: "Leaders met to discuss...",
  content: "Full article text...",
  category: "Business",
  country: "Sweden",
  source_name: "Dagens Nyheter",
  published_at: "2025-11-06T10:00:00Z"
}
```

**Output (AI format):**
```
Article 1:
Title: Nordic Climate Summit
Source: Dagens Nyheter (Sweden)
Category: Business
Date: 2025-11-06
Summary: Leaders met to discuss...

---

Article 2:
...
```

---

### 5. Anthropic Client (src/services/anthropic-client.js)

**Responsibilities:**
- Call Anthropic Messages API
- Handle rate limiting
- Parse responses
- Error handling

**API Call:**
```javascript
POST https://api.anthropic.com/v1/messages
Headers:
  x-api-key: <ANTHROPIC_API_KEY>
  anthropic-version: 2023-06-01
  content-type: application/json

Body:
{
  model: "claude-sonnet-4-20250514",
  max_tokens: 16000,
  temperature: 1.0,
  messages: [{
    role: "user",
    content: "<full prompt with 100 articles>"
  }]
}
```

**Response Parsing:**
AI may return JSON wrapped in markdown:
```
```json
{
  "report": { ... },
  "email": { ... }
}
```
```

**Parser handles both:**
- Plain JSON: `{ "report": ... }`
- Markdown-wrapped: ` ```json\n{ ... }\n``` `

---

## 🔐 SECURITY

### Environment Variables

**Never hardcode:**
- ANTHROPIC_API_KEY (AI access)
- SUPABASE_SERVICE_ROLE_KEY (database full access)

**Storage:**
- Beast: `~/dev-network/beast/docker/mundus/.env.vault`
- Container: Passed via docker-compose.yml

### Network Isolation

**Docker Network:**
```yaml
networks:
  mundus_mundus:
    external: true  # Existing network
```

**Access Control:**
- Only containers on `mundus_mundus` can call service
- Port 3003 exposed to Beast host only (not public)
- Frontend → Backend → Digest Service (never direct)

### Input Validation

```javascript
// Validate required fields
if (!client_id || !articles || articles.length === 0) {
  throw new Error('Invalid request');
}

// Sanitize (no HTML injection into prompts)
const sanitized = articles.map(a => ({
  ...a,
  title: stripHtml(a.title),
  summary: stripHtml(a.summary)
}));
```

---

## ⚡ PERFORMANCE

### Expected Metrics

| Metric | Target | Notes |
|--------|--------|-------|
| **Processing Time** | 25-35s | 100 articles + AI |
| **Memory Usage** | <500MB | Node.js + 100 articles |
| **CPU Usage** | <50% | Single request |
| **Concurrent Requests** | 1-2 | AI is bottleneck |

### Optimization Opportunities (Future)

1. **Caching:**
   - Cache prompts (avoid DB lookup each time)
   - Cache client details (TTL 5 min)

2. **Parallel Processing:**
   - Batch articles (10 at a time)
   - Run 10 parallel AI calls
   - Merge results

3. **Queue System:**
   - Bull queue for async processing
   - Frontend polls for completion
   - Better for high volume

4. **Response Streaming:**
   - Stream AI response as it generates
   - Update frontend in real-time

---

## 🐳 DEPLOYMENT

### Container Configuration

**Image Size Target:** <200MB
- Base: node:18-alpine (50MB)
- Dependencies: ~50MB
- Source code: ~1MB
- Total: ~100MB (good!)

**Resource Limits:**
```yaml
deploy:
  resources:
    limits:
      cpus: '1.0'
      memory: 512M
    reservations:
      cpus: '0.5'
      memory: 256M
```

### Health Checks

**Docker Compose:**
```yaml
healthcheck:
  test: ["CMD", "wget", "--spider", "http://localhost:3003/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 10s
```

**Endpoint Response:**
```json
{
  "status": "ok",
  "service": "digest-service",
  "uptime": 3600,
  "version": "1.0.0"
}
```

---

## 🧪 TESTING STRATEGY

### Unit Tests (Future)

```javascript
// Test prompt loader
test('loads prompt from database', async () => {
  const result = await loadPrompt('test-prompt', { var: 'value' });
  expect(result.prompt).toContain('value');
});

// Test article formatter
test('formats articles correctly', () => {
  const formatted = formatArticles([article1, article2]);
  expect(formatted).toContain('Article 1:');
});
```

### Integration Tests

```bash
# Test health endpoint
curl http://localhost:3003/health
# Expected: { "status": "ok", ... }

# Test digest generation (with real data)
curl -X POST http://localhost:3003/generate-digest \
  -H "Content-Type: application/json" \
  -d @test-payload.json
# Expected: { "success": true, "report": { ... } }
```

### End-to-End Tests

```javascript
// Test full flow: Frontend → Backend → Digest Service → AI → Database
test('generates digest end-to-end', async () => {
  // 1. Create test client
  const client = await createTestClient();

  // 2. Call backend endpoint
  const response = await fetch('/api/v2/digest/generate-mundus', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ client_id: client.id })
  });

  // 3. Verify response
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.success).toBe(true);
  expect(data.digest_id).toBeDefined();

  // 4. Verify database
  const digest = await getDigest(data.digest_id);
  expect(digest.state).toBe('pending_review');
  expect(digest.content_json).toBeDefined();
});
```

---

## 📈 MONITORING

### Logs to Capture

```javascript
// Request start
console.log(`[DIGEST] Processing ${articles.length} articles for client ${client_id}`);

// AI call
console.log(`[DIGEST] Calling AI with model: ${config.model}`);

// Completion
console.log(`[DIGEST] Completed in ${duration}ms`);

// Errors
console.error(`[DIGEST] Error: ${error.message}`, { client_id, articles_count });
```

### Metrics to Track (Future)

- Request count
- Average processing time
- Success/failure rate
- AI token usage
- Memory usage over time

### Alerting (Future)

- Processing time > 60s (too slow)
- Error rate > 5% (quality issue)
- Memory usage > 80% (resource issue)

---

## 🔄 MIGRATION PLAN

### Phase 1: Build Service (Beast)
- [ ] Create service structure
- [ ] Copy edge function logic
- [ ] Build Docker container
- [ ] Deploy to Beast
- [ ] Test locally on Beast

### Phase 2: Integration (Chromebook)
- [ ] Update mundus digest-controllers.mjs
- [ ] Replace edge function call with service call
- [ ] Test on Beast staging
- [ ] Verify end-to-end flow

### Phase 3: Validation
- [ ] Generate 5 test digests
- [ ] Compare quality to edge function
- [ ] Measure performance
- [ ] Fix any issues

### Phase 4: Cleanup
- [ ] Keep edge function as fallback (1 week)
- [ ] Monitor production usage
- [ ] Delete edge function if no issues

---

## 🎯 SUCCESS METRICS

### Functional
- ✅ Generates digests successfully
- ✅ Returns same quality as edge function
- ✅ Handles 100 articles without timeout

### Performance
- ✅ Completes in 25-35 seconds
- ✅ Memory usage < 500MB
- ✅ No crashes or errors

### Integration
- ✅ Mundus backend can call service
- ✅ Frontend receives digest data
- ✅ Database updates correctly

---

## 📚 REFERENCES

**Similar Services:**
- `pdf-service` - PDF generation microservice (same pattern)
- Mundus backend - Express API structure
- Edge function - Source logic

**Technologies:**
- Node.js 18 (LTS)
- Express 4.x
- @supabase/supabase-js
- Docker + Docker Compose

**Documentation:**
- [Anthropic API Docs](https://docs.anthropic.com/)
- [Supabase JS Client](https://supabase.com/docs/reference/javascript/)
- [Express Best Practices](https://expressjs.com/en/advanced/best-practice-performance.html)

---

**Design Version:** 1.0
**Created:** 2025-11-07
**Status:** Ready for implementation
**Next:** See BUILD-SPEC.md for implementation details
