import { Suspense, useMemo, useRef, type ReactNode } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, Sparkles } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useReducedMotion } from '@/shared/ui/useReducedMotion';
import './timeline.css';

export interface Milestone {
  id: string;
  label: string;
  meta?: string;
  done: boolean;
  current?: boolean;
}

/** A winding path receding into the distance — the day's road (spec §15 mockup). */
function dayCurve(count: number): THREE.CatmullRomCurve3 {
  const span = Math.max(count, 2);
  const pts = Array.from({ length: span }, (_, i) => {
    const t = i / (span - 1);
    return new THREE.Vector3(Math.sin(t * Math.PI * 1.6) * 2.4, 0, 1 - t * 15);
  });
  return new THREE.CatmullRomCurve3(pts);
}

function Path({ curve }: { curve: THREE.CatmullRomCurve3 }) {
  const geometry = useMemo(() => new THREE.TubeGeometry(curve, 140, 0.09, 12, false), [curve]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color="#0f3d30"
        emissive="#1f8f6c"
        emissiveIntensity={0.55}
        roughness={0.35}
        metalness={0.35}
      />
    </mesh>
  );
}

function Node({
  milestone,
  position,
  index,
  reduced,
}: {
  milestone: Milestone;
  position: [number, number, number];
  index: number;
  reduced: boolean;
}) {
  const orb = useRef<THREE.Group>(null);
  const color = milestone.current ? '#f5c451' : milestone.done ? '#34d399' : '#3f9a83';
  const emissive = milestone.current ? 1.4 : milestone.done ? 0.9 : 0.4;

  useFrame((state) => {
    if (reduced || !orb.current) return;
    const t = state.clock.elapsedTime;
    orb.current.position.y = 0.9 + (milestone.current ? Math.sin(t * 3) * 0.09 : Math.sin(t * 1.2 + index) * 0.03);
    orb.current.rotation.y = t * 0.5;
  });

  return (
    <group position={position}>
      <mesh position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.85, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissive * 0.5} />
      </mesh>
      <group ref={orb} position={[0, 0.9, 0]}>
        <mesh>
          <icosahedronGeometry args={[milestone.current ? 0.23 : 0.16, 1]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={emissive} roughness={0.3} />
        </mesh>
        <pointLight color={color} intensity={emissive} distance={2.6} />
      </group>
      <Html
        center
        position={[0, 1.5 + (index % 2 === 0 ? 0 : 0.72), 0]}
        distanceFactor={16}
        zIndexRange={[10, 0]}
      >
        <div
          className={`timeline-node ${milestone.current ? 'is-now' : milestone.done ? 'is-done' : ''}`}
        >
          <strong>{milestone.label}</strong>
          {milestone.meta ? <span>{milestone.meta}</span> : null}
        </div>
      </Html>
    </group>
  );
}

function Scene({ milestones, reduced }: { milestones: Milestone[]; reduced: boolean }) {
  const curve = useMemo(() => dayCurve(milestones.length), [milestones.length]);
  const positions = useMemo(
    () =>
      milestones.map((_, i) => {
        const t = milestones.length <= 1 ? 0 : i / (milestones.length - 1);
        const p = curve.getPointAt(t);
        return [p.x, p.y, p.z] as [number, number, number];
      }),
    [curve, milestones],
  );

  useFrame((state) => {
    if (reduced) return;
    state.camera.position.x = Math.sin(state.clock.elapsedTime * 0.18) * 0.5;
    state.camera.lookAt(0, 0.7, -5);
  });

  return (
    <>
      <ambientLight intensity={0.42} />
      <hemisphereLight args={['#1c4a3c', '#02100b', 0.5]} />
      <directionalLight position={[4, 8, 6]} intensity={0.9} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, -4]}>
        <planeGeometry args={[46, 46]} />
        <meshStandardMaterial color="#04120d" roughness={1} />
      </mesh>
      <Path curve={curve} />
      {milestones.map((m, i) => (
        <Node key={m.id} milestone={m} index={i} position={positions[i]!} reduced={reduced} />
      ))}
      <Sparkles
        count={60}
        scale={[16, 5, 20]}
        position={[0, 2, -4]}
        size={2.2}
        speed={reduced ? 0 : 0.3}
        color="#9fe8cd"
      />
    </>
  );
}

export function DayTimeline3D({
  milestones,
  title,
  subtitle,
  emptyState,
}: {
  milestones: Milestone[];
  title: string;
  subtitle: string;
  emptyState?: ReactNode;
}) {
  const reduced = useReducedMotion();
  return (
    <div className="day-timeline">
      <div className="timeline-title">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      {milestones.length === 0 ? (
        <div className="timeline-empty">{emptyState}</div>
      ) : (
        <Canvas
          dpr={[1, 1.75]}
          camera={{ position: [0, 3.9, 8.2], fov: 44 }}
          onCreated={({ camera }) => camera.lookAt(0, 0.7, -5)}
        >
          <color attach="background" args={['#03110b']} />
          <fog attach="fog" args={['#03110b', 6, 21]} />
          <Suspense fallback={null}>
            <Scene milestones={milestones} reduced={reduced} />
            <EffectComposer>
              <Bloom mipmapBlur intensity={0.8} luminanceThreshold={0.2} luminanceSmoothing={0.32} />
              <Vignette eskil={false} offset={0.3} darkness={0.7} />
            </EffectComposer>
          </Suspense>
        </Canvas>
      )}
    </div>
  );
}
