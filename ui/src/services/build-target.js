/* 构建目标: 由 scripts/build-amr.mjs 在打包前写入.
   rk  = 瑞芯微 aarch64, 缩放基准用 vh (window.innerHeight)
   cvi = 晶晨 arm32,    缩放基准用 dh ($falcon.env.deviceHeight) */
export const BUILD_TARGET = 'rk'
