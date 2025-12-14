interface HelpModalProps {
  isOpen: boolean
  onClose: () => void
}

export function HelpModal({ isOpen, onClose }: HelpModalProps) {
  if (!isOpen) return null

  return (
    <div class="modal-overlay" onClick={onClose}>
      <div class="modal-content" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <h2>Compose Environments</h2>
          <button class="modal-close" onClick={onClose}>X</button>
        </div>

        <div class="modal-body">
          <section>
            <h3>Workflow</h3>
            <ol>
              <li><strong>Load DROID Robot</strong> (optional) - Add robot visualization for reference (not exported)</li>
              <li><strong>Add Assets</strong> - Click "Add Asset" to load 3D models (USD, USDZ, GLTF, GLB)</li>
              <li><strong>Arrange Scene</strong> - Position assets and set physics:
                <ul>
                  <li>Use Move/Rotate/Scale controls or keys (G/R/S)</li>
                  <li>Check "Disable Gravity" for static objects (tables, shelves)</li>
                </ul>
              </li>
              <li><strong>Randomize Initial Conditions</strong> - Click "Randomize Positions" in left panel:
                <ul>
                  <li>Adjust the green spawn bounds box</li>
                  <li>Click "Randomize" then "Accept" to save configurations</li>
                  <li>Repeat to save multiple initial conditions</li>
                </ul>
              </li>
              <li><strong>Enter Task Instruction</strong> - Describe the task in the Instruction panel</li>
              <li><strong>Export</strong> - Creates ZIP with scene files and initial conditions</li>
            </ol>
          </section>

          <section>
            <h3>Requirements for Export</h3>
            <ul>
              <li>At least one static asset (Disable Gravity checked)</li>
              <li>A task instruction</li>
            </ul>
          </section>

          <section>
            <h3>Keyboard Shortcuts</h3>
            <ul>
              <li><strong>G</strong> - Move | <strong>R</strong> - Rotate | <strong>S</strong> - Scale</li>
              <li><strong>Escape</strong> - Deselect | <strong>Delete</strong> - Remove asset</li>
            </ul>
          </section>
        </div>

        <div class="modal-footer">
          <button class="toolbar-btn toolbar-btn-primary" onClick={onClose}>
            Get Started
          </button>
        </div>
      </div>
    </div>
  )
}
