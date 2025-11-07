/**
 * Anthropic API Client
 * Handles calls to Claude API for digest generation
 */

export async function callAnthropicAPI({ prompt, model = 'claude-haiku-4-5-20251001', max_tokens = 4000, temperature = 0.7 }) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured in environment');
  }

  console.log('[ANTHROPIC] Calling API with model:', model);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens,
      temperature,
      messages: [{
        role: 'user',
        content: prompt
      }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[ANTHROPIC] Error response:', response.status, errorText);
    throw new Error(`Anthropic API failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('[ANTHROPIC] Response received, processing...');

  return data;
}

/**
 * Parse JSON response from Claude
 * Handles both raw JSON and JSON wrapped in markdown code blocks
 */
export function parseClaudeJSON(responseText) {
  let jsonText = responseText;

  // Check if response is wrapped in markdown code block
  const codeBlockMatch = responseText.match(/```json\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    jsonText = codeBlockMatch[1];
  } else {
    // Also try plain ```
    const plainBlockMatch = responseText.match(/```\n?([\s\S]*?)\n?```/);
    if (plainBlockMatch) {
      jsonText = plainBlockMatch[1];
    }
  }

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    console.error('[ANTHROPIC] Failed to parse JSON:', error.message);
    throw new Error(`Failed to parse Claude response as JSON: ${error.message}`);
  }
}
