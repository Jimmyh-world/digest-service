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
 * Pattern copied from working edge function (generate-mundus-digest)
 */
export function parseClaudeJSON(responseText) {
  let aiText = responseText.trim();

  // Strip markdown code blocks if present (EXACT pattern from edge function)
  const jsonMatch = aiText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
  if (jsonMatch) {
    aiText = jsonMatch[1];
  }

  try {
    return JSON.parse(aiText);
  } catch (parseError) {
    console.error('[ANTHROPIC] Failed to parse JSON:', parseError.message);
    console.error('[ANTHROPIC] Response starts with:', aiText.substring(0, 100));
    throw new Error(`Failed to parse Claude response as JSON: ${parseError.message}`);
  }
}
