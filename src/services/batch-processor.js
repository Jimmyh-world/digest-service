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
export function buildBatchPrompt({ batch, batchNumber, totalBatches, client, country, context, last_digest, promptTemplate }) {
  let prompt = `BATCH ${batchNumber}/${totalBatches}: Analyzing ${batch.length} articles for ${client.name}\n\n`;

  // Add geographic focus if available
  if (context?.countries || context?.country_primary || country) {
    const countries = context?.countries || [context?.country_primary || country];
    const primaryCountry = context?.country_primary || country;

    prompt += `=== GEOGRAPHIC FOCUS ===\n`;
    prompt += `Primary region: ${primaryCountry}\n`;
    if (countries.length > 1) {
      prompt += `Focus countries: ${countries.join(', ')}\n`;
    }
    prompt += `These articles are from ${primaryCountry} and the Nordic/Baltic region.\n`;
    prompt += `Prioritize relevance to ${primaryCountry} and regional developments.\n\n`;
  }

  // Add client topics if available - STRONG emphasis
  if (context?.topics && context.topics.length > 0) {
    prompt += `=== CLIENT TOPICS ===\n`;
    prompt += `Focus areas: ${context.topics.join(', ')}\n`;
    prompt += `This client ONLY wants articles about: ${context.topics.join(', ')}\n\n`;

    prompt += `IMPORTANT FOR RELEVANCE SCORING:\n`;
    prompt += `- Articles directly about ${context.topics.join('/')} should score 8-10\n`;
    prompt += `- Articles tangentially related to ${context.topics.join('/')} should score 4-6\n`;
    prompt += `- Articles completely unrelated to ${context.topics.join('/')} should score 0-2\n\n`;

    // Add related keywords hint for the topic
    if (context.topics.includes('Energy')) {
      prompt += `Energy includes: solar, wind, batteries, hydrogen, nuclear, grid, renewable, electric vehicles, power generation, energy storage, charging infrastructure\n\n`;
    }
  }

  // Add priority keywords if available
  if (context?.keywords && context.keywords.length > 0) {
    prompt += `=== KEY INTERESTS ===\n`;
    prompt += `Priority keywords: ${context.keywords.join(', ')}\n`;
    prompt += `Articles containing these keywords are HIGH PRIORITY for this client.\n`;
    prompt += `Boost relevance scores by +1 for articles with these keywords.\n\n`;
  }

  // Add categories context if available
  if (context?.categories && context.categories.length > 0) {
    prompt += `=== SOURCE CATEGORIES ===\n`;
    prompt += `Articles pre-filtered to: ${context.categories.join(', ')}\n`;
    prompt += `Categorize your output as: news, business, politics, eu_relations\n\n`;
  }

  // Add client-specific instructions if available
  const clientBrief = client.preferences?.client_brief || client.brief || client.description;
  if (clientBrief) {
    prompt += `=== CLIENT REQUIREMENTS ===\n`;
    prompt += `${clientBrief}\n\n`;
  }

  // Add language requirement
  const language = context?.language || client.preferences?.language || 'en';
  const languageMap = {
    'en': 'English',
    'sv': 'Swedish',
    'no': 'Norwegian',
    'da': 'Danish',
    'fi': 'Finnish'
  };
  const languageName = languageMap[language] || 'English';
  prompt += `=== LANGUAGE ===\n`;
  prompt += `Write all paragraphs in ${languageName}. Translate article content if needed.\n\n`;

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
export async function processBatch({ batch, batchNumber, totalBatches, client, country, context, last_digest, promptTemplate }) {
  console.log(`[BATCH-PROCESSOR] Processing batch ${batchNumber}/${totalBatches} (${batch.length} articles)`);

  const batchPrompt = buildBatchPrompt({
    batch,
    batchNumber,
    totalBatches,
    client,
    country,
    context,  // Pass full client context
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
