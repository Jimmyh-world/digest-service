# START HERE - Beast Execution Instructions

**Date:** 2025-11-07
**Executor:** Beast (Claude Code CLI)
**Estimated Time:** 2-3 hours
**Pattern:** Clone pdf-service, port edge function logic

---

## 🎯 Your Mission

Build a **Node.js microservice** that generates Mundus digests by processing 100 articles with Anthropic AI.

---

## 📚 Read These Files (In Order)

1. **README.md** - Project overview
2. **DESIGN.md** - Architecture and data flow
3. **BUILD-SPEC.md** - Detailed build instructions ⭐ **YOUR MAIN GUIDE**
4. **AGENTS.md** - Project guidelines (if needed)

---

## 🔴 RED Phase: Implementation

### Step 1: Read BUILD-SPEC.md Completely
- Understand all components
- Note reference files to copy from
- Understand Docker network requirements

### Step 2: Copy Edge Function Logic

**Source Files (in mundus-editor repo):**
```
~/m-e-p/4-mundus-editor-application/supabase/functions/generate-mundus-digest/index.ts
~/m-e-p/4-mundus-editor-application/supabase/functions/shared/db-prompt-loader.ts
```

**Convert Deno → Node.js:**
- Replace `jsr:@supabase/supabase-js@2` with `@supabase/supabase-js` (npm)
- Replace Deno.env.get() with process.env
- Keep all logic the same

### Step 3: Create Files

**Required:**
- src/server.js (Express server)
- src/services/digest-generator.js (main logic)
- src/services/prompt-loader.js (database prompts)
- src/services/article-formatter.js (format articles)
- src/services/anthropic-client.js (AI API calls)

**Optional:**
- src/utils/logger.js (logging helper)

### Step 4: Test Locally

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit with actual values from ~/dev-network/beast/docker/mundus/.env.vault

# Run locally
npm start

# Test health
curl http://localhost:3003/health

# Test generation (need real client_id and articles)
```

---

## 🟢 GREEN Phase: Validation

### Build Docker Container

```bash
docker build -t mundus-digest:latest .
```

**Must succeed without errors**

### Deploy to Beast

```bash
# Ensure mundus_mundus network exists
docker network ls | grep mundus_mundus

# Start service
docker-compose up -d

# Check logs
docker logs mundus-digest --tail 50

# Test health endpoint
curl http://localhost:3003/health

# Test from mundus container (internal network)
docker exec mundus curl http://mundus-digest:3003/health
```

### Integration Test

```bash
# Test full digest generation with real data
# (requires active mundus database connection)
docker logs mundus-digest -f

# From another terminal, trigger generate from mundus frontend
# Watch logs for successful processing
```

---

## 🔵 CHECKPOINT Phase: Documentation

### Update Files

1. **NEXT-SESSION-START-HERE.md**
   - Set status: "Build complete, ready for integration"
   - Add any issues encountered
   - Note what worked well

2. **STATUS.md**
   - Update completion percentage
   - Mark features as complete
   - Add any technical debt

3. **Commit Work**
   ```bash
   git add -A
   git commit -m "feat: Complete digest-service implementation

   - Implement Express server with /generate-digest endpoint
   - Port edge function logic to Node.js
   - Add Anthropic API integration
   - Add database prompt loading
   - Test build and deployment
   - All tests passing"

   git push origin main  # If remote configured
   ```

---

## 🆘 If You Get Stuck

### Missing Environment Variables
- Check ~/dev-network/beast/docker/mundus/.env.vault
- SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY

### Docker Network Not Found
```bash
# Create network if missing
docker network create mundus_mundus
```

### Port 3003 In Use
```bash
# Find what's using it
lsof -i :3003
# Kill if needed, or change port in .env and docker-compose.yml
```

### Can't Find Source Files
```bash
# Edge function location
ls ~/m-e-p/4-mundus-editor-application/supabase/functions/

# PDF service (for pattern reference)
ls ~/pdf-service/
```

---

## 📋 Success Checklist

- [ ] All source files created (src/server.js, src/services/*.js)
- [ ] Docker build successful
- [ ] Container starts without errors
- [ ] Health endpoint responds: { "status": "ok" }
- [ ] Accessible from mundus container (Docker network)
- [ ] Logs show service started on port 3003
- [ ] Git committed with clear message
- [ ] NEXT-SESSION-START-HERE.md updated

---

## 🎯 Final Deliverable

A **working Docker container** that:
1. Starts successfully on Beast
2. Responds to health checks
3. Can generate digests when called from mundus backend
4. Runs on mundus_mundus Docker network
5. Uses port 3003

---

## 📞 Handoff to Chromebook

After successful build, message Chromebook orchestrator:

**"Digest service build complete. Container running on Beast:3003. Ready for mundus-editor integration. See NEXT-SESSION-START-HERE.md for status."**

Chromebook will then:
1. Update mundus backend to call new service
2. Test end-to-end flow
3. Validate digest quality

---

**Good luck, Beast! Follow Jimmy's Workflow. You got this! 🚀**

---

**Document Version:** 1.0
**Created:** 2025-11-07
**Pattern:** Autonomous execution on Beast
