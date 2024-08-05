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

const batch_requests_delay = 500;

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
  const input_prompt = await prompts.read('../input-prompt');
  const input_goal = await prompts.read('../input-goal');
  const improved_prompt_result = await _itarate_autoimprove_prompt({
    first_intent: input_prompt,
    input_goal,
    input_prompt,
    iteration: 4,
    alternative_quantity: 3,
  });
  log.info(`\nScore:`);
  log.debug(`${improved_prompt_result.score}\n`);
  log.info(`Bad aspect:`);
  log.debug(
    `${improved_prompt_result.recommendations?.bad_aspects.join('\n')}\n`
  );
  log.info(`Good aspect:`);
  log.debug(
    `${improved_prompt_result.recommendations?.good_aspects.join('\n')}\n`
  );
  log.info(`Prompt:`);
  log.debug(`${improved_prompt_result.prompt}\n`);
}

main().then(() => console.log('DONE'));

async function _itarate_autoimprove_prompt({
  first_intent,
  input_goal,
  input_prompt,
  iteration,
  alternative_quantity,
}: {
  first_intent: string;
  input_goal: string;
  input_prompt: string;
  iteration: number;
  alternative_quantity: number;
}) {
  let current_prompt = input_prompt;
  let response;
  let max_score = 0;
  let recommendations;
  for (let i = 0; i < iteration; i++) {
    log.info(`************************************************************`);
    log.info(`Iteration ${i} started...`);
    response = await _autoimprove_prompt({
      first_intent,
      input_goal,
      input_prompt: current_prompt,
      alternative_quantity,
      recommendations,
    });
    if (response.score > max_score) {
      log.info(
        `Response score [${response.score}] is grater than` +
          ` max_score [${max_score}]. Replacing best response`
      );
      max_score = response.score;
      current_prompt = response.prompt;
      recommendations = {
        good_aspects: response.good_aspects,
        bad_aspects: response.bad_aspects,
      };
    }
  }
  return {
    score: max_score,
    prompt: current_prompt,
    recommendations,
  };
}

async function _autoimprove_prompt({
  first_intent,
  input_goal,
  input_prompt,
  alternative_quantity,
  recommendations,
}: {
  first_intent: string;
  input_goal: string;
  input_prompt: string;
  alternative_quantity: number;
  recommendations?: Recommendations;
}): Promise<ImprovedPromptResult> {
  const improved_prompts = await _improve_prompt({
    input_prompt,
    input_goal,
    output_quantity: alternative_quantity,
    recommendations,
  });
  const scores: number[] = [];
  const evaluated_response_promises: Promise<EvaluatedResponse>[] = [];
  for (let i = 0; i < improved_prompts.length; i++) {
    const evaluated_response_promise = new Promise<EvaluatedResponse>((res) => {
      setTimeout(async function () {
        const improved_prompt = improved_prompts[i]!;
        log.trace('---------------------------------------------------------');
        log.trace(`Improved prompt [${i}]:\n${improved_prompt}`);
        const result = await _test_prompt(improved_prompt);
        log.trace('"""""""""""""""""""""""""""""""""""""""""""""""""""""""""');
        log.trace(`Generated result [${i}]:\n${result}`);
        const evaluated_response = await _evaluate_result({
          first_intent,
          input_goal,
          result,
          prompt: improved_prompt,
        });
        res(evaluated_response);
      }, batch_requests_delay * i);
    });
    evaluated_response_promises.push(evaluated_response_promise);
  }
  const evaluated_responses = await Promise.all(evaluated_response_promises);
  for (let i = 0; i < evaluated_responses.length; i++) {
    const evaluated_response = evaluated_responses[i]!;
    log.info(`Evaluated result score [${i}]: ${evaluated_response.score}`);
    scores.push(evaluated_response.score);
    // evaluated_responses.push(evaluated_response);
  }
  const best_score_index = _resolve_best_score_index(scores);
  log.debug(`Best score index: ${best_score_index}`);
  const improved_prompt_result: ImprovedPromptResult = {
    prompt: improved_prompts[best_score_index]!,
    ...evaluated_responses[best_score_index]!,
  };
  log.trace(`Best evaluated response`, evaluated_responses[best_score_index]);
  return improved_prompt_result;
}

async function _test_prompt(prompt: string) {
  const user_prompt = await _generate_user_prompt_example(prompt);
  const response = await _ask_openai({
    system_prompt: prompt,
    user_prompt,
  });
  return response;
}

async function _generate_user_prompt_example(prompt: string): Promise<string> {
  const user_input_system_prompt = await prompts.read('user-input-system');
  const user_input_user_prompt = await prompts.read('user-input-user', {
    prompt,
  });
  const response = await _ask_openai({
    system_prompt: user_input_system_prompt,
    user_prompt: user_input_user_prompt,
  });
  return response;
}

