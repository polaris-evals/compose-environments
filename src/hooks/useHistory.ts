import { useState, useCallback, useRef } from 'preact/hooks'

export interface Command {
  type: string
  execute(): void
  undo(): void
}

const MAX_HISTORY_SIZE = 50

export interface HistoryActions {
  pushCommand: (command: Command) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  clear: () => void
}

export function useHistory(): HistoryActions {
  const undoStackRef = useRef<Command[]>([])
  const redoStackRef = useRef<Command[]>([])
  const [, forceUpdate] = useState({})

  const pushCommand = useCallback((command: Command) => {
    undoStackRef.current = [...undoStackRef.current, command]

    // Trim oldest commands if exceeding max size
    if (undoStackRef.current.length > MAX_HISTORY_SIZE) {
      undoStackRef.current = undoStackRef.current.slice(
        undoStackRef.current.length - MAX_HISTORY_SIZE
      )
    }

    // Clear redo stack on new action
    redoStackRef.current = []
    forceUpdate({})
  }, [])

  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return

    const command = undoStackRef.current[undoStackRef.current.length - 1]
    undoStackRef.current = undoStackRef.current.slice(0, -1)

    command.undo()

    redoStackRef.current = [...redoStackRef.current, command]
    forceUpdate({})
  }, [])

  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return

    const command = redoStackRef.current[redoStackRef.current.length - 1]
    redoStackRef.current = redoStackRef.current.slice(0, -1)

    command.execute()

    undoStackRef.current = [...undoStackRef.current, command]
    forceUpdate({})
  }, [])

  const clear = useCallback(() => {
    undoStackRef.current = []
    redoStackRef.current = []
    forceUpdate({})
  }, [])

  return {
    pushCommand,
    undo,
    redo,
    canUndo: undoStackRef.current.length > 0,
    canRedo: redoStackRef.current.length > 0,
    clear,
  }
}
