const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const saveData = navigator.connection?.saveData === true;
const requestedTime = new URLSearchParams(location.search).get('t');
const fixedTime = requestedTime === null ? null : Number(requestedTime);
const freezeTime = Number.isFinite(fixedTime) ? fixedTime : null;
const activeShaders = [];
const revealed = new Set();

function initReveals() {
  if (reduceMotion.matches || !('IntersectionObserver' in window)) return;
  const selector = [
    '.guide-intro',
    '.guide-stories-heading',
    '.guide-feature',
    '.guide-story-row',
    '.guide-fallback-list article',
    '.guide-close-inner',
    '.guide-article-head-inner',
    '.guide-article-hero',
    '.guide-article-body > section',
    '.guide-article-sidebar',
  ].join(', ');
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('guide-in-view');
      observer.unobserve(entry.target);
    }
  }, { threshold: 0.06, rootMargin: '0px 0px -7% 0px' });

  function register(parent) {
    const targets = [];
    if (parent.matches?.(selector)) targets.push(parent);
    targets.push(...(parent.querySelectorAll?.(selector) ?? []));
    for (const target of targets) {
      if (revealed.has(target)) continue;
      revealed.add(target);
      target.classList.add('guide-reveal');
      observer.observe(target);
    }
  }

  register(document);
  const feed = document.querySelector('.guide-feed');
  if (feed && 'MutationObserver' in window) {
    new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) register(node);
        }
      }
    }).observe(feed, { childList: true, subtree: true });
  }
  document.documentElement.classList.add('guide-motion-ready');
  reduceMotion.addEventListener('change', event => {
    if (!event.matches) return;
    document.documentElement.classList.remove('guide-motion-ready');
    for (const target of revealed) target.classList.add('guide-in-view');
    observer.disconnect();
  }, { once: true });
}

function initReadingProgress() {
  const bar = document.querySelector('.guide-reading-progress span');
  if (!bar) return;
  let queued = false;
  function update() {
    queued = false;
    const distance = document.documentElement.scrollHeight - window.innerHeight;
    const progress = distance > 0 ? Math.min(1, Math.max(0, window.scrollY / distance)) : 0;
    bar.style.transform = `scaleX(${progress})`;
  }
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  schedule();
}

const vertexSource = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = (a_position + 1.0) * 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const fragmentSource = `
  precision highp float;
  varying vec2 v_uv;
  uniform sampler2D u_image;
  uniform vec2 u_resolution;
  uniform vec2 u_image_resolution;
  uniform vec2 u_focus;
  uniform vec2 u_mouse;
  uniform float u_time;
  uniform float u_scroll;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec2 uv = v_uv;
    vec2 scale = u_resolution / u_image_resolution;
    float cover = max(scale.x, scale.y);
    vec2 visible = u_resolution / (u_image_resolution * cover);
    visible *= 0.94;
    vec2 sampleUV = uv * visible + (1.0 - visible) * u_focus;

    // A slow current and a soft pointer lens echo the chalet's hero.
    float current = sin(sampleUV.y * 10.5 + u_time * 0.20)
                  * sin(sampleUV.x * 7.0 - u_time * 0.13);
    sampleUV.x += current * 0.0015;
    vec2 delta = uv - u_mouse;
    float lens = exp(-dot(delta, delta) * 13.0);
    sampleUV += delta * lens * 0.008;
    sampleUV.y += u_scroll * 0.010;

    vec3 color = texture2D(u_image, sampleUV).rgb;
    float luminance = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(color * vec3(0.93, 0.99, 0.94),
                color * vec3(1.02, 0.99, 0.94),
                smoothstep(0.18, 0.85, luminance));
    float mist = (0.5 + 0.5 * sin(uv.x * 4.2 + uv.y * 2.5 + u_time * 0.12))
               * (1.0 - smoothstep(0.08, 0.8, uv.y)) * 0.035;
    color = mix(color, vec3(0.72, 0.77, 0.71), mist);
    float grain = hash(floor(uv * u_resolution * 0.65) + floor(u_time * 8.0)) - 0.5;
    color += grain * 0.014;
    float vignette = 1.0 - smoothstep(0.27, 1.20, length((uv - 0.5) * vec2(1.04, 0.84)));
    color *= mix(0.90, 1.0, vignette);
    gl_FragColor = vec4(color, 1.0);
  }
`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  console.warn('Guide shader compilation failed:', gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
  return null;
}

function imageFocus(image) {
  const parts = getComputedStyle(image).objectPosition.toLowerCase().split(/\s+/);
  function fraction(value, axis) {
    if (value === 'center') return 0.5;
    if (value === 'left' || value === 'top') return 0;
    if (value === 'right' || value === 'bottom') return 1;
    if (value.endsWith('%')) return Math.min(1, Math.max(0, parseFloat(value) / 100));
    return axis === 'x' ? 0.5 : 0.5;
  }
  return [fraction(parts[0] ?? 'center', 'x'), 1 - fraction(parts[1] ?? 'center', 'y')];
}

