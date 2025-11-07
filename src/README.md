# Source Code - To Be Implemented by Beast

This directory will contain:

## Files to Create

### src/server.js
Express server with endpoints:
- GET /health
- POST /generate-digest

### src/services/digest-generator.js
Main orchestrator:
- Load client from Supabase
- Load prompt from database
- Format articles
- Call Anthropic API
- Parse response

### src/services/prompt-loader.js
Database prompt loading:
- Query mundus_prompts table
- Load variables
- Interpolate template

### src/services/article-formatter.js
Format articles for AI:
- Convert database format to text
- Include metadata (source, date, country)

### src/services/anthropic-client.js
Anthropic API integration:
- Call Messages API
- Handle errors
- Parse JSON responses

### src/utils/logger.js
Logging utility (console.log wrapper)

---

## Reference

**Copy logic from:**
- mundus-editor/supabase/functions/generate-mundus-digest/index.ts
- mundus-editor/supabase/functions/shared/db-prompt-loader.ts

**Copy structure from:**
- pdf-service/src/server.js

See BUILD-SPEC.md for detailed implementation instructions.
