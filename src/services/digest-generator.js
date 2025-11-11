/**
 * Digest Generator Service
 * Two-stage AI filtering: Pre-filter (semantic) → Batch processing (content generation)
 */

import { loadClient } from './prompt-loader.js';
import { filterValidArticles } from './article-formatter.js';
import { preFilterArticles } from './pre-filter.js';
import { processAllBatches } from './batch-processor.js';
import { mergeBatchResults } from './result-merger.js';

/**
 * Main digest generation function with batching
 * @param {Object} options - Generation options
 * @param {string} options.client_id - Client ID
 * @param {Array<Object>} options.articles - Array of articles
 * @param {string} options.country - Country name
 * @param {Object} options.context - Full client context (topics, keywords, countries, etc)
 * @param {Object} options.last_digest - Previous digest for context (optional)
 * @returns {Promise<Object>} Generated digest with report and email
 */
export async function generateDigest({ client_id, articles, country, context, last_digest }) {
  const startTime = Date.now();

  try {
    // Validate input
    if (!articles || articles.length === 0) {
      throw new Error('Articles array is required and cannot be empty');
    }

    console.log(`[DIGEST-GENERATOR] Starting digest generation for client: ${client_id}`);
    console.log(`[DIGEST-GENERATOR] Processing ${articles.length} articles`);

    if (last_digest) {
      console.log(`[DIGEST-GENERATOR] With context from last digest: ${last_digest.created_at}`);
    }

    // Filter valid articles
    const validArticles = filterValidArticles(articles);
    if (validArticles.length === 0) {
      throw new Error('No valid articles provided');
    }

    if (validArticles.length < articles.length) {
      console.warn(`[DIGEST-GENERATOR] Using ${validArticles.length}/${articles.length} valid articles`);
    }

    // Load client details from Supabase
    const client = await loadClient(client_id);

    // STAGE 1: Pre-filter articles by topic relevance (if topics specified)
    let articlesToProcess = validArticles;
    const clientTopics = context?.topics || client.preferences?.topics || [];
    const clientCategories = context?.categories || client.preferences?.categories || [];

    if (clientTopics.length > 0 && validArticles.length > 100) {
      console.log(`[DIGEST-GENERATOR] Starting two-stage filtering for topics: ${clientTopics.join(', ')}`);
      console.log(`[DIGEST-GENERATOR] Source categories: ${clientCategories.join(', ')}`);

      try {
        const preFiltered = await preFilterArticles({
          articles: validArticles,
          topics: clientTopics,
          categories: clientCategories,  // Pass categories for context
          clientName: client.name,
          targetCount: 100  // Filter down to 100 most relevant
        });

        articlesToProcess = preFiltered;
        console.log(`[DIGEST-GENERATOR] Pre-filter: ${validArticles.length} → ${articlesToProcess.length} articles`);
      } catch (error) {
        console.error(`[DIGEST-GENERATOR] Pre-filter failed, using all articles:`, error.message);
        // Fall back to using all articles if pre-filter fails
        articlesToProcess = validArticles.slice(0, 100);
      }
    } else {
      console.log(`[DIGEST-GENERATOR] Skipping pre-filter (no topics or <100 articles)`);
      articlesToProcess = validArticles.slice(0, 100);
    }

    // STAGE 2: Process articles in batches with full context
    const batchResults = await processAllBatches(articlesToProcess, {
      client,
      country,
      context,  // Pass full client context for AI prompts
      last_digest
    });

    console.log(`[DIGEST-GENERATOR] All batches processed successfully`);

    // Merge batch results into final digest
    const digest = mergeBatchResults(batchResults, client, last_digest);

    // Build final response (flat structure for backend compatibility)
    const result = {
      success: true,
      report: digest.report,
      email: digest.email,
      _metadata: {
        ...digest.report.metadata,
        client_id,
        client_name: client.name,
        country,
        generated_at: new Date().toISOString(),
        has_previous_context: !!last_digest
      }
    };

    const duration = Date.now() - startTime;
    console.log(`[DIGEST-GENERATOR] ✅ Complete digest generated in ${duration}ms`);
    console.log(`[DIGEST-GENERATOR] Response metadata:`, JSON.stringify(result._metadata, null, 2));

    return result;

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[DIGEST-GENERATOR] ❌ Error after ${duration}ms:`, error.message);
    throw error;
  }
}

/**
 * Generate digest with retry logic
 * @param {Object} options - Same as generateDigest
 * @param {number} maxRetries - Maximum number of retries (default: 1)
 * @returns {Promise<Object>} Generated digest
 */
export async function generateDigestWithRetry(options, maxRetries = 1) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      console.log(`[DIGEST-GENERATOR] Attempt ${attempt}/${maxRetries + 1}`);
      return await generateDigest(options);
    } catch (error) {
      lastError = error;
      console.warn(`[DIGEST-GENERATOR] Attempt ${attempt} failed:`, error.message);

      if (attempt <= maxRetries) {
        const delay = Math.min(2000 * Math.pow(2, attempt - 1), 10000);
        console.log(`[DIGEST-GENERATOR] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
