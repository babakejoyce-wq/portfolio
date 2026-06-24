/* ============================================
   STAR'S SKY — Flamme 3D interactive
   Particules + glyphe vectoriel, contrôlable
   à la souris (rotation) et à la molette (zoom)
   ============================================ */

(function initFlame3D() {
  const container = document.getElementById('flame-canvas');
  if (!container || typeof THREE === 'undefined') return;

  let scene, camera, renderer, flameGroup, particles, glowSprite;
  let targetRotY = 0, targetRotX = 0;
  let currentRotY = 0, currentRotX = 0;
  let zoom = 1, targetZoom = 1;
  let autoRotate = true;
  let pointerDown = false;
  let lastX = 0, lastY = 0;

  const W = () => container.clientWidth;
  const H = () => container.clientHeight;

  function init() {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(42, W() / H(), 0.1, 100);
    camera.position.set(0, 0, 9);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W(), H());
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    flameGroup = new THREE.Group();
    scene.add(flameGroup);

    buildFlameParticles();
    buildEmbersField();
    buildGlow();

    bindInteraction();
    window.addEventListener('resize', onResize);
    animate();
  }

  // Forme de flamme paramétrique : silhouette proche du logo
  // (large à la base, effilée en pointe asymétrique vers le haut)
  function flameProfile(t) {
    // t: 0 (base) -> 1 (pointe)
    const width = Math.sin(Math.PI * Math.pow(t, 0.7)) * (1 - t * 0.25);
    return width;
  }

  function buildFlameParticles() {
    const COUNT = 5200;
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const sizes = new Float32Array(COUNT);

    const colA = new THREE.Color('#6b4a1e');
    const colB = new THREE.Color('#d4a843');
    const colC = new THREE.Color('#f5e1a4');

    for (let i = 0; i < COUNT; i++) {
      const t = Math.pow(Math.random(), 0.62); // plus de densité en bas
      const height = t * 5.6 - 2.4;
      const radiusBase = flameProfile(t) * 1.55;

      // léger décalage asymétrique façon logo (deux langues de flamme)
      const lobe = Math.random();
      const angle = Math.random() * Math.PI * 2;
      let r = radiusBase * (0.25 + 0.75 * Math.random());

      // tordre légèrement pour créer 2 langues comme le logo
      const twist = Math.sin(t * Math.PI * 1.4) * 0.35;
      const x = Math.cos(angle) * r + twist * (lobe - 0.5) * 0.8;
      const z = Math.sin(angle) * r * 0.62;
      const y = height + Math.sin(angle * 3 + t * 8) * 0.04;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      const mixT = Math.min(1, t * 1.3 + Math.random() * 0.15);
      let c;
      if (mixT < 0.5) c = colA.clone().lerp(colB, mixT * 2);
      else c = colB.clone().lerp(colC, (mixT - 0.5) * 2);

      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;

      sizes[i] = (1 - t) * 0.09 + 0.025 + Math.random() * 0.05;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        uniform float uTime;
        void main() {
          vColor = color;
          vec3 pos = position;
          float flicker = sin(uTime * 2.2 + position.y * 3.0 + position.x * 5.0) * 0.045;
          pos.x += flicker;
          pos.z += cos(uTime * 1.8 + position.y * 4.0) * 0.03;
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = size * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          float alpha = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor, alpha * 0.9);
        }
      `,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    // patch: enable per-vertex color attribute on the custom shader
    mat.vertexShader = mat.vertexShader.replace(
      'attribute float size;',
      'attribute float size;\n        attribute vec3 color;'
    );

    particles = new THREE.Points(geo, mat);
    flameGroup.add(particles);
  }

  function buildEmbersField() {
    const COUNT = 90;
    const positions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 3.5;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = Math.random() * 6 - 2.5;
      positions[i * 3 + 2] = Math.sin(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: new THREE.Color('#f5e1a4'),
      size: 0.045,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const embers = new THREE.Points(geo, mat);
    embers.name = 'embers';
    flameGroup.add(embers);
  }

  function buildGlow() {
    const spriteMat = new THREE.SpriteMaterial({
      map: makeGlowTexture(),
      color: new THREE.Color('#d4a843'),
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    glowSprite = new THREE.Sprite(spriteMat);
    glowSprite.scale.set(7, 7, 1);
    glowSprite.position.set(0, 0.4, -0.5);
    flameGroup.add(glowSprite);
  }

  function makeGlowTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    grad.addColorStop(0, 'rgba(245,225,164,0.9)');
    grad.addColorStop(0.4, 'rgba(212,168,67,0.35)');
    grad.addColorStop(1, 'rgba(212,168,67,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  }

  // ---------- Interaction pointeur ----------
  function bindInteraction() {
    container.addEventListener('pointerdown', (e) => {
      pointerDown = true;
      autoRotate = false;
      lastX = e.clientX; lastY = e.clientY;
      container.classList.add('grabbing');
    });
    window.addEventListener('pointerup', () => {
      pointerDown = false;
      container.classList.remove('grabbing');
    });
    window.addEventListener('pointermove', (e) => {
      if (!pointerDown) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      targetRotY += dx * 0.006;
      targetRotX += dy * 0.004;
      targetRotX = Math.max(-0.5, Math.min(0.5, targetRotX));
    });

    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      targetZoom += e.deltaY * 0.0009;
      targetZoom = Math.max(0.65, Math.min(1.8, targetZoom));
    }, { passive: false });

    // touch pinch (simplifié via 2 doigts)
    let pinchStart = null;
    container.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        pinchStart = dist(e.touches[0], e.touches[1]);
      } else if (e.touches.length === 1) {
        pointerDown = true; autoRotate = false;
        lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
      }
    }, { passive: true });
    container.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && pinchStart) {
        const d = dist(e.touches[0], e.touches[1]);
        const delta = (d - pinchStart) * 0.004;
        targetZoom = Math.max(0.65, Math.min(1.8, targetZoom + delta));
        pinchStart = d;
      } else if (e.touches.length === 1 && pointerDown) {
        const dx = e.touches[0].clientX - lastX;
        const dy = e.touches[0].clientY - lastY;
        lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
        targetRotY += dx * 0.006;
        targetRotX += dy * 0.004;
        targetRotX = Math.max(-0.5, Math.min(0.5, targetRotX));
      }
    }, { passive: true });
    container.addEventListener('touchend', () => { pointerDown = false; pinchStart = null; });

    function dist(a, b) {
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }

    // double clic / double tap : reset
    container.addEventListener('dblclick', () => {
      targetRotY = 0; targetRotX = 0; targetZoom = 1;
      autoRotate = true;
    });
  }

  function onResize() {
    camera.aspect = W() / H();
    camera.updateProjectionMatrix();
    renderer.setSize(W(), H());
  }

  let clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();

    if (autoRotate) targetRotY += 0.0028;

    currentRotY += (targetRotY - currentRotY) * 0.07;
    currentRotX += (targetRotX - currentRotX) * 0.07;
    zoom += (targetZoom - zoom) * 0.08;

    flameGroup.rotation.y = currentRotY;
    flameGroup.rotation.x = currentRotX;
    camera.position.z = 9 * zoom;

    const embers = flameGroup.getObjectByName('embers');
    if (embers) embers.rotation.y = -t * 0.05;

    if (particles && particles.material.uniforms) {
      particles.material.uniforms.uTime.value = t;
    }

    if (glowSprite) {
      glowSprite.material.opacity = 0.45 + Math.sin(t * 1.6) * 0.08;
    }

    renderer.render(scene, camera);
  }

  if (typeof THREE !== 'undefined') {
    init();
  }
})();