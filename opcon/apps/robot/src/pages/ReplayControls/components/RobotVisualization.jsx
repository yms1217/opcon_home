// components/RobotVisualization.jsx
import React, { useEffect, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Grid } from '@react-three/drei'
import * as THREE from 'three'
import URDFLoader from 'urdf-loader'

import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'

import { pickNearestJointStateSample, applyJointStateToRobot } from './urdf/jointStateBinding'

/**
 * RobotVisualization (URDF + MCAP /joint_states)
 */

function fitCameraToBox(camera, controlsRef, box, padding = 1.6) {
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  if (!Number.isFinite(maxDim) || maxDim <= 0) return

  const fov = (camera.fov * Math.PI) / 180
  const dist = (maxDim / 2 / Math.tan(fov / 2)) * padding

  const dir = new THREE.Vector3(1, 0.8, 1).normalize()
  camera.position.copy(center.clone().add(dir.multiplyScalar(dist)))

  // ✅ 반드시 추가
  camera.lookAt(center)

  // ✅ near를 충분히 작게, far는 충분히 크게
  camera.near = 0.01
  camera.far = 1000
  camera.updateProjectionMatrix()

  if (controlsRef?.current) {
    controlsRef.current.target.copy(center)
    controlsRef.current.update()
  }
}

// (옵션) 언마운트 시 geometry 정리용
function disposeObject3DGeometryOnly(obj) {
  if (!obj) return
  try {
    obj.traverse((n) => {
      if (n && n.isMesh) {
        if (n.geometry && typeof n.geometry.dispose === 'function') {
          n.geometry.dispose()
        }
        // material은 sharedMat을 재사용하므로 여기서 dispose 하지 않음
      }
    })
  } catch {}
}

function URDFRobot({ robotRef, controlsRef }) {
  const { scene, camera } = useThree()

  useEffect(() => {
    // ✅ baseURI 기반으로 계산 (서브패스 안전)
    const urdfUrl = new URL('urdf/hmc_v2_hand/hmc_v2_hand.urdf', document.baseURI).toString()
    const urdfRoot = new URL('urdf/hmc_v2_hand/', document.baseURI).toString().replace(/\/$/, '')

    const manager = new THREE.LoadingManager()
    if (typeof manager.resolveURL !== 'function') manager.resolveURL = (url) => url

    const loader = new URDFLoader(manager)

    loader.packages = {
      hmc_v2_hand_description: urdfRoot
    }

    // ✅ (2) 개선: material 1개 공유 (메쉬마다 새로 만들지 않기)
    const sharedMat = new THREE.MeshStandardMaterial({
      color: 0xcfd6e6,
      roughness: 0.5,
      metalness: 0.1
    })

    // mesh loaders
    const stl = new STLLoader(manager)
    const dae = new ColladaLoader(manager)
    const obj = new OBJLoader(manager)

    // ✅ (2) 개선: mesh 캐시 + inflight 합치기
    // - meshCache: 로딩 완료된 결과
    // - inflight: 같은 path가 동시에 여러 번 요청되면, 첫 1회 로딩에 콜백들을 묶어서 처리
    const meshCache = new Map() // key(path) -> THREE.Object3D (prototype)
    const inflight = new Map() // key(path) -> Array<doneCb>

    const finishInflight = (key, objectOrNull) => {
      const cbs = inflight.get(key)
      inflight.delete(key)
      if (!cbs) return
      for (const cb of cbs) {
        try {
          if (objectOrNull) cb(objectOrNull.clone(true))
          else cb(null)
        } catch {
          try {
            cb(null)
          } catch {}
        }
      }
    }

    loader.loadMeshCb = (path, _manager, done) => {
      const key = String(path || '')
      const lower = key.toLowerCase()

      // ✅ cache hit -> clone 반환
      const cached = meshCache.get(key)
      if (cached) {
        done(cached.clone(true))
        return
      }

      // ✅ inflight hit -> 콜백만 등록하고 종료
      const inflightList = inflight.get(key)
      if (inflightList) {
        inflightList.push(done)
        return
      }

      // ✅ 새 로드 시작
      inflight.set(key, [done])

      if (lower.endsWith('.stl')) {
        stl.load(
          path,
          (geo) => {
            // NOTE: computeVertexNormals는 무거울 수 있으나, 여기서는 기존 동작 유지
            try {
              geo.computeVertexNormals()
            } catch {}
            const mesh = new THREE.Mesh(geo, sharedMat)
            meshCache.set(key, mesh)
            finishInflight(key, mesh)
          },
          undefined,
          (err) => {
            console.error('[URDF] STL load failed:', path, err)
            finishInflight(key, null)
          }
        )
        return
      }

      if (lower.endsWith('.dae')) {
        dae.load(
          path,
          (collada) => {
            const root = collada?.scene
            if (!root) {
              finishInflight(key, null)
              return
            }

            // ✅ material 통일(가능한 범위에서)
            try {
              root.traverse((n) => {
                if (n && n.isMesh) n.material = sharedMat
              })
            } catch {}

            meshCache.set(key, root)
            finishInflight(key, root)
          },
          undefined,
          (err) => {
            console.error('[URDF] DAE load failed:', path, err)
            finishInflight(key, null)
          }
        )
        return
      }

      if (lower.endsWith('.obj')) {
        obj.load(
          path,
          (o) => {
            if (!o) {
              finishInflight(key, null)
              return
            }
            try {
              o.traverse((n) => {
                if (n && n.isMesh) n.material = sharedMat
              })
            } catch {}

            meshCache.set(key, o)
            finishInflight(key, o)
          },
          undefined,
          (err) => {
            console.error('[URDF] OBJ load failed:', path, err)
            finishInflight(key, null)
          }
        )
        return
      }

      console.warn('[URDF] Unsupported mesh type:', path)
      finishInflight(key, null)
    }

    let disposed = false

    loader.load(
      urdfUrl,
      (robot) => {
        if (disposed) return

        scene.add(robot)
        robotRef.current = robot

        // ROS(Z-up) → three.js(Y-up)
        robot.rotation.x = -Math.PI / 2
        robot.updateMatrixWorld(true)

        // ✅ 조건 없이 항상 스케일 정규화 (목표 높이 2.5 기준)
        const box1 = new THREE.Box3().setFromObject(robot)
        const size1 = box1.getSize(new THREE.Vector3())
        const maxDim1 = Math.max(size1.x, size1.y, size1.z)

        if (Number.isFinite(maxDim1) && maxDim1 > 0) {
          const s = 2.5 / maxDim1
          robot.scale.setScalar(s)
          robot.updateMatrixWorld(true)
        }

        // 스케일 적용 후 다시 box 계산
        const box2 = new THREE.Box3().setFromObject(robot)
        fitCameraToBox(camera, controlsRef, box2, 0.9)
      },
      undefined,
      (err) => console.error('[URDF] load failed:', err)
    )

    return () => {
      disposed = true

      // 로딩 중에 inflight로 묶인 콜백은 모두 null 처리 (안전)
      try {
        for (const [key, list] of inflight.entries()) {
          for (const cb of list) {
            try {
              cb(null)
            } catch {}
          }
          inflight.delete(key)
        }
      } catch {}

      if (robotRef.current) {
        try {
          scene.remove(robotRef.current)
        } catch {}
        // geometry 중심 정리 (sharedMat은 아래에서 1회 dispose)
        disposeObject3DGeometryOnly(robotRef.current)
        robotRef.current = null
      }

      // 캐시 정리 (geometry 중심)
      try {
        for (const v of meshCache.values()) disposeObject3DGeometryOnly(v)
        meshCache.clear()
      } catch {}

      try {
        sharedMat.dispose()
      } catch {}
    }
  }, [scene, camera, robotRef, controlsRef])

  return null
}

