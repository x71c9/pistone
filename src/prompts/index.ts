/**
 *
 * Prompt Manager
 *
 */

import fs from 'fs';
import root from 'app-root-path';

export async function read(
  name: string,
  parameters?: Record<string, any>
): Promise<string> {
  const data = fs.readFileSync(`${root}/src/prompts/${name}.md`, {
    encoding: 'utf-8',
  });
  if (parameters) {
    return _replace_placeholder(data, parameters);
  }
  return data;
}

function _replace_placeholder(
  input_string: string,
  replacements: {[key: string]: string}
): string {
  return input_string.replace(/{{\s*([\w]+)\s*}}/g, (_, key) => {
    return replacements[key] || `{{${key}}}`;
  });
}
