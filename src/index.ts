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

type EvaluatedResponse = {
  score: number;
  good_aspects: string;
  bad_aspects: string;
};

type ImprovedPromptResult = EvaluatedResponse & {
  prompt: string;
};

export async function main() {
  const input_prompt = await prompts.read('input');
  const improved_prompt_result = await _itarate_autoimprove_prompt(
    input_prompt,
    3
  );
  console.log(improved_prompt_result);
}

main().then(() => console.log('DONE'));

async function _itarate_autoimprove_prompt(
  input_prompt: string,
  iteration: number
) {
  let current_prompt = input_prompt;
  let response;
  for (let i = 0; i < iteration; i++) {
    response = await _autoimprove_prompt(current_prompt);
    current_prompt = response.prompt;
  }
  return response;
}

async function _autoimprove_prompt(
  input_prompt: string
): Promise<ImprovedPromptResult> {
  const improved_prompts = await _improve_prompt(input_prompt, 2);
  const scores: number[] = [];
  const evaluated_responses: EvaluatedResponse[] = [];
  for (const improved_prompt of improved_prompts) {
    const result = await _test_prompt(improved_prompt);
    const evaluated_response = await _evaluate_result(result, improved_prompt);
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
  const user_prompt = await _generate_user_prompt_example(prompt);
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
  const parsed_response = JSON.parse(response);
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
  output_quantity: number
): Promise<string[]> {
  const improve_prompt = await prompts.read('improve');
  const user_prompt = await _resolve_improved_prompt_user_prompt(
    input_prompt,
    output_quantity
  );
  log.info(improve_prompt);
  log.debug(user_prompt);
  const response = await _ask_openai(improve_prompt, user_prompt);
  const parsed_response = JSON.parse(response);
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
  output_quantity: number
): Promise<string> {
  let user_prompt = '';
  user_prompt += `Generate ${output_quantity} improved prompts for the`;
  user_prompt += ` following prompt:\n\n`;
  user_prompt += `<INPUT_PROMPT>\n`;
  user_prompt += `${input_prompt}\n`;
  user_prompt += `</INPUT_PROMPT>\n`;
  return user_prompt;
}

async function _ask_openai(system_prompt: string, user_prompt: string) {
  log.trace(`Asking OpenAI...`);
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
  });
  const text_resopnse = _resolve_text(openai_response);
  log.debug(text_resopnse);
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
  // log.trace(text.message.content);
  return text.message.content;
}

function _resolve_best_score_index(scores: number[]) {
  return scores.indexOf(Math.max(...scores));
}
