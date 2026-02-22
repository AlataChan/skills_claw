import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSimpleYaml, validateManifest, resolveInputs } from '../src/lib/manifest.js';
import { parseSkillRef } from '../src/lib/ref.js';

const yaml = `schema_version: "1.0"
name: invoice-processor
version: 1.2.0
description: "desc"
system_prompt: |
  hello
capabilities:
  - read-file
mcp_deps:
  - tool: ocr.recognize
    required: true
    description: ocr
inputs:
  - name: output_language
    type: enum
    enum: [zh-CN, en-US]
    required: false
    default: zh-CN
`;

test('parse and validate manifest', () => {
  const m = parseSimpleYaml(yaml);
  const v = validateManifest(m);
  assert.equal(v.ok, true);
});

test('resolve inputs', () => {
  const m = parseSimpleYaml(yaml);
  const r = resolveInputs(m, { output_language: 'en-US' });
  assert.equal(r.output_language, 'en-US');
});

test('parse skill ref', () => {
  assert.equal(parseSkillRef('github:sga/repo@main').type, 'github');
  assert.equal(parseSkillRef('invoice@1.0.0').type, 'registry');
});
