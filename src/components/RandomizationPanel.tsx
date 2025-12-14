import { useState } from 'preact/hooks'
import { useScene, SpawnBounds } from '../hooks/useScene'

export function RandomizationPanel() {
  const {
    isRandomizeMode,
    spawnBounds,
    savedPoses,
    savedConditions,
    assets,
    enterRandomizeMode,
    exitRandomizeMode,
    setSpawnBounds,
    setBoundsTransformMode,
    randomizeNonStaticAssets,
    acceptRandomization,
    clearSavedConditions,
  } = useScene()

  const [notification, setNotification] = useState<string | null>(null)

  // Count dynamic (non-static) and static assets
  const exportableAssets = assets.filter(a => !a.excludeFromExport && !a.locked)
  const dynamicAssets = exportableAssets.filter(a => !a.disableGravity)
  const staticAssets = exportableAssets.filter(a => a.disableGravity)
  const hasDynamicAssets = dynamicAssets.length > 0
  const hasStaticAssets = staticAssets.length > 0
  const canRandomize = hasDynamicAssets && hasStaticAssets

  const handleBoundsChange = (key: keyof SpawnBounds, value: string) => {
    const num = parseFloat(value) || 0
    setSpawnBounds({ ...spawnBounds, [key]: num })
  }

  const getHint = () => {
    if (!hasStaticAssets && !hasDynamicAssets) {
      return 'Add assets to get started'
    }
    if (!hasStaticAssets) {
      return 'Mark at least one asset as "Disable Gravity" (static)'
    }
    if (!hasDynamicAssets) {
      return 'Add assets without "Disable Gravity" to randomize'
    }
    return ''
  }

  const showNotification = (message: string) => {
    setNotification(message)
    setTimeout(() => setNotification(null), 3000)
  }

  const handleEnterRandomize = () => {
    if (!canRandomize) {
      showNotification(getHint())
      return
    }
    enterRandomizeMode()
  }

  if (!isRandomizeMode) {
    return (
      <div class="randomization-panel">
        <button
          class="toolbar-btn randomize-enter-btn"
          onClick={handleEnterRandomize}
        >
          Randomize Positions
        </button>
        <p class="randomize-hint">
          {getHint() || `${staticAssets.length} static, ${dynamicAssets.length} dynamic`}
        </p>
        {notification && (
          <div class="randomize-notification">
            {notification}
          </div>
        )}
      </div>
    )
  }

  const [boundsMode, setBoundsMode] = useState<'translate' | 'rotate' | 'scale'>('translate')

  const handleBoundsModeChange = (mode: 'translate' | 'rotate' | 'scale') => {
    setBoundsMode(mode)
    setBoundsTransformMode(mode)
  }

  return (
    <div class="randomization-panel active">
      <div class="randomization-header">
        <span>Randomize Mode</span>
        <button class="randomize-close-btn" onClick={exitRandomizeMode} title="Back to Compose">X</button>
      </div>

      <div class="bounds-mode-buttons">
        <button
          class={`toolbar-btn ${boundsMode === 'translate' ? 'active' : ''}`}
          onClick={() => handleBoundsModeChange('translate')}
        >
          Move
        </button>
        <button
          class={`toolbar-btn ${boundsMode === 'rotate' ? 'active' : ''}`}
          onClick={() => handleBoundsModeChange('rotate')}
        >
          Rotate
        </button>
        <button
          class={`toolbar-btn ${boundsMode === 'scale' ? 'active' : ''}`}
          onClick={() => handleBoundsModeChange('scale')}
        >
          Scale
        </button>
      </div>

      <div class="bounds-label">Spawn Bounds (Z-up)</div>
      <div class="bounds-group">
        <div class="bounds-row">
          <label>X:</label>
          <input
            type="number"
            step={0.01}
            value={spawnBounds.minX}
            onChange={(e) => handleBoundsChange('minX', (e.target as HTMLInputElement).value)}
          />
          <span>to</span>
          <input
            type="number"
            step={0.01}
            value={spawnBounds.maxX}
            onChange={(e) => handleBoundsChange('maxX', (e.target as HTMLInputElement).value)}
          />
        </div>
        <div class="bounds-row">
          <label>Y:</label>
          <input
            type="number"
            step={0.01}
            value={spawnBounds.minY}
            onChange={(e) => handleBoundsChange('minY', (e.target as HTMLInputElement).value)}
          />
          <span>to</span>
          <input
            type="number"
            step={0.01}
            value={spawnBounds.maxY}
            onChange={(e) => handleBoundsChange('maxY', (e.target as HTMLInputElement).value)}
          />
        </div>
        <div class="bounds-row">
          <label>Z:</label>
          <input
            type="number"
            step={0.01}
            value={spawnBounds.minZ}
            onChange={(e) => handleBoundsChange('minZ', (e.target as HTMLInputElement).value)}
          />
          <span>to</span>
          <input
            type="number"
            step={0.01}
            value={spawnBounds.maxZ}
            onChange={(e) => handleBoundsChange('maxZ', (e.target as HTMLInputElement).value)}
          />
        </div>
      </div>

      <div class="randomize-info">
        {dynamicAssets.length} dynamic asset{dynamicAssets.length !== 1 ? 's' : ''} to randomize
      </div>

      <div class="saved-conditions-counter">
        <span>{savedConditions.length} saved condition{savedConditions.length !== 1 ? 's' : ''}</span>
        {savedConditions.length > 0 && (
          <button class="clear-conditions-btn" onClick={clearSavedConditions} title="Clear all saved conditions">
            Clear
          </button>
        )}
      </div>

      <div class="randomize-actions">
        <button class="toolbar-btn" onClick={randomizeNonStaticAssets}>
          Randomize
        </button>
      </div>

      {savedPoses && (
        <div class="randomize-confirm">
          <div class="randomize-confirm-actions">
            <button class="toolbar-btn toolbar-btn-primary" onClick={acceptRandomization}>
              Accept & Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
