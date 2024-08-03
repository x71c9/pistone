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
async function main() {
    index_1.log.trace('Autoimproving prompt...');
    const input_prompt = await prompts.read('../input');
    const improved_prompt_result = await _itarate_autoimprove_prompt(input_prompt, 3);
    console.log(improved_prompt_result);
}
exports.main = main;
main().then(() => console.log('DONE'));
async function _itarate_autoimprove_prompt(input_prompt, iteration) {
    let current_prompt = input_prompt;
    let response;
    let max_score = 0;
    for (let i = 0; i < iteration; i++) {
        index_1.log.debug(`************************************************************`);
        index_1.log.debug(`Iteration ${i} started...`);
        response = await _autoimprove_prompt(current_prompt);
        if (response.score > max_score) {
            max_score = response.score;
            current_prompt = response.prompt;
        }
    }
    return response;
}
async function _autoimprove_prompt(input_prompt, recommendation) {
    index_1.log.trace(`Autoimproving prompt...`);
    const improved_prompts = await _improve_prompt(input_prompt, 3, recommendation);
    const scores = [];
    const evaluated_responses = [];
    for (const improved_prompt of improved_prompts) {
        index_1.log.trace('-------------------------------------------------------------');
        index_1.log.trace(improved_prompt);
        const result = await _test_prompt(improved_prompt);
        index_1.log.debug(`Generated result:\n${result}`);
        const evaluated_response = await _evaluate_result(result, improved_prompt);
        index_1.log.info(`Evaluated result score: ${evaluated_response.score}`);
        scores.push(evaluated_response.score);
        evaluated_responses.push(evaluated_response);
    }
    const best_score_index = _resolve_best_score_index(scores);
    const improved_prompt_result = {
        prompt: improved_prompts[best_score_index],
        ...evaluated_responses[best_score_index],
    };
    return improved_prompt_result;
}
async function _test_prompt(prompt) {
    index_1.log.trace(`Testing prompt...`);
    const user_prompt = await _generate_user_prompt_example(prompt);
    index_1.log.debug(`Generated user input example ${user_prompt}`);
    const response = await _ask_openai(prompt, user_prompt);
    return response;
}
async function _generate_user_prompt_example(prompt) {
    const user_input_system_prompt = await prompts.read('user-input-system');
    const user_input_user_prompt = await prompts.read('user-input-user', {
        prompt,
    });
    const response = await _ask_openai(user_input_system_prompt, user_input_user_prompt);
    return response;
}
async function _evaluate_result(result, prompt) {
    const evaluate_system_prompt = await prompts.read('evaluate-system');
    const evaluate_user_prompt = await prompts.read('evaluate-user', {
        result,
        prompt,
    });
    const response = await _ask_openai(evaluate_system_prompt, evaluate_user_prompt);
    const parsed_response = JSON.parse(response);
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
async function _improve_prompt(input_prompt, output_quantity, recommendations) {
    const improve_prompt = await prompts.read('improve');
    const user_prompt = await _resolve_improved_prompt_user_prompt(input_prompt, output_quantity, recommendations);
    const response = await _ask_openai(improve_prompt, user_prompt);
    const parsed_response = JSON.parse(response);
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
async function _resolve_improved_prompt_user_prompt(input_prompt, output_quantity, recommendation) {
    let user_prompt = '';
    user_prompt += `Generate ${output_quantity} improved prompts for the`;
    user_prompt += ` following prompt:\n\n`;
    user_prompt += `<INPUT_PROMPT>\n`;
    user_prompt += `${input_prompt}\n`;
    user_prompt += `</INPUT_PROMPT>\n`;
    if (recommendation) {
        user_prompt += `Considering this feedback:\n`;
        if (recommendation.good_aspects) {
            user_prompt += `**Good aspects**:\n`;
            user_prompt += `${recommendation.good_aspects.join('\n')}`;
            user_prompt += `\n\n`;
        }
        if (recommendation.bad_aspects) {
            user_prompt += `**Bad aspects**:\n`;
            user_prompt += `${recommendation.bad_aspects.join('\n')}`;
            user_prompt += `\n\n`;
        }
    }
    return user_prompt;
}
async function _ask_openai(system_prompt, user_prompt) {
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
//# sourceMappingURL=index.js.map