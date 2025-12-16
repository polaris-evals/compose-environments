import * as THREE from 'three'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { LoadedAsset } from './AssetLoader'

export type TransformMode = 'translate' | 'rotate' | 'scale'

export interface TransformChangeEvent {
  position: THREE.Vector3
  rotation: THREE.Euler
  scale: THREE.Vector3
}

export interface TransformDragEvent {
  assetId: string
  before: {
    position: { x: number; y: number; z: number }
    rotation: { x: number; y: number; z: number }
    scale: { x: number; y: number; z: number }
  }
  after: {
    position: { x: number; y: number; z: number }
    rotation: { x: number; y: number; z: number }
    scale: { x: number; y: number; z: number }
  }
}

export class SelectionManager {
  private scene: THREE.Scene
  private camera: THREE.Camera
  private renderer: THREE.WebGLRenderer
  private orbitControls: OrbitControls
  private transformControls: TransformControls
  private raycaster: THREE.Raycaster
  private mouse: THREE.Vector2
  private assets: LoadedAsset[] = []
  private selectedAsset: LoadedAsset | null = null
  private onSelectionChange: ((asset: LoadedAsset | null) => void) | null = null
  private onTransformChange: ((event: TransformChangeEvent) => void) | null = null
  private highlightBox: THREE.BoxHelper | null = null
  private boundsMesh: THREE.Mesh | null = null
  private onBoundsChange: ((mesh: THREE.Mesh) => void) | null = null
  private isRandomizeMode = false
  private isBoundsSelected = false
  private onTransformDragEnd: ((event: TransformDragEvent) => void) | null = null
  private dragStartTransform: {
    position: { x: number; y: number; z: number }
    rotation: { x: number; y: number; z: number }
    scale: { x: number; y: number; z: number }
  } | null = null
  private wasDragging = false
  private mouseDownPos: { x: number; y: number } | null = null

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
    orbitControls: OrbitControls
  ) {
    this.scene = scene
    this.camera = camera
    this.renderer = renderer
    this.orbitControls = orbitControls

    this.raycaster = new THREE.Raycaster()
    this.mouse = new THREE.Vector2()

    // Setup transform controls
    this.transformControls = new TransformControls(camera, renderer.domElement)
    this.transformControls.setSpace('world')
    this.scene.add(this.transformControls)

    // Disable orbit controls while transforming
    this.transformControls.addEventListener('dragging-changed', (event) => {
      this.orbitControls.enabled = !event.value

      // Track that a drag occurred (to prevent click from changing selection)
      if (event.value) {
        this.wasDragging = true
      }

      // Track asset transforms (works in both normal and randomize mode when an asset is selected)
      if (this.selectedAsset && (!this.isRandomizeMode || !this.isBoundsSelected)) {
        if (event.value) {
          // Drag started - capture initial transform
          const obj = this.selectedAsset.object
          this.dragStartTransform = {
            position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
            rotation: {
              x: obj.rotation.x * (180 / Math.PI),
              y: obj.rotation.y * (180 / Math.PI),
              z: obj.rotation.z * (180 / Math.PI),
            },
            scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
          }
        } else if (this.dragStartTransform && this.onTransformDragEnd) {
          // Drag ended - fire callback with before/after
          const obj = this.selectedAsset.object
          const after = {
            position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
            rotation: {
              x: obj.rotation.x * (180 / Math.PI),
              y: obj.rotation.y * (180 / Math.PI),
              z: obj.rotation.z * (180 / Math.PI),
            },
            scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
          }
          this.onTransformDragEnd({
            assetId: this.selectedAsset.id,
            before: this.dragStartTransform,
            after,
          })
          this.dragStartTransform = null
        }
      }
    })

    // Emit transform changes and update highlight
    this.transformControls.addEventListener('change', () => {
      if (this.selectedAsset) {
        // Update highlight box to follow object
        this.updateHighlight()

        if (this.onTransformChange) {
          const obj = this.selectedAsset.object
          this.onTransformChange({
            position: obj.position.clone(),
            rotation: obj.rotation.clone(),
            scale: obj.scale.clone(),
          })
        }
      }

      // Handle bounds mesh changes in randomize mode
      if (this.isRandomizeMode && this.boundsMesh && this.onBoundsChange) {
        this.onBoundsChange(this.boundsMesh)
      }
    })

    // Listen for mouse events to detect intentional clicks vs drags
    renderer.domElement.addEventListener('mousedown', this.onMouseDown)
    renderer.domElement.addEventListener('click', this.onClick)

    // Keyboard shortcuts
    window.addEventListener('keydown', this.onKeyDown)
  }

  setAssets(assets: LoadedAsset[]): void {
    this.assets = assets
  }

  setOnSelectionChange(callback: (asset: LoadedAsset | null) => void): void {
    this.onSelectionChange = callback
  }

  setOnTransformChange(callback: (event: TransformChangeEvent) => void): void {
    this.onTransformChange = callback
  }

  setOnTransformDragEnd(callback: (event: TransformDragEvent) => void): void {
    this.onTransformDragEnd = callback
  }

  select(asset: LoadedAsset | null): void {
    // Remove previous highlight
    if (this.highlightBox) {
      this.scene.remove(this.highlightBox)
      this.highlightBox.dispose()
      this.highlightBox = null
    }

    this.selectedAsset = asset

    if (asset) {
      this.transformControls.attach(asset.object)

      // Create highlight box that renders on top
      this.highlightBox = new THREE.BoxHelper(asset.object, 0x00ffff)
      this.highlightBox.material = new THREE.LineBasicMaterial({
        color: 0x00ffff,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        opacity: 0.8,
      })
      this.highlightBox.renderOrder = 999
      this.scene.add(this.highlightBox)
    } else {
      this.transformControls.detach()
    }

    if (this.onSelectionChange) {
      this.onSelectionChange(asset)
    }
  }

  updateHighlight(): void {
    if (this.highlightBox && this.selectedAsset) {
      this.highlightBox.update()
    }
  }

  getSelected(): LoadedAsset | null {
    return this.selectedAsset
  }

  setMode(mode: TransformMode): void {
    this.transformControls.setMode(mode)
  }

  getMode(): TransformMode {
    return this.transformControls.mode as TransformMode
  }

  attachToBoundsMesh(mesh: THREE.Mesh, onBoundsChange: (mesh: THREE.Mesh) => void): void {
    this.boundsMesh = mesh
    this.onBoundsChange = onBoundsChange
    this.isRandomizeMode = true
    this.isBoundsSelected = true
    this.transformControls.attach(mesh)
    this.transformControls.setMode('translate')
  }

  detachBoundsMesh(): void {
    this.boundsMesh = null
    this.onBoundsChange = null
    this.isRandomizeMode = false
    this.isBoundsSelected = false
    this.transformControls.detach()
  }

  selectBounds(): void {
    if (!this.isRandomizeMode || !this.boundsMesh) return

    // Remove asset highlight
    if (this.highlightBox) {
      this.scene.remove(this.highlightBox)
      this.highlightBox.dispose()
      this.highlightBox = null
    }

    this.selectedAsset = null
    this.isBoundsSelected = true
    this.transformControls.attach(this.boundsMesh)

    if (this.onSelectionChange) {
      this.onSelectionChange(null)
    }
  }

  isBoundsCurrentlySelected(): boolean {
    return this.isRandomizeMode && this.isBoundsSelected
  }

  setBoundsTransformMode(mode: 'translate' | 'rotate' | 'scale'): void {
    if (this.isRandomizeMode) {
      this.transformControls.setMode(mode)
    }
  }

  private onMouseDown = (event: MouseEvent): void => {
    this.mouseDownPos = { x: event.clientX, y: event.clientY }
    this.wasDragging = false
  }

  private onClick = (event: MouseEvent): void => {
    // Ignore if we're dragging the transform controls
    if (this.transformControls.dragging) return

    // Ignore if a drag occurred (transform or orbit controls)
    if (this.wasDragging) {
      this.wasDragging = false
      return
    }

    // Check if mouse moved significantly from mousedown (orbit drag detection)
    if (this.mouseDownPos) {
      const dx = event.clientX - this.mouseDownPos.x
      const dy = event.clientY - this.mouseDownPos.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      if (distance > 5) {
        // Mouse moved too much, this was a drag not a click
        this.mouseDownPos = null
        return
      }
    }
    this.mouseDownPos = null

    const rect = this.renderer.domElement.getBoundingClientRect()
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    this.raycaster.setFromCamera(this.mouse, this.camera)

    // Get all meshes from non-locked assets
    const meshes: THREE.Object3D[] = []
    for (const asset of this.assets) {
      if (asset.locked) continue
      asset.object.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          meshes.push(child)
        }
      })
    }

    const intersects = this.raycaster.intersectObjects(meshes, false)

    if (intersects.length > 0) {
      // Find which asset owns this mesh
      const hitObject = intersects[0].object
      for (const asset of this.assets) {
        if (asset.locked) continue
        let found = false
        asset.object.traverse((child) => {
          if (child === hitObject) found = true
        })
        if (found) {
          // In randomize mode, switch from bounds to asset
          if (this.isRandomizeMode) {
            this.isBoundsSelected = false
          }
          this.select(asset)
          return
        }
      }
    } else {
      // Clicked on nothing
      if (this.isRandomizeMode) {
        // In randomize mode, clicking empty space returns to bounds selection
        this.selectBounds()
      } else {
        // Normal mode - deselect
        this.select(null)
      }
    }
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    // Ignore if typing in an input
    if (event.target instanceof HTMLInputElement) return

    switch (event.key.toLowerCase()) {
      case 'g':
        this.setMode('translate')
        break
      case 'r':
        this.setMode('rotate')
        break
      case 's':
        this.setMode('scale')
        break
      case 'escape':
        this.select(null)
        break
      case 'delete':
      case 'backspace':
        // Handled by parent component
        break
    }
  }

  dispose(): void {
    this.renderer.domElement.removeEventListener('mousedown', this.onMouseDown)
    this.renderer.domElement.removeEventListener('click', this.onClick)
    window.removeEventListener('keydown', this.onKeyDown)
    this.transformControls.dispose()
    if (this.highlightBox) {
      this.scene.remove(this.highlightBox)
      this.highlightBox.dispose()
    }
  }
}
