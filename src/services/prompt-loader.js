/**
 * Prompt Loader Service
 * Loads prompts from Supabase and handles variable interpolation
 */

import { createClient } from '@supabase/supabase-js';

let supabaseClient = null;

function getSupabaseClient() {
  if (!supabaseClient) {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase credentials not configured');
    }

    supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  }

  return supabaseClient;
}

/**
 * Load prompt from Supabase
 * @param {string} promptName - Name of prompt to load (e.g., 'mundus-multi-article-digest')
 * @returns {Promise<Object>} Prompt object with template and variables
 */
export async function loadPrompt(promptName) {
  const supabase = getSupabaseClient();

  console.log(`[PROMPT-LOADER] Loading prompt: ${promptName}`);

  const { data, error } = await supabase
    .from('prompts')
    .select('*')
    .eq('name', promptName)
    .single();

  if (error) {
    console.error('[PROMPT-LOADER] Error loading prompt:', error);
    throw new Error(`Failed to load prompt '${promptName}': ${error.message}`);
  }

  if (!data) {
    throw new Error(`Prompt '${promptName}' not found in database`);
  }

  console.log(`[PROMPT-LOADER] Loaded prompt: ${promptName}`);
  return data;
}

/**
 * Load client details from Supabase
 * @param {string} clientId - Client ID
 * @returns {Promise<Object>} Client details
 */
export async function loadClient(clientId) {
  const supabase = getSupabaseClient();

  console.log(`[PROMPT-LOADER] Loading client: ${clientId}`);

  const { data, error } = await supabase
    .from('digest_clients')
    .select('*')
    .eq('id', clientId)
    .single();

  if (error) {
    console.error('[PROMPT-LOADER] Error loading client:', error);
    throw new Error(`Failed to load client '${clientId}': ${error.message}`);
  }

  if (!data) {
    throw new Error(`Client '${clientId}' not found in database`);
  }

  console.log(`[PROMPT-LOADER] Loaded client: ${data.name || clientId}`);
  return data;
}

/**
 * Load prompt variables from Supabase
 * @returns {Promise<Array>} Array of variable definitions
 */
export async function loadPromptVariables() {
  const supabase = getSupabaseClient();

  console.log(`[PROMPT-LOADER] Loading prompt variables`);

  const { data, error } = await supabase
    .from('prompt_variables')
    .select('*');

  if (error) {
    console.warn('[PROMPT-LOADER] Warning loading variables:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Interpolate variables into prompt template
 * @param {string} template - Template string
 * @param {Object} variables - Variables to interpolate
 * @returns {string} Interpolated template
 */
export function interpolateTemplate(template, variables) {
  let result = template;

  // Replace all {{variable}} patterns
  Object.entries(variables).forEach(([key, value]) => {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    const stringValue = value === null || value === undefined ? '' : String(value);
    result = result.replace(pattern, stringValue);
  });

  return result;
}

/**
 * Build interpolation variables for prompt
 * @param {Object} client - Client object from Supabase
 * @param {Array<Object>} articles - Articles array
 * @param {string} country - Country name
 * @returns {Object} Variables for interpolation
 */
export function buildInterpolationVariables(client, articles, country) {
  return {
    client_name: client.name || '',
    client_brief: client.brief || client.description || '',
    country: country || '',
    articles: articles.map(a => `- ${a.title} (${a.source})`).join('\n'),
    article_count: articles.length.toString(),
    article_titles: articles.map(a => a.title).join(', '),
    article_sources: Array.from(new Set(articles.map(a => a.source))).join(', ')
  };
}
