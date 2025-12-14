import { useState } from 'preact/hooks'
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
