import { createContext } from 'preact'
import { useContext, useState, useCallback, useRef } from 'preact/hooks'
import * as THREE from 'three'
import { SceneManager } from '../scene/SceneManager'
import { SelectionManager, TransformMode } from '../scene/SelectionManager'
import { AssetLoader, LoadedAsset } from '../scene/AssetLoader'

export interface SpawnBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
}

export interface SavedPose {
  position: THREE.Vector3
  quaternion: THREE.Quaternion
}

export interface SavedCondition {
  poses: Map<string, SavedPose>
}

export interface SceneState {
  sceneManager: SceneManager | null
  selectionManager: SelectionManager | null
  assetLoader: AssetLoader | null
  assets: LoadedAsset[]
  selectedAsset: LoadedAsset | null
  transformMode: TransformMode
  isRandomizeMode: boolean
  spawnBounds: SpawnBounds
  savedPoses: Map<string, SavedPose> | null
  savedConditions: SavedCondition[]
  instruction: string
}

export interface SceneActions {
  initScene: (container: HTMLElement) => void
  addAsset: (asset: LoadedAsset) => void
  removeAsset: (id: string) => void
  selectAsset: (asset: LoadedAsset | null) => void
  setTransformMode: (mode: TransformMode) => void
  updateAssetTransform: (id: string, position: { x: number; y: number; z: number }, rotation: { x: number; y: number; z: number }, scale: { x: number; y: number; z: number }) => void
  toggleAssetGravity: (id: string) => void
  enterRandomizeMode: () => void
  exitRandomizeMode: () => void
  setSpawnBounds: (bounds: SpawnBounds) => void
  setBoundsTransformMode: (mode: 'translate' | 'rotate' | 'scale') => void
  randomizeNonStaticAssets: () => void
  acceptRandomization: () => void
  clearSavedConditions: () => void
  setSavedConditions: (conditions: SavedCondition[]) => void
  setInstruction: (instruction: string) => void
}

export interface SceneContextValue extends SceneState, SceneActions {}

export const SceneContext = createContext<SceneContextValue | null>(null)

const DEFAULT_SPAWN_BOUNDS: SpawnBounds = {
  minX: -0.3,
  maxX: 0.3,
  minY: -0.3,
  maxY: 0.3,
  minZ: 0.05,
  maxZ: 0.15,
}

