
import * as coda from '@codahq/packs-sdk';

export const pack = coda.newPack();

const DEFAULT_MODEL = 'text-ada-001';

pack.setUserAuthentication({
  type: coda.AuthenticationType.HeaderBearerToken,
  instructionsUrl: 'https://platform.openai.com/account/api-keys',
});

pack.addNetworkDomain('openai.com');

interface CompletionsRequest {
  model: string;
  prompt: string;
  max_tokens?: number;
  temperature?: number;
  stop?: string[];
}

interface ChatCompletionMessage {
  role: 'system' | 'user';
  content: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatCompletionMessage[];
  max_tokens?: number;
  temperature?: number;
  stop?: string[];
}

function isChatCompletionModel(model: string): boolean {
  // Also works with snapshot model like `gpt-3.5-turbo-0301` & `gpt-4-0314`
  return model.includes('gpt-3.5-turbo') || model.includes('gpt-4');
}

async function getChatCompletion(context: coda.ExecutionContext, request: ChatCompletionRequest): Promise<string> {
  const resp = await context.fetcher.fetch({
    url: 'https://api.openai.com/v1/chat/completions',
    method: 'POST',
    body: JSON.stringify(request),
    headers: {'Content-Type': 'application/json'},
  });
  return resp.body.choices[0].message.content.trim();
}

async function getCompletion(context: coda.ExecutionContext, request: CompletionsRequest): Promise<string> {
  try {
    // Call Chat Completion API if the model is a chat completion model.
    if (isChatCompletionModel(request.model)) {
      return getChatCompletion(context, {
        model: request.model,
        max_tokens: request.max_tokens,
        temperature: request.temperature,
        messages: [{role: 'user', content: request.prompt}],
      });
    }

    const resp = await context.fetcher.fetch({
      url: 'https://api.openai.com/v1/completions',
      method: 'POST',
      body: JSON.stringify(request),
      headers: {'Content-Type': 'application/json'},
    });
    return resp.body.choices[0].text.trim();
  } catch (err: any) {
    if (err.statusCode === 429 && err.type === 'insufficient_quota') {
      throw new coda.UserVisibleError(
        "You've exceed your current OpenAI API quota. Please check your plan and billing details. For help, see https://help.openai.com/en/articles/6891831-error-code-429-you-exceeded-your-current-quota-please-check-your-plan-and-billing-details",
      );
    }

    throw err;
  }
}

const promptParam = coda.makeParameter({
  type: coda.ParameterType.String,
  name: 'prompt',
  description: 'prompt',
});

const modelParameter = coda.makeParameter({
  type: coda.ParameterType.String,
  name: 'model',
  description:
    "the GPT-3 model to process your request. If you don't specify a model, it defaults to text-ada-001, which is the fastest and lowest cost. For higher quality generation, consider text-davinci-003. For more information, see https://platform.openai.com/docs/models/overview.",
  optional: true,
  autocomplete: async () => {
    return [
      'text-davinci-003',
      'text-davinci-002',
      'text-curie-001',
      'text-babbage-001',
      'text-ada-001',
      'gpt-3.5-turbo',
      'gpt-3.5-turbo-16k',
      'gpt-4',
      'gpt-4-32k',
    ];
  },
});

const numTokensParam = coda.makeParameter({
  type: coda.ParameterType.Number,
  name: 'numTokens',
  description:
    'the maximum number of tokens for the completion to output. Defaults to 512. Maximum of 2048 for most models and 4000 for davinci',
  optional: true,
});

const temperatureParam = coda.makeParameter({
  type: coda.ParameterType.Number,
  name: 'temperature',
  description:
    'the temperature for how creative GPT-3 is with the completion. Must be between 0.0 and 1.0. Defaults to 1.0.',
  optional: true,
});

const systemPromptParam = coda.makeParameter({
  type: coda.ParameterType.String,
  name: 'systemPrompt',
  description: "Optional. Helps define the behavior of the assistant. e.g. 'You are a helpful assistant.'",
  optional: true,
});

const stopParam = coda.makeParameter({
  type: coda.ParameterType.StringArray,
  name: 'stop',
  description: 'Optional. Up to 4 sequences where the API will stop generating further tokens.',
  optional: true,
});

const commonPromptParams = {
  parameters: [promptParam, modelParameter, numTokensParam, temperatureParam, stopParam],
  resultType: coda.ValueType.String,
  onError: handleError,
  execute: async function ([prompt, model = DEFAULT_MODEL, max_tokens = 512, temperature, stop], context) {
    if (prompt.length === 0) {
      return '';
    }

    const request = {
      model,
      prompt,
      max_tokens,
      temperature,
      stop,
    };

    const result = await getCompletion(context, request);
    return result;
  },
};

pack.addFormula({
  name: 'ChatCompletion',
  description:
    'Takes prompt as input, and return a model-generated message as output. Optionally, you can provide a system message to control the behavior of the chatbot.',
  parameters: [promptParam, systemPromptParam, modelParameter, numTokensParam, temperatureParam, stopParam],
  resultType: coda.ValueType.String,
  onError: handleError,
  execute: async function (
    [userPrompt, systemPrompt, model = 'gpt-3.5-turbo', maxTokens = 512, temperature, stop],
    context,
  ) {
    coda.assertCondition(isChatCompletionModel(model), 'Must use `gpt-3.5-turbo`-related models for this formula.');

    if (userPrompt.length === 0) {
      return '';
    }

    const messages: ChatCompletionMessage[] = [];

    if (systemPrompt && systemPrompt.length > 0) {
      messages.push({role: 'system', content: systemPrompt});
    }

    messages.push({role: 'user', content: userPrompt});

    const request = {
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stop,
    };