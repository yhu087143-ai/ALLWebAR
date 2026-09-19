import * as THREE from 'three'

/**
 * Web 端真 shader 特效。
 * 微信 xr-frame 端建议使用官方 Effect/粒子或降级为 emissive 网格（见 QualityManager）。
 */

export function createBlackHoleMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#ff6d00') },
      uCoreColor: { value: new THREE.Color('#000000') },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPos;
      void main() {
        vUv = uv;
        vNormal = normal;
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      uniform vec3 uCoreColor;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPos;
      void main() {
        vec2 p = vUv - 0.5;
        float r = length(p);
        float angle = atan(p.y, p.x);
        float swirl = angle + (1.0 - r) * 4.0 + uTime * 1.5;
        float ring = smoothstep(0.15, 0.22, r) * smoothstep(0.5, 0.45, r);
        vec3 col = mix(uCoreColor, uColor, ring);
        col += vec3(1.0, 0.5, 0.2) * pow(ring, 3.0) * 1.5;
        float fresnel = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 2.0);
        col += vec3(0.8, 0.4, 1.0) * fresnel * 0.6;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.DoubleSide,
  })
}

export function createEnergyBallMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#00e5ff') },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float fresnel = pow(1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0), 2.5);
        float pulse = 0.8 + 0.4 * sin(uTime * 4.0);
        vec3 col = uColor * fresnel * pulse;
        col += uColor * 0.15;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
  })
}

export function createDissolveMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#a259ff') },
      uSpeed: { value: 0.8 },
    },
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uSpeed;
      varying vec3 vPos;
      float hash(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      void main() {
        float n = hash(floor(vPos * 6.0));
        // 阈值随时间 sin 循环（0.1 ~ 0.6），不会一次溶完消失
        float threshold = 0.35 + 0.25 * sin(uTime * uSpeed);
        if (n < threshold) discard;
        float edge = 1.0 - smoothstep(threshold, threshold + 0.12, n);
        vec3 col = uColor * 0.2 + uColor * edge * 2.0;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.DoubleSide,
  })
}

export function createHologramMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#66ccff') },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = -mv.xyz;
        vPos = position;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vPos;
      void main() {
        float fresnel = pow(1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0), 2.0);
        // 水平扫描线沿局部 Y 向上滚动
        float scan = 0.5 + 0.5 * sin(vPos.y * 40.0 - uTime * 3.0);
        // 轻微闪烁
        float flicker = 0.9 + 0.1 * sin(uTime * 27.0) * sin(uTime * 7.3);
        vec3 col = uColor * (0.35 + fresnel * 1.2) * (0.75 + 0.25 * scan) * flicker;
        float alpha = (0.25 + fresnel * 0.6) * (0.8 + 0.2 * scan) * flicker;
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
  })
}

export function createShockwaveMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#ffffff') },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv - 0.5;
        float r = length(p) * 2.0;
        // 环形波从中心循环扩散，alpha 随半径与扩散进度衰减
        float t = fract(uTime * 0.6);
        float ring = 1.0 - smoothstep(0.0, 0.06, abs(r - t));
        float fade = (1.0 - smoothstep(0.6, 1.0, r)) * (1.0 - t);
        float alpha = ring * fade;
        if (alpha < 0.003) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
  })
}

export function updateShaderTime(obj: THREE.Object3D, time: number): void {
  obj.traverse((child) => {
    const isMesh = (child as THREE.Mesh).isMesh
    const isPoints = (child as THREE.Points).isPoints
    if (!isMesh && !isPoints) return
    const material = (child as THREE.Mesh).material as THREE.ShaderMaterial | THREE.ShaderMaterial[] | undefined
    const materials = Array.isArray(material) ? material : [material]
    for (const mat of materials) {
      if (mat instanceof THREE.ShaderMaterial && mat.uniforms.uTime) {
        mat.uniforms.uTime.value = time
      }
    }
  })
}
