/**
 * Digest Generator Service
 * Main logic for generating multi-article digests using Anthropic API
 */

import { callAnthropicAPI, parseClaudeJSON } from './anthropic-client.js';
import { loadPrompt, loadClient, buildInterpolationVariables, interpolateTemplate } from './prompt-loader.js';
import { formatArticlesForPrompt, extractArticleMetadata, getArticlesSummary, filterValidArticles } from './article-formatter.js';

/**
 * Main digest generation function
 * @param {Object} options - Generation options
 * @param {string} options.client_id - Client ID
 * @param {Array<Object>} options.articles - Array of articles
 * @param {string} options.country - Country name
 * @returns {Promise<Object>} Generated digest with report and email
 */
export async function generateDigest({ client_id, articles, country }) {
  const startTime = Date.now();

  try {
    // Validate input
    if (!articles || articles.length === 0) {
      throw new Error('Articles array is required and cannot be empty');
    }

    console.log(`[DIGEST-GENERATOR] Starting digest generation for client: ${client_id}`);
    console.log(`[DIGEST-GENERATOR] Processing ${articles.length} articles`);

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

    // Load prompt from Supabase
    const promptData = await loadPrompt('mundus-multi-article-digest');

    // Format articles for AI
    const formattedArticles = formatArticlesForPrompt(validArticles);

    // Build interpolation variables
    const variables = buildInterpolationVariables(client, validArticles, country);

    // Interpolate prompt template
    const interpolatedPrompt = interpolateTemplate(promptData.template, variables);

    console.log(`[DIGEST-GENERATOR] Prompt prepared, calling Anthropic API...`);

    // Add strict JSON instruction to prompt
    const strictPrompt = interpolatedPrompt + '\n\nIMPORTANT: Return ONLY valid, parseable JSON. No markdown code blocks. No additional text. Ensure all strings are properly escaped and quoted.';

    // Call Anthropic API
    const apiResponse = await callAnthropicAPI({
      prompt: strictPrompt,
      model: promptData.model || 'claude-sonnet-4-5-20250929',
      max_tokens: promptData.max_tokens || 16000,
      temperature: promptData.temperature || 0.5  // Lower temp for more reliable JSON
    });

    // Extract response content
    if (!apiResponse.content || apiResponse.content.length === 0) {
      throw new Error('Empty response from Anthropic API');
    }

    const responseText = apiResponse.content[0].text;
    console.log(`[DIGEST-GENERATOR] API response received (${responseText.length} chars)`);

    // Parse JSON response
    const parsedResponse = parseClaudeJSON(responseText);

    // Build result object
    const result = {
      success: true,
      digest: {
        report: parsedResponse.report || parsedResponse,
        email: parsedResponse.email || null,
        metadata: {
          client_id,
          client_name: client.name,
          country,
          article_count: validArticles.length,
          articles_summary: getArticlesSummary(validArticles),
          article_sources: validArticles.map(a => a.source),
          generated_at: new Date().toISOString()
        }
      }
    };

    const duration = Date.now() - startTime;
    console.log(`[DIGEST-GENERATOR] ✅ Digest generated successfully in ${duration}ms`);

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
 * @param {number} maxRetries - Maximum number of retries (default: 2)
 * @returns {Promise<Object>} Generated digest
 */
export async function generateDigestWithRetry(options, maxRetries = 2) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      console.log(`[DIGEST-GENERATOR] Attempt ${attempt}/${maxRetries + 1}`);
      return await generateDigest(options);
    } catch (error) {
      lastError = error;
      console.warn(`[DIGEST-GENERATOR] Attempt ${attempt} failed:`, error.message);

      if (attempt <= maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff
        console.log(`[DIGEST-GENERATOR] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
