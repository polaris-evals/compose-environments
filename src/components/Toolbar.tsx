import { useRef, useEffect, useState } from 'preact/hooks'
import { useScene } from '../hooks/useScene'
import { TransformMode } from '../scene/SelectionManager'
import { exportScene } from '../io/exportScene'
import { importScene } from '../io/importScene'

interface ToolbarProps {
  onHelpClick: () => void
}

export function Toolbar({ onHelpClick }: ToolbarProps) {
  const { transformMode, setTransformMode, assets, addAsset, assetLoader, savedConditions, instruction, setSavedConditions, setInstruction } = useScene()
  const folderInputRef = useRef<HTMLInputElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [notification, setNotification] = useState<{ message: string; type: 'error' | 'success' } | null>(null)

  const modes: { mode: TransformMode; label: string; key: string }[] = [
    { mode: 'translate', label: 'Move', key: 'G' },
    { mode: 'rotate', label: 'Rotate', key: 'R' },
    { mode: 'scale', label: 'Scale', key: 'S' },
  ]

  // Set webkitdirectory attribute imperatively (JSX doesn't handle it well)
  useEffect(() => {
    if (folderInputRef.current) {
      folderInputRef.current.setAttribute('webkitdirectory', '')
      folderInputRef.current.setAttribute('directory', '')
    }
  }, [])

  const handleAddAsset = () => {
    folderInputRef.current?.click()
  }

  const handleFolderSelect = async (e: Event) => {
    const input = e.target as HTMLInputElement
    const fileList = input.files
    if (!fileList || !assetLoader) return

    const files = new Map<string, File>()
    let folderName = ''

    for (const file of Array.from(fileList)) {
      // webkitRelativePath gives us the folder structure
      const path = file.webkitRelativePath
      files.set(path, file)

      if (!folderName && path) {
        folderName = path.split('/')[0]
      }
    }

    if (files.size > 0) {
      const asset = await assetLoader.loadFromFiles(files, folderName)
      if (asset) {
        addAsset(asset)
      }
    }

    // Reset input so same folder can be selected again
    input.value = ''
  }

  const showNotification = (message: string, type: 'error' | 'success') => {
    setNotification({ message, type })
    setTimeout(() => setNotification(null), 4000)
  }

  const handleExport = async () => {
    if (assets.length === 0) return
    const result = await exportScene(assets, savedConditions, instruction)
    if (!result.success && result.error) {
      showNotification(result.error, 'error')
    }
  }

  const handleImport = () => {
    importInputRef.current?.click()
  }

  const handleImportSelect = async (e: Event) => {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file || !assetLoader) return

    showNotification(`Importing ${file.name}...`, 'success')

    const result = await importScene(file, assetLoader)

    if (!result.success) {
      showNotification(result.error || 'Import failed', 'error')
      input.value = ''
      return
    }

    // Add assets
    for (const asset of result.assets) {
      addAsset(asset)
    }

    // Load saved conditions
    if (result.savedConditions.length > 0) {
      setSavedConditions(result.savedConditions)
    }

    // Load instruction
    if (result.instruction) {
      setInstruction(result.instruction)
    }

    showNotification(`Imported ${result.assets.length} asset(s)`, 'success')
    input.value = ''
  }

  const handleLoadDroid = async () => {
    if (!assetLoader) return
    const base = import.meta.env.BASE_URL || '/'
    const asset = await assetLoader.loadFromUrl(
      `${base}gui.usd`,
      'DROID Robot',
      { excludeFromExport: true, translucent: true, locked: true }
    )
    if (asset) {
      addAsset(asset)
    }
  }

  return (
    <div class="toolbar">
      <span class="toolbar-title">Compose Environments</span>

      <button class="help-btn" onClick={onHelpClick} title="Help">
        ? Help
      </button>

      <div class="toolbar-group">
        {modes.map(({ mode, label, key }) => (
          <button
            key={mode}
            class={`toolbar-btn ${transformMode === mode ? 'active' : ''}`}
            onClick={() => setTransformMode(mode)}
            title={`${label} (${key})`}
          >
            {label}
          </button>
        ))}
      </div>

      <div class="toolbar-group">
        <button class="toolbar-btn" onClick={handleLoadDroid}>
          Load DROID
        </button>
        <button class="toolbar-btn" onClick={handleAddAsset}>
          Add Asset
        </button>
        <button class="toolbar-btn" onClick={handleImport}>
          Import
        </button>
        <button
          class="toolbar-btn toolbar-btn-primary"
          onClick={handleExport}
          disabled={assets.length === 0}
        >
          Export
        </button>
      </div>

      <input
        ref={folderInputRef}
        type="file"
        class="hidden-input"
        onChange={handleFolderSelect}
      />
      <input
        ref={importInputRef}
        type="file"
        class="hidden-input"
        accept=".zip"
        onChange={handleImportSelect}
      />

      {notification && (
        <div class={`notification notification-${notification.type}`}>
          {notification.message}
        </div>
      )}
    </div>
  )
}
