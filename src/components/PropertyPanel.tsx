import { useState, useEffect, useRef } from 'preact/hooks'
import { useScene } from '../hooks/useScene'

interface Vec3 {
  x: number
  y: number
  z: number
}

interface TransformSnapshot {
  position: Vec3
  rotation: Vec3
  scale: Vec3
}

export function PropertyPanel() {
  const { selectedAsset, assets, updateAssetTransform, selectionManager, toggleAssetGravity, createTransformCommand } = useScene()

  // Get the current asset from assets array to have reactive disableGravity
  const currentAsset = selectedAsset ? assets.find(a => a.id === selectedAsset.id) : null

  const [position, setPosition] = useState<Vec3>({ x: 0, y: 0, z: 0 })
  const [rotation, setRotation] = useState<Vec3>({ x: 0, y: 0, z: 0 })
  const [scale, setScale] = useState<Vec3>({ x: 1, y: 1, z: 1 })

  // Track the "before" transform for undo batching
  const beforeTransformRef = useRef<TransformSnapshot | null>(null)
  const selectedAssetIdRef = useRef<string | null>(null)

  // Commit any pending transform changes when asset changes
  useEffect(() => {
    const previousAssetId = selectedAssetIdRef.current
    const currentAssetId = selectedAsset?.id || null

    // If asset changed and we have uncommitted changes, commit them
    if (previousAssetId && previousAssetId !== currentAssetId && beforeTransformRef.current) {
      const before = beforeTransformRef.current
      const after = { position, rotation, scale }
      if (!transformsEqual(before, after)) {
        createTransformCommand(previousAssetId, before, after)
      }
      beforeTransformRef.current = null
    }

    selectedAssetIdRef.current = currentAssetId
  }, [selectedAsset, position, rotation, scale, createTransformCommand])

  // Sync state with selected asset
  useEffect(() => {
    if (selectedAsset) {
      const obj = selectedAsset.object
      setPosition({
        x: round(obj.position.x),
        y: round(obj.position.y),
        z: round(obj.position.z),
      })
      setRotation({
        x: round(obj.rotation.x * (180 / Math.PI)),
        y: round(obj.rotation.y * (180 / Math.PI)),
        z: round(obj.rotation.z * (180 / Math.PI)),
      })
      setScale({
        x: round(obj.scale.x),
        y: round(obj.scale.y),
        z: round(obj.scale.z),
      })
      // Clear before transform when selecting a new asset
      beforeTransformRef.current = null
    }
  }, [selectedAsset])

  // Listen for gizmo changes
  useEffect(() => {
    if (selectionManager) {
      selectionManager.setOnTransformChange((event) => {
        setPosition({
          x: round(event.position.x),
          y: round(event.position.y),
          z: round(event.position.z),
        })
        setRotation({
          x: round(event.rotation.x * (180 / Math.PI)),
          y: round(event.rotation.y * (180 / Math.PI)),
          z: round(event.rotation.z * (180 / Math.PI)),
        })
        setScale({
          x: round(event.scale.x),
          y: round(event.scale.y),
          z: round(event.scale.z),
        })
      })
    }
  }, [selectionManager])

  // Capture before transform on focus
  const handleInputFocus = () => {
    if (!beforeTransformRef.current) {
      beforeTransformRef.current = {
        position: { ...position },
        rotation: { ...rotation },
        scale: { ...scale },
      }
    }
  }

  // Commit changes on blur
  const handleInputBlur = () => {
    if (selectedAsset && beforeTransformRef.current) {
      const before = beforeTransformRef.current
      const after = { position, rotation, scale }
      if (!transformsEqual(before, after)) {
        createTransformCommand(selectedAsset.id, before, after)
      }
      beforeTransformRef.current = null
    }
  }

  const handlePositionChange = (axis: keyof Vec3, value: string) => {
    const num = parseFloat(value) || 0
    const newPos = { ...position, [axis]: num }
    setPosition(newPos)
    if (selectedAsset) {
      updateAssetTransform(selectedAsset.id, newPos, rotation, scale)
    }
  }

  const handleRotationChange = (axis: keyof Vec3, value: string) => {
    const num = parseFloat(value) || 0
    const newRot = { ...rotation, [axis]: num }
    setRotation(newRot)
    if (selectedAsset) {
      updateAssetTransform(selectedAsset.id, position, newRot, scale)
    }
  }

  const handleScaleChange = (axis: keyof Vec3, value: string) => {
    const num = parseFloat(value) || 1
    const newScale = { ...scale, [axis]: num }
    setScale(newScale)
    if (selectedAsset) {
      updateAssetTransform(selectedAsset.id, position, rotation, newScale)
    }
  }

  if (!selectedAsset) {
    return (
      <div class="panel panel-right">
        <div class="panel-header">Properties</div>
        <div class="panel-content">
          <div class="empty-state">
            <p>No asset selected</p>
            <p style={{ marginTop: '8px', fontSize: '11px' }}>
              Click an asset to edit its transform
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div class="panel panel-right">
      <div class="panel-header">Properties</div>
      <div class="panel-content">
        <div class="property-group">
          <div class="property-label">Position (m)</div>
          <div class="property-row">
            <Vec3Input value={position} axis="x" onChange={handlePositionChange} onFocus={handleInputFocus} onBlur={handleInputBlur} step={0.01} />
            <Vec3Input value={position} axis="y" onChange={handlePositionChange} onFocus={handleInputFocus} onBlur={handleInputBlur} step={0.01} />
            <Vec3Input value={position} axis="z" onChange={handlePositionChange} onFocus={handleInputFocus} onBlur={handleInputBlur} step={0.01} />
          </div>
        </div>

        <div class="property-group">
          <div class="property-label">Rotation (degrees)</div>
          <div class="property-row">
            <Vec3Input value={rotation} axis="x" onChange={handleRotationChange} onFocus={handleInputFocus} onBlur={handleInputBlur} step={1} />
            <Vec3Input value={rotation} axis="y" onChange={handleRotationChange} onFocus={handleInputFocus} onBlur={handleInputBlur} step={1} />
            <Vec3Input value={rotation} axis="z" onChange={handleRotationChange} onFocus={handleInputFocus} onBlur={handleInputBlur} step={1} />
          </div>
        </div>

        <div class="property-group">
          <div class="property-label">Scale</div>
          <div class="property-row">
            <Vec3Input value={scale} axis="x" onChange={handleScaleChange} onFocus={handleInputFocus} onBlur={handleInputBlur} step={0.01} />
            <Vec3Input value={scale} axis="y" onChange={handleScaleChange} onFocus={handleInputFocus} onBlur={handleInputBlur} step={0.01} />
            <Vec3Input value={scale} axis="z" onChange={handleScaleChange} onFocus={handleInputFocus} onBlur={handleInputBlur} step={0.01} />
          </div>
        </div>

        <div class="property-group">
          <div class="property-label">Physics</div>
          <label class="property-checkbox">
            <input
              type="checkbox"
              checked={currentAsset?.disableGravity || false}
              onChange={() => selectedAsset && toggleAssetGravity(selectedAsset.id)}
            />
            <span>Disable Gravity (Kinematic)</span>
          </label>
        </div>
      </div>
    </div>
  )
}

interface Vec3InputProps {
  value: Vec3
  axis: keyof Vec3
  onChange: (axis: keyof Vec3, value: string) => void
  onFocus?: () => void
  onBlur?: () => void
  step?: number
}

function Vec3Input({ value, axis, onChange, onFocus, onBlur, step = 0.01 }: Vec3InputProps) {
  return (
    <div class="property-input-group">
      <span class="property-input-label">{axis.toUpperCase()}</span>
      <input
        type="number"
        class="property-input"
        value={value[axis]}
        step={step}
        onChange={(e) => onChange(axis, (e.target as HTMLInputElement).value)}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    </div>
  )
}

function round(num: number): number {
  return Math.round(num * 1000) / 1000
}

function vec3Equal(a: Vec3, b: Vec3): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z
}

function transformsEqual(a: TransformSnapshot, b: TransformSnapshot): boolean {
  return vec3Equal(a.position, b.position) && vec3Equal(a.rotation, b.rotation) && vec3Equal(a.scale, b.scale)
}
