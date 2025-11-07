# Digest Service - Build Specification for Beast

**Created:** 2025-11-07
**Target:** Beast execution (autonomous build)
**Pattern:** Clone of pdf-service architecture
**Executor:** Beast AI (Claude Code CLI)

---

## 🎯 MISSION

Build a **Node.js microservice** that processes 100 articles and generates Mundus multi-article digests using Anthropic Claude API.

**Why separate service:**
- Heavy AI processing (25-30 seconds per digest)
- Prevents timeout issues in Supabase Edge Functions
- Isolated from main Mundus app (no performance impact)
- Matches existing PDF service pattern

---

## 📋 REQUIREMENTS

### Functional Requirements

1. **POST /generate-digest** endpoint
   - Accepts: client details + array of 100 articles
   - Returns: Structured JSON digest (report + email)
   - Processing time: 25-30 seconds (NO timeout limit)

2. **Database Integration**
   - Load prompts from Supabase (mundus_prompts table)
   - Use prompt: 'mundus-multi-article-digest'
   - Variable interpolation for client details

3. **AI Processing**
   - Call Anthropic API (Claude model)
   - Parse JSON response (with markdown code block handling)
   - Return structured data: report + email + metadata

4. **Health Check**
   - GET /health endpoint
   - Returns: { status: 'ok', service: 'digest-service', uptime }

### Non-Functional Requirements

- **Performance**: Handle 100 articles efficiently
- **Reliability**: Retry logic for AI API failures
- **Logging**: Console logs for debugging
- **Error Handling**: Proper HTTP status codes
- **Docker**: Single-container deployment
- **Network**: mundus_mundus Docker network

---

## 🏗️ ARCHITECTURE

### Service Pattern (Copy from pdf-service)

```
digest-service/
├── src/
│   ├── server.js              # Express server
│   ├── services/
│   │   ├── prompt-loader.js   # Load prompts from Supabase
│   │   ├── article-formatter.js  # Format articles for AI
│   │   └── anthropic-client.js   # Call Anthropic API
│   └── utils/
│       └── logger.js          # Console logging
├── Dockerfile                 # Single-stage build
├── docker-compose.yml         # Local dev + Beast deploy
├── package.json
├── .env.example
└── README.md

Container:
- Base: node:18-alpine
- Port: 3003
- Network: mundus_mundus (same as mundus + pdf containers)
- Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY
```

### Data Flow

```
Mundus Backend (mundus:8081)
    ↓ POST /api/v2/digest/generate-mundus
    ↓ (calls internally via Docker network)
http://mundus-digest:3003/generate-digest
    ↓ (loads prompt from Supabase)
Supabase Database (mundus_prompts table)
    ↓ (formats articles + calls AI)
Anthropic API (Claude)
    ↓ (returns JSON)
Digest Service → Mundus Backend → Frontend
```

---

## 📝 IMPLEMENTATION DETAILS

### 1. Express Server (src/server.js)

```javascript
// Pattern: Copy from pdf-service/src/server.js
import express from 'express';
import { generateDigest } from './services/digest-generator.js';

const app = express();
app.use(express.json({ limit: '50mb' })); // Large payload for 100 articles

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'digest-service',
    uptime: process.uptime()
  });
});

// Main endpoint
app.post('/generate-digest', async (req, res) => {
  try {
    const { client_id, articles, country } = req.body;

    // Validate
    if (!client_id || !articles || articles.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'client_id and articles are required'
      });
    }

    console.log(`[DIGEST] Processing ${articles.length} articles for client ${client_id}`);
    const startTime = Date.now();

    // Generate digest (main logic)
    const result = await generateDigest({ client_id, articles, country });

    const duration = Date.now() - startTime;
    console.log(`[DIGEST] Completed in ${duration}ms`);

    res.json({
      success: true,
      ...result,
      _metadata: {
        ...result.metadata,
        processing_time_ms: duration
      }
    });

  } catch (error) {
    console.error('[DIGEST] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`[DIGEST] Service running on port ${PORT}`);
});
```

### 2. Digest Generator (src/services/digest-generator.js)

**This is the core logic - COPY from edge function:**

Source: `mundus-editor/supabase/functions/generate-mundus-digest/index.ts`

