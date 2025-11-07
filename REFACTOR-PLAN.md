# Digest Service Refactor Plan
**Created:** 2025-11-07
**Problem:** Current implementation tries to process 100 articles in one call, causes JSON errors
**Solution:** Multi-step workflow with batching, context preservation, and last-digest tracking

---

## 🎯 CORE REQUIREMENTS (From Discussion)

1. ✅ Query articles SINCE last digest production date (not arbitrary timeframe)
2. ✅ Include last digest in AI call (for context, comparison, continuity)
3. ✅ Batch processing (smaller chunks = reliable JSON)
4. ✅ Follow KISS principle
5. ✅ Can use Sonnet or Haiku 4.5
6. ✅ Can use container memory
7. ✅ Time doesn't matter (5 min is fine, runs on schedule)
8. ✅ Think like "deep research" not quick response

---

## 🔬 RESEARCH FINDINGS

### Claude JSON Reliability (from docs.claude.com)
- **Prefill responses** - Start Assistant message with `{` to enforce JSON
- **Use examples** - Show concrete output samples
- **Specify format precisely** - Define exact structure

### Batching Best Practices
- **25-30 items per batch** - Sweet spot for reliability
- **Parallel processing possible** - Multiple API calls simultaneously
- **Context preservation** - Pass previous results forward

### Multi-Step Workflows
- **Chain of Thought** - Break complex tasks into steps
- **Validation between steps** - Check each batch result
- **Layered approach** - Filter → Categorize → Merge → Summarize

---

## 🏗️ PROPOSED ARCHITECTURE

### Current (Broken)
```
Backend → Digest Service
  ↓
  Query 100 articles (fixed timeframe: 24h/7d/30d)
  ↓
  Single AI call (100 articles → complex JSON)
  ↓
  ❌ Truncated or malformed JSON
```

### New (Robust)
```
Backend → Digest Service
  ↓
  Step 1: Get last digest for client
  Step 2: Query articles SINCE last digest date
  Step 3: Batch articles (25 per batch)
  Step 4: Process each batch in parallel with context
    - Pass last digest context
    - Use JSON prefilling
    - Smaller output = reliable
  Step 5: Merge batch results
  Step 6: Final summarization with dedupe
  ↓
  ✅ Complete, valid JSON digest
```

---

## 📝 IMPLEMENTATION PLAN (Jimmy's Workflow)

### 🔴 RED: IMPLEMENT

#### Part 1: Mundus Backend Changes (Chromebook)
**File:** `backend/src/controllers/v2/digest-controllers.mjs`

**Change 1: Query from last digest date**
```javascript
// OLD:
const since = client.frequency === 'daily' ? now - 24h : now - 7d;

// NEW:
const { data: lastDigest } = await supabase
  .from('digests')
  .select('created_at, content_json')
  .eq('client_id', client_id)
  .eq('state', 'sent')
  .order('created_at', { ascending: false })
  .limit(1)
  .single();

const since = lastDigest?.created_at || (now - frequency_days);
```

**Change 2: Pass last digest context**
```javascript
// Call microservice with context
const response = await fetch('http://mundus-digest:3003/generate-digest', {
  method: 'POST',
  body: JSON.stringify({
    client_id,
    articles: newArticles,
    country,
    last_digest: lastDigest ? {
      created_at: lastDigest.created_at,
      sections: lastDigest.content_json?.sections,
      article_count: lastDigest.content_json?.metadata?.article_count
    } : null
  })
});
```

#### Part 2: Digest Service Changes (Beast)
**Files:** 
- `src/services/digest-generator.js` (main refactor)
- `src/services/batch-processor.js` (new)
- `src/services/result-merger.js` (new)

**Change 1: Add batching logic**
```javascript
async function generateDigest({ client_id, articles, country, last_digest }) {
  // Split into batches of 25
  const batches = chunkArray(articles, 25);
  console.log(`Processing ${articles.length} articles in ${batches.length} batches`);

  // Process each batch with context
  const batchResults = [];
  for (let i = 0; i < batches.length; i++) {
    const batchResult = await processBatch({
      batch: batches[i],
      batchNumber: i + 1,
      totalBatches: batches.length,
      client,
      country,
      last_digest,
      previousBatches: batchResults  // Preserve context
    });
    batchResults.push(batchResult);
  }

  // Merge all batch results
  const mergedDigest = mergeBatchResults(batchResults, last_digest);
  
  return mergedDigest;
}
```

**Change 2: Use JSON prefilling**
```javascript
async function processBatch({ batch, client, last_digest }) {
  const prompt = buildBatchPrompt(batch, client, last_digest);
  
  // Call API with prefill
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4000,  // Smaller batch = smaller response
      temperature: 0.2,
      messages: [
        { role: 'user', content: prompt },
        { role: 'assistant', content: '{' }  // Prefill to enforce JSON
      ]
    })
  });
  
  const data = await response.json();
  const jsonText = '{' + data.content[0].text;  // Prepend the prefill
  return JSON.parse(jsonText);
}
```

