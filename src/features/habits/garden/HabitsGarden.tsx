import { Suspense, useMemo, useRef, type ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, Sparkles, ContactShadows } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import type * as THREE from 'three';
import { useReducedMotion } from '@/shared/ui/useReducedMotion';
import './garden.css';

export interface GardenArea {
  id: string;
  name: string;
  color: string;
  progress: number; // 0..100
}

/** Evenly place N plants on a circle of the given radius. */
function circleLayout(count: number, radius: number): [number, number, number][] {
  if (count === 1) return [[0, 0, 0]];
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2;
    return [Math.cos(a) * radius, 0, Math.sin(a) * radius];
  });
}

function Plant({
  area,
  position,
  index,
  reduced,
  onSelect,
}: {
  area: GardenArea;
  position: [number, number, number];
  index: number;
  reduced: boolean;
  onSelect?: (id: string) => void;
}) {
  const swing = useRef<THREE.Group>(null);
  // Growth 0.7 → 1.7 with progress; even a fresh area reads as a small tree.
  const growth = 0.7 + (area.progress / 100) * 1.0;
  const emissive = 0.28 + area.progress / 170;

  useFrame((state) => {
    if (reduced || !swing.current) return;
    const t = state.clock.elapsedTime + index * 1.7;
    swing.current.rotation.z = Math.sin(t * 0.8) * 0.04;
    swing.current.position.y = Math.sin(t * 0.9) * 0.04;
  });

  const cones = [0, 1, 2];
  return (
    <group
      position={position}
      onPointerOver={() => onSelect && (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = 'auto')}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(area.id);
      }}
    >
      {/* Pedestal */}
      <mesh position={[0, -0.06, 0]} receiveShadow>
        <cylinderGeometry args={[0.66, 0.78, 0.24, 40]} />
        <meshStandardMaterial color="#0b241b" roughness={0.85} metalness={0.25} />
      </mesh>
      <mesh position={[0, 0.07, 0]} receiveShadow>
        <cylinderGeometry args={[0.6, 0.66, 0.06, 40]} />
        <meshStandardMaterial
          color={area.color}
          emissive={area.color}
          emissiveIntensity={0.35}
          roughness={0.4}
          metalness={0.2}
        />
      </mesh>

      <group ref={swing} position={[0, 0.1, 0]}>
        {/* Trunk */}
        <mesh position={[0, growth * 0.32, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.08, growth * 0.64, 10]} />
          <meshStandardMaterial color="#5a3a20" roughness={0.9} />
        </mesh>
        {/* Foliage — three stacked glowing tiers, tapering into a conifer silhouette */}
        {cones.map((i) => (
          <mesh key={i} position={[0, growth * (0.62 + i * 0.36), 0]} castShadow>
            <coneGeometry args={[growth * (0.52 - i * 0.14), growth * 0.56, 16]} />
            <meshStandardMaterial
              color={area.color}
              emissive={area.color}
              emissiveIntensity={emissive}
              roughness={0.45}
              metalness={0.1}
            />
          </mesh>
        ))}
        <pointLight
          position={[0, growth * 0.9, 0.2]}
          color={area.color}
          intensity={0.4 + area.progress / 90}
          distance={3.2}
        />
      </group>

      <Html center position={[0, growth * 1.75 + 0.55, 0]} distanceFactor={13} zIndexRange={[10, 0]}>
        <div className="garden-label">
          <strong>{area.name}</strong>
          <span>{Math.round(area.progress)}%</span>
        </div>
      </Html>
    </group>
  );
}

function Scene({
  areas,
  reduced,
  onSelect,
}: {
  areas: GardenArea[];
  reduced: boolean;
  onSelect?: (id: string) => void;
}) {
  const positions = useMemo(() => circleLayout(areas.length, 3.25), [areas.length]);
  return (
    <>
      <ambientLight intensity={0.4} />
      <hemisphereLight args={['#1c4a3c', '#020906', 0.55]} />
      <directionalLight position={[5, 9, 4]} intensity={1.15} castShadow shadow-mapSize={[1024, 1024]}>
        <orthographicCamera attach="shadow-camera" args={[-8, 8, 8, -8, 0.1, 30]} />
      </directionalLight>
      <spotLight position={[0, 8, 0]} angle={0.7} penumbra={1} intensity={0.6} color="#bff5df" />

      {/* Garden floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <circleGeometry args={[6.5, 64]} />
        <meshStandardMaterial color="#07160f" roughness={0.95} metalness={0.1} />
      </mesh>

      {areas.map((area, i) => (
        <Plant
          key={area.id}
          area={area}
          index={i}
          position={positions[i]!}
          reduced={reduced}
          onSelect={onSelect}
        />
      ))}

      <Sparkles count={70} scale={[11, 5, 11]} size={2.4} speed={reduced ? 0 : 0.4} color="#8fe3c0" />
      <ContactShadows position={[0, 0.02, 0]} opacity={0.45} scale={13} blur={2.6} far={4.5} />

      <OrbitControls
        enablePan={false}
        enableZoom={false}
        autoRotate={!reduced}
        autoRotateSpeed={0.45}
        minPolarAngle={Math.PI / 3.4}
        maxPolarAngle={Math.PI / 2.15}
      />
    </>
  );
}

export function HabitsGarden({
  areas,
  title,
  subtitle,
  emptyState,
  onSelect,
}: {
  areas: GardenArea[];
  title: string;
  subtitle: string;
  emptyState?: ReactNode;
  onSelect?: (id: string) => void;
}) {
  const reduced = useReducedMotion();
  return (
    <div className="habits-garden">
      <div className="garden-title">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      {areas.length === 0 ? (
        <div className="garden-empty">{emptyState}</div>
      ) : (
        <Canvas shadows dpr={[1, 1.75]} camera={{ position: [0, 3.4, 7.4], fov: 42 }}>
          <color attach="background" args={['#03110b']} />
          <fog attach="fog" args={['#03110b', 9, 19]} />
          <Suspense fallback={null}>
            <Scene areas={areas} reduced={reduced} onSelect={onSelect} />
            <EffectComposer>
              <Bloom mipmapBlur intensity={0.75} luminanceThreshold={0.2} luminanceSmoothing={0.35} />
              <Vignette eskil={false} offset={0.28} darkness={0.72} />
            </EffectComposer>
          </Suspense>
        </Canvas>
      )}
    </div>
  );
}