**Steps:**
1. Load client from Supabase (digest_clients table)
2. Load prompt from Supabase using PromptLoader
3. Format articles for prompt
4. Build variables (client_name, client_brief, country, articles, article_count)
5. Call Anthropic API
6. Parse JSON response (handle markdown code blocks)
7. Return structured data

**Key differences from edge function:**
- Node.js instead of Deno
- Use npm packages instead of JSR imports
- Use @supabase/supabase-js (npm version)
- Console.log instead of Deno console

### 3. Prompt Loader (src/services/prompt-loader.js)

**Copy from edge function:**
Source: `mundus-editor/supabase/functions/shared/db-prompt-loader.ts`

**Convert Deno → Node.js:**
- Replace `jsr:@supabase/supabase-js@2` with `@supabase/supabase-js` (npm)
- Keep same logic: load prompt, load variables, interpolate
- Export as ES module

### 4. Article Formatter (src/services/article-formatter.js)

**Copy from edge function:**
Source: `mundus-editor/supabase/functions/shared/db-prompt-loader.ts` (formatArticlesForPrompt)

**Purpose:** Convert article objects to text for AI prompt

### 5. Anthropic Client (src/services/anthropic-client.js)

```javascript
export async function callAnthropicAPI({ prompt, model, max_tokens, temperature }) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens,
      temperature,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API failed: ${response.status} - ${errorText}`);
  }

  return await response.json();
}
```

---

## 🐳 DOCKER CONFIGURATION

### Dockerfile

```dockerfile
# Single-stage build (keep it simple like pdf-service)
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY src/ ./src/

# Expose port
EXPOSE 3003

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3003/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); });"

# Start server
CMD ["node", "src/server.js"]
```

### docker-compose.yml (Beast deployment)

```yaml
version: '3.8'

services:
  digest-service:
    build: .
    container_name: mundus-digest
    ports:
      - "3003:3003"
    networks:
      - mundus_mundus  # IMPORTANT: Same network as mundus + pdf containers
    environment:
      - PORT=3003
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - NODE_ENV=production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3003/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

networks:
  mundus_mundus:
    external: true  # Use existing network
