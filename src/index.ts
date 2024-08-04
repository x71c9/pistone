/**
 *
 * Index
 *
 */

import OpenAI from 'openai';
import exp from '3xp';
import {log} from './log/index';
import * as prompts from './prompts/index';

const openai = new OpenAI();

type Recommendations = {
  good_aspects: string[];
  bad_aspects: string[];
};

type EvaluatedResponse = Recommendations & {
  score: number;
};

type ImprovedPromptResult = EvaluatedResponse & {
  prompt: string;
};

export async function main() {
  const input_prompt = await prompts.read('../input');
  const improved_prompt_result = await _itarate_autoimprove_prompt(
    input_prompt,
    3,
    2
  );
  console.log(improved_prompt_result);
}

main().then(() => console.log('DONE'));

async function _itarate_autoimprove_prompt(
  input_prompt: string,
  iteration: number,
  alternative_quantity: number
) {
  let current_prompt = input_prompt;
  let response;
  let max_score = 0;
  let recommendations;
  for (let i = 0; i < iteration; i++) {
    log.debug(`************************************************************`);
    log.debug(`Iteration ${i} started...`);
    response = await _autoimprove_prompt(
      current_prompt,
      alternative_quantity,
      recommendations
    );
    if (response.score > max_score) {
      max_score = response.score;
      current_prompt = response.prompt;
      recommendations = {
        good_aspects: response.good_aspects,
        bad_aspects: response.bad_aspects,
      };
    }
  }
  return response;
}

async function _autoimprove_prompt(
  input_prompt: string,
  alternative_quantity: number,
  recommendations?: Recommendations
): Promise<ImprovedPromptResult> {
  log.trace(`Autoimproving prompt...`);
  const improved_prompts = await _improve_prompt(
    input_prompt,
    alternative_quantity,
    recommendations
  );
  const scores: number[] = [];
  const evaluated_responses: EvaluatedResponse[] = [];
  for (const improved_prompt of improved_prompts) {
    log.trace('-------------------------------------------------------------');
    log.trace(improved_prompt);
    const result = await _test_prompt(improved_prompt);
    log.debug(`Generated result:\n${result}`);
    const evaluated_response = await _evaluate_result(result, improved_prompt);
    log.info(`Evaluated result score: ${evaluated_response.score}`);
    scores.push(evaluated_response.score);
    evaluated_responses.push(evaluated_response);
  }
  const best_score_index = _resolve_best_score_index(scores);
  const improved_prompt_result: ImprovedPromptResult = {
    prompt: improved_prompts[best_score_index]!,
    ...evaluated_responses[best_score_index]!,
  };
  return improved_prompt_result;
}

async function _test_prompt(prompt: string) {
  log.trace(`Testing prompt...`);
  const user_prompt = await _generate_user_prompt_example(prompt);
  log.debug(`Generated user input example:\n${user_prompt}`);
  const response = await _ask_openai(prompt, user_prompt);
  return response;
}

async function _generate_user_prompt_example(prompt: string): Promise<string> {
  const user_input_system_prompt = await prompts.read('user-input-system');
  const user_input_user_prompt = await prompts.read('user-input-user', {
    prompt,
  });
  const response = await _ask_openai(
    user_input_system_prompt,
    user_input_user_prompt
  );
  return response;
}

async function _evaluate_result(
  result: string,
  prompt: string
): Promise<EvaluatedResponse> {
  const evaluate_system_prompt = await prompts.read('evaluate-system');
  const evaluate_user_prompt = await prompts.read('evaluate-user', {
    result,
    prompt,
  });
  const response = await _ask_openai(
    evaluate_system_prompt,
    evaluate_user_prompt
  );
  const parsed_response = _autocorrect_parse_JSON(response);
  _validate_evaluated_response(parsed_response);
  return parsed_response;
}

function _validate_evaluated_response(
  response: unknown
): asserts response is EvaluatedResponse {
  exp.asserts(response, {
    primitive: 'object',
    properties: {
      score: 'number',
      good_aspects: {
        primitive: 'array',
        item: 'string',
      },
      bad_aspects: {
        primitive: 'array',
        item: 'string',
      },
    },
  });
}

