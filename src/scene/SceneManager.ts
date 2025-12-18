import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export class SceneManager {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  private container: HTMLElement

  // Axes helper in corner
  private axesScene: THREE.Scene
  private axesCamera: THREE.PerspectiveCamera
  private axesHelper: THREE.AxesHelper

  constructor(container: HTMLElement) {
    this.container = container

    // Scene
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x1a1a2e)

    // Camera
    const aspect = container.clientWidth / container.clientHeight
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000)
    this.camera.position.set(5, 5, 5)
    this.camera.lookAt(0, 0, 0)

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(container.clientWidth, container.clientHeight)
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.autoClear = false // We'll clear manually for multi-pass rendering
    container.appendChild(this.renderer.domElement)

    // Orbit Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05

    // Lighting
    this.setupLights()

    // Grid
    this.setupGrid()

    // Axes helper (corner widget) - rotated so Z is up
    this.axesScene = new THREE.Scene()
    this.axesCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 10)
    this.axesCamera.position.set(0, 0, 2.5)
    this.axesHelper = new THREE.AxesHelper(1)
    // Rotate so Z is up: X stays forward (red), Y goes left (green), Z goes up (blue)
    this.axesHelper.rotation.x = -Math.PI / 2
    this.axesScene.add(this.axesHelper)

    // Add axis labels (positions match rotated axes)
    // X: forward (red), Y: left (green), Z: up (blue)
    this.axesScene.add(this.createAxisLabel('X', new THREE.Vector3(1.2, 0, 0), 0xff0000))
    this.axesScene.add(this.createAxisLabel('Y', new THREE.Vector3(0, 0, -1.2), 0x00ff00))
    this.axesScene.add(this.createAxisLabel('Z', new THREE.Vector3(0, 1.2, 0), 0x0000ff))

    // Handle resize
    window.addEventListener('resize', this.onResize)

    // Start render loop
    this.animate()
  }

  private setupLights(): void {
    // Ambient light
    const ambient = new THREE.AmbientLight(0xffffff, 0.4)
    this.scene.add(ambient)

    // Directional light (sun)
    const directional = new THREE.DirectionalLight(0xffffff, 0.8)
    directional.position.set(-15, 20, 5)
    directional.castShadow = true
    directional.shadow.mapSize.width = 2048
    directional.shadow.mapSize.height = 2048
    directional.shadow.camera.near = 0.5
    directional.shadow.camera.far = 50
    directional.shadow.camera.left = -20
    directional.shadow.camera.right = 20
    directional.shadow.camera.top = 20
    directional.shadow.camera.bottom = -20
    this.scene.add(directional)

    // Hemisphere light for better ambient
    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x3d3d3d, 0.3)
    this.scene.add(hemi)
  }

  private setupGrid(): void {
    const grid = new THREE.GridHelper(20, 20, 0x444444, 0x333333)
    this.scene.add(grid)
  }

  private createAxisLabel(text: string, position: THREE.Vector3, color: number): THREE.Sprite {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0')
    ctx.font = 'bold 48px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 32, 32)

    const texture = new THREE.CanvasTexture(canvas)
    const material = new THREE.SpriteMaterial({ map: texture })
    const sprite = new THREE.Sprite(material)
    sprite.position.copy(position)
    sprite.scale.set(0.5, 0.5, 0.5)
    return sprite
  }

  private onResize = (): void => {
    const width = this.container.clientWidth
    const height = this.container.clientHeight
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate)
    this.controls.update()

    // Sync axes camera with main camera orientation
    this.axesCamera.position.copy(this.camera.position)
    this.axesCamera.position.sub(this.controls.target)
    this.axesCamera.position.setLength(2.5)
    this.axesCamera.lookAt(0, 0, 0)

    // Clear and render main scene
    this.renderer.clear()
    this.renderer.setViewport(0, 0, this.container.clientWidth, this.container.clientHeight)
    this.renderer.render(this.scene, this.camera)

    // Render axes helper in bottom-left corner
    const size = 100
    this.renderer.clearDepth()
    this.renderer.setScissorTest(true)
    this.renderer.setScissor(10, 10, size, size)
    this.renderer.setViewport(10, 10, size, size)
    this.renderer.render(this.axesScene, this.axesCamera)
    this.renderer.setScissorTest(false)
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize)
    this.renderer.dispose()
    this.controls.dispose()
  }
}
