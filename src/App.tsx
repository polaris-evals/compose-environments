import { useState, useEffect } from 'preact/hooks'
import { SceneContext, useSceneProvider } from './hooks/useScene'
import { Toolbar } from './components/Toolbar'
import { AssetPanel } from './components/AssetPanel'
import { PropertyPanel } from './components/PropertyPanel'
import { Viewport } from './components/Viewport'
import { RandomizationPanel } from './components/RandomizationPanel'
import { InstructionPanel } from './components/InstructionPanel'
import { HelpModal } from './components/HelpModal'

export function App() {
  const sceneValue = useSceneProvider()
  const [showHelp, setShowHelp] = useState(true)

  // Handle undo/redo keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          sceneValue.redo()
        } else {
          sceneValue.undo()
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault()
        sceneValue.redo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sceneValue])

  return (
    <SceneContext.Provider value={sceneValue}>
      <div class="app-container">
        <Toolbar onHelpClick={() => setShowHelp(true)} />
        <div class="main-content">
          <div class="left-panels">
            <AssetPanel />
            <InstructionPanel />
            <RandomizationPanel />
          </div>
          <Viewport />
          <PropertyPanel />
        </div>
      </div>
      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </SceneContext.Provider>
  )
}
