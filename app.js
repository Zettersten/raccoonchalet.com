const root = document.documentElement;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
root.classList.add('js-ready');

function initNavigation() {
  const header = document.querySelector('.site-header');
  const toggle = document.querySelector('.menu-toggle');
  const menu = document.querySelector('.mobile-nav');
  const progress = document.querySelector('.scroll-progress span');
  const mobileBook = document.querySelector('.mobile-book');
  const background = [document.querySelector('main'), document.querySelector('footer'), mobileBook].filter(Boolean);
  if (!header || !toggle || !menu) return;

  let ticking = false;
  function updateScroll() {
    header.classList.toggle('is-scrolled', window.scrollY > 40);
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    if (progress) progress.style.transform = `scaleX(${scrollable > 0 ? Math.min(1, window.scrollY / scrollable) : 0})`;
    if (mobileBook) mobileBook.classList.toggle('is-hidden', window.scrollY < window.innerHeight * .55);
    ticking = false;
  }
  window.addEventListener('scroll', () => {
    if (!ticking) { requestAnimationFrame(updateScroll); ticking = true; }
  }, { passive: true });
  updateScroll();

  function closeMenu(restoreFocus = true) {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
    menu.classList.remove('is-open');
    menu.inert = true;
    background.forEach(element => { element.inert = false; });
    header.classList.remove('menu-active');
    document.body.classList.remove('menu-open');
    if (restoreFocus) toggle.focus();
  }
  toggle.addEventListener('click', () => {
    const opening = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(opening));
    toggle.setAttribute('aria-label', opening ? 'Close menu' : 'Open menu');
    menu.classList.toggle('is-open', opening);
    menu.inert = !opening;
    background.forEach(element => { element.inert = opening; });
    header.classList.toggle('menu-active', opening);
    document.body.classList.toggle('menu-open', opening);
    if (opening) menu.querySelector('a')?.focus();
    else toggle.focus();
  });
  menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => closeMenu(false)));
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') closeMenu();
    if (event.key === 'Tab' && toggle.getAttribute('aria-expanded') === 'true') {
      const focusable = [toggle, ...menu.querySelectorAll('a')];
      const index = focusable.indexOf(document.activeElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); focusable.at(-1).focus(); }
      else if (!event.shiftKey && index === focusable.length - 1) { event.preventDefault(); focusable[0].focus(); }
    }
  });
  window.matchMedia('(min-width: 1101px)').addEventListener('change', event => {
    if (event.matches) closeMenu(false);
  });
}

function initReveals() {
  const elements = document.querySelectorAll('.reveal');
  if (prefersReducedMotion.matches || !('IntersectionObserver' in window)) {
    elements.forEach(element => element.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: .08, rootMargin: '0px 0px -6% 0px' });
  elements.forEach(element => observer.observe(element));
}

function initStory() {
  const chapters = [...document.querySelectorAll('.story-chapter')];
  const images = [...document.querySelectorAll('.story-image')];
  const label = document.getElementById('story-visual-label');
  const count = document.getElementById('story-visual-count');
  if (!chapters.length || !('IntersectionObserver' in window)) return;
  const labels = ['The reset', 'The rematch', 'The gathering', 'The outside'];
  let active = -1;
  function setActive(index) {
    if (index === active) return;
    active = index;
    chapters.forEach((chapter, i) => chapter.classList.toggle('is-active', i === index));
    images.forEach((image, i) => image.classList.toggle('is-active', i === index));
    if (label) label.textContent = labels[index];
    if (count) count.textContent = `${String(index + 1).padStart(2, '0')} / 04`;
  }
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) setActive(Number(entry.target.dataset.story));
    }
  }, { rootMargin: '-42% 0px -42% 0px', threshold: 0 });
  chapters.forEach(chapter => observer.observe(chapter));
  setActive(0);
}

function initGallery() {
  const track = document.getElementById('gallery-track');
  const previous = document.getElementById('gallery-prev');
  const next = document.getElementById('gallery-next');
  if (!track) return;
  const step = () => (track.querySelector('.gallery-item')?.getBoundingClientRect().width ?? 380) + 18;
  previous?.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: prefersReducedMotion.matches ? 'instant' : 'smooth' }));
  next?.addEventListener('click', () => track.scrollBy({ left: step(), behavior: prefersReducedMotion.matches ? 'instant' : 'smooth' }));

  let pointerId = null;
  let startX = 0;
  let startScroll = 0;
  track.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch') return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startScroll = track.scrollLeft;
    track.setPointerCapture(event.pointerId);
  });
  track.addEventListener('pointermove', event => {
    if (event.pointerId !== pointerId) return;
    track.scrollLeft = startScroll - (event.clientX - startX);
  });
  const endDrag = () => { pointerId = null; };
  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);
  track.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      track.scrollBy({ left: (event.key === 'ArrowRight' ? 1 : -1) * step(), behavior: prefersReducedMotion.matches ? 'instant' : 'smooth' });
    }
  });
}

