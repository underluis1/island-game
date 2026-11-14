/** Shared PBR materials for phones. Created lazily, cached for the whole session. */
import * as THREE from 'three';
import { brushedTexture, chipAtlasTexture, coilTexture, grilleTexture, pcbTexture, pearLogoTexture, screwHeadTexture } from './textures';

const cache = new Map<string, THREE.Material>();

function get<T extends THREE.Material>(key: string, make: () => T): T {
  let m = cache.get(key) as T | undefined;
  if (!m) {
    m = make();
    // bare metal under a tropical sky blows out the bloom: tame the environment reflections
    const std = m as unknown as THREE.MeshStandardMaterial;
    if (std.isMeshStandardMaterial && std.metalness > 0.8 && std.envMapIntensity === 1) std.envMapIntensity = 0.5;
    m.name = key;
    cache.set(key, m);
  }
  return m;
}

export function disposePhoneMaterials(): void {
  for (const m of cache.values()) m.dispose();
  cache.clear();
}

export const mat = {
  frame: (color: string, steel = false) =>
    get(`frame:${color}:${steel}`, () => {
      const m = new THREE.MeshPhysicalMaterial({
        color,
        metalness: 1,
        roughness: steel ? 0.12 : 0.34,
        clearcoat: steel ? 0.6 : 0.15,
        clearcoatRoughness: 0.2,
      });
      if (!steel) {
        m.roughnessMap = brushedTexture();
        m.roughnessMap.repeat.set(0.05, 0.05);
      }
      return m;
    }),
  backGlass: (color: string) =>
    get(`back:${color}`, () =>
      new THREE.MeshPhysicalMaterial({
        color,
        metalness: 0,
        roughness: 0.12,
        clearcoat: 1,
        clearcoatRoughness: 0.04,
        reflectivity: 0.6,
      }),
    ),
  frontGlass: () =>
    get('frontGlass', () =>
      new THREE.MeshPhysicalMaterial({
        color: '#050607',
        metalness: 0,
        roughness: 0.06,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
        reflectivity: 0.7,
      }),
    ),
  inner: () => get('inner', () => new THREE.MeshStandardMaterial({ color: '#2a2c30', metalness: 0.85, roughness: 0.55 })),
  innerLight: () => get('innerLight', () => new THREE.MeshStandardMaterial({ color: '#8d9198', metalness: 0.9, roughness: 0.45 })),
  steel: () =>
    get('steel', () => {
      const m = new THREE.MeshPhysicalMaterial({ color: '#c9ccd1', metalness: 1, roughness: 0.32, anisotropy: 0.7 });
      m.roughnessMap = brushedTexture();
      m.roughnessMap.repeat.set(0.08, 0.08);
      return m;
    }),
  shield: () =>
    get('shield', () => {
      const m = new THREE.MeshPhysicalMaterial({ color: '#c4c7cc', metalness: 1, roughness: 0.4, anisotropy: 0.85, anisotropyRotation: Math.PI / 2 });
      m.envMapIntensity = 0.32;
      m.roughnessMap = brushedTexture();
      m.roughnessMap.repeat.set(0.12, 0.12);
      return m;
    }),
  blackPlastic: () => get('blackPlastic', () => new THREE.MeshStandardMaterial({ color: '#17181b', metalness: 0.05, roughness: 0.62 })),
  rubber: () => get('rubber', () => new THREE.MeshStandardMaterial({ color: '#0d0d0f', metalness: 0, roughness: 0.92 })),
  flex: () =>
    get('flex', () =>
      new THREE.MeshPhysicalMaterial({
        color: '#c9792a',
        metalness: 0.15,
        roughness: 0.42,
        clearcoat: 0.5,
        clearcoatRoughness: 0.35,
        side: THREE.DoubleSide,
        emissive: '#3a1c05',
        emissiveIntensity: 0.25,
      }),
    ),
  flexBlack: () => get('flexBlack', () => new THREE.MeshStandardMaterial({ color: '#1a1a1c', metalness: 0.2, roughness: 0.5, side: THREE.DoubleSide })),
  gold: () => get('gold', () => new THREE.MeshStandardMaterial({ color: '#e2bd62', metalness: 1, roughness: 0.28 })),
  copper: () => get('copper', () => new THREE.MeshStandardMaterial({ color: '#c8793d', metalness: 1, roughness: 0.32 })),
  plug: () => get('plug', () => new THREE.MeshStandardMaterial({ color: '#22232a', metalness: 0.4, roughness: 0.45 })),
  plugCap: () => get('plugCap', () => new THREE.MeshStandardMaterial({ color: '#b9bcc2', metalness: 1, roughness: 0.3 })),
  socket: () => get('socket', () => new THREE.MeshStandardMaterial({ color: '#d0b060', metalness: 1, roughness: 0.38 })),
  pcb: (variant: 'teal' | 'navy' | 'black', seed: number) =>
    get(`pcb:${variant}:${seed}`, () =>
      new THREE.MeshPhysicalMaterial({
        map: pcbTexture(variant, seed),
        metalness: 0.25,
        roughness: 0.5,
        clearcoat: 0.55,
        clearcoatRoughness: 0.3,
      }),
    ),
  chips: () => get('chips', () => new THREE.MeshStandardMaterial({ map: chipAtlasTexture(), metalness: 0.2, roughness: 0.42 })),
  batteryWrap: (map: THREE.Texture) =>
    get(`bat:${map.uuid}`, () => new THREE.MeshPhysicalMaterial({ map, metalness: 0.1, roughness: 0.38, clearcoat: 0.35, clearcoatRoughness: 0.4 })),
  batteryFoil: () => get('batFoil', () => new THREE.MeshStandardMaterial({ color: '#b8bbc0', metalness: 1, roughness: 0.4 })),
  tab: () => get('tab', () => new THREE.MeshStandardMaterial({ color: '#101012', metalness: 0, roughness: 0.75, side: THREE.DoubleSide })),
  adhesive: () =>
    get('adhesive', () =>
      new THREE.MeshPhysicalMaterial({
        color: '#e9e4d2',
        metalness: 0,
        roughness: 0.18,
        clearcoat: 1,
        clearcoatRoughness: 0.1,
        transparent: true,
        opacity: 0.78,
        side: THREE.DoubleSide,
      }),
    ),
  adhesiveBlack: () =>
    get('adhesiveBlack', () => new THREE.MeshPhysicalMaterial({ color: '#0c0c0e', metalness: 0, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.15 })),
  lens: () =>
    get('lens', () =>
      new THREE.MeshPhysicalMaterial({
        color: '#0a0d18',
        metalness: 0.2,
        roughness: 0.03,
        clearcoat: 1,
        clearcoatRoughness: 0.02,
        iridescence: 1,
        iridescenceIOR: 1.9,
        
        reflectivity: 1,
      }),
    ),
  lensRing: () => get('lensRing', () => new THREE.MeshStandardMaterial({ color: '#1b1c20', metalness: 0.9, roughness: 0.25 })),
  sapphire: () =>
    get('sapphire', () => new THREE.MeshPhysicalMaterial({ color: '#111216', metalness: 0, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03 })),
  grille: () =>
    get('grille', () => {
      const t = grilleTexture();
      const m = new THREE.MeshStandardMaterial({ map: t, metalness: 0.6, roughness: 0.5 });
      return m;
    }),
  coil: () => get('coil', () => new THREE.MeshStandardMaterial({ map: coilTexture(), metalness: 0.75, roughness: 0.4, transparent: true })),
  pearLogo: (dark: boolean) =>
    get(`pear:${dark}`, () =>
      new THREE.MeshPhysicalMaterial({
        alphaMap: pearLogoTexture(),
        color: dark ? '#0d0e10' : '#f4f4f4',
        transparent: true,
        metalness: 0.9,
        roughness: 0.15,
        clearcoat: 1,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    ),
  screwHead: (type: 'P2' | 'Y000' | 'PH000' | 'SO', stripped: boolean) =>
    get(`screwHead:${type}:${stripped}`, () => new THREE.MeshStandardMaterial({ map: screwHeadTexture(type, stripped), metalness: 0.9, roughness: 0.32 })),
  screwBody: (gold: boolean) =>
    get(`screwBody:${gold}`, () => new THREE.MeshStandardMaterial({ color: gold ? '#c9a857' : '#b4b8be', metalness: 1, roughness: 0.38 })),
  hole: () => get('hole', () => new THREE.MeshStandardMaterial({ color: '#050506', metalness: 0.3, roughness: 0.8 })),
  dark: () => get('dark', () => new THREE.MeshBasicMaterial({ color: '#020203' })),
  simCard: () => get('sim', () => new THREE.MeshStandardMaterial({ color: '#f1f1ee', metalness: 0, roughness: 0.6 })),
  foam: () => get('foam', () => new THREE.MeshStandardMaterial({ color: '#2c2d31', metalness: 0, roughness: 1 })),
  sticker: () => get('sticker', () => new THREE.MeshStandardMaterial({ color: '#e8e2cf', metalness: 0, roughness: 0.7 })),
  redDot: () => get('redDot', () => new THREE.MeshStandardMaterial({ color: '#d63a3a', metalness: 0, roughness: 0.6 })),
  whiteDot: () => get('whiteDot', () => new THREE.MeshStandardMaterial({ color: '#f2f2f2', metalness: 0, roughness: 0.6 })),
};
