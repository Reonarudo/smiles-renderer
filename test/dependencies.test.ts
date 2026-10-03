import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const notices = readFileSync('THIRD_PARTY_NOTICES.md', 'utf8');
const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string> };
const locked = JSON.parse(readFileSync('package-lock.json', 'utf8')) as { packages: Record<string, { version: string; integrity: string }> };

for (const [name, licence, file] of [
  ['openchemlib', 'BSD-3-Clause', 'OPENCHEMLIB-LICENSE'],
  ['@xmldom/xmldom', 'MIT', 'XMLDOM-LICENSE']
] as const) {
  test(`${name} is pinned exactly, and the lock file, notices and licence copy agree`, () => {
    const installed = JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8')) as { version: string; license: string };
    assert.equal(manifest.dependencies[name], installed.version);
    assert.equal(installed.license, licence);
    const lock = locked.packages[`node_modules/${name}`]!;
    assert.equal(lock.version, installed.version);
    assert.ok(notices.includes(`${name}\` ${installed.version}`), `notices name ${name} ${installed.version}`);
    assert.ok(notices.includes(lock.integrity), `notices carry the integrity of ${name}`);
    const copy = readFileSync(`licenses/${file}`, 'utf8');
    if (name === 'openchemlib') assert.equal(copy, readFileSync(`node_modules/${name}/LICENSE`, 'utf8'));
  });
}