function initHeroShader() {
  const hero = document.querySelector('.hero');
  const canvas = document.getElementById('hero-canvas');
  if (!hero || !canvas || prefersReducedMotion.matches) return;
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' });
  if (!gl) return;
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    hero.classList.remove('has-shader');
    loaded = false;
    cancelAnimationFrame(frame);
    frame = 0;
  });

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
      visible *= 0.86;
      vec2 sampleUV = (uv - 0.5) * visible + vec2(0.5, 0.55);

      // A slow current moves through the image; the pointer gives it a gentle lens.
      float current = sin(sampleUV.y * 13.0 + u_time * 0.27) * sin(sampleUV.x * 8.0 - u_time * 0.18);
      sampleUV.x += current * 0.0019;
      vec2 delta = uv - u_mouse;
      float lens = exp(-dot(delta, delta) * 12.0);
      sampleUV += delta * lens * 0.015;
      sampleUV.y += u_scroll * 0.018;

      vec3 color = texture2D(u_image, sampleUV).rgb;
      float luminance = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(color * vec3(0.80, 0.91, 0.82), color * vec3(1.03, 0.98, 0.88), smoothstep(0.18, 0.9, luminance));
      float veil = 0.025 * sin(uv.y * 3.4 + u_time * 0.22) * sin(uv.x * 4.2 - u_time * 0.12);
      color += vec3(0.12, 0.10, 0.06) * veil;
      float grain = hash(floor(uv * u_resolution * 0.75) + floor(u_time * 12.0)) - 0.5;
      color += grain * 0.022;
      float vignette = 1.0 - smoothstep(0.25, 1.15, length((uv - 0.5) * vec2(1.05, 0.85)));
      color *= mix(0.79, 1.0, vignette);
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  function shader(type, source) {
    const item = gl.createShader(type);
    gl.shaderSource(item, source);
    gl.compileShader(item);
    if (!gl.getShaderParameter(item, gl.COMPILE_STATUS)) {
      console.warn('Hero shader could not compile:', gl.getShaderInfoLog(item));
      gl.deleteShader(item);
      return null;
    }
    return item;
  }
  const vertex = shader(gl.VERTEX_SHADER, vertexSource);
  const fragment = shader(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertex || !fragment) return;
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('Hero shader could not link:', gl.getProgramInfoLog(program));
    return;
  }
  gl.useProgram(program);
  const vertices = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const attribute = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(attribute);
  gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0);

  const uniforms = {
    resolution: gl.getUniformLocation(program, 'u_resolution'),
    imageResolution: gl.getUniformLocation(program, 'u_image_resolution'),
    mouse: gl.getUniformLocation(program, 'u_mouse'),
    time: gl.getUniformLocation(program, 'u_time'),
    scroll: gl.getUniformLocation(program, 'u_scroll'),
    image: gl.getUniformLocation(program, 'u_image'),
  };
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.uniform1i(uniforms.image, 0);

  const mouse = { x: .5, y: .5 };
  hero.addEventListener('pointermove', event => {
    const bounds = hero.getBoundingClientRect();
    mouse.x = (event.clientX - bounds.left) / bounds.width;
    mouse.y = 1 - (event.clientY - bounds.top) / bounds.height;
  }, { passive: true });
  hero.addEventListener('pointerleave', () => { mouse.x = .5; mouse.y = .5; });

  let visible = true;
  let loaded = false;
  let frame = 0;
  let start = performance.now();
  const frozenTime = new URLSearchParams(location.search).get('t');
  const observer = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting ?? false; if (visible && loaded && !frame) frame = requestAnimationFrame(render); }, { threshold: 0 });
  observer.observe(hero);
  function resize() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    const width = Math.round(canvas.clientWidth * pixelRatio);
    const height = Math.round(canvas.clientHeight * pixelRatio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    gl.uniform2f(uniforms.resolution, width, height);
  }
  function render(now) {
    frame = 0;
    if (!loaded || !visible || document.hidden) return;
    resize();
    const time = frozenTime === null ? (now - start) / 1000 : Number(frozenTime) || 0;
    gl.uniform1f(uniforms.time, time);
    gl.uniform2f(uniforms.mouse, mouse.x, mouse.y);
    gl.uniform1f(uniforms.scroll, Math.min(1, window.scrollY / Math.max(1, hero.clientHeight)));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (frozenTime === null) frame = requestAnimationFrame(render);
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && loaded && !frame) { start = performance.now(); frame = requestAnimationFrame(render); }
  });
  window.addEventListener('resize', resize, { passive: true });

  const image = new Image();
  image.onload = () => {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.uniform2f(uniforms.imageResolution, image.naturalWidth, image.naturalHeight);
    loaded = true;
    hero.classList.add('has-shader');
    frame = requestAnimationFrame(render);
  };
  const fallback = hero.querySelector('.hero-fallback');
  image.src = fallback?.currentSrc || fallback?.src || 'assets/deck-view-01.jpg';
}

initNavigation();
initReveals();
initStory();
initGallery();
initHeroShader();
