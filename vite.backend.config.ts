import { defineConfig, Plugin } from 'vite';
import { builtinModules } from 'module';
import path from 'path';

// In SEA mode, uWebSockets.js cannot be loaded from node_modules (there are none).
// This plugin replaces require("uWebSockets.js") with an IIFE that:
//   - In SEA mode: extracts the .node binary from the SEA asset store to a temp
//     directory and loads it directly via require(absolutePath).
//   - Otherwise: falls through to require('uWebSockets.js') for dev/pkg use.
// process.dlopen is NOT patched in SEA (unlike pkg), so loading from disk works.
function uwsSeaPlugin(): Plugin {
  return {
    name: 'uws-sea-loader',
    generateBundle(_, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'chunk' && /require\(["']uWebSockets\.js["']\)/.test(chunk.code)) {
          chunk.code = chunk.code.replace(
            /\brequire\(["']uWebSockets\.js["']\)/g,
            // Use process.dlopen (not require) to load the extracted .node file.
            // In SEA, process.dlopen is unpatched; require() for arbitrary .node
            // paths does not work through embedderRequire.
            `(()=>{const _os=require('os'),_path=require('path'),_fs=require('fs');const _nn='uws_'+process.platform+'_'+process.arch+'_'+process.versions.modules+'.node';try{const _sea=require('node:sea');if(_sea.isSea()){const _td=_path.join(_os.tmpdir(),'swp-uws-'+process.versions.modules);_fs.mkdirSync(_td,{recursive:true});const _np=_path.join(_td,_nn);_fs.writeFileSync(_np,Buffer.from(_sea.getAsset(_nn)));const _m={exports:{}};process.dlopen(_m,_np);return _m.exports;}}catch(_e){}return require('uWebSockets.js');})()`,
          );
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [uwsSeaPlugin()],
  build: {
    target: 'node24',
    lib: {
      entry: path.resolve(__dirname, 'src/api/index.ts'),
      formats: ['cjs'],
      fileName: 'index',
    },
    outDir: 'dist-api',
    rollupOptions: {
      external: [
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
        'uWebSockets.js',
        'fsevents',
      ],
    },
    ssr: true,
  },
  ssr: {
    noExternal: true,
    external: ['uWebSockets.js'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