async function _improve_prompt(
  input_prompt: string,
  output_quantity: number,
  recommendations?: Recommendations
): Promise<string[]> {
  const improve_prompt = await prompts.read('improve');
  const user_prompt = await _resolve_improved_prompt_user_prompt(
    input_prompt,
    output_quantity,
    recommendations
  );
  const response = await _ask_openai(improve_prompt, user_prompt, 1.2);
  const parsed_response = _autocorrect_parse_JSON(response);
  const improved_prompts: string[] = [];
  for (const [_key, value] of Object.entries(parsed_response)) {
    if (typeof value !== 'string') {
      log.error(parsed_response);
      throw new Error(`Invalid improved prompt`);
    }
    improved_prompts.push(value);
  }
  return improved_prompts;
}

async function _resolve_improved_prompt_user_prompt(
  input_prompt: string,
  output_quantity: number,
  recommendations?: Recommendations
): Promise<string> {
  let user_prompt = '';
  user_prompt += `Generate ${output_quantity} improved prompts for the`;
  user_prompt += ` following prompt:\n\n`;
  user_prompt += `<INPUT_PROMPT>\n`;
  user_prompt += `${input_prompt}\n`;
  user_prompt += `</INPUT_PROMPT>\n`;
  if (recommendations) {
    user_prompt += `Considering this feedback:\n`;
    if (recommendations.good_aspects) {
      user_prompt += `**Good aspects**:\n`;
      user_prompt += `${recommendations.good_aspects.join('\n')}`;
      user_prompt += `\n\n`;
    }
    if (recommendations.bad_aspects) {
      user_prompt += `**Bad aspects**:\n`;
      user_prompt += `${recommendations.bad_aspects.join('\n')}`;
      user_prompt += `\n\n`;
    }
  }
  return user_prompt;
}

async function _ask_openai(
  system_prompt: string,
  user_prompt: string,
  temperature = 1
) {
  const openai_response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    // max_tokens: 4096,
    max_tokens: 16384,
    messages: [
      {
        role: 'system',
        content: system_prompt,
      },
      {
        role: 'user',
        content: user_prompt,
      },
    ],
    temperature,
  });
  const text_resopnse = _resolve_text(openai_response);
  return text_resopnse;
}

function _resolve_text(
  openai_response: OpenAI.Chat.Completions.ChatCompletion
): string {
  const text = openai_response.choices[0];
  if (!text || !text.message.content) {
    console.error(openai_response);
    throw new Error(`OpenAI Response is empty`);
  }
  return text.message.content;
}

function _resolve_best_score_index(scores: number[]) {
  return scores.indexOf(Math.max(...scores));
}

function _autocorrect_parse_JSON(jsonString: string): any {
  // Step 1: Remove any unwanted formatting like ```json, ```, {{, }}
  jsonString = jsonString.trim(); // Remove leading/trailing spaces
  // Remove ```json and ```
  if (jsonString.startsWith('```json')) {
    jsonString = jsonString.substring(7);
  }
  if (jsonString.endsWith('```')) {
    jsonString = jsonString.substring(0, jsonString.length - 3);
  }
  // Remove {{ and }}
  jsonString = jsonString.replace(/^\s*\{\{/, '{');
  jsonString = jsonString.replace(/\}\}\s*$/, '}');
  // Step 2: Attempt to parse the JSON
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Initial JSON parsing failed, attempting to autocorrect...');
    // Step 3: Fix common issues like missing commas, trailing commas, and unquoted keys
    // Add quotes to keys (this is a basic approach and may need refinement for edge cases)
    jsonString = jsonString.replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":');
    // Add commas between adjacent braces or brackets (this assumes that missing commas are the problem)
    jsonString = jsonString.replace(/}\s*{/g, '},{');
    jsonString = jsonString.replace(/]\s*\[/g, '],[');
    // Remove trailing commas
    jsonString = jsonString.replace(/,\s*([}\]])/g, '$1');
    // Try parsing again
    try {
      return JSON.parse(jsonString);
    } catch (finalError) {
      console.error('Failed to parse JSON after autocorrection attempts.');
      throw finalError;
    }
  }
}
