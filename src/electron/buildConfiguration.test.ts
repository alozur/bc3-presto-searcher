import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type PackageConfiguration = {
  build: {
    appId: string;
    asarUnpack: string[];
    productName: string;
    win: {
      artifactName: string;
      target: string;
    };
  };
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  main: string;
  name: string;
  packageManager: string;
  scripts: Record<string, string>;
};

type TypeScriptConfiguration = {
  compilerOptions: {
    rootDir?: string;
  };
  include: string[];
};

function normalizeConfigurationText(text: string) {
  return text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
}

const projectRoot = path.resolve(process.cwd());
const packageConfiguration = JSON.parse(
  readFileSync(path.join(projectRoot, 'package.json'), 'utf8'),
) as PackageConfiguration;
const typeScriptConfiguration = JSON.parse(
  readFileSync(path.join(projectRoot, 'tsconfig.json'), 'utf8'),
) as TypeScriptConfiguration;
const lockfile = readFileSync(path.join(projectRoot, 'pnpm-lock.yaml'), 'utf8');

function importerSpecifier(
  lockfileText: string,
  group: 'dependencies' | 'devDependencies',
  dependency: string,
) {
  const normalizedLockfile = normalizeConfigurationText(lockfileText);
  const rootImporter = normalizedLockfile.slice(0, normalizedLockfile.indexOf('\npackages:'));
  const groupStart = rootImporter.indexOf(`    ${group}:\n`);

  if (groupStart === -1) {
    return undefined;
  }

  const followingGroup = rootImporter.slice(groupStart + 1).search(/\n    \S/);
  const groupContents = rootImporter.slice(
    groupStart,
    followingGroup === -1 ? undefined : groupStart + followingGroup + 1,
  );
  const entry = groupContents.match(
    new RegExp(`^      ${dependency}:\\n        specifier: ([^\\n]+)$`, 'm'),
  );

  return entry?.[1];
}

function workflowJob(workflowText: string, jobName: string) {
  const normalizedWorkflow = normalizeConfigurationText(workflowText);
  const jobStart = normalizedWorkflow.indexOf(`  ${jobName}:\n`);
  const followingJob = normalizedWorkflow.slice(jobStart + 1).search(/\n  \S/);

  return normalizedWorkflow.slice(
    jobStart,
    followingJob === -1 ? undefined : jobStart + followingJob + 1,
  );
}

describe('Electron build configuration', () => {
  it('normalizes an optional leading UTF-8 BOM and CRLF line endings without changing an interior BOM', () => {
    expect(normalizeConfigurationText('\uFEFF  linux:\r\n    runs-on: ubuntu-latest')).toBe(
      '  linux:\n    runs-on: ubuntu-latest',
    );
    expect(normalizeConfigurationText('  linux:\r\n    \uFEFFruns-on: ubuntu-latest')).toBe(
      '  linux:\n    \uFEFFruns-on: ubuntu-latest',
    );
  });

  it('extracts Electron importer and Linux job data from CRLF configuration text with a leading BOM', () => {
    const crlfLockfile = [
      "\uFEFFlockfileVersion: '9.0'",
      '',
      'importers:',
      '',
      '  .:',
      '    devDependencies:',
      '      electron:',
      '        specifier: 33.2.1',
      '        version: 33.2.1',
      '',
      'packages:',
    ].join('\r\n');
    const crlfWorkflow = [
      '\uFEFFname: ci',
      '',
      'jobs:',
      '  linux:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: pnpm test',
      '  windows:',
      '    runs-on: windows-latest',
    ].join('\r\n');

    for (const [lockfileText, workflowText] of [
      [crlfLockfile, crlfWorkflow],
      [crlfLockfile.slice(1), crlfWorkflow.slice(1)],
    ]) {
      expect(importerSpecifier(lockfileText, 'devDependencies', 'electron')).toBe('33.2.1');
      expect(workflowJob(workflowText, 'linux')).toBe(`  linux:
    runs-on: ubuntu-latest
    steps:
      - run: pnpm test`);
    }
  });

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

  it('classifies Electron packaging tools as pinned development dependencies in the manifest and root importer', () => {
    for (const [dependency, version] of [
      ['electron', '33.2.1'],
      ['electron-builder', '25.1.8'],
    ]) {
      expect(packageConfiguration.dependencies[dependency]).toBeUndefined();
      expect(packageConfiguration.devDependencies[dependency]).toBe(version);
      expect(importerSpecifier(lockfile, 'dependencies', dependency)).toBeUndefined();
      expect(importerSpecifier(lockfile, 'devDependencies', dependency)).toBe(version);
    }
  });

  it('preserves the Linux and Windows delivery contracts', () => {
    const workflow = readFileSync(path.join(projectRoot, '.github/workflows/ci.yml'), 'utf8');
    const linuxJob = workflowJob(workflow, 'linux');
    const windowsJob = workflowJob(workflow, 'windows');

    expect(packageConfiguration.packageManager).toBe('pnpm@9.15.0');
    expect(linuxJob).toBe(`  linux:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: {version: 9.15.0}
      - uses: actions/setup-node@v4
        with: {node-version: 22, cache: pnpm}
      - run: pnpm install --frozen-lockfile
      - run: pnpm test`);

    const requiredWindowsStages = [
      'pnpm install --frozen-lockfile',
      'pnpm test',
      'pnpm electron:build',
      'uses: actions/upload-artifact@v4',
    ];
    const stagePositions = requiredWindowsStages.map((stage) => windowsJob.indexOf(stage));

    expect(stagePositions.every((position) => position !== -1)).toBe(true);
    expect(stagePositions).toEqual([...stagePositions].sort((left, right) => left - right));
    expect(windowsJob).toContain('name: PrestoSearch.exe');
    expect(windowsJob).toContain('path: release/PrestoSearch.exe');
    expect(windowsJob).toContain('if-no-files-found: error');
  });

  it('preserves the PrestoSearch package identity', () => {
    expect(packageConfiguration.name).toBe('bc3-presto-searcher');
    expect(packageConfiguration.build.appId).toBe('com.alozur.prestosearch');
    expect(packageConfiguration.build.productName).toBe('PrestoSearch');
    expect(packageConfiguration.build.win).toEqual({
      target: 'nsis',
      artifactName: 'PrestoSearch.exe',
    });
    expect(packageConfiguration.build.asarUnpack).toContain('node_modules/better-sqlite3/**');
  });
});
