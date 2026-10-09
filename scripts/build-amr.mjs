#!/usr/bin/env node
/**
 * 整盒多平台打包脚本 (平台归属 2026-10-10 依据 POSC versionInfo 实测更正):
 *   rk   = RK 平台 (瑞芯微 aarch64 / panet.so): 覆盖 RK3566(X3s/X6plus/P5) + RK3562(X7) + RK3326(X6plus)
 *   cvis = S 系列 / X5 系列 (arm32 glibc / bridge.so, 两系列 so 合并共用): 覆盖 S7pro/S6pro(CV1826) + X5 系列
 *          (X5 SDK 库实测为 ELF32 ARM/glibc, 不属于 RK3566/aarch64, 勿归入 rk 包)
 *   cvia = A6pro (Rockchip RV1106 arm32 / bridge.so): 用 RV1106 工具链 (arm-rockchip830-linux-uclibcgnueabihf,
 *          开源源 Luckfox Pico SDK) + iot-miniapp-sdk 模板编译的最小兼容库, 产物放 ui/libs-rv1106/
 * 用法: node scripts/build-amr.mjs
 * 产物: rk/  cvis/  cvia/
 * appid 统一为 BASE_APPID (参考 Pencraft 多机型单 appid 做法, 同一 appid 适配多平台)
 */
import { execSync } from 'child_process'
import { copyFileSync, existsSync, renameSync, readdirSync, unlinkSync, writeFileSync, readFileSync, mkdirSync } from 'fs'
import { join, basename } from 'path'

const UI = join(process.cwd(), 'ui')
const LIBS = join(UI, 'libs')
const PANET = join(LIBS, 'libjsapi_panet.so')
const BRIDGE = join(LIBS, 'libjsapi_bridge.so')
const BRIDGE_SRC = join(UI, 'libs-cvi', 'libjsapi_bridge.so')
const BRIDGE_SRC_RV = join(UI, 'libs-rv1106', 'libjsapi_bridge.so')
const TARGET_FILE = join(UI, 'src/services/build-target.js')
const PKG_JSON = join(UI, 'package.json')
const VERSION_JS = join(UI, 'src/services/version.js')
const BASE_APPID = '8001865309000002'
/* 临时换库用的 .bak 放项目根 (ui/libs 外), 避免残留进 AMR 包 */
const PANET_BAK = join(process.cwd(), '.tmp-panet.so.bak')
const BRIDGE_BAK2 = join(process.cwd(), '.tmp-bridge.so.bak')
/* cvis 与 rk 共用同一 appid (参考 Pencraft 多机型单 appid 做法):
   rk 包   = RK 平台 (aarch64/panet.so): X3s/X6plus/P5/X7 (RK3566/RK3562/RK3326)
   cvis 包 = S 系列/X5 系列 (arm32 glibc/bridge.so, so 合并共用): S7pro/S6pro(CV1826) + X5 系列 */

/* =====================================================================
 * so 平台预检 (2026-10-09 新增, 防止 cvis 混用 A 系列库问题重演)
 * 背景: 固件/商店按包内 .so 的 libc 类型识别机型系列 (实测: cvis 包曾
 * 误用 uClibc/cvia 编译的 bridge.so, 提交后被识别为 A 系列).
 * 判定规则:
 *   - rk    = glibc aarch64 (ld-linux-aarch64.so.1 / libc.so.6)
 *   - cvis  = glibc arm32   (S7pro/S6pro, CV1826, 对应 arm-glibc-s61)
 *   - cvia  = uclibc arm32  (A6pro/RV1106, 对应 arm-uclibc-a6p)
 * 任一平台库类型不匹配即拒绝整包打包; 确知库正确时可设 SKIP_SO_CHECK=1 绕过.
 * ===================================================================== */
function soLibc(path) {
  if (!existsSync(path)) return 'missing'
  try {
    const out = execSync(`readelf -d "${path}" 2>/dev/null | grep -oE 'Shared library: \\[[^]]+\\]'`, { encoding: 'utf8' })
    const tags = (out.match(/\[[^\]]+\]/g) || []).map(s => s.slice(1, -1))
    if (tags.some(t => t.includes('ld-uClibc') || t === 'libc.so.0')) return 'uclibc'
    if (tags.some(t => t.includes('ld-linux') || t === 'libc.so.6')) return 'glibc'
    return 'unknown'
  } catch (e) {
    return 'readelf-error'
  }
}

function assertLibc(path, expect, label) {
  const got = soLibc(path)
  if (got !== expect) {
    throw new Error(
      `[so平台预检失败] ${label}: ${path}\n` +
      `  当前 libc 类型 = ${got}, 期望 = ${expect}\n` +
      `  固件按 .so 的 libc 识别机型系列, 混用会导致包被识别成错误系列\n` +
      `  (v2.2.6 cvis 曾误用 uClibc/cvia 库被识别为 A 系列).\n` +
      `  请替换为正确编译目标后再打包; 若确知库正确, 可设 SKIP_SO_CHECK=1 强制跳过.`
    )
  }
  console.log(`[so平台预检通过] ${label}: ${path} -> ${got}`)
}

function precheckSo() {
  console.log('\n=== so 平台预检 ===')
  assertLibc(PANET, 'glibc', 'rk (panet.so)')
  assertLibc(BRIDGE_SRC, 'glibc', 'cvis (libs-cvi/bridge.so, S 系列需 glibc arm32)')
  assertLibc(BRIDGE_SRC_RV, 'uclibc', 'cvia (libs-rv1106/bridge.so, A6pro 需 uclibc)')
  console.log('=== so 平台预检全部通过 ===\n')
}

