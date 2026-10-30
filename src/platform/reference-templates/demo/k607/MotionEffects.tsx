'use client';
import { useEffect, useRef } from "react";
import "./motion.css";
/** Source scrollReveal v0.1: reset=true, move=50px, viewportFactor=.33. */
export function useSourceReveals() {
    useEffect(() => {
        const media = window.matchMedia("(prefers-reduced-motion: reduce)");
        const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-source-reveal]"));
        let frame = 0;
        function update() {
            frame = 0;
            nodes.forEach(node => {
                // Layout offsets ignore the reveal transform itself, as the source library does.
                let top = 0;
                let parent: HTMLElement | null = node;
                while (parent) {
                    top += parent.offsetTop;
                    parent = parent.offsetParent as HTMLElement | null;
                }
                const position = top - window.scrollY;
                const visible = media.matches || (position + node.offsetHeight * .33 <= innerHeight &&
                    position + node.offsetHeight >= 0);
                node.classList.toggle("source-revealed", visible);
                node.classList.add("source-reveal-ready");
            });
        }
        const schedule = () => { if (!frame)
            frame = requestAnimationFrame(update); };
        update();
        window.addEventListener("scroll", schedule, { passive: true });
        window.addEventListener("resize", schedule);
        media.addEventListener("change", schedule);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener("scroll", schedule);
            window.removeEventListener("resize", schedule);
            media.removeEventListener("change", schedule);
            nodes.forEach(node => node.classList.remove("source-reveal-ready", "source-revealed"));
        };
    }, []);
}
/* Height/velocity/normal simulation adapted from jquery.ripples by sirxemic (MIT).
 * Full attribution/license: docs/research/k607/motion/RIPPLES-LICENSE.txt.
 * This is an independent React/WebGL implementation; no original site bundle is executed. */
