import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type PackageConfiguration = {
  main: string;
  scripts: Record<string, string>;
};

type TypeScriptConfiguration = {
  compilerOptions: {
    rootDir?: string;
  };
  include: string[];
};

const projectRoot = path.resolve(process.cwd());
const packageConfiguration = JSON.parse(
  readFileSync(path.join(projectRoot, 'package.json'), 'utf8'),
) as PackageConfiguration;
const typeScriptConfiguration = JSON.parse(
  readFileSync(path.join(projectRoot, 'tsconfig.json'), 'utf8'),
) as TypeScriptConfiguration;

describe('Electron build configuration', () => {
  it('emits the configured main entry directly under dist-electron', () => {
    expect(packageConfiguration.main).toBe('dist-electron/electron/main.js');
    expect(typeScriptConfiguration.compilerOptions.rootDir).toBe('src');
    expect(typeScriptConfiguration.include).toEqual(['src']);
  });

  it('builds renderer assets with paths that resolve from the Electron file URL', () => {
    const viteConfiguration = readFileSync(path.join(projectRoot, 'vite.config.ts'), 'utf8');

    expect(viteConfiguration).toContain("base: './'");
  });

  it('rebuilds better-sqlite3 for the runtime selected by each user-facing script', () => {
    expect(packageConfiguration.scripts.test).toBe('pnpm rebuild better-sqlite3 && vitest run');
    expect(packageConfiguration.scripts['electron:rebuild']).toBe(
      'pnpm rebuild better-sqlite3 --config.runtime=electron --config.target=33.2.1 --config.disturl=https://electronjs.org/headers --config.build_from_source=true',
    );
    expect(packageConfiguration.scripts['electron:start']).toBe(
      'pnpm electron:rebuild && pnpm build && electron .',
    );
  });
});
