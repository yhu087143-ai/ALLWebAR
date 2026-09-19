/**
 * COS 直传凭证路由
 * GET /api/upload-token — 获取 COS 临时上传凭证
 *
 * 本地开发时如果未配置 COS 环境变量，返回 mock 凭证
 */

import { Router } from 'express';
import crypto from 'crypto';
import { config } from '../config.js';

const router = Router();

/**
 * 生成 COS 临时密钥
 * 简化实现：使用固定密钥模拟临时凭证
 * 生产环境建议使用 STS 服务
 */
function generateMockCredentials() {
  const now = Math.floor(Date.now() / 1000);
  return {
    tmpSecretId: config.cosConfig.secretId || 'mock-secret-id',
    tmpSecretKey: config.cosConfig.secretKey || 'mock-secret-key',
    sessionToken: `mock-session-token-${now}`
  };
}

/**
 * GET /api/upload-token
 * 返回上传所需的临时凭证和目标路径
 */
router.get('/', (req, res) => {
  const { secretId, secretKey } = config.cosConfig;

  // 判断是否为 mock 模式（环境变量未配置）
  const isMock = !secretId || !secretKey;

  const credentials = isMock
    ? generateMockCredentials()
    : generateMockCredentials(); // 简化实现，后续可接入 STS

  // 生成唯一的上传路径
  const key = `${config.cosConfig.keyPrefix}${crypto.randomUUID()}`;

  res.json({
    credentials,
    bucket: config.cosConfig.bucket,
    region: config.cosConfig.region,
    key,
    // 告知前端是否为 mock 模式（方便调试）
    _mock: isMock
  });
});

export default router;
