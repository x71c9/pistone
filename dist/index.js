"use strict";
/**
 *
 * Index
 *
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
const openai_1 = __importDefault(require("openai"));
const _3xp_1 = __importDefault(require("3xp"));
const index_1 = require("./log/index");
const prompts = __importStar(require("./prompts/index"));
const openai = new openai_1.default();
const batch_requests_delay = 500;
const iteration = 4;
const alternative_quantity = 3;
async function main() {
    var _a, _b;
    const input_prompt = await prompts.read('../../input-prompt');
    if (!input_prompt) {
        throw new Error(`No input prompt found. Write the prompt to improve as markdown file in` +
            ` the root of the project [input-prompt.md]`);
    }
    const input_goal = await prompts.read('../../input-goal');
    const improved_prompt_result = await _itarate_autoimprove_prompt({
        first_intent: input_prompt,
        input_goal,
        input_prompt,
        iteration,
        alternative_quantity,
    });
    index_1.log.info(`\nScore:`);
    index_1.log.debug(`${improved_prompt_result.score}\n`);
    index_1.log.info(`Bad aspect:`);
    index_1.log.debug(`${(_a = improved_prompt_result.recommendations) === null || _a === void 0 ? void 0 : _a.bad_aspects.join('\n')}\n`);
    index_1.log.info(`Good aspect:`);
    index_1.log.debug(`${(_b = improved_prompt_result.recommendations) === null || _b === void 0 ? void 0 : _b.good_aspects.join('\n')}\n`);
    index_1.log.info(`Prompt:`);
    index_1.log.debug(`${improved_prompt_result.prompt}\n`);
}
exports.main = main;
main().then(() => console.log('DONE'));
async function _itarate_autoimprove_prompt({ first_intent, input_goal, input_prompt, iteration, alternative_quantity, }) {
    let current_prompt = input_prompt;
    let response;
    let max_score = 0;
    let recommendations;
    for (let i = 0; i < iteration; i++) {
        index_1.log.info(`************************************************************`);
        index_1.log.info(`Iteration ${i} started...`);
        response = await _autoimprove_prompt({
            first_intent,
            input_goal,
            input_prompt: current_prompt,
            alternative_quantity,
            recommendations,
        });
        if (response.score > max_score) {
            index_1.log.info(`Response score [${response.score}] is grater than` +
                ` max_score [${max_score}]. Replacing best response`);
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
async function _autoimprove_prompt({ first_intent, input_goal, input_prompt, alternative_quantity, recommendations, }) {
    const improved_prompts = await _improve_prompt({
        input_prompt,
        input_goal,
        output_quantity: alternative_quantity,
        recommendations,
    });
    const scores = [];
    const evaluated_response_promises = [];
    for (let i = 0; i < improved_prompts.length; i++) {
        const evaluated_response_promise = new Promise((res) => {
            setTimeout(async function () {
                const improved_prompt = improved_prompts[i];
                index_1.log.trace('---------------------------------------------------------');
                index_1.log.trace(`Improved prompt [${i}]:\n${improved_prompt}`);
                const result = await _test_prompt(improved_prompt);
                index_1.log.trace('"""""""""""""""""""""""""""""""""""""""""""""""""""""""""');
                index_1.log.trace(`Generated result [${i}]:\n${result}`);
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
        const evaluated_response = evaluated_responses[i];
        index_1.log.info(`Evaluated result score [${i}]: ${evaluated_response.score}`);
        scores.push(evaluated_response.score);
        // evaluated_responses.push(evaluated_response);
    }
    const best_score_index = _resolve_best_score_index(scores);
    index_1.log.debug(`Best score index: ${best_score_index}`);
    const improved_prompt_result = {
        prompt: improved_prompts[best_score_index],
        ...evaluated_responses[best_score_index],
    };
    index_1.log.trace(`Best evaluated response`, evaluated_responses[best_score_index]);
    return improved_prompt_result;
}
async function _test_prompt(prompt) {
    const user_prompt = await _generate_user_prompt_example(prompt);
    index_1.log.trace('""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""');
    index_1.log.trace('Testing generated user prompt:');
    index_1.log.trace(user_prompt);
    const response = await _ask_openai({
        system_prompt: prompt,
        user_prompt,
    });
    return response;
}
async function _generate_user_prompt_example(prompt) {
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
async function _evaluate_result({ first_intent, input_goal, result, prompt, }) {
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
function _validate_evaluated_response(response) {
    _3xp_1.default.asserts(response, {
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
async function _improve_prompt({ input_prompt, input_goal, output_quantity, recommendations, }) {
    index_1.log.trace(`Generating alternative prompts...`);
    const improve_prompt = await prompts.read('improve-system');
    const user_prompt = await _resolve_improved_prompt_user_prompt({
        input_prompt,
        input_goal,
        output_quantity,
        recommendations,
    });
    index_1.log.trace('...............................................................');
    index_1.log.trace(`Improved prompts user prompt:\n\n`);
    index_1.log.trace(user_prompt);
    const response = await _ask_openai({
        system_prompt: improve_prompt,
        user_prompt,
        response_format: 'json_object',
        temperature: 1.1,
    });
    const parsed_response = _autocorrect_parse_JSON(response);
    const improved_prompts = [];
    for (const [_key, value] of Object.entries(parsed_response)) {
        if (typeof value !== 'string') {
            index_1.log.error(parsed_response);
            throw new Error(`Invalid improved prompt`);
        }
        improved_prompts.push(value);
    }
    return improved_prompts;
}
async function _resolve_improved_prompt_user_prompt({ input_prompt, input_goal, output_quantity, recommendations, }) {
    let user_prompt = '';
    user_prompt += `Generate ${output_quantity} improved prompts for the`;
    user_prompt += ` following prompt:\n\n`;
    user_prompt += `<INPUT_PROMPT>\n`;
    user_prompt += `${input_prompt}\n`;
    user_prompt += `</INPUT_PROMPT>`;
    user_prompt += `\n\n`;
    if (input_goal) {
        user_prompt += `The provided final goal of the improved prompts is:\n\n`;
        user_prompt += `<GOAL>\n`;
        user_prompt += `${input_goal}\n`;
        user_prompt += `</GOAL>`;
        user_prompt += `\n\n`;
    }
    if (recommendations) {
        user_prompt += `When generating the new prompts consider these feedbacks:\n\n`;
        if (recommendations.good_aspects) {
            user_prompt += `<GOOD_ASPECT>\n`;
            user_prompt += `${recommendations.good_aspects.join('\n')}\n`;
            user_prompt += `</GOOD_ASPECT>`;
            user_prompt += `\n\n`;
        }
        if (recommendations.bad_aspects) {
            user_prompt += `<BAD_ASPECTS>\n`;
            user_prompt += `${recommendations.bad_aspects.join('\n')}\n`;
            user_prompt += `</BAD_ASPECTS>`;
        }
    }
    return user_prompt;
}
async function _ask_openai({ system_prompt, user_prompt, temperature = 1, response_format = 'text', }) {
    const openai_response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        // max_tokens: 4096,
        max_tokens: 16384,
        response_format: { type: response_format },
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
function _resolve_text(openai_response) {
    const text = openai_response.choices[0];
    if (!text || !text.message.content) {
        console.error(openai_response);
        throw new Error(`OpenAI Response is empty`);
    }
    return text.message.content;
}
function _resolve_best_score_index(scores) {
    return scores.indexOf(Math.max(...scores));
}
function _autocorrect_parse_JSON(jsonString) {
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
    }
    catch (error) {
        index_1.log.error(jsonString);
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
        }
        catch (finalError) {
            index_1.log.error(jsonString);
            console.error('Failed to parse JSON after autocorrection attempts.');
            throw finalError;
        }
    }
}
//# sourceMappingURL=index.js.map