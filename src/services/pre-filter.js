/**
 * Pre-Filter Service using Claude Tool Use API
 * Semantically filters articles by topic relevance (Stage 1 of two-stage filtering)
 */

/**
 * Build topic keyword hints for semantic understanding
 * @param {Array<string>} topics - Client topics
 * @returns {string} Keyword hints for the topic
 */
function buildTopicKeywordHints(topics) {
  const hints = {
    'Energy': 'solar, wind, batteries, hydrogen, nuclear, grid, power generation, electric vehicles, energy storage, charging infrastructure, renewable energy, fossil fuels, energy policy, power plants, electricity transmission',
    'Technology': 'software, hardware, AI, machine learning, digital transformation, innovation, startups, tech companies, platforms, SaaS, cloud computing, cybersecurity',
    'Healthcare': 'medical treatments, pharmaceuticals, hospitals, clinical trials, drugs, patient care, health technology, biotechnology, medical devices',
    'Finance': 'banking, investments, stock market, trading, financial services, funds, capital markets, fintech, cryptocurrencies',
    'Politics': 'government policy, elections, legislation, political parties, ministers, parliament, public policy, regulations'
  };

  return topics.map(topic => hints[topic] || topic).join(', ');
}

/**
 * Format articles for pre-filter prompt
 * @param {Array<Object>} articles - Articles to format
 * @returns {string} Formatted article list
 */
function formatArticlesForPreFilter(articles) {
  return articles.map((article, idx) => {
    const id = article.article_id || article.id || `article_${idx + 1}`;
    const title = article.title || 'Untitled';
    const summary = article.summary || 'No summary available';
    const source = article.source_name || article.source || 'Unknown';

    return `[${idx + 1}] ID: ${id}
Title: ${title}
Source: ${source}
Summary: ${summary.substring(0, 300)}
`;
  }).join('\n');
}

/**
 * Build pre-filter prompt
 * @param {Array<Object>} articles - Articles to filter
 * @param {Array<string>} topics - Client topics
 * @param {Array<string>} categories - Source categories (Business, Technology, Politics)
 * @param {string} clientName - Client name
 * @param {number} targetCount - Target number of filtered articles
 * @returns {string} Pre-filter prompt
 */
function buildPreFilterPrompt(articles, topics, categories, clientName, targetCount) {
  const topicList = topics.join(', ');
  const keywordHints = buildTopicKeywordHints(topics);
  const categoryList = categories?.join(', ') || 'all categories';

  return `You are a content curator for ${clientName}, filtering articles by topic relevance.

CLIENT TOPICS: ${topicList}
SOURCE CATEGORIES: ${categoryList}

IMPORTANT CONTEXT:
These articles are already pre-filtered to ${categoryList} categories.
You are looking for ${categoryList} articles ABOUT ${topicList} topics.

Example: If topic is "Energy" and categories are "Business, Technology, Politics":
- ✅ Business article about solar company deals → RELEVANT
- ✅ Technology article about battery innovations → RELEVANT
- ✅ Politics article about energy policy → RELEVANT
- ❌ Business article about pharma company → NOT RELEVANT
- ❌ Banking article (even if company name has "sol") → NOT RELEVANT

You must select the top ${targetCount} articles MOST RELEVANT to these topics using SEMANTIC UNDERSTANDING.

SEMANTIC FILTERING GUIDELINES:

For "${topicList}" topics, look for articles about:
${keywordHints}

IMPORTANT SEMANTIC RULES:
- Use semantic understanding, NOT just keyword matching
- Articles ABOUT ${topicList} companies/developments are relevant
- Articles that MENTION ${topicList} in passing are NOT relevant
- Company names containing topic fragments are NOT automatically relevant
- Context matters (Swedish language ambiguity)

LANGUAGE AWARENESS:
- Articles may be in Swedish/Nordic languages
- Understand Swedish word context: "kraft" (power/force), "vind" (wind/gain), "sol" (sun)
- "Megasol" banking ≠ solar energy (false positive)
- "kraftigt vinst" (significant profit) ≠ power generation (false positive)

RELEVANCE SCORING (0-10):
- 9-10: Directly about ${topicList} with significant developments (solar company deals, nuclear investments)
- 7-8: Clearly related to ${topicList}, newsworthy (battery tech, energy policy)
- 5-6: Tangentially related to ${topicList} (electric vehicle infrastructure, grid tech)
- 3-4: Mentions ${topicList} but not the focus
- 0-2: Unrelated to ${topicList} (pharma, banking, general business)

SELECTION CRITERIA:
- Keep articles scoring 5+ for relevance (inclusive)
- Select up to ${targetCount} articles (can be fewer if not enough are relevant)
- Prioritize higher relevance scores
- Include tangentially related articles (score 5-6) to provide breadth
- Avoid false positives from keyword fragments

ARTICLES TO FILTER (${articles.length} total):

${formatArticlesForPreFilter(articles)}

YOUR TASK:

Use the "filter_articles_by_topic" tool to return the filtered results.

IMPORTANT:
- Select ${categoryList} articles that are ABOUT ${topicList}
- Include direct + tangentially related articles for good coverage
- Reject false positives (wrong topic entirely)
- Provide clear relevance_reason for each article
- Aim for ${targetCount} articles if enough are relevant`;
}

