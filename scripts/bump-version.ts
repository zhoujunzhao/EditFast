const nextVersion = Bun.argv.slice(2).pop()
if (!nextVersion || !/^\d+\.\d+\.\d+/.test(nextVersion)) {
  console.error('用法: bun run version 0.2.0')
  process.exit(1)
}

const pkg = await Bun.file('package.json').json()
pkg.version = nextVersion
await Bun.write('package.json', JSON.stringify(pkg, null, 2) + '\n')

const tauriConf = await Bun.file('src-tauri/tauri.conf.json').json()
tauriConf.version = nextVersion
await Bun.write('src-tauri/tauri.conf.json', JSON.stringify(tauriConf, null, 2) + '\n')

const cargoToml = await Bun.file('src-tauri/Cargo.toml').text()
const updatedCargo = cargoToml.replace(/^version\s*=\s*"[^"]+"/m, `version = "${nextVersion}"`)
await Bun.write('src-tauri/Cargo.toml', updatedCargo)

console.log(`✅ 所有文件版本号已同步更新为: ${nextVersion}`)
export { }