export function useSceneProvider(): SceneContextValue {
  const [sceneManager, setSceneManager] = useState<SceneManager | null>(null)
  const [selectionManager, setSelectionManager] = useState<SelectionManager | null>(null)
  const [assetLoader] = useState(() => new AssetLoader())
  const [assets, setAssets] = useState<LoadedAsset[]>([])
  const [selectedAsset, setSelectedAsset] = useState<LoadedAsset | null>(null)
  const [transformMode, setTransformModeState] = useState<TransformMode>('translate')
  const [isRandomizeMode, setIsRandomizeMode] = useState(false)
  const [spawnBounds, setSpawnBoundsState] = useState<SpawnBounds>(DEFAULT_SPAWN_BOUNDS)
  const [savedPoses, setSavedPoses] = useState<Map<string, SavedPose> | null>(null)
  const [savedConditions, setSavedConditions] = useState<SavedCondition[]>([])
  const [instruction, setInstruction] = useState('')
  const boundsBoxRef = useRef<THREE.Box3Helper | null>(null)
  const boundsMeshRef = useRef<THREE.Mesh | null>(null)

  const initScene = useCallback((container: HTMLElement) => {
    const sm = new SceneManager(container)
    setSceneManager(sm)

    const sel = new SelectionManager(sm.scene, sm.camera, sm.renderer, sm.controls)
    sel.setOnSelectionChange((asset) => {
      setSelectedAsset(asset)
    })
    setSelectionManager(sel)
  }, [])

  const addAsset = useCallback((asset: LoadedAsset) => {
    if (sceneManager) {
      sceneManager.scene.add(asset.object)
      setAssets((prev) => {
        const newAssets = [...prev, asset]
        selectionManager?.setAssets(newAssets)
        return newAssets
      })
    }
  }, [sceneManager, selectionManager])

  const removeAsset = useCallback((id: string) => {
    setAssets((prev) => {
      const asset = prev.find((a) => a.id === id)
      if (asset && sceneManager) {
        sceneManager.scene.remove(asset.object)
        if (selectedAsset?.id === id) {
          selectionManager?.select(null)
        }
      }
      const newAssets = prev.filter((a) => a.id !== id)
      selectionManager?.setAssets(newAssets)
      return newAssets
    })
  }, [sceneManager, selectionManager, selectedAsset])

  const selectAsset = useCallback((asset: LoadedAsset | null) => {
    selectionManager?.select(asset)
  }, [selectionManager])

  const setTransformMode = useCallback((mode: TransformMode) => {
    setTransformModeState(mode)
    selectionManager?.setMode(mode)
  }, [selectionManager])

  const updateAssetTransform = useCallback((
    id: string,
    position: { x: number; y: number; z: number },
    rotation: { x: number; y: number; z: number },
    scale: { x: number; y: number; z: number }
  ) => {
    const asset = assets.find((a) => a.id === id)
    if (asset) {
      asset.object.position.set(position.x, position.y, position.z)
      asset.object.rotation.set(
        rotation.x * (Math.PI / 180),
        rotation.y * (Math.PI / 180),
        rotation.z * (Math.PI / 180)
      )
      asset.object.scale.set(scale.x, scale.y, scale.z)
    }
  }, [assets])

  const toggleAssetGravity = useCallback((id: string) => {
    setAssets((prev) => {
      return prev.map((asset) => {
        if (asset.id === id) {
          return { ...asset, disableGravity: !asset.disableGravity }
        }
        return asset
      })
    })
  }, [])

  const createBoundsMesh = useCallback((bounds: SpawnBounds): THREE.Mesh => {
    // Calculate size and center from bounds (in Z-up coordinates)
    const sizeX = bounds.maxX - bounds.minX
    const sizeY = bounds.maxY - bounds.minY
    const sizeZ = bounds.maxZ - bounds.minZ
    const centerX = (bounds.minX + bounds.maxX) / 2
    const centerY = (bounds.minY + bounds.maxY) / 2
    const centerZ = (bounds.minZ + bounds.maxZ) / 2

    // Convert to Three.js Y-up: swap Y and Z, negate Y
    const geometry = new THREE.BoxGeometry(sizeX, sizeZ, sizeY)
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(centerX, centerZ, -centerY)
    return mesh
  }, [])

  const updateBoundsFromMesh = useCallback((mesh: THREE.Mesh) => {
    // Extract bounds from mesh position and scale
    const pos = mesh.position
    const scale = mesh.scale
    // Base geometry is 1x1x1 centered, so size = scale
    const geometry = mesh.geometry as THREE.BoxGeometry
    const params = geometry.parameters

    const sizeX = params.width * scale.x
    const sizeZ = params.height * scale.y  // Three.js Y = Z-up Z
    const sizeY = params.depth * scale.z   // Three.js Z = -Z-up Y

    // Convert back from Three.js Y-up to Z-up
    const newBounds: SpawnBounds = {
      minX: pos.x - sizeX / 2,
      maxX: pos.x + sizeX / 2,
      minY: -pos.z - sizeY / 2,
      maxY: -pos.z + sizeY / 2,
      minZ: pos.y - sizeZ / 2,
      maxZ: pos.y + sizeZ / 2,
    }
    setSpawnBoundsState(newBounds)

    // Update the wireframe helper to follow the mesh
    if (boundsBoxRef.current && sceneManager) {
      sceneManager.scene.remove(boundsBoxRef.current)
      const box = new THREE.Box3().setFromObject(mesh)
      const helper = new THREE.Box3Helper(box, new THREE.Color(0x00ff00))
      helper.material = new THREE.LineBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.8,
        depthTest: false,
      })
      sceneManager.scene.add(helper)
      boundsBoxRef.current = helper
    }
  }, [sceneManager])

  const updateBoundsVisualization = useCallback((bounds: SpawnBounds, createNew = false) => {
    if (!sceneManager) return

    // Remove existing visuals
    if (boundsBoxRef.current) {
      sceneManager.scene.remove(boundsBoxRef.current)
      boundsBoxRef.current = null
    }
    if (boundsMeshRef.current && createNew) {
      sceneManager.scene.remove(boundsMeshRef.current)
      boundsMeshRef.current = null
    }

    // Create mesh if needed
    if (!boundsMeshRef.current || createNew) {
      const mesh = createBoundsMesh(bounds)
      sceneManager.scene.add(mesh)
      boundsMeshRef.current = mesh
    }

    // Create wireframe helper
    const box = new THREE.Box3().setFromObject(boundsMeshRef.current)
    const helper = new THREE.Box3Helper(box, new THREE.Color(0x00ff00))
    helper.material = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.8,
      depthTest: false,
    })
    sceneManager.scene.add(helper)
    boundsBoxRef.current = helper
  }, [sceneManager, createBoundsMesh])

  const enterRandomizeMode = useCallback(() => {
    // Deselect any selected asset
    selectionManager?.select(null)
    setIsRandomizeMode(true)
    updateBoundsVisualization(spawnBounds, true)

    // Attach transform controls to bounds mesh
    if (boundsMeshRef.current && selectionManager) {
      selectionManager.attachToBoundsMesh(boundsMeshRef.current, updateBoundsFromMesh)
    }
  }, [spawnBounds, updateBoundsVisualization, selectionManager, updateBoundsFromMesh])

  const exitRandomizeMode = useCallback(() => {
    setIsRandomizeMode(false)

    // Detach transform controls from bounds mesh
    selectionManager?.detachBoundsMesh()

    // Remove bounds visualization
    if (boundsBoxRef.current && sceneManager) {
      sceneManager.scene.remove(boundsBoxRef.current)
      boundsBoxRef.current = null
    }
    if (boundsMeshRef.current && sceneManager) {
      sceneManager.scene.remove(boundsMeshRef.current)
      boundsMeshRef.current = null
    }
    setSavedPoses(null)
    // Note: savedConditions are preserved when exiting randomize mode
  }, [sceneManager, selectionManager])

  const setSpawnBounds = useCallback((bounds: SpawnBounds) => {
    setSpawnBoundsState(bounds)
    if (isRandomizeMode && boundsMeshRef.current && sceneManager) {
      // Update mesh position/scale from bounds
      sceneManager.scene.remove(boundsMeshRef.current)
      boundsMeshRef.current = null
      updateBoundsVisualization(bounds, true)
      if (boundsMeshRef.current && selectionManager) {
        selectionManager.attachToBoundsMesh(boundsMeshRef.current, updateBoundsFromMesh)
      }
    }
  }, [isRandomizeMode, updateBoundsVisualization, sceneManager, selectionManager, updateBoundsFromMesh])

  const setBoundsTransformMode = useCallback((mode: 'translate' | 'rotate' | 'scale') => {
    selectionManager?.setBoundsTransformMode(mode)
  }, [selectionManager])

  const getAssetBoundingBox = useCallback((asset: LoadedAsset): THREE.Box3 => {
    const box = new THREE.Box3()
    box.setFromObject(asset.object)
    return box
  }, [])

  const checkCollision = useCallback((box1: THREE.Box3, box2: THREE.Box3): boolean => {
    return box1.intersectsBox(box2)
  }, [])

  const getAssetLocalSize = useCallback((asset: LoadedAsset, useRotation?: THREE.Quaternion): THREE.Vector3 => {
    // Save current transform
    const savedPos = asset.object.position.clone()
    const savedQuat = asset.object.quaternion.clone()

    // Reset to origin, optionally with a specific rotation
    asset.object.position.set(0, 0, 0)
    if (useRotation) {
      asset.object.quaternion.copy(useRotation)
    } else {
      asset.object.quaternion.set(0, 0, 0, 1) // identity
    }

    const box = new THREE.Box3().setFromObject(asset.object)
    const size = new THREE.Vector3()
    box.getSize(size)

    // Restore transform
    asset.object.position.copy(savedPos)
    asset.object.quaternion.copy(savedQuat)

    return size
  }, [])

  const isBoxWithinSpawnBounds = useCallback((box: THREE.Box3): boolean => {
    // Convert spawn bounds from Z-up to Three.js Y-up for comparison
    // Spawn bounds (Z-up): X, Y, Z -> Three.js (Y-up): X, Z, -Y
    const minX = spawnBounds.minX
    const maxX = spawnBounds.maxX
    const minY = spawnBounds.minZ  // Z-up Z becomes Y-up Y
    const maxY = spawnBounds.maxZ
    const minZ = -spawnBounds.maxY // Z-up Y becomes -Y-up Z
    const maxZ = -spawnBounds.minY

    return (
      box.min.x >= minX && box.max.x <= maxX &&
      box.min.y >= minY && box.max.y <= maxY &&
      box.min.z >= minZ && box.max.z <= maxZ
    )
  }, [spawnBounds])

  const randomizeNonStaticAssets = useCallback(() => {
    // Get non-static (gravity-enabled) exportable assets
    const dynamicAssets = assets.filter(a => !a.excludeFromExport && !a.disableGravity && !a.locked)

    if (dynamicAssets.length === 0) return

    // Save current poses before randomizing
    const poses = new Map<string, SavedPose>()
    dynamicAssets.forEach(asset => {
      poses.set(asset.id, {
        position: asset.object.position.clone(),
        quaternion: asset.object.quaternion.clone(),
      })
    })
    setSavedPoses(poses)

    // Try to place each asset without collision and fully within bounds
    const placedBoxes: THREE.Box3[] = []
    const maxAttempts = 100

    for (const asset of dynamicAssets) {
      let placed = false

      // Get the saved rotation for this asset
      const savedPose = poses.get(asset.id)

      // Get asset size with the saved rotation applied (so bounds calculation accounts for orientation)
      const assetSize = getAssetLocalSize(asset, savedPose?.quaternion)
      // Use max of X/Z for horizontal extent since we rotate around Y
      const maxHorizontalExtent = Math.max(assetSize.x, assetSize.z) / 2
      const verticalExtent = assetSize.y / 2

      // Calculate shrunken bounds to ensure asset stays within (in Z-up coords)
      const validMinX = spawnBounds.minX + maxHorizontalExtent
      const validMaxX = spawnBounds.maxX - maxHorizontalExtent
      const validMinY = spawnBounds.minY + maxHorizontalExtent
      const validMaxY = spawnBounds.maxY - maxHorizontalExtent
      const validMinZ = spawnBounds.minZ + verticalExtent
      const validMaxZ = spawnBounds.maxZ - verticalExtent

      // Check if asset can fit at all
      const canFit = validMinX < validMaxX && validMinY < validMaxY && validMinZ < validMaxZ

      for (let attempt = 0; attempt < maxAttempts && !placed; attempt++) {
        let x: number, y: number, z: number

        if (canFit) {
          // Random position within shrunken bounds (Z-up to Y-up conversion)
          x = validMinX + Math.random() * (validMaxX - validMinX)
          y = validMinZ + Math.random() * (validMaxZ - validMinZ)  // Z-up Z -> Y-up Y
          z = -(validMinY + Math.random() * (validMaxY - validMinY))  // Z-up Y -> -Y-up Z
        } else {
          // Asset is too big, just center it
          x = (spawnBounds.minX + spawnBounds.maxX) / 2
          y = (spawnBounds.minZ + spawnBounds.maxZ) / 2
          z = -((spawnBounds.minY + spawnBounds.maxY) / 2)
        }

        // Random rotation around Y axis (up axis in Three.js), relative to saved orientation
        const rotY = Math.random() * Math.PI * 2
        const randomYRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY)

        // Apply transform
        asset.object.position.set(x, y, z)
        if (savedPose) {
          // Apply random Y rotation on top of the saved orientation
          asset.object.quaternion.copy(savedPose.quaternion).premultiply(randomYRotation)
        } else {
          asset.object.rotation.set(0, rotY, 0)
        }

        // Check collision with placed assets
        const assetBox = getAssetBoundingBox(asset)
        let hasCollision = false

        for (const placedBox of placedBoxes) {
          if (checkCollision(assetBox, placedBox)) {
            hasCollision = true
            break
          }
        }

        // Also verify asset is fully within spawn bounds
        const withinBounds = isBoxWithinSpawnBounds(assetBox)

        if (!hasCollision && withinBounds) {
          placedBoxes.push(assetBox)
          placed = true
        } else if (!canFit && !hasCollision) {
          // If asset can't fit but no collision, accept it
          placedBoxes.push(assetBox)
          placed = true
        }
      }

      // If couldn't place without collision, keep last attempted position
      if (!placed) {
        placedBoxes.push(getAssetBoundingBox(asset))
      }
    }

    // Update selection highlight if needed
    selectionManager?.updateHighlight()
  }, [assets, spawnBounds, getAssetBoundingBox, getAssetLocalSize, isBoxWithinSpawnBounds, checkCollision, selectionManager])

  const acceptRandomization = useCallback(() => {
    // Save the current poses to savedConditions
    const dynamicAssets = assets.filter(a => !a.excludeFromExport && !a.disableGravity && !a.locked)

    if (dynamicAssets.length > 0) {
      const poses = new Map<string, SavedPose>()
      dynamicAssets.forEach(asset => {
        poses.set(asset.id, {
          position: asset.object.position.clone(),
          quaternion: asset.object.quaternion.clone(),
        })
      })
      setSavedConditions(prev => [...prev, { poses }])
    }

    // Clear current saved poses and trigger new randomization
    setSavedPoses(null)

    // Use setTimeout to allow state to update, then call randomize
    setTimeout(() => {
      randomizeNonStaticAssets()
    }, 0)
  }, [assets, randomizeNonStaticAssets])

  const clearSavedConditions = useCallback(() => {
    setSavedConditions([])
  }, [])

  return {
    sceneManager,
    selectionManager,
    assetLoader,
    assets,
    selectedAsset,
    transformMode,
    isRandomizeMode,
    spawnBounds,
    savedPoses,
    savedConditions,
    instruction,
    initScene,
    addAsset,
    removeAsset,
    selectAsset,
    setTransformMode,
    updateAssetTransform,
    toggleAssetGravity,
    enterRandomizeMode,
    exitRandomizeMode,
    setSpawnBounds,
    setBoundsTransformMode,
    randomizeNonStaticAssets,
    acceptRandomization,
    clearSavedConditions,
    setSavedConditions,
    setInstruction,
  }
}

export function useScene(): SceneContextValue {
  const context = useContext(SceneContext)
  if (!context) {
    throw new Error('useScene must be used within SceneContext.Provider')
  }
  return context
}
