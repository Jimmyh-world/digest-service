/**
 * Anthropic API Client
 */

export async function callAnthropicAPI({ prompt, model = 'claude-haiku-4-5-20251001', max_tokens = 4000, temperature = 0.7 }) {
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

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
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log('[ANTHROPIC] Response received');
  return data;
}

export function parseClaudeJSON(responseText) {
  let text = responseText.trim();
  
  console.log('[PARSE] Input length:', text.length);
  console.log('[PARSE] First 100 chars:', JSON.stringify(text.substring(0, 100)));
  
  // Try to strip markdown - multiple attempts
  const patterns = [
    /```json\s*([\s\S]*?)\s*```/,
    /```\s*([\s\S]*?)\s*```/,
    /```(?:json)?\s*(\{[\s\S]*\})\s*```/
  ];
  
  let extracted = null;
  for (let i = 0; i < patterns.length; i++) {
    const match = text.match(patterns[i]);
    if (match) {
      extracted = match[1].trim();
      console.log(`[PARSE] Matched pattern ${i}, extracted ${extracted.length} chars`);
      break;
    }
  }
  
  const jsonText = extracted || text;
  console.log('[PARSE] Parsing:', JSON.stringify(jsonText.substring(0, 50)));
  
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    console.error('[PARSE] FAILED:', error.message);
    throw new Error(`JSON parse failed: ${error.message}`);
  }
}
