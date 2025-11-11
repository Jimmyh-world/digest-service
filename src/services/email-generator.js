/**
 * Email Generator Service using Claude Tool Use API
 * Generates personalized email subject and body for digest delivery
 */

/**
 * Build email generation prompt
 * @param {Object} digest - Generated digest content
 * @param {Object} client - Client information
 * @param {Object} context - Client context (topics, language, etc)
 * @returns {string} Email generation prompt
 */
function buildEmailPrompt(digest, client, context) {
  const language = context?.language || 'en';
  const languageMap = {
    'en': 'English',
    'sv': 'Swedish',
    'no': 'Norwegian',
    'da': 'Danish',
    'fi': 'Finnish'
  };
  const languageName = languageMap[language] || 'English';
  const topics = context?.topics || [];
  const topicList = topics.join(', ');

  // Extract main story titles for context
  const mainStories = digest.report.main_stories || [];
  const storyTitles = mainStories.slice(0, 5).map((s, i) => `${i + 1}. ${s.title}`).join('\n');

  return `You are writing a personalized email to accompany a digest report.

CLIENT INFORMATION:
- Name: ${client.name}
- Topics of Interest: ${topicList || 'General news'}
- Language: ${languageName}
- Organization: ${client.organization || 'Not specified'}

DIGEST CONTENT:
The digest contains ${mainStories.length} main stories about ${topicList}:

${storyTitles}

YOUR TASK:

Generate a compelling, personalized email using the "generate_digest_email" tool.

REQUIREMENTS:

1. SUBJECT LINE (max 60 characters):
   - Mention the key topic: ${topicList}
   - Make it compelling and specific
   - Reference the most significant story if space allows
   - Examples (for Energy topic):
     * "Your Energy Digest: Nuclear investments surge in Sweden"
     * "Energy Update: Solar deals & new reactor announcements"
     * "Swedish Energy News: Major developments this week"

2. EMAIL BODY (2-3 paragraphs in HTML):

   Paragraph 1 - Greeting + Key Theme:
   - Professional greeting: "Dear ${client.name},"
   - Identify this week/day's key theme in ${topicList}
   - Example: "This week brings significant developments in Sweden's energy sector,
     with major investments in both solar and nuclear power."

   Paragraph 2 - Highlights (3-4 bullets):
   - List 3-4 key story highlights from the digest
   - Keep bullets concise (one line each)
   - Focus on what matters to ${topicList} interests

   Paragraph 3 - Call to Action:
   - Encourage engagement: "We'd love to hear your thoughts on these developments."
   - Feedback request: "Reply to this email with your feedback or questions."
   - Professional close: "Best regards,\\nThe Mundus Team"

3. KEY HIGHLIGHTS (array of strings):
   - Extract 3-4 most compelling points from the stories
   - Each highlight should be one sentence
   - Focus on impact and significance

TONE:
- Professional but warm
- Client-focused (emphasize relevance to their interests)
- Concise and scannable
- Appropriate for ${client.organization || 'institutional'} audience

LANGUAGE:
- Write EVERYTHING in ${languageName}
- Translate story titles if needed
- Natural, fluent ${languageName}

IMPORTANT:
- Keep subject line under 60 characters
- Use HTML tags for body: <p>, <ul>, <li>, <br>
- Make it personal to ${client.name} and their ${topicList} interests
- Encourage reply/feedback`;
}

/**
 * Generate personalized email using Claude Tool Use API
 * @param {Object} options - Email generation options
 * @returns {Promise<Object>} Generated email with subject and body
 */
export async function generateDigestEmail({ digest, client, context }) {
  console.log(`[EMAIL-GEN] Generating personalized email for ${client.name}`);
  console.log(`[EMAIL-GEN] Topics: ${context?.topics?.join(', ') || 'none'}, Language: ${context?.language || 'en'}`);

  const startTime = Date.now();

  try {
    // Build prompt
    const prompt = buildEmailPrompt(digest, client, context);

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
        max_tokens: 1500,
        temperature: 0.3,  // Slightly higher for creative email writing
        tools: [{
          name: 'generate_digest_email',
          description: 'Generate a personalized email to accompany a digest report',
          input_schema: {
            type: 'object',
            properties: {
              subject: {
                type: 'string',
                description: 'Compelling email subject line (max 60 characters)',
                maxLength: 60
              },
              body_html: {
                type: 'string',
                description: 'Email body in HTML format with 2-3 paragraphs'
              },
              key_highlights: {
                type: 'array',
                description: 'Array of 3-4 key highlights from the digest',
                items: {
                  type: 'string'
                },
                minItems: 3,
                maxItems: 4
              }
            },
            required: ['subject', 'body_html', 'key_highlights']
          }
        }],
        tool_choice: {
          type: 'tool',
          name: 'generate_digest_email'
        },
        messages: [
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API failed (email generation): ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // Extract tool use result
    const toolUseContent = data.content.find(c => c.type === 'tool_use');
    if (!toolUseContent) {
      throw new Error('No tool use in Claude response');
    }

    const emailData = toolUseContent.input;

    const duration = Date.now() - startTime;
    console.log(`[EMAIL-GEN] ✅ Email generated in ${duration}ms`);
    console.log(`[EMAIL-GEN] Subject: "${emailData.subject}" (${emailData.subject.length} chars)`);
    console.log(`[EMAIL-GEN] Highlights: ${emailData.key_highlights.length}`);

    return emailData;

  } catch (error) {
    console.error(`[EMAIL-GEN] ❌ Error:`, error.message);
    throw error;
  }
}
