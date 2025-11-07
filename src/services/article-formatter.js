/**
 * Article Formatter Service
 * Formats articles for use in AI prompts
 */

/**
 * Format articles for AI prompt input
 * @param {Array<Object>} articles - Array of article objects
 * @returns {string} Formatted articles text
 */
export function formatArticlesForPrompt(articles) {
  if (!articles || articles.length === 0) {
    return '';
  }

  return articles
    .map((article, index) => {
      const title = article.title || 'Untitled';
      const source = article.source || 'Unknown Source';
      const content = article.content || article.text || article.description || '';
      const url = article.url || '';
      const published = article.published_at || article.publishedAt || '';

      let formatted = `Article ${index + 1}: ${title}\n`;
      formatted += `Source: ${source}\n`;

      if (url) {
        formatted += `URL: ${url}\n`;
      }

      if (published) {
        formatted += `Published: ${published}\n`;
      }

      if (content) {
        // Truncate very long content
        const maxLength = 1000;
        const truncatedContent = content.length > maxLength
          ? content.substring(0, maxLength) + '...'
          : content;
        formatted += `\nContent:\n${truncatedContent}\n`;
      }

      formatted += '\n---\n';

      return formatted;
    })
    .join('\n');
}

/**
 * Extract article metadata for response
 * @param {Array<Object>} articles - Array of article objects
 * @returns {Array<Object>} Processed article metadata
 */
export function extractArticleMetadata(articles) {
  return articles.map(article => ({
    title: article.title || 'Untitled',
    source: article.source || 'Unknown',
    url: article.url || null,
    published_at: article.published_at || article.publishedAt || null
  }));
}

/**
 * Validate article structure
 * @param {Object} article - Article object to validate
 * @returns {boolean} True if article has minimum required fields
 */
export function isValidArticle(article) {
  return article &&
    typeof article === 'object' &&
    (article.title || article.content || article.text);
}

/**
 * Filter valid articles from input array
 * @param {Array<Object>} articles - Articles to filter
 * @returns {Array<Object>} Valid articles only
 */
export function filterValidArticles(articles) {
  const validArticles = articles.filter(isValidArticle);

  if (validArticles.length < articles.length) {
    console.log(`[ARTICLE-FORMATTER] Filtered ${articles.length - validArticles.length} invalid articles`);
  }

  return validArticles;
}

/**
 * Prepare articles summary
 * @param {Array<Object>} articles - Articles to summarize
 * @returns {Object} Summary object
 */
export function getArticlesSummary(articles) {
  const sources = {};
  articles.forEach(article => {
    const source = article.source || 'Unknown';
    sources[source] = (sources[source] || 0) + 1;
  });

  return {
    total_count: articles.length,
    sources,
    source_list: Object.keys(sources),
    source_count: Object.keys(sources).length
  };
}
