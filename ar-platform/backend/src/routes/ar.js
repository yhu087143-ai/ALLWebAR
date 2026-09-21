/**
 * AR 体验路由
 * POST  /api/ar     — 创建 AR 体验
 * GET   /api/ar/:id — 获取 AR 体验详情
 */

import { Router } from 'express';
import { nanoid } from 'nanoid';
import QRCode from 'qrcode';
import { createAR, getAR, listAR, deleteAR, incrementViewCount } from '../db.js';
import { buildPublicUrl } from '../share-url.js';

const router = Router();

/**
 * POST /api/ar
 * Body: { modelUrl, videoUrl, trackingType, scale?, title?, targetUrl?, targetImageUrl?, publicOrigin? }
 * 返回: { id, url, qrCode, fullUrl }
 */
router.post('/', async (req, res, next) => {
  try {
    const {
      modelUrl, videoUrl, trackingType, scale, title, targetUrl, targetImageUrl,
      filterMinCF, filterBeta, missTolerance, warmupTolerance, freezeOnDetect,
      animationConfig, interactionConfig, engine, faceFeature, faceZones, positionOffset,
      planeMode,
      config: reqConfig,
    } = req.body;

    // 参数校验：至少需要 modelUrl / videoUrl / 导览路线 / 面部多区域 之一
    // 面部多区域模式（内置素材/贴纸）可以没有外部模型；
    // 导览模式（config.unifiedConfig.guide）同样可以没有外部模型 —— 导览的
    // 主要内容是 POI 路线，模型是可选的展品。
    const hasFaceZones = Array.isArray(faceZones) && faceZones.some(z => z.enabled && (z.contentSource === 'generated' || z.contentSource === 'decal' || z.modelUrl || z.videoUrl));
    const guideRoute = reqConfig?.unifiedConfig?.guide;
    const hasGuideRoute = !!(guideRoute && Array.isArray(guideRoute.pois) && guideRoute.pois.length > 0);
    if (!hasFaceZones && !hasGuideRoute && (!modelUrl || typeof modelUrl !== 'string') && (!videoUrl || typeof videoUrl !== 'string')) {
      return res.status(400).json({ error: 'modelUrl、videoUrl、导览路线（config.unifiedConfig.guide）或面部区域必须提供其一' });
    }
    if (modelUrl && typeof modelUrl !== 'string') {
      return res.status(400).json({ error: 'modelUrl 必须是字符串' });
    }
    if (!trackingType || !['image', 'face', 'plane', 'world'].includes(trackingType)) {
      return res.status(400).json({ error: 'trackingType 必须是 image/face/plane/world' });
    }

    const id = nanoid(12);
    const now = new Date().toISOString();
    const viewPath = `/view/${id}`;
    const fullViewUrl = buildPublicUrl(viewPath, req.body.publicOrigin, req);

    // 生成二维码 dataURL（使用完整 URL，确保手机扫描可访问）
    const qrCode = await QRCode.toDataURL(fullViewUrl, {
      width: 256,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' }
    });

    // 构建完整 AR 配置
    const config = {
      scale: scale || 1,
      modelUrl: modelUrl || '',
      videoUrl: videoUrl || undefined,
      trackingType,
      filterMinCF: filterMinCF ?? 0.0003,
      filterBeta: filterBeta ?? 100,
      missTolerance: missTolerance ?? 30,
      warmupTolerance: warmupTolerance ?? 8,
      freezeOnDetect: freezeOnDetect ?? true,
    };
    if (targetUrl) config.targetUrl = targetUrl;
    if (targetImageUrl) config.targetImageUrl = targetImageUrl;
    if (engine) config.engine = engine;
    if (faceFeature !== undefined) config.faceFeature = faceFeature;
    if (faceZones !== undefined) config.faceZones = faceZones;
    if (planeMode) config.planeMode = planeMode;
    if (positionOffset) config.positionOffset = positionOffset;

    // 存入数据库
    createAR({
      id,
      title: title || '未命名体验',
      modelUrl: modelUrl || '',
      videoUrl: videoUrl || null,
      trackingType,
      config,
      createdAt: now,
      targetUrl: targetUrl || null,
      targetImageUrl: targetImageUrl || null,
      animationConfig: animationConfig || null,
      interactionConfig: interactionConfig || null,
      unifiedConfig: reqConfig?.unifiedConfig || null,
    });

    res.status(201).json({
      id,
      title: title || '未命名体验',
      url: viewPath,
      fullUrl: fullViewUrl,
      qrCode,
      targetUrl: targetUrl || null,
      targetImageUrl: targetImageUrl || null,
      videoUrl: videoUrl || null,
      animationConfig: animationConfig || null,
      interactionConfig: interactionConfig || null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/ar
 * 返回所有 AR 体验列表（不含 config 详情）
 */
router.get('/', async (req, res, next) => {
  try {
    const records = listAR();
    const items = records.map((r) => ({
      id: r.id,
      title: r.title,
      trackingType: r.tracking_type,
      viewCount: r.view_count,
      createdAt: r.created_at,
    }));
    res.json(items);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/ar/:id
 * 删除指定的 AR 体验
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const record = getAR(id);
    if (!record) {
      return res.status(404).json({ error: 'AR 体验不存在' });
    }
    deleteAR(id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/ar/:id
 * 返回 AR 体验的完整配置，每次访问递增 viewCount
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const record = getAR(id);

    if (!record) {
      return res.status(404).json({ error: 'AR 体验不存在' });
    }

    // 递增访问计数。
    // ⚠️ 不能因为计数更新失败就回 404：记录明明存在，只因并发删除/写盘抖动
    //    就把「体验不存在」返回给用户，会让本来能正常打开的页面直接白屏。
    //    计数是辅助信息，失败只记日志，不影响主流程。
    incrementViewCount(id);
    const updated = record;

    res.json({
      id: updated.id,
      title: updated.title,
      modelUrl: updated.model_url,
      videoUrl: updated.video_url || null,
      trackingType: updated.tracking_type,
      config: updated.config,
      targetUrl: updated.target_url || null,
      targetImageUrl: updated.target_image_url || null,
      animationConfig: updated.animation_config || null,
      interactionConfig: updated.interaction_config || null,
      unifiedConfig: updated.unified_config || null,
      viewCount: updated.view_count,
      createdAt: updated.created_at
    });
  } catch (err) {
    next(err);
  }
});

export default router;
