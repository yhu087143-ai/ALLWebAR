/**
 * Guide template presets — ready-to-use POI configurations
 * for common AR guide scenarios.
 *
 * Each template returns Partial<POI>[] so the consumer can assign
 * concrete ids, triggerRadius values, and any other required fields
 * before passing them to a GuideRoute.
 */

import type { POI } from '../types/config'

export interface GuideTemplate {
  id: string
  name: string
  description: string
  pois: Partial<POI>[]
}

export const GUIDE_TEMPLATES: GuideTemplate[] = [
  {
    id: 'campus-tour',
    name: '校园导览',
    description: '校园主要地点导览路线',
    pois: [
      {
        name: '正门',
        description: '校园主入口，宏伟的校门建筑',
        position: { type: 'gps', latitude: 0, longitude: 0 },
        autoTrigger: false,
        order: 1,
        estimatedDuration: 5,
      },
      {
        name: '图书馆',
        description: '学校图书馆，藏书丰富',
        position: { type: 'gps', latitude: 0, longitude: 0 },
        autoTrigger: false,
        order: 2,
        estimatedDuration: 10,
      },
      {
        name: '教学楼',
        description: '主教学楼，日常上课地点',
        position: { type: 'gps', latitude: 0, longitude: 0 },
        autoTrigger: false,
        order: 3,
        estimatedDuration: 5,
      },
      {
        name: '食堂',
        description: '学生食堂，提供多样餐饮选择',
        position: { type: 'gps', latitude: 0, longitude: 0 },
        autoTrigger: false,
        order: 4,
        estimatedDuration: 15,
      },
    ],
  },
  {
    id: 'scenic-tour',
    name: '景区导览',
    description: '景区主要景点导览路线',
    pois: [
      {
        name: '入口',
        description: '景区入口，购票入园',
        position: { type: 'gps', latitude: 0, longitude: 0 },
        autoTrigger: false,
        order: 1,
        estimatedDuration: 5,
      },
      {
        name: '观景台',
        description: '最佳观景位置，俯瞰全景',
        position: { type: 'gps', latitude: 0, longitude: 0 },
        autoTrigger: false,
        order: 2,
        estimatedDuration: 20,
      },
      {
        name: '古建筑',
        description: '历史悠久的古建筑群',
        position: { type: 'gps', latitude: 0, longitude: 0 },
        autoTrigger: false,
        order: 3,
        estimatedDuration: 15,
      },
      {
        name: '出口',
        description: '景区出口',
        position: { type: 'gps', latitude: 0, longitude: 0 },
        autoTrigger: false,
        order: 4,
        estimatedDuration: 5,
      },
    ],
  },
  {
    id: 'mall-tour',
    name: '商场导览',
    description: '商场主要区域导览路线',
    pois: [
      {
        name: '入口',
        description: '商场主入口',
        position: { type: 'gps', latitude: 0, longitude: 0 },
        autoTrigger: false,
        order: 1,
        estimatedDuration: 5,
      },
      {
        name: '中庭',
        description: '商场中心区域，常有活动举办',
        position: { type: 'gps', latitude: 0, longitude: 0 },
        autoTrigger: false,
        order: 2,
        estimatedDuration: 10,
      },
      {
        name: '出口',
        description: '商场出口',
        position: { type: 'gps', latitude: 0, longitude: 0 },
        autoTrigger: false,
        order: 3,
        estimatedDuration: 5,
      },
    ],
  },
]