```

---

## 📦 PACKAGE.JSON

```json
{
  "name": "digest-service",
  "version": "1.0.0",
  "description": "Mundus multi-article digest generation microservice",
  "type": "module",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js",
    "test": "echo \"No tests yet\" && exit 0"
  },
  "dependencies": {
    "express": "^4.18.2",
    "@supabase/supabase-js": "^2.39.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

---

## 🔧 ENVIRONMENT VARIABLES

### Required (.env.example)

```bash
# Service
PORT=3003

# Supabase
SUPABASE_URL=https://kaompjtxgizeswuumzil.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Anthropic
ANTHROPIC_API_KEY=your_anthropic_key_here

# Environment
NODE_ENV=production
```

### Where to get values:
- SUPABASE_URL: From mundus backend/.env
- SUPABASE_SERVICE_ROLE_KEY: From mundus backend/.env (SUPABASE_SERVICE_ROLE_KEY_V2)
- ANTHROPIC_API_KEY: From Beast vault or Supabase secrets

---

## 🧪 TESTING PLAN

### Local Testing

```bash
# 1. Build and run locally
docker build -t digest-service .
docker run -p 3003:3003 --env-file .env digest-service

# 2. Test health endpoint
curl http://localhost:3003/health

# 3. Test digest generation (use real data from mundus)
curl -X POST http://localhost:3003/generate-digest \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "test-client-id",
    "articles": [...],
    "country": "Sweden"
  }'
```

### Beast Deployment Testing

```bash
# 1. Copy to Beast
scp -r digest-service/ jimmyb@beast:~/

# 2. SSH to Beast
ssh jimmyb@beast

# 3. Create .env from vault
cd ~/digest-service
# Copy values from ~/dev-network/beast/docker/mundus/.env.vault

# 4. Build and deploy
docker-compose up -d

# 5. Check logs
docker logs mundus-digest -f

# 6. Test from mundus container
docker exec mundus curl http://mundus-digest:3003/health
```

### Integration Testing

```bash
# Test from mundus backend (internal Docker network)
# Modify mundus digest-controllers.mjs:
# Change: await supabase.functions.invoke('generate-mundus-digest', ...)
# To: await fetch('http://mundus-digest:3003/generate-digest', ...)
```

---

## ✅ SUCCESS CRITERIA

1. **Build Success:**
   - [ ] `docker build` completes without errors
   - [ ] Container starts successfully
   - [ ] Health check passes

2. **Functional Success:**
   - [ ] POST /generate-digest returns 200 with valid JSON
   - [ ] Processes 100 articles without timeout
   - [ ] Returns structured digest (report + email + metadata)

3. **Integration Success:**
   - [ ] Accessible from mundus container via Docker network
   - [ ] Mundus backend can call service successfully
   - [ ] End-to-end digest generation works

4. **Performance:**
   - [ ] Completes in 25-35 seconds (acceptable)
   - [ ] No memory leaks (monitor with `docker stats`)

---

## 🚀 DEPLOYMENT STEPS (Beast)

### Step 1: Build on Beast

```bash
# SSH to Beast
ssh jimmyb@beast

# Navigate to service
cd ~/digest-service

# Build container
docker build -t mundus-digest:latest .
```

### Step 2: Configure Environment

```bash
# Create .env file (copy from vault)
cat > .env << 'EOF'
PORT=3003
SUPABASE_URL=https://kaompjtxgizeswuumzil.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<from vault>
ANTHROPIC_API_KEY=<from vault>
NODE_ENV=production
EOF
```

### Step 3: Deploy

```bash
# Start service
docker-compose up -d

# Verify
docker ps | grep mundus-digest
docker logs mundus-digest --tail 20
```

### Step 4: Test

```bash
# Health check
curl http://localhost:3003/health

# Internal network test (from mundus container)
docker exec mundus curl http://mundus-digest:3003/health
```

---

## 🔗 INTEGRATION WITH MUNDUS

### Update mundus backend (digest-controllers.mjs)

**Current (Edge Function):**
```javascript
const { data: digestData, error: edgeError } = await supabase.functions.invoke(
  'generate-mundus-digest',
  { body: { client_id, articles, country } }
);
```

**New (Microservice):**
```javascript
const response = await fetch('http://mundus-digest:3003/generate-digest', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ client_id, articles, country })
});

if (!response.ok) {
  throw new AppError('Digest generation failed', 500);
}

const digestData = await response.json();
```

**Changes needed:**
1. Replace `supabase.functions.invoke()` with `fetch()`
2. Update error handling
3. Update response parsing (already returns JSON)
4. Test end-to-end

---

## 📚 REFERENCE FILES

**Copy logic from:**
- `mundus-editor/supabase/functions/generate-mundus-digest/index.ts` (main logic)
- `mundus-editor/supabase/functions/shared/db-prompt-loader.ts` (prompt loading)
- `pdf-service/` (Docker + Express structure)

**Use same pattern as:**
- `pdf-service/src/server.js` (Express setup)
- `pdf-service/Dockerfile` (Container config)
- `pdf-service/docker-compose.yml` (Deployment)

---

## ⚠️ IMPORTANT NOTES

1. **Port 3003** - Do not conflict with:
   - Mundus: 8081
   - PDF Service: 3002

2. **Docker Network** - MUST use `mundus_mundus`:
   - Same network as mundus + pdf containers
   - Allows internal communication

3. **Environment Variables** - Get from Beast vault:
   - Path: `~/dev-network/beast/docker/mundus/.env.vault`
   - Copy: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY_V2, ANTHROPIC_API_KEY

4. **No Timeout** - Node.js has no 30-second limit like edge functions

5. **Logging** - Use console.log (Docker captures stdout)

---

## 🎯 BEAST EXECUTION CHECKLIST

- [ ] Read this BUILD-SPEC.md completely
- [ ] Read DESIGN.md for architecture details
- [ ] Copy edge function logic to Node.js
- [ ] Create Express server (pattern: pdf-service)
- [ ] Create Dockerfile (pattern: pdf-service)
- [ ] Create docker-compose.yml
- [ ] Create package.json with dependencies
- [ ] Create .env.example
- [ ] Test build locally (if possible)
- [ ] Deploy to Beast
- [ ] Test health endpoint
- [ ] Test digest generation
- [ ] Document in NEXT-SESSION-START-HERE.md

---

**Build Spec Version:** 1.0
**Created:** 2025-11-07
**Target Executor:** Beast (Claude Code CLI)
**Estimated Build Time:** 2-3 hours
**Pattern Source:** pdf-service + edge function logic
