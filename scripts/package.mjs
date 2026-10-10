import { packager } from '@electron/packager';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeState } from '../src/model.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
const destination = path.join(output, 'Daynote-win32-x64');
const includeLocalData = process.argv.includes('--with-data');
if (fs.existsSync(destination)) throw new Error('dist/Daynote-win32-x64 已存在。为保护其中的任务数据，本次打包未覆盖它。');
const packageInfo = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const paths = await packager({
  dir: root, name: 'Daynote', executableName: 'Daynote', platform: 'win32', arch: 'x64',
  electronVersion: packageInfo.devDependencies.electron, appVersion: packageInfo.version,
  out: output, overwrite: false, asar: true,
  icon: path.join(root, 'assets', 'app-icon.ico'),
  extraResource: [path.join(root, 'assets', 'app-icon.ico'), path.join(root, 'assets', 'app-icon.png')],
  download: { cacheRoot: path.join(root, '.electron-cache') },
  tmpdir: path.join(root, '.package-tmp'),
  ignore: [/^\/(?:dist|node_modules|data|artifacts|docs|tests|scripts|\.runtime(?:-smoke)?|\.npm-cache|\.electron-cache|\.package-tmp|\.tools|\.git|\.github|\.codex|\.agents)(?:\/|$)/, /^\/(?:README\.md|start-demo\.cmd|package-lock\.json|\.gitignore|\.gitattributes)$/, /^\/\.env(?:\.|$)/],
  win32metadata: { CompanyName: 'Daynote', FileDescription: '拾光 · 本地待办', ProductName: '拾光 Daynote', OriginalFilename: 'Daynote.exe' }
});
const appFolder = paths[0];
const sourceData = path.join(root, 'data', 'tasks.json');
if (includeLocalData && fs.existsSync(sourceData)) {
  const state = normalizeState(JSON.parse(fs.readFileSync(sourceData, 'utf8')));
  const dataFolder = path.join(appFolder, 'data'); fs.mkdirSync(dataFolder, { recursive: true });
  fs.writeFileSync(path.join(dataFolder, 'tasks.json'), JSON.stringify(state, null, 2), 'utf8');
  fs.writeFileSync(path.join(dataFolder, 'tasks.backup.json'), JSON.stringify(state, null, 2), 'utf8');
}
fs.copyFileSync(path.join(root, 'README.md'), path.join(appFolder, 'README.md'));
fs.copyFileSync(path.join(root, 'docs', 'PORTABLE.md'), path.join(appFolder, '使用说明.md'));
console.log(`Windows app: ${path.join(appFolder, 'Daynote.exe')}`);
console.log(includeLocalData ? 'Local tasks copied into this build. Keep it for personal use.' : 'Clean build: no local task data included.');
