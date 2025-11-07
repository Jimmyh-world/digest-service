/**
 * Digest Generator Service
 * Multi-batch processing with context preservation
 */

import { loadClient } from './prompt-loader.js';
import { filterValidArticles } from './article-formatter.js';
import { processAllBatches } from './batch-processor.js';
import { mergeBatchResults } from './result-merger.js';

/**
 * Main digest generation function with batching
 * @param {Object} options - Generation options
 * @param {string} options.client_id - Client ID
 * @param {Array<Object>} options.articles - Array of articles
 * @param {string} options.country - Country name
 * @param {Object} options.last_digest - Previous digest for context (optional)
 * @returns {Promise<Object>} Generated digest with report and email
 */
export async function generateDigest({ client_id, articles, country, last_digest }) {
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

    // Process articles in batches
    const batchResults = await processAllBatches(validArticles, {
      client,
      country,
      last_digest
    });

    console.log(`[DIGEST-GENERATOR] All batches processed successfully`);

    // Merge batch results into final digest
    const digest = mergeBatchResults(batchResults, client, last_digest);

    // Build final response
    const result = {
      success: true,
      digest: {
        ...digest,
        metadata: {
          ...digest.report.metadata,
          client_id,
          client_name: client.name,
          country,
          generated_at: new Date().toISOString(),
          has_previous_context: !!last_digest
        }
      }
    };

    const duration = Date.now() - startTime;
    console.log(`[DIGEST-GENERATOR] ✅ Complete digest generated in ${duration}ms`);

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