export default function RobotVisualization({ currentTime, mcapSummary }) {
  const robotRef = useRef(null)
  const controlsRef = useRef(null)

  const jointSamples = mcapSummary?.samples?.['/joint_states'] || null
  const timeRange = mcapSummary?.timeRange || null

  const lastAppliedRef = useRef({ idx: -1 })
  const debugOnceRef = useRef({ printedShape: false, printedReason: false })

  useEffect(() => {
    const robot = robotRef.current
    if (!robot) return
    if (!Array.isArray(jointSamples) || jointSamples.length === 0) return
    if (!Number.isFinite(currentTime)) return

    // 최초 1회: 샘플 구조 확인 로그 (너무 많이 찍히지 않게)
    if (!debugOnceRef.current.printedShape) {
      const s0 = jointSamples[0]
      const msg0 = s0?.msg ?? s0?.message ?? s0
      console.log('[joint_states sample shape]', {
        sampleKeys: s0 ? Object.keys(s0) : null,
        msgKeys: msg0 ? Object.keys(msg0) : null,
        nameType: msg0?.name ? Object.prototype.toString.call(msg0.name) : null,
        posType: msg0?.position ? Object.prototype.toString.call(msg0.position) : null,
        namesLen: msg0?.name?.length,
        posLen: msg0?.position?.length
      })
      debugOnceRef.current.printedShape = true
    }

    const picked = pickNearestJointStateSample(jointSamples, currentTime, timeRange)
    if (!picked) return

    // 같은 index는 스킵 (현재는 유지/미적용 상태)
    // if (picked.index === lastAppliedRef.current.idx) return
    // lastAppliedRef.current.idx = picked.index

    // 이름 변환 필요하면 여기에
    const nameTransform = null

    applyJointStateToRobot(robot, picked.sample?.msg ?? picked.sample, {
      nameTransform,
      onStats: (s) => {
        // reason이 있으면 1회만 출력
        if (s.reason && !debugOnceRef.current.printedReason) {
          console.warn('[joint_states->URDF skipped reason]', s.reason)
          debugOnceRef.current.printedReason = true
        }

        // 매칭 결과는 변화 있을 때만 출력 (스팸 방지)
        // (처음엔 한 번은 꼭 보이게)
        if (!debugOnceRef.current._printedOnce) {
          console.log('[joint_states->URDF]', { t: currentTime, idx: picked.index, ...s })
          debugOnceRef.current._printedOnce = true
        } else if (s.missing > 0 && s.missing !== debugOnceRef.current._lastMissing) {
          console.log('[joint_states->URDF]', { t: currentTime, idx: picked.index, ...s })
          debugOnceRef.current._lastMissing = s.missing
        }
      }
    })
  }, [currentTime, jointSamples, timeRange])

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 360 }}>
      <Canvas
        camera={{ position: [3, 2.5, 3], fov: 50, near: 0.01, far: 1000 }}
        style={{ width: '100%', height: '100%', background: '#0B1929' }}
      >
        <ambientLight intensity={0.65} />
        <directionalLight position={[4, 6, 4]} intensity={1.2} />
        <pointLight position={[-2, 3, -2]} intensity={0.25} />

        <URDFRobot robotRef={robotRef} controlsRef={controlsRef} />

        <Grid position={[0, 0, 0]} args={[4, 4]} cellSize={0.2} sectionSize={1} fadeDistance={5} />

        <OrbitControls ref={controlsRef} enablePan enableZoom enableRotate />
      </Canvas>
    </div>
  )
}
