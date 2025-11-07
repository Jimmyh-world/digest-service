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
  let aiText = responseText.trim();

  console.log('[PARSE] Input length:', aiText.length);
  console.log('[PARSE] First 100 chars:', aiText.substring(0, 100));

  // Remove markdown code blocks if present (simple string operations)
  // Remove opening ```json or ```
  if (aiText.startsWith('```json')) {
    aiText = aiText.substring(7).trim(); // Remove ```json
    console.log('[PARSE] Removed opening ```json');
  } else if (aiText.startsWith('```')) {
    aiText = aiText.substring(3).trim(); // Remove ```
    console.log('[PARSE] Removed opening ```');
  }

  // Remove closing ```
  if (aiText.endsWith('```')) {
    aiText = aiText.substring(0, aiText.length - 3).trim();
    console.log('[PARSE] Removed closing ```');
  }

  console.log('[PARSE] After stripping, length:', aiText.length);
  console.log('[PARSE] First 100 after strip:', aiText.substring(0, 100));

  let digestData;
  try {
    digestData = JSON.parse(aiText);
    console.log('[PARSE] ✅ Successfully parsed JSON');
    return digestData;
  } catch (parseError) {
    console.error('[PARSE] ❌ Failed to parse AI JSON response:', parseError.message);
    console.error('[PARSE] Text being parsed (first 300):', aiText.substring(0, 300));
    console.error('[PARSE] Text being parsed (last 100):', aiText.substring(aiText.length - 100));
    throw new Error('AI did not return valid JSON');
  }
}