**Change 3: Context-aware prompting**
```javascript
function buildBatchPrompt(articles, client, last_digest) {
  let prompt = `Batch ${batchNum}/${totalBatches}: Analyze ${articles.length} articles for ${client.name}\n\n`;
  
  if (last_digest) {
    prompt += `PREVIOUS DIGEST (${last_digest.created_at}):\n`;
    prompt += `Covered ${last_digest.article_count} articles including:\n`;
    last_digest.sections.news.forEach(s => {
      prompt += `- ${s.title}\n`;
    });
    prompt += `\nFor articles in this batch:\n`;
    prompt += `- SKIP if already covered\n`;
    prompt += `- Note "CONTINUED" if story develops\n`;
    prompt += `- Reference previous coverage when relevant\n\n`;
  }
  
  prompt += `ARTICLES (${articles.length}):\n`;
  prompt += formatArticles(articles);
  prompt += `\n\nReturn JSON with: { "filtered": [...], "duplicates": [...] }`;
  
  return prompt;
}
```

---

## 🟢 GREEN: VALIDATION

### Test 1: Unit Tests
```bash
# Test batching logic
node test-batch-split.js
# Expected: 100 articles → 4 batches of 25

# Test merge logic  
node test-merge.js
# Expected: 4 batch results → 1 complete digest
```

### Test 2: Integration Test
```bash
# With last digest context
POST http://localhost:3003/generate-digest
{
  "client_id": "uuid",
  "articles": [50 articles],
  "last_digest": { created_at, sections }
}

# Expected: Valid JSON, no duplicates from last digest
```

### Test 3: End-to-End
```bash
# From Mundus frontend
# Generate digest for client
# Check:
# - Only NEW articles processed
# - References to previous digest
# - No duplicates
# - Valid JSON
# - All sections complete
```

---

## 🔵 CHECKPOINT: DELIVERABLES

### Documentation
- [ ] Update BUILD-SPEC.md with new architecture
- [ ] Document batching strategy
- [ ] Document last-digest integration
- [ ] API contract updates

### Code
- [ ] Backend: Query from last digest date
- [ ] Backend: Pass last_digest to microservice  
- [ ] Service: Batch processing (25 articles)
- [ ] Service: JSON prefilling
- [ ] Service: Result merging
- [ ] Service: Context preservation

### Testing
- [ ] Unit tests for batching
- [ ] Unit tests for merging
- [ ] Integration test with context
- [ ] E2E test from frontend

### Rollback
- [ ] Document current working version
- [ ] Tag release before refactor
- [ ] Keep old code path (feature flag?)

---

## 💡 KEY IMPROVEMENTS

### 1. True "New Articles Only"
```
Current: Last 24h/7d/30d (arbitrary)
New: Since last digest created_at (precise)
Result: Fewer articles, more relevant
```

### 2. Story Continuity
```
Current: Each digest independent
New: AI knows what was covered before
Result: "Day 2: Summit concluded..." instead of repeating
```

### 3. Reliable JSON
```
Current: 100 articles → huge JSON → syntax errors
New: 25 articles → small JSON → reliable
Result: No more "Unexpected token" errors
```

### 4. Smart Deduplication
```
Current: Only within current batch
New: Checks against last digest too
Result: No repeated stories across days
```

### 5. Scalable
```
Current: Fails > 50 articles
New: Works with any number (batches automatically)
Result: Can handle 500 articles if needed
```

---

## 📊 ESTIMATED WORK

**Backend (Chromebook):**
- Query refactor: 15 min
- Last digest fetch: 10 min
- API call update: 10 min
- Testing: 15 min
**Total: ~50 minutes**

**Digest Service (Beast):**
- Batch processor: 30 min
- Result merger: 20 min
- JSON prefilling: 15 min
- Context handling: 15 min
- Testing: 20 min
**Total: ~100 minutes**

**GRAND TOTAL: ~2.5 hours**

---

## 🚀 EXECUTION SEQUENCE

**Session 1 (Today - Beast):**
1. Implement batching in digest-service
2. Add result merging
3. Add JSON prefilling
4. Test locally

**Session 2 (Chromebook → Beast):**
1. Chromebook: Update backend query logic
2. Chromebook: Add last_digest to API call
3. Push to GitHub
4. Beast: Pull and test integration
5. Validate E2E

**Session 3 (Polish):**
1. Add last-digest context to prompts
2. Enhance deduplication
3. Performance tuning
4. Documentation

---

## ✅ SUCCESS CRITERIA

- [ ] Processes any number of articles reliably
- [ ] Valid JSON every time
- [ ] Only NEW articles since last digest
- [ ] References previous digest when relevant
- [ ] No duplicate stories
- [ ] Processing time < 5 minutes
- [ ] Ready for production

---

**Ready to Execute?**

This is the proper solution. Should I start implementation using Jimmy's Workflow?

