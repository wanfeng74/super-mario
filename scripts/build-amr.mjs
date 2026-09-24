#!/usr/bin/env node
/**
 * 双平台打包脚本: rk (瑞芯微 aarch64 / panet.so) + cvi (cvitek arm32 / bridge.so)
 * 用法: node scripts/build-amr.mjs
 * 产物: rk/  和  cvi/
 */
import { execSync } from 'child_process'
import { copyFileSync, existsSync, renameSync, readdirSync, unlinkSync, writeFileSync, readFileSync } from 'fs'
import { join, basename } from 'path'

const UI = join(process.cwd(), 'ui')
const LIBS = join(UI, 'libs')
const PANET = join(LIBS, 'libjsapi_panet.so')
const BRIDGE = join(LIBS, 'libjsapi_bridge.so')
const BRIDGE_SRC = join(UI, 'libs-cvi', 'libjsapi_bridge.so')
const TARGET_FILE = join(UI, 'src/services/build-target.js')
const PKG_JSON = join(UI, 'package.json')
const VERSION_JS = join(UI, 'src/services/version.js')
const BASE_APPID = '8001865309000002'
const CVI_APPID = '8001865309000003'

function setTarget(t) {
  writeFileSync(TARGET_FILE,
    `/* 构建目标: 由 scripts/build-amr.mjs 在打包前写入.
   rk  = 瑞芯微 aarch64, 缩放基准用 vh (window.innerHeight)
   cvi = 晶晨 arm32,    缩放基准用 dh ($falcon.env.deviceHeight) */
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

function findAmr() {
  const files = readdirSync(UI).filter(f => f.endsWith('.amr'))
  if (!files.length) throw new Error('未找到打包产物 .amr')
  return join(UI, files[0])
}

function buildRk() {
  console.log('\n=== 打包 rk 版 (aarch64 / panet.so, vh 缩放) ===')
  setTarget('rk')
  if (existsSync(BRIDGE)) renameSync(BRIDGE, BRIDGE + '.bak')
  if (!existsSync(PANET)) throw new Error('缺少 panet.so')
  cleanAmr()
  sh('pnpm -C ui package')
  const amr = findAmr()
  const out = join(process.cwd(), 'rk', basename(amr).replace('.amr', '-rk.amr'))
  copyFileSync(amr, out)
  console.log('->', out)
}

function buildCvi() {
  console.log('\n=== 打包 cvi 版 (cvitek arm32 / bridge.so, dh 缩放, appid+1) ===')
  setTarget('cvi')
  setAppid(CVI_APPID)
  renameSync(PANET, PANET + '.bak')
  copyFileSync(BRIDGE_SRC, BRIDGE)
  try {
    cleanAmr()
    sh('pnpm -C ui package')
  } finally {
    renameSync(BRIDGE, BRIDGE + '.bak2')
    renameSync(PANET + '.bak', PANET)
    setAppid(BASE_APPID)
  }
  const amr = findAmr()
  const out = join(process.cwd(), 'cvi', basename(amr).replace('.amr', '-cvi.amr'))
  copyFileSync(amr, out)
  console.log('->', out)
}

buildRk()
buildCvi()
console.log('\n完成: rk/ 与 cvi/ 产物已更新')
