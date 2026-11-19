import { readDir, stat } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'json', 'jsonc', 'js', 'jsx', 'ts', 'tsx',
  'vue', 'html', 'htm', 'css', 'scss', 'less', 'rs', 'toml', 'yaml', 'yml',
  'xml', 'svg', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'php',
  'rb', 'sh', 'bat', 'ps1', 'sql', 'log', 'csv', 'ini', 'conf', 'env'
])
const IGNORE_DIRS = new Set(['node_modules', '.git', 'target', 'dist', '.idea', '.vscode'])

async function collectFromDir(dirPath: string, result: string[]) {
  try {
    const entries = await readDir(dirPath)
    for (const entry of entries) {
      if (!entry.name) continue
      const fullPath = await join(dirPath, entry.name)
      if (entry.isDirectory) {
        if (!IGNORE_DIRS.has(entry.name)) {
          await collectFromDir(fullPath, result)
        }
      } else if (entry.isFile) {
        const ext = entry.name.split('.').pop()?.toLowerCase() || ''
        if (TEXT_EXTENSIONS.has(ext) || !entry.name.includes('.')) {
          result.push(fullPath)
        }
      }
    }
  } catch (e) {
    console.error(`遍历文件夹失败 (${dirPath}):`, e)
  }
}

export async function collectDroppedFiles(paths: string[]): Promise<string[]> {
  const filesToOpen: string[] = []
  for (const p of paths) {
    try {
      const info = await stat(p)
      if (info.isDirectory) {
        await collectFromDir(p, filesToOpen)
      } else if (info.isFile) {
        filesToOpen.push(p)
      }
    } catch (e) {
      console.error(`读取拖入路径失败 (${p}):`, e)
    }
  }
  return filesToOpen
}
