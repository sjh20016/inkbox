/**
 * G5 rendering options. The adapter enables the verified path by default;
 * terrain=cpu retains the previous upload path for comparison and fallback.
 *
 * displacement：Pigment 材质激活时，地形顶点 Y 由顶点着色器读取
 *   TerrainDataTextures.heightTexture.g（= ElevationField.node()，最终视觉高程）。
 *   CPU 仍写 position 数组（拾取 / 射线的真相），但不再上传；顶点色同理。
 *   动态三角拓扑（topology.diagonalAD）保持原样：翻转时仍重写索引。
 * partialIndexUpload：无视界遮罩时，拓扑翻转只上传翻转 quad 所在行的索引跨度（否则整份 3.9 MB）。
 * coalesceTextureUpload：高度 / 类型纹理的脏行超过阈值时，改为一次整张上传，
 *   替代 three r186 的逐行 texSubImage2D。
 */
export const terrainGpuConfig = { displacement: false, coalesceTextureUpload: false, coalesceRows: 48, partialIndexUpload: false };
export function configureTerrainGpu(params) {
  const q = params instanceof URLSearchParams ? params : new URLSearchParams(params || '');
  const v = q.get('terrain') || '';
  terrainGpuConfig.displacement = v !== 'cpu';
  terrainGpuConfig.coalesceTextureUpload = v !== 'cpu' || q.get('texupload') === 'full';
  terrainGpuConfig.partialIndexUpload = v !== 'cpu' || q.get('index') === 'partial';
  return terrainGpuConfig;
}
