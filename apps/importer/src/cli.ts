#!/usr/bin/env node
import { APP_NAME } from '@notnote/shared';

export function usage(): string {
  return [
    `${APP_NAME} importer`,
    '',
    'Usage:',
    '  notnote-import plan   --source notion --workspace <id>',
    '  notnote-import extract --job <id>',
    '  notnote-import verify  --job <id>',
    '',
    'The importer is implemented in Phase 0/1. This CLI currently prints usage only.',
  ].join('\n');
}

export function runCli(argv: readonly string[]): number {
  const command = argv[0];

  if (command === '--help' || command === '-h' || command === undefined) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  process.stderr.write(`Unknown command: ${command}\n\n${usage()}\n`);
  return 1;
}

const isEntrypoint = process.argv[1]?.endsWith('cli.js') ?? false;
if (isEntrypoint) {
  process.exitCode = runCli(process.argv.slice(2));
}
