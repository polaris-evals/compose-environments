import { createContext } from 'preact'
import { useContext, useState, useCallback, useRef, useEffect } from 'preact/hooks'
import * as THREE from 'three'
import { SceneManager } from '../scene/SceneManager'
import { SelectionManager, TransformMode, TransformDragEvent } from '../scene/SelectionManager'
import { AssetLoader, LoadedAsset } from '../scene/AssetLoader'
import { useHistory, Command } from './useHistory'

export interface SpawnBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
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
  saveCurrentCondition: () => void
  deleteCondition: (index: number) => void
  loadCondition: (index: number) => void
  clearSavedConditions: () => void
  setSavedConditions: (conditions: SavedCondition[]) => void
  setInstruction: (instruction: string) => void
  // History actions
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  // For property panel batching
  createTransformCommand: (id: string, before: { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number } }, after: { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number } }) => void
  // For instruction panel batching
  createInstructionCommand: (before: string, after: string) => void
  // For bounds input batching
  createSpawnBoundsCommand: (before: SpawnBounds, after: SpawnBounds) => void
}

export interface SceneContextValue extends SceneState, SceneActions {}

export const SceneContext = createContext<SceneContextValue | null>(null)

const DEFAULT_SPAWN_BOUNDS: SpawnBounds = {
  minX: -0.3,
  maxX: 0.3,
  minY: -0.3,
  maxY: 0.3,
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

  // History management
  const history = useHistory()
  const assetsRef = useRef<LoadedAsset[]>([])
  assetsRef.current = assets

  // Helper to apply transform to an asset
  const applyTransform = useCallback((
    id: string,
    position: { x: number; y: number; z: number },
    rotation: { x: number; y: number; z: number },
    scale: { x: number; y: number; z: number }
  ) => {
    const asset = assetsRef.current.find((a) => a.id === id)
    if (asset) {
      asset.object.position.set(position.x, position.y, position.z)
      asset.object.rotation.set(
        rotation.x * (Math.PI / 180),
        rotation.y * (Math.PI / 180),
        rotation.z * (Math.PI / 180)
      )
      asset.object.scale.set(scale.x, scale.y, scale.z)
    }
  }, [])

  // Create and push a transform command (for property panel and gizmo)
  const createTransformCommand = useCallback((
    id: string,
    before: { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number } },
    after: { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number } }
  ) => {
    const command: Command = {
      type: 'transform',
      execute: () => applyTransform(id, after.position, after.rotation, after.scale),
      undo: () => applyTransform(id, before.position, before.rotation, before.scale),
    }
    history.pushCommand(command)
  }, [applyTransform, history])

  // Create and push an instruction command (for instruction panel)
  const createInstructionCommand = useCallback((before: string, after: string) => {
    const command: Command = {
      type: 'instruction',
      execute: () => setInstruction(after),
      undo: () => setInstruction(before),
    }
    history.pushCommand(command)
  }, [history])

  // Create and push a spawn bounds command (for bounds input)
  const createSpawnBoundsCommand = useCallback((before: SpawnBounds, after: SpawnBounds) => {
    const command: Command = {
      type: 'spawnBounds',
      execute: () => setSpawnBoundsState(after),
      undo: () => setSpawnBoundsState(before),
    }
    history.pushCommand(command)
  }, [history])

  // Handle transform drag end from SelectionManager
  const handleTransformDragEnd = useCallback((event: TransformDragEvent) => {
    createTransformCommand(event.assetId, event.before, event.after)
  }, [createTransformCommand])

  const initScene = useCallback((container: HTMLElement) => {
    const sm = new SceneManager(container)
    setSceneManager(sm)

    const sel = new SelectionManager(sm.scene, sm.camera, sm.renderer, sm.controls)
    sel.setOnSelectionChange((asset) => {
      setSelectedAsset(asset)
    })
    setSelectionManager(sel)
  }, [])

  // Set up transform drag end callback when selection manager is available
  useEffect(() => {
    if (selectionManager) {
      selectionManager.setOnTransformDragEnd(handleTransformDragEnd)
    }
  }, [selectionManager, handleTransformDragEnd])

  // Internal add asset (no history)
  const doAddAsset = useCallback((asset: LoadedAsset) => {
    if (sceneManager) {
      sceneManager.scene.add(asset.object)
      setAssets((prev) => {
        const newAssets = [...prev, asset]
        selectionManager?.setAssets(newAssets)
        return newAssets
      })
    }
  }, [sceneManager, selectionManager])

  // Internal remove asset (no history)
  const doRemoveAsset = useCallback((id: string) => {
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

  // Public add asset with history
  const addAsset = useCallback((asset: LoadedAsset) => {
    doAddAsset(asset)
    const command: Command = {
      type: 'addAsset',
      execute: () => doAddAsset(asset),
      undo: () => doRemoveAsset(asset.id),
    }
    history.pushCommand(command)
  }, [doAddAsset, doRemoveAsset, history])

  // Public remove asset with history
  const removeAsset = useCallback((id: string) => {
    const asset = assetsRef.current.find((a) => a.id === id)
    if (!asset) return
    const wasSelected = selectedAsset?.id === id
    doRemoveAsset(id)
    const command: Command = {
      type: 'removeAsset',
      execute: () => doRemoveAsset(id),
      undo: () => {
        doAddAsset(asset)
        if (wasSelected) {
          selectionManager?.select(asset)
        }
      },
    }
    history.pushCommand(command)
  }, [doAddAsset, doRemoveAsset, selectedAsset, selectionManager, history])

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

  // Internal toggle gravity (no history)
  const doToggleAssetGravity = useCallback((id: string) => {
    setAssets((prev) => {
      return prev.map((asset) => {
        if (asset.id === id) {
          return { ...asset, disableGravity: !asset.disableGravity }
        }
        return asset
      })
    })
  }, [])

  // Public toggle gravity with history
  const toggleAssetGravity = useCallback((id: string) => {
    doToggleAssetGravity(id)
    const command: Command = {
      type: 'toggleGravity',
      execute: () => doToggleAssetGravity(id),
      undo: () => doToggleAssetGravity(id), // Toggle is self-reversing
    }
    history.pushCommand(command)
  }, [doToggleAssetGravity, history])

  const createBoundsMesh = useCallback((bounds: SpawnBounds): THREE.Mesh => {
    // Calculate size and center from bounds (in Z-up coordinates)
    const sizeX = bounds.maxX - bounds.minX
    const sizeY = bounds.maxY - bounds.minY
    const centerX = (bounds.minX + bounds.maxX) / 2
    const centerY = (bounds.minY + bounds.maxY) / 2

    // Create a flat plane (PlaneGeometry lies in XY, we rotate it to be horizontal)
    // In Three.js Y-up: plane should be in XZ plane (horizontal ground)
    const geometry = new THREE.PlaneGeometry(sizeX, sizeY)
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(geometry, material)
    // Rotate plane to be horizontal (in XZ plane) and position it
    // PlaneGeometry is in XY by default, rotate -90 degrees around X to make it horizontal
    mesh.rotation.x = -Math.PI / 2
    // Position: centerX stays, Y=0 (ground), Z=-centerY (Z-up Y becomes -Three.js Z)
    mesh.position.set(centerX, 0, -centerY)
    return mesh
  }, [])

  const updateBoundsFromMesh = useCallback((mesh: THREE.Mesh) => {
    // Extract bounds from mesh position and scale
    const pos = mesh.position
    const scale = mesh.scale
    const geometry = mesh.geometry as THREE.PlaneGeometry
    const params = geometry.parameters

    // PlaneGeometry width/height, scaled
    const sizeX = params.width * scale.x
    const sizeY = params.height * scale.z  // After rotation, scale.z affects the depth (Y in Z-up)

    // Convert back from Three.js Y-up to Z-up
    const newBounds: SpawnBounds = {
      minX: pos.x - sizeX / 2,
      maxX: pos.x + sizeX / 2,
      minY: -pos.z - sizeY / 2,
      maxY: -pos.z + sizeY / 2,
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

  // Helper to apply poses to assets (for undo/redo)
  const applyPoses = useCallback((poses: Map<string, SavedPose>) => {
    poses.forEach((pose, id) => {
      const asset = assetsRef.current.find(a => a.id === id)
      if (asset) {
        asset.object.position.copy(pose.position)
        asset.object.quaternion.copy(pose.quaternion)
      }
    })
    selectionManager?.updateHighlight()
  }, [selectionManager])

  // Helper to capture current poses of dynamic assets
  const capturePoses = useCallback((): Map<string, SavedPose> => {
    const dynamicAssets = assetsRef.current.filter(a => !a.excludeFromExport && !a.disableGravity && !a.locked)
    const poses = new Map<string, SavedPose>()
    dynamicAssets.forEach(asset => {
      poses.set(asset.id, {
        position: asset.object.position.clone(),
        quaternion: asset.object.quaternion.clone(),
      })
    })
    return poses
  }, [])

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
    // Only check X and Y bounds (2D plane), ignore Z/height
    // Spawn bounds (Z-up): X, Y -> Three.js (Y-up): X, -Z
    const minX = spawnBounds.minX
    const maxX = spawnBounds.maxX
    const minZ = -spawnBounds.maxY // Z-up Y becomes -Y-up Z
    const maxZ = -spawnBounds.minY

    return (
      box.min.x >= minX && box.max.x <= maxX &&
      box.min.z >= minZ && box.max.z <= maxZ
    )
  }, [spawnBounds])

  // Internal randomize (no history)
  const doRandomizeNonStaticAssets = useCallback(() => {
    // Get non-static (gravity-enabled) exportable assets
    const dynamicAssets = assetsRef.current.filter(a => !a.excludeFromExport && !a.disableGravity && !a.locked)

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

    // Try to place each asset without collision and within 2D bounds
    const placedBoxes: THREE.Box3[] = []
    const maxAttempts = 100

    for (const asset of dynamicAssets) {
      let placed = false

      // Get the saved pose for this asset (to preserve Z/height)
      const savedPose = poses.get(asset.id)

      // Get asset size with the saved rotation applied (so bounds calculation accounts for orientation)
      const assetSize = getAssetLocalSize(asset, savedPose?.quaternion)
      // Use max of X/Z for horizontal extent since we rotate around Y
      const maxHorizontalExtent = Math.max(assetSize.x, assetSize.z) / 2

      // Calculate shrunken bounds to ensure asset stays within (in Z-up coords, only X and Y)
      const validMinX = spawnBounds.minX + maxHorizontalExtent
      const validMaxX = spawnBounds.maxX - maxHorizontalExtent
      const validMinY = spawnBounds.minY + maxHorizontalExtent
      const validMaxY = spawnBounds.maxY - maxHorizontalExtent

      // Check if asset can fit at all (only X and Y)
      const canFit = validMinX < validMaxX && validMinY < validMaxY

      // Preserve the original height (Three.js Y = Z-up Z)
      const originalHeight = savedPose ? savedPose.position.y : asset.object.position.y

      for (let attempt = 0; attempt < maxAttempts && !placed; attempt++) {
        let x: number, z: number

        if (canFit) {
          // Random position within shrunken bounds (Z-up to Y-up conversion)
          // Only randomize X and Y (Z-up), keep height unchanged
          x = validMinX + Math.random() * (validMaxX - validMinX)
          z = -(validMinY + Math.random() * (validMaxY - validMinY))  // Z-up Y -> -Y-up Z
        } else {
          // Asset is too big, just center it horizontally
          x = (spawnBounds.minX + spawnBounds.maxX) / 2
          z = -((spawnBounds.minY + spawnBounds.maxY) / 2)
        }

        // Random rotation around Y axis (up axis in Three.js), relative to saved orientation
        const rotY = Math.random() * Math.PI * 2
        const randomYRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY)

        // Apply transform - keep original height (Y in Three.js)
        asset.object.position.set(x, originalHeight, z)
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

        // Verify asset is within spawn bounds (only X and Y)
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
  }, [spawnBounds, getAssetBoundingBox, getAssetLocalSize, isBoxWithinSpawnBounds, checkCollision, selectionManager])

  // Public randomize with history
  const randomizeNonStaticAssets = useCallback(() => {
    const beforePoses = capturePoses()
    if (beforePoses.size === 0) return

    doRandomizeNonStaticAssets()

    const afterPoses = capturePoses()

    const command: Command = {
      type: 'randomize',
      execute: () => applyPoses(afterPoses),
      undo: () => applyPoses(beforePoses),
    }
    history.pushCommand(command)
  }, [capturePoses, doRandomizeNonStaticAssets, applyPoses, history])

  // Internal functions for savedConditions manipulation
  const savedConditionsRef = useRef<SavedCondition[]>([])
  savedConditionsRef.current = savedConditions

  const doAddSavedCondition = useCallback((condition: SavedCondition) => {
    setSavedConditions(prev => [...prev, condition])
  }, [])

  const doRemoveLastSavedCondition = useCallback(() => {
    setSavedConditions(prev => prev.slice(0, -1))
  }, [])

  const doSetSavedConditions = useCallback((conditions: SavedCondition[]) => {
    setSavedConditions(conditions)
  }, [])

  // Save current condition without triggering randomization
  const saveCurrentCondition = useCallback(() => {
    const dynamicAssets = assetsRef.current.filter(a => !a.excludeFromExport && !a.disableGravity && !a.locked)

    if (dynamicAssets.length > 0) {
      const poses = new Map<string, SavedPose>()
      dynamicAssets.forEach(asset => {
        poses.set(asset.id, {
          position: asset.object.position.clone(),
          quaternion: asset.object.quaternion.clone(),
        })
      })
      const condition: SavedCondition = { poses }
      doAddSavedCondition(condition)

      // Create command for the condition addition
      const command: Command = {
        type: 'saveCondition',
        execute: () => doAddSavedCondition(condition),
        undo: () => doRemoveLastSavedCondition(),
      }
      history.pushCommand(command)
    }
  }, [doAddSavedCondition, doRemoveLastSavedCondition, history])

  // Public acceptRandomization with history (save + randomize)
  const acceptRandomization = useCallback(() => {
    // Save the current poses to savedConditions
    const dynamicAssets = assetsRef.current.filter(a => !a.excludeFromExport && !a.disableGravity && !a.locked)

    if (dynamicAssets.length > 0) {
      const poses = new Map<string, SavedPose>()
      dynamicAssets.forEach(asset => {
        poses.set(asset.id, {
          position: asset.object.position.clone(),
          quaternion: asset.object.quaternion.clone(),
        })
      })
      const condition: SavedCondition = { poses }
      doAddSavedCondition(condition)

      // Create command for the condition addition
      const command: Command = {
        type: 'acceptRandomization',
        execute: () => doAddSavedCondition(condition),
        undo: () => doRemoveLastSavedCondition(),
      }
      history.pushCommand(command)
    }

    // Clear current saved poses and trigger new randomization
    setSavedPoses(null)

    // Use setTimeout to allow state to update, then call randomize
    setTimeout(() => {
      randomizeNonStaticAssets()
    }, 0)
  }, [doAddSavedCondition, doRemoveLastSavedCondition, randomizeNonStaticAssets, history])

  // Public clearSavedConditions with history
  const clearSavedConditions = useCallback(() => {
    const previousConditions = [...savedConditionsRef.current]
    if (previousConditions.length === 0) return

    doSetSavedConditions([])

    const command: Command = {
      type: 'clearConditions',
      execute: () => doSetSavedConditions([]),
      undo: () => doSetSavedConditions(previousConditions),
    }
    history.pushCommand(command)
  }, [doSetSavedConditions, history])

  // Delete a specific condition by index
  const deleteCondition = useCallback((index: number) => {
    const previousConditions = [...savedConditionsRef.current]
    if (index < 0 || index >= previousConditions.length) return

    const newConditions = previousConditions.filter((_, i) => i !== index)
    doSetSavedConditions(newConditions)

    const command: Command = {
      type: 'deleteCondition',
      execute: () => doSetSavedConditions(newConditions),
      undo: () => doSetSavedConditions(previousConditions),
    }
    history.pushCommand(command)
  }, [doSetSavedConditions, history])

  // Load a saved condition (apply its poses to current assets)
  const loadCondition = useCallback((index: number) => {
    const conditions = savedConditionsRef.current
    if (index < 0 || index >= conditions.length) return

    const condition = conditions[index]
    const beforePoses = capturePoses()

    // Apply poses from the condition
    applyPoses(condition.poses)

    const afterPoses = capturePoses()

    const command: Command = {
      type: 'loadCondition',
      execute: () => applyPoses(afterPoses),
      undo: () => applyPoses(beforePoses),
    }
    history.pushCommand(command)
  }, [capturePoses, applyPoses, history])

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
    saveCurrentCondition,
    deleteCondition,
    loadCondition,
    clearSavedConditions,
    setSavedConditions,
    setInstruction,
    // History
    undo: history.undo,
    redo: history.redo,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    createTransformCommand,
    createInstructionCommand,
    createSpawnBoundsCommand,
  }
}

export function useScene(): SceneContextValue {
  const context = useContext(SceneContext)
  if (!context) {
    throw new Error('useScene must be used within SceneContext.Provider')
  }
  return context
}
