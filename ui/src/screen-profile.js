/* 分辨率适配参考 youdao-hill-climb:
   setViewPort(960) 后宽度自动铺满设备, 高度按物理比例动态计算.
   多出的高度当天空, 地面锚定底部, 不 letterbox 不留黑边. */
export const DESIGN_WIDTH = 960;
export const MIN_LOGICAL_HEIGHT = 266;

export function logicalHeightForPhysical(width, height) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (!w || !h) return MIN_LOGICAL_HEIGHT;
  /* 横屏: 长边=宽度, 短边=高度. 逻辑高度 = 960 * 物理高/物理宽 */
  const longSide = Math.max(w, h);
  const shortSide = Math.min(w, h);
  return Math.max(MIN_LOGICAL_HEIGHT, Math.round(DESIGN_WIDTH * shortSide / longSide));
}

export function describeScreen(width, height) {
  const logicalHeight = logicalHeightForPhysical(width, height);
  return {
    designWidth: DESIGN_WIDTH,
    logicalHeight,
    extraSkyHeight: Math.max(0, logicalHeight - MIN_LOGICAL_HEIGHT),
    compact: logicalHeight <= MIN_LOGICAL_HEIGHT
  };
}
