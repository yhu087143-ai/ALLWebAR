declare module 'mind-ar/dist/mindar-image-three.prod.js' {
  export class MindARThree {
    constructor(config: {
      container: HTMLElement
      imageTargetSrc: string
      filterMinCF?: number
      filterBeta?: number
      missTolerance?: number
      warmupTolerance?: number
      /**
       * 同时追踪的目标数量上限（mind-ar 1.2.5 支持），默认 1。
       * 多目标 .mind 文件中每个 target 对应一个 addAnchor(targetIndex)。
       */
      maxTrack?: number
    })
    renderer: any
    scene: any
    camera: any
    cssRenderer: any
    video: HTMLVideoElement
    start(): Promise<void>
    stop(): Promise<void>
    addAnchor(featureIndex: number): any
    switchCamera?(): Promise<void>
  }
}

declare module 'mind-ar/dist/mindar-face-three.prod.js' {
  export class MindARThree {
    constructor(config: {
      container: HTMLElement
    })
    renderer: any
    scene: any
    camera: any
    cssRenderer: any
    video: HTMLVideoElement
    start(): Promise<void>
    stop(): Promise<void>
    addAnchor(featureIndex: number): any
    switchCamera?(): Promise<void>
    faceResult?: any[]
  }
}
