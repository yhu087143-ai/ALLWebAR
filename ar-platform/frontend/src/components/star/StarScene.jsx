// src/components/star/StarScene.jsx
import BackgroundLayer from './BackgroundLayer';
import ConstellationLayer from './ConstellationLayer';
import ParticleLayer from './ParticleLayer';

export default function StarScene({
  children,
  activePage,
  layers = { nebula: true, dust: true, particles: true, flow: true },
  onNavigate,
  className = '',
}) {
  return (
    <div className={`relative min-h-screen star-bg ${className}`}>
      {/* Layer 1: Background */}
      <BackgroundLayer nebula={layers.nebula} dust={layers.dust} />

      {/* Layer 2 & 3: Constellation + Stars */}
      <div className="absolute inset-0" style={{ zIndex: 1 }}>
        <ConstellationLayer
          activePage={activePage}
          showFlow={layers.flow}
          onNavigate={onNavigate}
        />
      </div>

      {/* Layer 4: Page content */}
      <div className="relative" style={{ zIndex: 10 }}>
        {children}
      </div>

      {/* Layer 5: Particles */}
      <ParticleLayer count={150} enabled={layers.particles} parallax />
    </div>
  );
}