async function _evaluate_result({
  first_intent,
  input_goal,
  result,
  prompt,
}: {
  first_intent: string;
  input_goal: string;
  result: string;
  prompt: string;
}): Promise<EvaluatedResponse> {
  const evaluate_system_prompt = await prompts.read('evaluate-system');
  const evaluate_user_prompt = await prompts.read('evaluate-user', {
    first_intent,
    input_goal,
    result,
    prompt,
  });
  const response = await _ask_openai({
    system_prompt: evaluate_system_prompt,
    user_prompt: evaluate_user_prompt,
    response_format: 'json_object',
  });
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

async function _improve_prompt({
  input_prompt,
  input_goal,
  output_quantity,
  recommendations,
}: {
  input_prompt: string;
  input_goal: string;
  output_quantity: number;
  recommendations?: Recommendations;
}): Promise<string[]> {
  log.trace(`Generating alternative prompts...`);
  const improve_prompt = await prompts.read('improve-system');
  const user_prompt = await _resolve_improved_prompt_user_prompt({
    input_prompt,
    input_goal,
    output_quantity,
    recommendations,
  });
  log.trace('...............................................................');
  log.trace(`Improved prompts user prompt:\n\n`, user_prompt);
  const response = await _ask_openai({
    system_prompt: improve_prompt,
    user_prompt,
    response_format: 'json_object',
    temperature: 1.1,
  });
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

async function _resolve_improved_prompt_user_prompt({
  input_prompt,
  input_goal,
  output_quantity,
  recommendations,
}: {
  input_prompt: string;
  input_goal: string;
  output_quantity: number;
  recommendations?: Recommendations;
}): Promise<string> {
  let user_prompt = '';
  user_prompt += `Generate ${output_quantity} improved prompts for the`;
  user_prompt += ` following prompt:\n\n`;
  user_prompt += `<INPUT_PROMPT>\n`;
  user_prompt += `${input_prompt}`;
  user_prompt += `</INPUT_PROMPT>`;
  user_prompt += `\n\n`;
  if (input_goal) {
    user_prompt += `The provided final goal of the improved prompts is:\n\n`;
    user_prompt += `<INPUT_GOAL>\n`;
    user_prompt += `${input_goal}`;
    user_prompt += `</INPUT_GOAL>`;
    user_prompt += `\n\n`;
  }
  if (recommendations) {
    user_prompt += `When generating the new prompts consider these feedbacks:\n\n`;
    if (recommendations.good_aspects) {
      user_prompt += `<GOOD_ASPECT>\n`;
      user_prompt += `${recommendations.good_aspects.join('\n')}`;
      user_prompt += `</GOOD_ASPECT>`;
      user_prompt += `\n\n`;
    }
    if (recommendations.bad_aspects) {
      user_prompt += `<BAD_ASPECTS>\n`;
      user_prompt += `${recommendations.bad_aspects.join('\n')}`;
      user_prompt += `</BAD_ASPECTS>`;
    }
  }
  return user_prompt;
}

type OpenAIResopnseFormat = 'text' | 'json_object';

async function _ask_openai({
  system_prompt,
  user_prompt,
  temperature = 1,
  response_format = 'text',
}: {
  system_prompt: string;
  user_prompt: string;
  temperature?: number;
  response_format?: OpenAIResopnseFormat;
}) {
  const openai_response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    // max_tokens: 4096,
    max_tokens: 16384,
    response_format: {type: response_format},
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
    log.error(jsonString);
    console.error('Initial JSON parsing failed, attempting to autocorrect...');
    // Step 3: Fix common issues like missing commas, trailing commas, and unquoted keys
    // Replace semicolons with commas
    jsonString = jsonString.replace(/;/g, ',');
    // Insert commas between objects if missing
    jsonString = jsonString.replace(/}\s*"/g, '}, "');
    // Insert commas between array items if missing
    jsonString = jsonString.replace(/]\s*"/g, '], "');
    // Insert missing commas between attributes (e.g., } followed by a letter or quote)
    jsonString = jsonString.replace(/}(\s*")/g, '},$1');
    jsonString = jsonString.replace(/}(\s*\w)/g, '},$1');
    jsonString = jsonString.replace(/](\s*")/g, '],$1');
    jsonString = jsonString.replace(/](\s*\w)/g, '],$1');
    // Add quotes to keys (this is a basic approach and may need refinement for edge cases)
    jsonString = jsonString.replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":');
    // Remove trailing commas
    jsonString = jsonString.replace(/,\s*([}\]])/g, '$1');
    // Fix unclosed strings by adding a closing quote if needed
    jsonString = jsonString.replace(/"([^"]*$)/g, '"$1"');
    // Try parsing again
    try {
      return JSON.parse(jsonString);
    } catch (finalError) {
      log.error(jsonString);
      console.error('Failed to parse JSON after autocorrection attempts.');
      throw finalError;
    }
  }
}