export function WaterRipples() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const canvas = canvasRef.current;
        const host = canvas?.parentElement;
        if (!canvas || !host)
            return;
        const media = window.matchMedia("(prefers-reduced-motion: reduce)");
        let dispose = () => { };
        function setup() {
            dispose();
            if (media.matches)
                return;
            const gl = canvas!.getContext("webgl", { alpha: true, antialias: false, preserveDrawingBuffer: true });
            if (!gl || !gl.getExtension("OES_texture_float") || !gl.getExtension("OES_texture_float_linear"))
                return;
            const programs: WebGLProgram[] = [];
            const shaders: WebGLShader[] = [];
            const textures: WebGLTexture[] = [];
            const buffers: WebGLFramebuffer[] = [];
            let frame = 0;
            let dead = false;
            let loaded = false;
            let visible = false;
            let last = 0;
            const resolution = 552;
            let side = 1;
            let current = 0;
            const image = new Image();
            const quad = gl.createBuffer();
            const size = [1, 1];
            const vertex = `attribute vec2 vertex; varying vec2 coord;
        void main(){coord=vertex*.5+.5;gl_Position=vec4(vertex,0.,1.);}`;
            function program(fragment: string) {
                const p = gl!.createProgram()!;
                for (const [type, source] of [[gl!.VERTEX_SHADER, vertex], [gl!.FRAGMENT_SHADER,
                        "precision highp float; varying vec2 coord;" + fragment]] as const) {
                    const shader = gl!.createShader(type)!;
                    gl!.shaderSource(shader, source);
                    gl!.compileShader(shader);
                    shaders.push(shader);
                    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS))
                        throw Error("Ripple shader unavailable");
                    gl!.attachShader(p, shader);
                }
                gl!.linkProgram(p);
                programs.push(p);
                if (!gl!.getProgramParameter(p, gl!.LINK_STATUS))
                    throw Error("Ripple program unavailable");
                return p;
            }
            function uniform(p: WebGLProgram, name: string) { return gl!.getUniformLocation(p, name); }
            function draw(p: WebGLProgram) {
                gl!.useProgram(p);
                gl!.bindBuffer(gl!.ARRAY_BUFFER, quad);
                const attribute = gl!.getAttribLocation(p, "vertex");
                gl!.enableVertexAttribArray(attribute);
                gl!.vertexAttribPointer(attribute, 2, gl!.FLOAT, false, 0, 0);
                gl!.drawArrays(gl!.TRIANGLE_FAN, 0, 4);
            }
            function bind(texture: WebGLTexture, unit = 0) {
                gl!.activeTexture(gl!.TEXTURE0 + unit);
                gl!.bindTexture(gl!.TEXTURE_2D, texture);
            }
            function pass(p: WebGLProgram) {
                gl!.viewport(0, 0, resolution, resolution);
                gl!.bindFramebuffer(gl!.FRAMEBUFFER, buffers[1 - current]);
                bind(textures[current]);
                draw(p);
                current = 1 - current;
            }
            let drop: WebGLProgram;
            let update: WebGLProgram;
            let normals: WebGLProgram;
            let render: WebGLProgram;
            let background: WebGLTexture;
            const observer = new IntersectionObserver(entries => {
                visible = entries[0].isIntersecting;
                if (visible && !frame && loaded)
                    frame = requestAnimationFrame(tick);
            });
            const resize = new ResizeObserver(() => {
                size[0] = host!.clientWidth;
                size[1] = host!.clientHeight;
                side = Math.max(...size);
                // Source uses CSS pixel dimensions, with a square 552x552 simulation texture.
                canvas!.width = size[0];
                canvas!.height = size[1];
            });
            function pointer(event: PointerEvent) {
                if (!loaded || dead)
                    return;
                const box = host!.getBoundingClientRect();
                gl!.useProgram(drop);
                gl!.uniform2f(uniform(drop, "center"), .5 + (event.clientX - box.left - size[0] / 2) / side, .5 - (event.clientY - box.top - size[1] / 2) / side);
                gl!.uniform1f(uniform(drop, "radius"), (event.type === "pointerdown" ? 30 : 20) / side);
                gl!.uniform1f(uniform(drop, "strength"), event.type === "pointerdown" ? .14 : .01);
                pass(drop);
            }
            function tick(time: number) {
                frame = 0;
                if (dead || !visible || document.hidden || !loaded)
                    return;
                // Preserve source's ~60Hz propagation even on high refresh rate displays.
                if (time - last >= 15) {
                    pass(update);
                    pass(normals);
                    last = time;
                    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
                    gl!.viewport(0, 0, canvas!.width, canvas!.height);
                    gl!.useProgram(render);
                    bind(textures[current]);
                    bind(background, 1);
                    gl!.uniform2f(uniform(render, "containerRatio"), size[0] / side, size[1] / side);
                    // Original is centered, natural-size and no-repeat at every breakpoint.
                    gl!.uniform2f(uniform(render, "imageRatio"), size[0] / image.width, size[1] / image.height);
                    draw(render);
                    canvas!.classList.add("ripples-active");
                }
                frame = requestAnimationFrame(tick);
            }
            const wake = () => {
                if (!document.hidden && visible && loaded && !frame)
                    frame = requestAnimationFrame(tick);
            };
            dispose = () => {
                dead = true;
                loaded = false;
                cancelAnimationFrame(frame);
                image.onload = null;
                observer.disconnect();
                resize.disconnect();
                host!.removeEventListener("pointermove", pointer);
                host!.removeEventListener("pointerdown", pointer);
                document.removeEventListener("visibilitychange", wake);
                canvas!.classList.remove("ripples-active");
                programs.forEach(p => gl.deleteProgram(p));
                shaders.forEach(s => gl.deleteShader(s));
                textures.forEach(t => gl.deleteTexture(t));
                buffers.forEach(b => gl.deleteFramebuffer(b));
                if (background)
                    gl.deleteTexture(background);
                gl.deleteBuffer(quad);
            };
            try {
                gl.bindBuffer(gl.ARRAY_BUFFER, quad);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
                for (let i = 0; i < 2; i++) {
                    const texture = gl.createTexture()!;
                    const buffer = gl.createFramebuffer()!;
                    textures.push(texture);
                    buffers.push(buffer);
                    bind(texture);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, resolution, resolution, 0, gl.RGBA, gl.FLOAT, null);
                    gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
                    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
                    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
                        throw Error("Float render target unavailable");
                }
                drop = program(`uniform sampler2D texture;uniform vec2 center;uniform float radius,strength;
          void main(){vec4 info=texture2D(texture,coord);
          float d=max(0.,1.-length(center-coord)/radius);d=.5-cos(d*3.14159265359)*.5;
          info.r+=d*strength;gl_FragColor=info;}`);
                update = program(`uniform sampler2D texture;uniform vec2 delta;
          void main(){vec4 info=texture2D(texture,coord);vec2 dx=vec2(delta.x,0.),dy=vec2(0.,delta.y);
          float average=(texture2D(texture,coord-dx).r+texture2D(texture,coord-dy).r+
          texture2D(texture,coord+dx).r+texture2D(texture,coord+dy).r)*.25;
          info.g+=(average-info.r)*2.;info.g*=.995;info.r+=info.g;gl_FragColor=info;}`);
                normals = program(`uniform sampler2D texture;uniform vec2 delta;
          void main(){vec4 info=texture2D(texture,coord);
          vec3 dx=vec3(delta.x,texture2D(texture,coord+vec2(delta.x,0.)).r-info.r,0.);
          vec3 dy=vec3(0.,texture2D(texture,coord+vec2(0.,delta.y)).r-info.r,delta.y);
          info.ba=normalize(cross(dy,dx)).xz;gl_FragColor=info;}`);
                render = program(`uniform sampler2D texture,background;uniform vec2 containerRatio,imageRatio;
          void main(){vec2 rippleCoord=(coord-.5)*containerRatio+.5;
          vec2 offset=-texture2D(texture,rippleCoord).ba;
          float specular=pow(max(0.,dot(offset,normalize(vec2(-.6,1.)))),4.);
          vec2 uv=(coord-.5)*imageRatio+.5+offset*.04;
          gl_FragColor=texture2D(background,uv)+specular;}`);
                for (const p of [update, normals]) {
                    gl.useProgram(p);
                    gl.uniform2f(uniform(p, "delta"), 1 / resolution, 1 / resolution);
                }
                gl.useProgram(render);
                gl.uniform1i(uniform(render, "background"), 1);
                background = gl.createTexture()!;
                bind(background, 1);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                image.onload = () => {
                    if (dead)
                        return;
                    bind(background, 1);
                    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
                    loaded = true;
                    if (visible && !frame)
                        frame = requestAnimationFrame(tick);
                };
                image.src = "/sites/k607/izixun-bg.jpg";
                host!.addEventListener("pointermove", pointer, { passive: true });
                host!.addEventListener("pointerdown", pointer, { passive: true });
                document.addEventListener("visibilitychange", wake);
                resize.observe(host!);
                observer.observe(host!);
            }
            catch {
                dispose(); /* Source background remains intact when WebGL is unsupported. */
            }
        }
        const lost = (event: Event) => { event.preventDefault(); dispose(); };
        canvas.addEventListener("webglcontextlost", lost);
        canvas.addEventListener("webglcontextrestored", setup);
        setup();
        media.addEventListener("change", setup);
        return () => {
            dispose();
            media.removeEventListener("change", setup);
            canvas.removeEventListener("webglcontextlost", lost);
            canvas.removeEventListener("webglcontextrestored", setup);
        };
    }, []);
    return <canvas className="water-ripples" ref={canvasRef} aria-hidden="true"/>;
}
