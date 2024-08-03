"use strict";
/**
 *
 * Prompt Manager
 *
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.read = void 0;
const fs_1 = __importDefault(require("fs"));
const app_root_path_1 = __importDefault(require("app-root-path"));
async function read(name, parameters) {
    const data = fs_1.default.readFileSync(`${app_root_path_1.default}/src/prompts/${name}.md`, {
        encoding: 'utf-8',
    });
    if (parameters) {
        return _replace_placeholder(data, parameters);
    }
    return data;
}
exports.read = read;
function _replace_placeholder(input_string, replacements) {
    return input_string.replace(/{{\s*([\w]+)\s*}}/g, (_, key) => {
        return replacements[key] || `{{${key}}}`;
    });
}
//# sourceMappingURL=index.js.map