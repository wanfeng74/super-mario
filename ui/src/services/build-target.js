/* 构建目标: 由 scripts/build-amr.mjs 在打包前写入.
   rk   = 瑞芯微 aarch64, 缩放基准用 vh (window.innerHeight)
   cvia = 晶晨 arm32 (适配 cvis/s7/x5), 缩放基准用 dh ($falcon.env.deviceHeight) */
export const BUILD_TARGET = 'rk'
