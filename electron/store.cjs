const fs = require('node:fs');
const path = require('node:path');

class FileStore {
  constructor(directory, normalize) {
    this.directory = directory;
    this.file = path.join(directory, 'tasks.json');
    this.backup = path.join(directory, 'tasks.backup.json');
    this.normalize = normalize;
  }
  load(initial) {
    fs.mkdirSync(this.directory, { recursive: true });
    if (!fs.existsSync(this.file) && !fs.existsSync(this.backup)) { const state = initial(); this.save(state); return { state, recovered: false }; }
    for (const [file, recovered] of [[this.file, false], [this.backup, true]]) {
      try { return { state: this.normalize(JSON.parse(fs.readFileSync(file, 'utf8'))), recovered }; } catch {}
    }
    throw new Error('任务文件与备份均无法读取。原文件已保留，请先检查 data 目录。');
  }
  save(value) {
    const state = this.normalize(value);
    fs.mkdirSync(this.directory, { recursive: true });
    const temporary = `${this.file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(state, null, 2), 'utf8');
    if (fs.existsSync(this.file)) {
      try {
        this.normalize(JSON.parse(fs.readFileSync(this.file, 'utf8')));
        fs.copyFileSync(this.file, this.backup);
      } catch (error) {
        if (error.code && error.code !== 'ENOENT') throw error;
        // A corrupt primary file must never replace the last valid backup.
      }
    }
    fs.renameSync(temporary, this.file);
    return state;
  }
}
module.exports = { FileStore };
