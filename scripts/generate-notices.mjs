import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const seen = new Set();
const entries = [];
async function locate(name, from) {
  let directory = from;
  while (true) {
    const path = join(directory, 'node_modules', name);
    try {
      return { path, pkg: JSON.parse(await readFile(join(path, 'package.json'), 'utf8')) };
    } catch {
      const parent = dirname(directory);
      if (parent === directory) throw new Error(`Missing runtime dependency: ${name}`);
      directory = parent;
    }
  }
}
async function collect(name, from) {
  const { path, pkg } = await locate(name, from);
  const key = `${pkg.name}@${pkg.version}`;
  if (seen.has(key)) return;
  seen.add(key);
  if ((await readdir(path)).every((file) => file === 'package.json')) return; // Metadata-only npm placeholder; no distributed code.
  const files = (await readdir(path)).filter((file) =>
    /^(licen[cs]e|copying|notice)(\.|$)/i.test(file),
  );
  const license = [];
  for (const file of files) {
    try {
      license.push(await readFile(join(path, file), 'utf8'));
    } catch {}
  }
  if (!license.length) {
    for (const file of (await readdir(path)).filter((file) => /^readme(\.|$)/i.test(file))) {
      const readme = await readFile(join(path, file), 'utf8');
      const section = readme.match(/^#{1,3}\s+licen[cs]e[^\n]*\n([\s\S]*)/im);
      if (section) license.push(section[1]);
    }
  }
  if (!license.length) throw new Error(`Review license manually for ${key}`);
  entries.push({ key, text: license.join('\n\n') });
  const dependencies = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
  ]);
  for (const dependency of dependencies) {
    if (pkg.peerDependenciesMeta?.[dependency]?.optional) {
      try {
        await locate(dependency, path);
      } catch {
        continue;
      }
    }
    await collect(dependency, path);
  }
}
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
for (const name of Object.keys(manifest.dependencies)) await collect(name, root);
const text =
  '# Third-party software notices\n\nOpenDeck Studio includes these runtime dependencies. Each component remains under its own license. Regenerate with `node scripts/generate-notices.mjs` after changing dependencies.\n\n' +
  entries
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((entry) => `## ${entry.key}\n\n${entry.text.trim()}\n`)
    .join('\n');
await writeFile(resolve(root, 'public/third-party-notices.txt'), text);
console.log(`Wrote notices for ${entries.length} runtime packages.`);
