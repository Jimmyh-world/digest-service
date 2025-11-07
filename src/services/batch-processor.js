/**
 * Batch Processor Service
 * Processes articles in batches of 25 for reliable JSON generation
 */

import { callAnthropicAPI } from './anthropic-client.js';
import { formatArticlesForPrompt } from './article-formatter.js';

const BATCH_SIZE = 25;

/**
 * Split articles into batches
 * @param {Array<Object>} articles - Articles to batch
 * @param {number} batchSize - Size of each batch
 * @returns {Array<Array<Object>>} Array of batches
 */
export function chunkArticles(articles, batchSize = BATCH_SIZE) {
  const chunks = [];
  for (let i = 0; i < articles.length; i += batchSize) {
    chunks.push(articles.slice(i, i + batchSize));
  }
  return chunks;
}

/**
 * Build prompt for a single batch with context
 * @param {Object} options - Batch processing options
 * @returns {string} Batch prompt
 */
export function buildBatchPrompt({ batch, batchNumber, totalBatches, client, country, last_digest, promptTemplate }) {
  let prompt = `BATCH ${batchNumber}/${totalBatches}: Analyzing ${batch.length} articles for ${client.name}\n\n`;

  // Add last digest context if available
  if (last_digest) {
    prompt += `=== PREVIOUS DIGEST CONTEXT ===\n`;
    prompt += `Generated: ${last_digest.created_at}\n`;
    prompt += `Articles covered: ${last_digest.article_count || 0}\n\n`;

    if (last_digest.sections?.news?.length > 0) {
      prompt += `Main stories from last digest:\n`;
      last_digest.sections.news.slice(0, 5).forEach(story => {
        prompt += `- ${story.title}\n`;
      });
    }

    prompt += `\nINSTRUCTIONS FOR THIS BATCH:\n`;
    prompt += `- SKIP articles already covered in previous digest\n`;
    prompt += `- Mark stories as "CONTINUED" if they develop from previous coverage\n`;
    prompt += `- Reference previous context when relevant\n`;
    prompt += `- Focus on NEW developments\n\n`;
  }

  prompt += `=== ARTICLES IN THIS BATCH (${batch.length}) ===\n\n`;
  prompt += formatArticlesForPrompt(batch);

  prompt += `\n\n=== TASK ===\n`;
  prompt += `For this batch, return ONLY a JSON object with:\n`;
  prompt += `{\n`;
  prompt += `  "filtered_articles": [\n`;
  prompt += `    {\n`;
  prompt += `      "title": "Article title",\n`;
  prompt += `      "source": { "name": "Source name", "url": "article_url" },\n`;
  prompt += `      "relevance_score": 8,\n`;
  prompt += `      "category": "news"|"business"|"politics"|"eu_relations",\n`;
  prompt += `      "priority": "main"|"b_side",\n`;
  prompt += `      "paragraphs": ["Paragraph 1", "Paragraph 2", "Paragraph 3"],\n`;
  prompt += `      "continued_from_previous": true|false,\n`;
  prompt += `      "article_id": "original_article_id_if_available"\n`;
  prompt += `    }\n`;
  prompt += `  ],\n`;
  prompt += `  "skipped_count": 5,\n`;
  prompt += `  "duplicate_count": 2\n`;
  prompt += `}\n\n`;
  prompt += `IMPORTANT: \n`;
  prompt += `- "source" must be an object with "name" and "url" properties\n`;
  prompt += `- "paragraphs" must be an array of 1-3 paragraph strings\n`;
  prompt += `- Split summaries into logical paragraphs for better readability\n`;
  prompt += `Return ONLY valid JSON. No markdown. No prose. Ensure all strings are properly escaped.`;

  return prompt;
}

/**
 * Process a single batch through Claude API
 * @param {Object} options - Batch processing options
 * @returns {Promise<Object>} Batch result with filtered articles
 */
export async function processBatch({ batch, batchNumber, totalBatches, client, country, last_digest, promptTemplate }) {
  console.log(`[BATCH-PROCESSOR] Processing batch ${batchNumber}/${totalBatches} (${batch.length} articles)`);

  const batchPrompt = buildBatchPrompt({
    batch,
    batchNumber,
    totalBatches,
    client,
    country,
    last_digest,
    promptTemplate
  });

  try {
    // Call Claude API with JSON prefilling
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4000,  // Smaller batch = smaller response needed
        temperature: 0.2,
        messages: [
          { role: 'user', content: batchPrompt },
          { role: 'assistant', content: '{' }  // Prefill to enforce JSON
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API failed for batch ${batchNumber}: ${response.status} - ${errorText}`);
    }

    const apiData = await response.json();
    const jsonText = '{' + apiData.content[0].text;  // Prepend the prefill

    console.log(`[BATCH-PROCESSOR] Batch ${batchNumber} response: ${jsonText.length} chars`);

    // Parse JSON
    const batchResult = JSON.parse(jsonText);

    console.log(`[BATCH-PROCESSOR] ✅ Batch ${batchNumber} processed: ${batchResult.filtered_articles?.length || 0} articles filtered`);

    return {
      batchNumber,
      articles: batchResult.filtered_articles || [],
      skipped: batchResult.skipped_count || 0,
      duplicates: batchResult.duplicate_count || 0
    };

  } catch (error) {
    console.error(`[BATCH-PROCESSOR] ❌ Batch ${batchNumber} failed:`, error.message);
    throw error;
  }
}

/**
 * Process all batches sequentially
 * @param {Array<Object>} articles - All articles to process
 * @param {Object} context - Processing context
 * @returns {Promise<Array<Object>>} Array of batch results
 */
export async function processAllBatches(articles, context) {
  const batches = chunkArticles(articles);

  console.log(`[BATCH-PROCESSOR] Processing ${articles.length} articles in ${batches.length} batches`);

  const results = [];
  for (let i = 0; i < batches.length; i++) {
    const result = await processBatch({
      batch: batches[i],
      batchNumber: i + 1,
      totalBatches: batches.length,
      ...context
    });
    results.push(result);
  }

  return results;
}
