/**
 * Guide module barrel export.
 */

export { GuideEngine } from './GuideEngine'
export type { GuideEvent, GuideEventPayloads } from './GuideEngine'
export type { INavigationSystem, NavigationEvent, NavigationEventPayloads } from './NavigationSystem'
export { GuideHUD } from './GuideHUD'
export { GUIDE_TEMPLATES } from './GuideTemplatePresets'

// Position providers
export type { IPositionProvider, UserPosition } from './position'
export { GPSPositionProvider, BLEPositionProvider, VPSPositionProvider } from './position'
