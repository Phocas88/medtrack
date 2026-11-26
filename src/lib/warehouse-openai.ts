import 'server-only';

export async function askOpenAI(key: string, instructions: string, input: string, schema?: object) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4.1-mini', instructions, input, store: false, max_output_tokens: 600,
      ...(schema && { text: { format: {
        type: 'json_schema', name: 'warehouse_response', strict: true, schema,
      } } }),
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error('OpenAI request failed.');
  const body = await response.json();
  const message = body.output?.find((item: { type: string }) => item.type === 'message');
  const text = message?.content?.find((item: { type: string }) => item.type === 'output_text')?.text;
  if (typeof text !== 'string' || !text) throw new Error('OpenAI returned no answer.');
  return text;
}
