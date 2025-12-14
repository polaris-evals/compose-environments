import { useScene } from '../hooks/useScene'

export function InstructionPanel() {
  const { instruction, setInstruction } = useScene()

  return (
    <div class="instruction-panel">
      <div class="panel-header">Instruction</div>
      <div class="instruction-content">
        <textarea
          class="instruction-input"
          placeholder="Enter task instruction (required for export)..."
          value={instruction}
          onInput={(e) => setInstruction((e.target as HTMLTextAreaElement).value)}
        />
        {!instruction.trim() && (
          <div class="instruction-warning">
            Required before export
          </div>
        )}
      </div>
    </div>
  )
}