function setTarget(t) {
  writeFileSync(TARGET_FILE,
    `/* 构建目标: 由 scripts/build-amr.mjs 在打包前写入.
   rk   = 瑞芯微 aarch64 (RK 平台: X3s/X6plus/P5/X7), 缩放基准用 vh (window.innerHeight)
   cvis = arm32 glibc (S 系列/X5 系列, so 合并共用: S7pro/S6pro/X5), 缩放基准用 dh ($falcon.env.deviceHeight)
   cvia = A6pro (Rockchip RV1106 arm32), 缩放基准用 dh ($falcon.env.deviceHeight) */
export const BUILD_TARGET = '${t}'\n`)
}

function setAppid(appid) {
  /* package.json */
  const pkg = JSON.parse(readFileSync(PKG_JSON, 'utf8'))
  pkg.appid = appid
  writeFileSync(PKG_JSON, JSON.stringify(pkg, null, 2) + '\n')
  /* version.js */
  const vjs = readFileSync(VERSION_JS, 'utf8')
    .replace(/export const APP_ID = '[^']*'/, `export const APP_ID = '${appid}'`)
  writeFileSync(VERSION_JS, vjs)
}

function sh(cmd) {
  console.log('$', cmd)
  execSync(cmd, { stdio: 'inherit' })
}

function cleanAmr() {
  for (const f of readdirSync(UI).filter(f => f.endsWith('.amr'))) {
    try { unlinkSync(join(UI, f)) } catch (e) {}
  }
}

/* 清理 ui/libs 里历史遗留的 .bak* 残留 (换库临时文件已移至项目根, 此处只删旧痕迹) */
function cleanLibBaks() {
  for (const f of readdirSync(LIBS)) {
    if (f.includes('.bak')) {
      try { unlinkSync(join(LIBS, f)) } catch (e) {}
    }
  }
}

function findAmr() {
  const files = readdirSync(UI).filter(f => f.endsWith('.amr'))
  if (!files.length) throw new Error('未找到打包产物 .amr')
  return join(UI, files[0])
}

function buildRk() {
  console.log('\n=== 打包 rk 版 (aarch64 / panet.so, vh 缩放) ===')
  setTarget('rk')
  cleanLibBaks()
  if (existsSync(BRIDGE)) renameSync(BRIDGE, BRIDGE_BAK)
  if (!existsSync(PANET)) throw new Error('缺少 panet.so')
  cleanAmr()
  sh('pnpm -C ui package')
  const amr = findAmr()
  const out = join(process.cwd(), 'rk', basename(amr).replace('.amr', '-rk.amr'))
  copyFileSync(amr, out)
  console.log('->', out)
}

function buildCvis() {
  console.log('\n=== 打包 cvis 版 (Cvitek arm32 / bridge.so, dh 缩放, 覆盖 CV1826 平台: S7pro/S6pro, appid 与 rk 一致) ===')
  setTarget('cvis')
  cleanLibBaks()
  /* appid 保持 BASE_APPID (与 rk 一致, 参考 Pencraft 多机型单 appid) */
  renameSync(PANET, PANET_BAK)
  copyFileSync(BRIDGE_SRC, BRIDGE)
  try {
    cleanAmr()
    sh('pnpm -C ui package')
  } finally {
    renameSync(BRIDGE, BRIDGE_BAK2)
    renameSync(PANET_BAK, PANET)
    /* 临时 .bak 移到 ui/libs 外, 避免残留进后续包 */
    if (existsSync(BRIDGE_BAK2)) unlinkSync(BRIDGE_BAK2)
  }
  const amr = findAmr()
  mkdirSync(join(process.cwd(), 'cvis'), { recursive: true })
  const out = join(process.cwd(), 'cvis', basename(amr).replace('.amr', '-cvis.amr'))
  copyFileSync(amr, out)
  console.log('->', out)
}

function buildCvia() {
  console.log('\n=== 打包 cvia 版 (A6pro / Rockchip RV1106 arm32 / bridge.so, dh 缩放, appid 与 rk 一致) ===')
  setTarget('cvia')
  cleanLibBaks()
  /* appid 保持 BASE_APPID (与 rk 一致) */
  renameSync(PANET, PANET_BAK)
  copyFileSync(BRIDGE_SRC_RV, BRIDGE)
  try {
    cleanAmr()
    sh('pnpm -C ui package')
  } finally {
    renameSync(BRIDGE, BRIDGE_BAK2)
    renameSync(PANET_BAK, PANET)
    if (existsSync(BRIDGE_BAK2)) unlinkSync(BRIDGE_BAK2)
  }
  const amr = findAmr()
  mkdirSync(join(process.cwd(), 'cvia'), { recursive: true })
  const out = join(process.cwd(), 'cvia', basename(amr).replace('.amr', '-cvia.amr'))
  copyFileSync(amr, out)
  console.log('->', out)
}

try {
  precheckSo()
} catch (e) {
  if (process.env.SKIP_SO_CHECK === '1') {
    console.warn('[警告] SKIP_SO_CHECK=1 已设置, 跳过 so 平台预检, 请自行确认库匹配!')
  } else {
    throw e
  }
}
buildRk()
buildCvis()
buildCvia()
console.log('\n完成: rk/  cvis/  cvia/ 产物已更新')
