# Deployment Incident Report: digest-service Auto-Deployment Failure

**Date:** 2025-11-11 08:00 UTC
**Reported by:** Chromebook
**Executed by:** Beast
**Status:** MANUALLY RESOLVED - Auto-deployment still broken

---

## Summary

digest-service failed to auto-deploy commit 512987a (pushed ~08:00 UTC). The service was running 23 hours old code (0967bba) instead of latest, causing 502 errors in production.

**Manual deployment completed successfully at 08:00 UTC.**

---

## Timeline

- **~08:00 UTC:** Chromebook pushed commit 512987a to GitHub
- **~08:00 UTC:** Beast did NOT receive webhook (should have auto-deployed)
- **08:00 UTC:** Beast manually deployed 512987a
- **Current:** Service running healthy on 512987a

---

## Root Cause

**GitHub webhooks are NOT configured for `Jimmyh-world` organization.**

### Evidence

**deployment-worker logs (last 20 hours):**
```
2025-11-10 11:19:03 - Repository: ydun-code-library/Mundus-editor-application ✅
2025-11-10 11:33:41 - Repository: ydun-code-library/Mundus-editor-application ✅
2025-11-10 13:16:00 - Repository: ydun-code-library/Mundus-editor-application ✅
2025-11-10 13:46:54 - Repository: ydun-code-library/Mundus-editor-application ✅
2025-11-10 14:05:33 - Repository: ydun-code-library/Mundus-editor-application ✅
2025-11-10 16:26:21 - Repository: ydun-code-library/Mundus-editor-application ✅
2025-11-11 07:51:05 - Repository: ydun-code-library/Mundus-editor-application ✅
2025-11-11 07:54:20 - Repository: ydun-code-library/Mundus-editor-application ✅

ZERO webhooks received for: Jimmyh-world/digest-service ❌
```

**Repository locations:**
```
digest-service:            Jimmyh-world/digest-service       (NO webhooks)
Mundus-editor-application: ydun-code-library/Mundus-...     (webhooks working)
```

### deployment-worker Configuration

File: `/home/jimmyb/dev-network/beast/deployment-worker/deployment_worker.py:65-70`

```python
'digest-service': {
    'path': '/home/jimmyb/digest-service',
    'compose_path': '/home/jimmyb/digest-service',
    'compose_file': 'docker-compose.yml',
    'enabled': True  # ✅ Configured correctly
}
```

**Conclusion:** Worker is configured correctly, but never receives webhooks.

---

## Manual Deployment Executed

```bash
cd ~/digest-service

# Update code
git fetch origin
git reset --hard origin/master
# Result: 0967bba → 512987a ✅

# Rebuild container
docker compose build --no-cache
# Result: New image built with commit 512987a ✅

# Restart service
docker compose up -d
# Result: mundus-digest restarted ✅

# Verify
curl http://localhost:3003/health
# Result: {"status":"ok"} ✅
```

**Current state:**
```
Container: mundus-digest
Status: Up 15 minutes (healthy)
Commit: 512987a
Port: 0.0.0.0:3003->3003/tcp
```

---

## What Needs to Be Fixed

### Problem

GitHub webhooks are only configured for `ydun-code-library` organization.
`Jimmyh-world/digest-service` pushes are NOT triggering deployment pipeline.

### Expected Flow (Not Working)

```
1. Chromebook pushes to Jimmyh-world/digest-service
2. GitHub sends webhook to Guardian
3. Guardian publishes to Kafka (deployment-webhooks topic)
4. Beast deployment-worker consumes Kafka message
5. Beast executes: git reset --hard + docker compose build + up -d
```

**Current flow stops at step 2:** GitHub webhook either not configured or Guardian not accepting it.

### Solution Options

**Option A: Configure webhook on GitHub repo (RECOMMENDED)**
```
1. Go to: https://github.com/Jimmyh-world/digest-service/settings/hooks
2. Add webhook:
   - Payload URL: http://guardian:PORT/webhook/github
   - Content type: application/json
   - Secret: (use existing webhook secret)
   - Events: Just the push event
   - Active: ✅
3. Test delivery with a test commit
```

**Option B: Configure Guardian to accept Jimmyh-world**
```
1. Update Guardian webhook receiver configuration
2. Add 'Jimmyh-world' to allowed orgs/users
3. Restart Guardian webhook service
4. Test with a test commit
```

**Option C: Move digest-service to ydun-code-library org**
```
- Transfer repo to ydun-code-library organization
- Webhooks would work automatically
- Update Beast local repo remote URL
```

---

## Testing After Fix

After configuring webhook, verify with test commit:

```bash
# 1. Push test commit to digest-service
cd ~/digest-service
echo "# Test webhook" >> README.md
git add README.md
git commit -m "test: Verify auto-deployment webhook"
git push

# 2. Monitor deployment pipeline
# On Guardian:
tail -f /path/to/guardian-webhook.log

# On Beast:
tail -f /home/jimmyb/deployment-worker.log

# Should see:
# - GitHub webhook received by Guardian
# - Kafka message published to deployment-webhooks
# - Beast consuming message and deploying
# - Docker container rebuilt
# - Deployment success published to deployment-results

# 3. Verify digest-service restarted
docker ps --filter "name=mundus-digest"
# Should show: Up X seconds (not minutes/hours)
```

---

## Affected Services

**Currently broken auto-deployment:**
- ✅ digest-service (manual deployment working)

**Working auto-deployment:**
- ✅ Mundus-editor-application (8 successful deployments in last 20h)

**Unknown (need to check):**
- ❓ Any other repos under Jimmyh-world org
- ❓ dev-rag (configured but disabled in worker)
- ❓ dev-network (configured but might have same webhook issue)

---

## Recommendations

### Immediate (HIGH)
1. **Configure GitHub webhook** for digest-service
2. **Test webhook** with small commit
3. **Document** which repos have webhooks configured

### Medium
4. **Audit all repos** for webhook configuration
5. **Add monitoring** to detect when configured repos haven't deployed despite GitHub activity
6. **Standardize** all repos under single GitHub org (simpler webhook management)

### Low
7. **Add health check** to deployment-worker showing webhook status
8. **Alert on stale deployments** (repo configured but no deploys in X hours)

---

## Files Involved

**Beast:**
- `/home/jimmyb/digest-service/` - Repository
- `/home/jimmyb/dev-network/beast/deployment-worker/deployment_worker.py` - Worker config
- `/home/jimmyb/deployment-worker.log` - Worker logs
- `/etc/systemd/system/deployment-worker.service` - Systemd service

**Guardian:**
- Webhook receiver service (location TBD)
- Kafka producer for deployment-webhooks topic

**GitHub:**
- https://github.com/Jimmyh-world/digest-service (needs webhook)
- https://github.com/ydun-code-library/Mundus-editor-application (has webhook)

---

## Next Actions

**For Chromebook/Guardian:**
- [ ] Configure GitHub webhook for Jimmyh-world/digest-service
- [ ] Verify Guardian accepts webhooks from Jimmyh-world
- [ ] Test with dummy commit
- [ ] Document webhook setup process

**For Beast:**
- [x] Manual deployment completed (512987a deployed)
- [x] Root cause documented
- [ ] Monitor for next digest-service push (will it auto-deploy?)

---

**Incident Status:** DOCUMENTED
**Service Status:** HEALTHY (manual deployment)
**Auto-Deployment:** BROKEN (awaiting webhook configuration)

*Report generated: 2025-11-11 08:15 UTC*
*Last updated: 2025-11-11 08:15 UTC*
