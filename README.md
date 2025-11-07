# Digest Service

**Purpose:** Mundus multi-article digest generation microservice
**Status:** Ready for Beast build
**Created:** 2025-11-07
**Pattern:** Microservice (same as pdf-service)

---

## 🎯 What This Service Does

Processes 100 articles and generates AI-powered Mundus digests using Anthropic Claude API.

**Why separate service:**
- Heavy AI processing (25-30 seconds)
- Prevents timeout issues in Supabase Edge Functions
- Isolated from main Mundus app
- No performance impact on user-facing services

---

## 🏗️ Architecture

```
Frontend → Mundus Backend → Digest Service → Anthropic API
                                 ↓
                         Supabase Database
```

**Network:** Docker internal (`mundus_mundus`)
**Port:** 3003
**Container:** `mundus-digest`

---

## 🚀 Quick Start (Beast)

### Prerequisites

- Docker + Docker Compose
- Access to Beast server
- Environment variables from vault

### Build and Deploy

```bash
# 1. SSH to Beast
ssh jimmyb@beast

# 2. Navigate to service
cd ~/digest-service

# 3. Create .env file
cp .env.example .env
# Edit .env with actual values from vault

# 4. Build container
docker build -t mundus-digest:latest .

# 5. Deploy with compose
docker-compose up -d

# 6. Check health
curl http://localhost:3003/health
docker logs mundus-digest --tail 20
```

---

## 📚 Documentation

- **BUILD-SPEC.md** - Detailed build instructions for Beast
- **DESIGN.md** - Architecture and technical design
- **AGENTS.md** - AI assistant guidelines
- **NEXT-SESSION-START-HERE.md** - Session continuity

---

## 🔧 Environment Variables

See `.env.example` for required variables.

**Get values from:**
- `~/dev-network/beast/docker/mundus/.env.vault` (Beast)

---

## 🧪 Testing

```bash
# Health check
curl http://localhost:3003/health

# Test digest generation (from mundus container)
docker exec mundus curl http://mundus-digest:3003/generate-digest \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"client_id": "test", "articles": [...], "country": "Sweden"}'
```

---

## 🔗 Integration

**Mundus Backend Update:**

Replace edge function call:
```javascript
// OLD
const { data } = await supabase.functions.invoke('generate-mundus-digest', { body });

// NEW
const response = await fetch('http://mundus-digest:3003/generate-digest', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ client_id, articles, country })
});
const data = await response.json();
```

---

## 📊 Performance

- **Processing Time:** 25-35 seconds (100 articles + AI)
- **Memory:** <500MB
- **Concurrent:** 1-2 requests (AI bottleneck)

---

## 🆘 Troubleshooting

**Container won't start:**
```bash
docker logs mundus-digest
# Check for missing env vars or network issues
```

**Can't reach from mundus:**
```bash
# Verify network
docker network inspect mundus_mundus
# Both mundus and mundus-digest should be listed
```

**AI timeout:**
```bash
# Check Anthropic API key
echo $ANTHROPIC_API_KEY
# Verify key is valid
```

---

## 📅 Next Steps

1. Beast builds service (see BUILD-SPEC.md)
2. Chromebook updates mundus backend
3. Integration testing
4. Deploy to production

---

**Version:** 1.0
**Last Updated:** 2025-11-07
**Maintainer:** Jimmy (orchestrator) + Beast (builder)