/**
 * Pre-filter articles using Claude Tool Use API
 * @param {Object} options - Pre-filter options
 * @returns {Promise<Array>} Filtered article IDs with scores
 */
export async function preFilterArticles({ articles, topics, categories, clientName, targetCount = 100 }) {
  console.log(`[PRE-FILTER] Starting semantic filtering: ${articles.length} articles → ${targetCount} target`);
  console.log(`[PRE-FILTER] Client: ${clientName}, Topics: ${topics.join(', ')}, Categories: ${categories?.join(', ') || 'all'}`);

  if (!topics || topics.length === 0) {
    console.log(`[PRE-FILTER] No topics specified, skipping pre-filter (returning all articles)`);
    return articles.slice(0, targetCount);
  }

  const startTime = Date.now();

  try {
    // Build prompt with category context
    const prompt = buildPreFilterPrompt(articles, topics, categories, clientName, targetCount);

    // Call Claude API with Tool Use
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4000,
        temperature: 0.1,  // Low temperature for consistent filtering
        tools: [{
          name: 'filter_articles_by_topic',
          description: 'Filter articles to find the most relevant ones for specified topics using semantic understanding',
          input_schema: {
            type: 'object',
            properties: {
              filtered_articles: {
                type: 'array',
                description: 'Array of articles relevant to the client topics',
                items: {
                  type: 'object',
                  properties: {
                    article_id: {
                      type: 'string',
                      description: 'Original article ID from the input list'
                    },
                    relevance_score: {
                      type: 'number',
                      minimum: 0,
                      maximum: 10,
                      description: 'Relevance score 0-10 for this article'
                    },
                    relevance_reason: {
                      type: 'string',
                      maxLength: 150,
                      description: 'Brief explanation of why this article is relevant'
                    }
                  },
                  required: ['article_id', 'relevance_score', 'relevance_reason']
                }
              },
              excluded_count: {
                type: 'number',
                description: 'Number of articles excluded as not relevant'
              },
              filtering_notes: {
                type: 'string',
                description: 'Optional notes about filtering decisions'
              }
            },
            required: ['filtered_articles', 'excluded_count']
          }
        }],
        tool_choice: {
          type: 'tool',
          name: 'filter_articles_by_topic'
        },
        messages: [
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API failed (pre-filter): ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // Extract tool use result
    const toolUseContent = data.content.find(c => c.type === 'tool_use');
    if (!toolUseContent) {
      throw new Error('No tool use in Claude response');
    }

    const filterResult = toolUseContent.input;

    const duration = Date.now() - startTime;
    console.log(`[PRE-FILTER] ✅ Filtered in ${duration}ms: ${filterResult.filtered_articles.length} articles selected, ${filterResult.excluded_count} excluded`);

    if (filterResult.filtering_notes) {
      console.log(`[PRE-FILTER] Notes: ${filterResult.filtering_notes}`);
    }

    // Map filtered article IDs back to original article objects
    const filteredIds = filterResult.filtered_articles.map(fa => fa.article_id);
    const filteredArticles = articles.filter(article => {
      const id = article.article_id || article.id;
      return filteredIds.includes(id);
    });

    // Add relevance scores from pre-filter to articles
    filteredArticles.forEach(article => {
      const id = article.article_id || article.id;
      const filterData = filterResult.filtered_articles.find(fa => fa.article_id === id);
      if (filterData) {
        article.pre_filter_score = filterData.relevance_score;
        article.pre_filter_reason = filterData.relevance_reason;
      }
    });

    console.log(`[PRE-FILTER] Returning ${filteredArticles.length} semantically filtered articles`);

    return filteredArticles;

  } catch (error) {
    console.error(`[PRE-FILTER] ❌ Error:`, error.message);
    throw error;
  }
}
