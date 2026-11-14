import type { QualityLevel } from '../core/settings';

export type { QualityLevel };

export interface QualityPreset {
  level: QualityLevel;
  /** upper bound for devicePixelRatio */
  pixelRatio: number;
  shadowMapSize: number;
  /** multiplier for procedural texture resolution: 0.5 | 1 | 2 */
  textureScale: number;
  bloom: boolean;
  dof: boolean;
  /** only high / ultra */
  ssao: boolean;
  antialias: 'none' | 'fxaa' | 'smaa';
  /** 0..1 share of palms / bushes / beach debris that is drawn */
  vegetationDensity: number;
  /** sea grid resolution (cells per side) */
  waterSegments: number;
  /** 0 = flat cheap shading, 1 = detail normals + foam, 2 = + caustics / rain rings at full quality */
  waterDetail: 0 | 1 | 2;
  /** procedural clouds in the sky shader */
  clouds: boolean;
  /** PMREM cube size */
  envMapSize: number;
  /** hours of game time between environment map refreshes */
  envRefreshHours: number;
  /** max rain streaks */
  rainDrops: number;
  /** relative GPU cost used by the benchmark to extrapolate between presets */
  cost: number;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  low: {
    level: 'low',
    pixelRatio: 1,
    shadowMapSize: 1024,
    textureScale: 0.5,
    bloom: false,
    dof: false,
    ssao: false,
    antialias: 'fxaa',
    vegetationDensity: 0.6,
    waterSegments: 96,
    waterDetail: 0,
    clouds: false,
    envMapSize: 256,
    envRefreshHours: 0.5,
    rainDrops: 3000,
    cost: 1,
  },
  medium: {
    level: 'medium',
    pixelRatio: 1.5,
    shadowMapSize: 2048,
    textureScale: 1,
    bloom: true,
    dof: true,
    ssao: false,
    antialias: 'smaa',
    vegetationDensity: 1,
    waterSegments: 144,
    waterDetail: 1,
    clouds: true,
    envMapSize: 256,
    envRefreshHours: 0.25,
    rainDrops: 7000,
    cost: 2.6,
  },
  high: {
    level: 'high',
    pixelRatio: 2,
    shadowMapSize: 2048,
    textureScale: 1,
    bloom: true,
    dof: true,
    ssao: true,
    antialias: 'smaa',
    vegetationDensity: 1,
    waterSegments: 176,
    waterDetail: 2,
    clouds: true,
    envMapSize: 256,
    envRefreshHours: 0.2,
    rainDrops: 10000,
    cost: 5.2,
  },
  ultra: {
    level: 'ultra',
    pixelRatio: 2,
    shadowMapSize: 4096,
    textureScale: 2,
    bloom: true,
    dof: true,
    ssao: true,
    antialias: 'smaa',
    vegetationDensity: 1,
    waterSegments: 208,
    waterDetail: 2,
    clouds: true,
    envMapSize: 512,
    envRefreshHours: 0.12,
    rainDrops: 14000,
    cost: 6.6,
  },
};

export const QUALITY_ORDER: readonly QualityLevel[] = ['low', 'medium', 'high', 'ultra'];