async function startShader(container) {
  const image = container.querySelector('img');
  const canvas = container.querySelector('canvas[data-guide-shader]');
  if (!image || !canvas) return;
  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power',
  });
  if (!gl) return;

  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) return;
  const program = gl.createProgram();
  if (!program) return;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('Guide shader link failed:', gl.getProgramInfoLog(program));
    return;
  }
  gl.useProgram(program);
  const vertices = gl.createBuffer();
  if (!vertices) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const attribute = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(attribute);
  gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);

  const uniforms = {
    resolution: gl.getUniformLocation(program, 'u_resolution'),
    imageResolution: gl.getUniformLocation(program, 'u_image_resolution'),
    focus: gl.getUniformLocation(program, 'u_focus'),
    mouse: gl.getUniformLocation(program, 'u_mouse'),
    time: gl.getUniformLocation(program, 'u_time'),
    scroll: gl.getUniformLocation(program, 'u_scroll'),
    image: gl.getUniformLocation(program, 'u_image'),
  };
  const texture = gl.createTexture();
  if (!texture) return;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.uniform1i(uniforms.image, 0);

  let loaded = false;
  let visible = false;
  let frame = 0;
  let elapsed = 0;
  let lastTick = 0;
  let lastDraw = 0;
  let firstFrameReady = false;
  let scrollTarget = 0;
  let scroll = 0;
  const pointer = { x: 0.5, y: 0.5 };
  const mouse = { x: 0.5, y: 0.5 };
  const mobile = window.matchMedia('(max-width: 700px)');
  const fpsInterval = () => mobile.matches ? 1000 / 30 : 1000 / 60;

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, mobile.matches ? 1 : 1.25);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (width !== canvas.width || height !== canvas.height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    gl.uniform2f(uniforms.resolution, width, height);
    const [focusX, focusY] = imageFocus(image);
    gl.uniform2f(uniforms.focus, focusX, focusY);
  }

  function schedule() {
    if (!frame && loaded && !reduceMotion.matches && !document.hidden && (visible || freezeTime !== null)) {
      frame = requestAnimationFrame(draw);
    }
  }

  function draw(now) {
    frame = 0;
    if (!loaded || reduceMotion.matches || document.hidden || (!visible && freezeTime === null)) return;
    if (freezeTime === null && now - lastDraw < fpsInterval()) {
      schedule();
      return;
    }
    const delta = lastTick ? Math.min(0.05, Math.max(0, (now - lastTick) / 1000)) : 0;
    lastTick = now;
    lastDraw = now;
    elapsed += delta;
    const ease = 1 - Math.exp(-delta * 7);
    mouse.x += (pointer.x - mouse.x) * ease;
    mouse.y += (pointer.y - mouse.y) * ease;
    scroll += (scrollTarget - scroll) * ease;
    if (canvas.clientWidth < 2 || canvas.clientHeight < 2) {
      schedule();
      return;
    }
    resize();
    gl.uniform1f(uniforms.time, freezeTime ?? elapsed);
    gl.uniform2f(uniforms.mouse, mouse.x, mouse.y);
    gl.uniform1f(uniforms.scroll, scroll);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (!firstFrameReady) {
      if (gl.getError() !== gl.NO_ERROR) return;
      firstFrameReady = true;
      container.classList.add('has-shader');
    }
    if (freezeTime === null) schedule();
  }

  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    container.classList.remove('has-shader');
  }
  activeShaders.push(stop);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    loaded = false;
    stop();
  });
  container.addEventListener('pointermove', event => {
    const bounds = container.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    pointer.x = (event.clientX - bounds.left) / bounds.width;
    pointer.y = 1 - (event.clientY - bounds.top) / bounds.height;
  }, { passive: true });
  container.addEventListener('pointerleave', () => {
    pointer.x = 0.5;
    pointer.y = 0.5;
  });
  const visibilityObserver = 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => {
      visible = entries[0]?.isIntersecting ?? false;
      if (visible) schedule();
      else if (freezeTime === null) {
        cancelAnimationFrame(frame);
        frame = 0;
        lastTick = 0;
      }
    }, { threshold: 0 })
    : null;
  if (visibilityObserver) visibilityObserver.observe(container);
  else visible = true;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
      lastTick = 0;
    } else schedule();
  });
  function updateScroll() {
    const bounds = container.getBoundingClientRect();
    scrollTarget = Math.min(1, Math.max(0, -bounds.top / Math.max(1, bounds.height)));
  }
  window.addEventListener('scroll', updateScroll, { passive: true });
  window.addEventListener('resize', () => {
    updateScroll();
    schedule();
  }, { passive: true });
  updateScroll();

  try {
    if (typeof image.decode === 'function') await image.decode();
    else if (!image.complete) await new Promise((resolve, reject) => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', reject, { once: true });
    });
  } catch {
    return;
  }
  if (!image.naturalWidth || !image.naturalHeight || reduceMotion.matches) return;
  const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  if (image.naturalWidth > maxSize || image.naturalHeight > maxSize) return;
  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  } catch {
    return;
  }
  gl.uniform2f(uniforms.imageResolution, image.naturalWidth, image.naturalHeight);
  loaded = true;
  schedule();
}

initReveals();
initReadingProgress();
if (!reduceMotion.matches && !saveData) {
  document.querySelectorAll('.guide-hero, .guide-article-hero').forEach(container => {
    startShader(container);
  });
  reduceMotion.addEventListener('change', event => {
    if (event.matches) activeShaders.forEach(stop => stop());
  });
}
