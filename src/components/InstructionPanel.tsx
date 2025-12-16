import { useRef } from 'preact/hooks'
import { useScene } from '../hooks/useScene'

export function InstructionPanel() {
  const { instruction, setInstruction, createInstructionCommand } = useScene()
  const beforeValueRef = useRef<string | null>(null)

  const handleFocus = () => {
    beforeValueRef.current = instruction
  }

  const handleBlur = () => {
    if (beforeValueRef.current !== null && beforeValueRef.current !== instruction) {
      createInstructionCommand(beforeValueRef.current, instruction)
    }
    beforeValueRef.current = null
  }

  return (
    <div class="instruction-panel">
      <div class="panel-header">Instruction</div>
      <div class="instruction-content">
        <textarea
          class="instruction-input"
          placeholder="Enter task instruction (required for export)..."
          value={instruction}
          onInput={(e) => setInstruction((e.target as HTMLTextAreaElement).value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
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
