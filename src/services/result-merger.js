/**
 * Result Merger Service
 * Merges batch processing results into final digest
 */

/**
 * Merge batch results into final digest structure
 * @param {Array<Object>} batchResults - Results from all batches
 * @param {Object} client - Client information
 * @param {Object} last_digest - Previous digest for context
 * @returns {Object} Final merged digest
 */
export function mergeBatchResults(batchResults, client, last_digest) {
  console.log(`[RESULT-MERGER] Merging ${batchResults.length} batch results`);

  // Collect all filtered articles from all batches
  const allFilteredArticles = [];
  let totalSkipped = 0;
  let totalDuplicates = 0;

  batchResults.forEach(result => {
    if (result.articles && Array.isArray(result.articles)) {
      allFilteredArticles.push(...result.articles);
    }
    totalSkipped += result.skipped || 0;
    totalDuplicates += result.duplicates || 0;
  });

  console.log(`[RESULT-MERGER] Total filtered articles: ${allFilteredArticles.length}`);
  console.log(`[RESULT-MERGER] Total skipped: ${totalSkipped}`);
  console.log(`[RESULT-MERGER] Total duplicates: ${totalDuplicates}`);

  // Sort articles by relevance score (highest first)
  allFilteredArticles.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));

  // Categorize into sections
  const sections = categorizeArticles(allFilteredArticles);

  // Build final digest structure
  const digest = {
    report: {
      metadata: {
        generated_at: new Date().toISOString(),
        articles_reviewed: batchResults.reduce((sum, r) => sum + (r.articles?.length || 0) + (r.skipped || 0), 0),
        articles_included: allFilteredArticles.length,
        main_stories: sections.main.length,
        b_side_stories: sections.b_side.length,
        duplicates_removed: totalDuplicates,
        batches_processed: batchResults.length
      },
      main_stories: sections.main,  // Top-level array for frontend
      sections: {
        news: sections.main.filter(a => a.category === 'news'),
        business: sections.main.filter(a => a.category === 'business'),
        politics: sections.main.filter(a => a.category === 'politics'),
        eu_relations: sections.main.filter(a => a.category === 'eu_relations')
      },
      b_side: {
        news: sections.b_side.filter(a => a.category === 'news'),
        business: sections.b_side.filter(a => a.category === 'business'),
        politics: sections.b_side.filter(a => a.category === 'politics'),
        eu_relations: sections.b_side.filter(a => a.category === 'eu_relations')
      }
    },
    email: generateEmailSummary(sections, client)
  };

  return digest;
}

/**
 * Categorize articles into main and b_side
 * @param {Array<Object>} articles - Filtered articles
 * @returns {Object} Categorized articles
 */
function categorizeArticles(articles) {
  const main = articles.filter(a => a.priority === 'main');
  const b_side = articles.filter(a => a.priority === 'b_side');

  return { main, b_side };
}

/**
 * Generate email summary from sections
 * @param {Object} sections - Categorized sections
 * @param {Object} client - Client information
 * @returns {Object} Email object
 */
function generateEmailSummary(sections, client) {
  const topStories = sections.main.slice(0, 3);

  const highlights = topStories.map(story =>
    `${story.title}${story.continued_from_previous ? ' (Continued)' : ''}`
  );

  // Simple email template
  const bodyHtml = `
    <p>Dear ${client.name},</p>
    <p>Here are today's key developments:</p>
    <ul>
      ${highlights.map(h => `<li>${h}</li>`).join('\n      ')}
    </ul>
    <p>Best regards,<br>Mundus Digest Team</p>
  `;

  return {
    subject: `${client.name} Digest: ${topStories[0]?.title || 'Daily Update'}`,
    body_html: bodyHtml.trim(),
    key_highlights: highlights
  };
}
