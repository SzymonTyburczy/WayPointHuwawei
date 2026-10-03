// Loads the Waypoint core (cpp/wasm, wasm32-wasi) in a browser or in Node.
// The module imports three WASI calls; a ten-line shim covers them.
//
//   const core = await WaypointCore.load(bytes);
//   core.call('audit', { snapshot })  // same commands and JSON as waypoint-cli
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WaypointCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function wasiShim(getMemory) {
    return {
      // Only stdout/stderr writes are possible; they are ignored (the core never logs).
      fd_write(fd, iovs, iovsLen, nwritten) {
        const view = new DataView(getMemory().buffer);
        let n = 0;
        for (let i = 0; i < iovsLen; i++) n += view.getUint32(iovs + i * 8 + 4, true);
        view.setUint32(nwritten, n, true);
        return 0;
      },
      fd_seek: () => 70, // ESPIPE
      fd_close: () => 0,
    };
  }

  async function instantiate(module) {
    let memory = null;
    const instance = await WebAssembly.instantiate(module, { wasi_snapshot_preview1: wasiShim(() => memory) });
    memory = instance.exports.memory;
    instance.exports._initialize();
    return instance;
  }

  async function load(bytes) {
    const module = bytes instanceof WebAssembly.Module ? bytes : await WebAssembly.compile(bytes);
    let instance = await instantiate(module);
    let traps = 0;

    function cstr(str) {
      const b = enc.encode(str);
      const p = instance.exports.wp_alloc(b.length + 1);
      const mem = new Uint8Array(instance.exports.memory.buffer);
      mem.set(b, p);
      mem[p + b.length] = 0;
      return p;
    }

    function read(p) {
      const mem = new Uint8Array(instance.exports.memory.buffer);
      let end = p;
      while (mem[end] !== 0) end++;
      return dec.decode(mem.subarray(p, end));
    }

    /** Synchronous: returns the parsed JSON reply ({error} on failure). */
    function callRaw(cmd, requestJson) {
      try {
        const c = cstr(cmd);
        const r = cstr(requestJson);
        const out = instance.exports.wp_call(c, r);
        const text = read(out);
        instance.exports.wp_free(c);
        instance.exports.wp_free(r);
        instance.exports.wp_free(out);
        return text;
      } catch (e) {
        // A C++ throw traps in this build (malformed input). Start over with a fresh instance.
        traps++;
        return JSON.stringify({ error: `core trapped: ${e && e.message ? e.message : e}` });
      }
    }

    const api = {
      call: (cmd, request) => JSON.parse(callRaw(cmd, JSON.stringify(request))),
      callRaw,
      get traps() {
        return traps;
      },
      async recover() {
        instance = await instantiate(module);
      },
    };
    return api;
  }

  return { load };
});
