/* 构建目标: 由 scripts/build-amr.mjs 在打包前写入.
   rk   = 瑞芯微 aarch64 (RK 平台: X3s/X6plus/P5/X5Pro/X7), 缩放基准用 vh (window.innerHeight)
   cvis = Cvitek arm32 (CV1826 平台: S7pro/S6pro 等), 缩放基准用 dh ($falcon.env.deviceHeight)
   cvia = A6pro (Rockchip RV1106 arm32), 缩放基准用 dh ($falcon.env.deviceHeight) */
export const BUILD_TARGET = 'cvia'
