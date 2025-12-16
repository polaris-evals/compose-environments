import { useState, useRef } from 'preact/hooks'
import { useScene, SpawnBounds } from '../hooks/useScene'

export function RandomizationPanel() {
  const {
    isRandomizeMode,
    spawnBounds,
    savedPoses,
    savedConditions,
    assets,
    selectedAsset,
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
    createSpawnBoundsCommand,
  } = useScene()

  const [showConditionsList, setShowConditionsList] = useState(false)

  const [notification, setNotification] = useState<string | null>(null)
  const beforeBoundsRef = useRef<SpawnBounds | null>(null)

  // Count dynamic (non-static) and static assets
  const exportableAssets = assets.filter(a => !a.excludeFromExport && !a.locked)
  const dynamicAssets = exportableAssets.filter(a => !a.disableGravity)
  const staticAssets = exportableAssets.filter(a => a.disableGravity)
  const hasDynamicAssets = dynamicAssets.length > 0
  const hasStaticAssets = staticAssets.length > 0
  const canRandomize = hasDynamicAssets && hasStaticAssets

  const handleBoundsFocus = () => {
    if (!beforeBoundsRef.current) {
      beforeBoundsRef.current = { ...spawnBounds }
    }
  }

  const handleBoundsBlur = () => {
    if (beforeBoundsRef.current && !boundsEqual(beforeBoundsRef.current, spawnBounds)) {
      createSpawnBoundsCommand(beforeBoundsRef.current, spawnBounds)
    }
    beforeBoundsRef.current = null
  }

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
          Initial Conditions
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

  const isEditingObject = selectedAsset !== null

  return (
    <div class="randomization-panel active">
      <div class="randomization-header">
        <span>Initial Conditions</span>
        <button class="randomize-close-btn" onClick={exitRandomizeMode} title="Back to Compose">X</button>
      </div>

      {isEditingObject ? (
        <div class="editing-mode-indicator">
          <span>Editing: {selectedAsset.name}</span>
          <div class="editing-hint">Click empty space to edit spawn bounds</div>
        </div>
      ) : (
        <>
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

          <div class="bounds-label">Spawn Area (X-Y plane)</div>
          <div class="bounds-group">
            <div class="bounds-row">
              <label>X:</label>
              <input
                type="number"
                step={0.01}
                value={spawnBounds.minX}
                onChange={(e) => handleBoundsChange('minX', (e.target as HTMLInputElement).value)}
                onFocus={handleBoundsFocus}
                onBlur={handleBoundsBlur}
              />
              <span>to</span>
              <input
                type="number"
                step={0.01}
                value={spawnBounds.maxX}
                onChange={(e) => handleBoundsChange('maxX', (e.target as HTMLInputElement).value)}
                onFocus={handleBoundsFocus}
                onBlur={handleBoundsBlur}
              />
            </div>
            <div class="bounds-row">
              <label>Y:</label>
              <input
                type="number"
                step={0.01}
                value={spawnBounds.minY}
                onChange={(e) => handleBoundsChange('minY', (e.target as HTMLInputElement).value)}
                onFocus={handleBoundsFocus}
                onBlur={handleBoundsBlur}
              />
              <span>to</span>
              <input
                type="number"
                step={0.01}
                value={spawnBounds.maxY}
                onChange={(e) => handleBoundsChange('maxY', (e.target as HTMLInputElement).value)}
                onFocus={handleBoundsFocus}
                onBlur={handleBoundsBlur}
              />
            </div>
          </div>
          <div class="bounds-hint">Click objects to position them manually</div>
        </>
      )}

      <div class="randomize-info">
        {dynamicAssets.length} dynamic asset{dynamicAssets.length !== 1 ? 's' : ''}
      </div>

      <div class="saved-conditions-section">
        <div class="saved-conditions-header">
          <button
            class={`conditions-toggle ${savedConditions.length > 0 ? 'has-conditions' : ''}`}
            onClick={() => savedConditions.length > 0 && setShowConditionsList(!showConditionsList)}
            disabled={savedConditions.length === 0}
          >
            <span class="toggle-arrow">{showConditionsList ? '▼' : '▶'}</span>
            <span>{savedConditions.length} saved condition{savedConditions.length !== 1 ? 's' : ''}</span>
          </button>
          {savedConditions.length > 0 && (
            <button class="clear-conditions-btn" onClick={clearSavedConditions} title="Clear all saved conditions">
              Clear All
            </button>
          )}
        </div>

        {showConditionsList && savedConditions.length > 0 && (
          <div class="conditions-list">
            {savedConditions.map((_, index) => (
              <div class="condition-item" key={index}>
                <span class="condition-name">Condition {index + 1}</span>
                <div class="condition-actions">
                  <button
                    class="condition-btn load"
                    onClick={() => loadCondition(index)}
                    title="Load this condition"
                  >
                    Load
                  </button>
                  <button
                    class="condition-btn delete"
                    onClick={() => deleteCondition(index)}
                    title="Delete this condition"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div class="randomize-actions">
        <button class="toolbar-btn" onClick={saveCurrentCondition} title="Save current positions as initial condition">
          Save Current
        </button>
        <button class="toolbar-btn" onClick={randomizeNonStaticAssets}>
          Randomize
        </button>
      </div>

      {savedPoses && (
        <div class="randomize-confirm">
          <div class="randomize-confirm-actions">
            <button class="toolbar-btn toolbar-btn-primary" onClick={acceptRandomization}>
              Save & Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function boundsEqual(a: SpawnBounds, b: SpawnBounds): boolean {
  return (
    a.minX === b.minX && a.maxX === b.maxX &&
    a.minY === b.minY && a.maxY === b.maxY
  )
}
